/**
 * Distributed stream-lock coordination.
 *
 * Issue #216 calls for horizontal worker scaling. Two workers running
 * the existing `SessionRegistry` would both happily register a session
 * for the same `streamId`, producing duplicate publish traffic. This
 * module provides a `LockManager` abstraction that the registry uses
 * to atomically claim ownership of a stream before spawning a session.
 *
 * Two backends ship with the worker:
 *
 *   - {@link MemoryLockManager} (LOCK_BACKEND=memory, the default)
 *     keeps the lock in a per-process `Map`. Behaviour matches the
 *     pre-issue codebase when only one worker is running. Used by the
 *     unit + integration test suite so tests stay deterministic and
 *     DB-free.
 *
 *   - {@link PostgresLockManager} (LOCK_BACKEND=postgres) uses a
 *     dedicated `stream_locks` table that the worker bootstraps on
 *     startup via `install()`. Acquisition is a single atomic
 *     `INSERT … ON CONFLICT DO UPDATE … WHERE expires_at <= NOW()
 *     OR owner_id = EXCLUDED.owner_id RETURNING …`, so two workers
 *     racing to claim the same `streamId` resolve to a single winner
 *     in one round trip. Heartbeat renewal is a guarded UPDATE that
 *     only succeeds for the worker that owns the row.
 *
 * Tokens are random UUIDv4s so a stale token from a previous
 * generation can never accidentally match a re-acquisition.
 */

import { Client as PgClient } from "pg"
import { randomUUID } from "crypto"
import { Logger } from "./logger"

/**
 * Opaque handle returned by {@link LockManager.acquire}. Callers must
 * present the same `token` to {@link LockManager.renew} and
 * {@link LockManager.release}. Tokens are NOT comparable across
 * acquires — each one represents a single "claim".
 */
export interface LockToken {
  streamId: string
  workerId: string
  /** Random per-acquisition UUID. */
  token: string
  /** Monotonic-time expiry, useful for client-side observability. */
  expiresAt: number
  acquiredAt: number
}

export interface LockManagerOptions {
  /** Stable id of the worker owning the lock manager. */
  workerId: string
  /**
   * Time-to-live for an acquired lock. Must be comfortably larger
   * than the heartbeat interval so a single missed renewal does not
   * drop ownership. Defaults to 30s. Both backends honour this value.
   */
  ttlMs?: number
  logger?: Pick<Console, "log" | "warn" | "error">
  /** Structured logger for detailed observability (issue #338). */
  structuredLogger?: Logger
}

const DEFAULT_TTL_MS = 30_000

/**
 * Abstract base class. The {@link SessionRegistry} (and tests) only
 * ever see this type — concrete backends are constructed through
 * {@link createLockManager}.
 */
export abstract class LockManager {
  /** TTL is public so {@link SessionRegistry} can schedule heartbeats. */
  public readonly ttlMs: number
  protected readonly workerId: string
  protected readonly logger: Pick<Console, "log" | "warn" | "error">
  protected readonly structuredLogger: Logger

  constructor(options: LockManagerOptions) {
    this.workerId = options.workerId
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.logger = options.logger ?? console
    this.structuredLogger = options.structuredLogger ?? new Logger({ workerId: options.workerId })
    this.structuredLogger.info("LockManager initialized", {
      workerId: this.workerId,
      ttlMs: this.ttlMs,
    })
  }

  /** One-time setup (schema bootstrap, etc.). Safe to call repeatedly. */
  abstract install(): Promise<void>

  /**
   * Atomically claim `streamId` for `workerId`. Returns a fresh
   * {@link LockToken} when the claim succeeds, or `null` when another
   * live worker still owns the lock.
   *
   * If the same worker calls `acquire(streamId)` while already
   * holding a live lock (re-entrant path), the existing token is
   * refreshed and returned so callers never see a torn lock.
   */
  abstract acquire(streamId: string): Promise<LockToken | null>

  /**
   * Extend the TTL of an owned lock. Returns `false` if the lock has
   * already been lost — either expired or claimed by another worker
   * since the previous renewal. The caller should treat a `false`
   * result as "ownership lost, drop the session".
   */
  abstract renew(streamId: string, token: LockToken): Promise<boolean>

  /** Drop a single owned lock. Idempotent — returns `false` if absent. */
  abstract release(streamId: string, token: LockToken): Promise<boolean>

  /** Drop every lock this worker holds. Called on graceful shutdown. */
  abstract releaseAll(): Promise<void>

  /** Release transport resources (DB pool, etc). */
  abstract close(): Promise<void>
}

/* ------------------------------------------------------------------ *
 *  In-process implementation                                          *
 * ------------------------------------------------------------------ */

interface MemoryLockEntry {
  token: LockToken
  /** Timer that auto-evicts the entry once `ttlMs` has elapsed. */
  timer: NodeJS.Timeout
}

/**
 * Single-process lock manager. Solves the "session races" issue
 * inside a worker by guaranteeing only one `route()` call may spawn a
 * session for a given streamId at a time. In multi-worker
 * deployments this manager must be replaced by either a shared
 * database or Redis; the {@link PostgresLockManager} is the default
 * for that case.
 */
export class MemoryLockManager extends LockManager {
  private readonly locks = new Map<string, MemoryLockEntry>()

  async install(): Promise<void> {
    // Nothing to bootstrap for an in-process manager.
  }

  async acquire(streamId: string): Promise<LockToken | null> {
    const now = Date.now()
    const existing = this.locks.get(streamId)
    if (
      existing &&
      existing.token.expiresAt > now &&
      existing.token.workerId !== this.workerId
    ) {
      // Foreign worker holds an unexpired lock.
      this.structuredLogger.debug("Lock acquisition denied - foreign worker owns lock", {
        streamId,
        foreignWorkerId: existing.token.workerId,
        expiresAt: new Date(existing.token.expiresAt).toISOString(),
      })
      return null
    }
    if (existing) {
      clearTimeout(existing.timer)
      this.structuredLogger.debug("Re-acquiring existing lock", {
        streamId,
        previousOwner: existing.token.workerId,
      })
    }
    const token: LockToken = {
      streamId,
      workerId: this.workerId,
      token: randomUUID(),
      acquiredAt: now,
      expiresAt: now + this.ttlMs,
    }
    const timer = setTimeout(() => this.evictIfCurrent(streamId, token.token), this.ttlMs)
    if (typeof timer.unref === "function") timer.unref()
    this.locks.set(streamId, { token, timer })
    this.structuredLogger.debug("Lock acquired in-memory", {
      streamId,
      token: token.token,
      expiresAt: new Date(token.expiresAt).toISOString(),
    })
    return token
  }

  async renew(streamId: string, token: LockToken): Promise<boolean> {
    const entry = this.locks.get(streamId)
    if (!entry || entry.token.token !== token.token) {
      this.structuredLogger.warn("Lock renewal failed - token mismatch or not found", {
        streamId,
        hasEntry: !!entry,
        tokenMatch: entry?.token.token === token.token,
      })
      return false
    }
    clearTimeout(entry.timer)
    const now = Date.now()
    const renewed: LockToken = { ...token, expiresAt: now + this.ttlMs }
    const timer = setTimeout(() => this.evictIfCurrent(streamId, renewed.token), this.ttlMs)
    if (typeof timer.unref === "function") timer.unref()
    this.locks.set(streamId, { token: renewed, timer })
    this.structuredLogger.debug("Lock renewed in-memory", {
      streamId,
      newExpiresAt: new Date(renewed.expiresAt).toISOString(),
    })
    return true
  }

  async release(streamId: string, token: LockToken): Promise<boolean> {
    const entry = this.locks.get(streamId)
    if (!entry) {
      this.structuredLogger.warn("Lock release failed - entry not found", {
        streamId,
      })
      return false
    }
    if (entry.token.token !== token.token) {
      this.structuredLogger.warn("Lock release failed - token mismatch", {
        streamId,
        expectedToken: token.token,
        actualToken: entry.token.token,
      })
      return false
    }
    clearTimeout(entry.timer)
    this.locks.delete(streamId)
    this.structuredLogger.debug("Lock released in-memory", { streamId })
    return true
  }

  async releaseAll(): Promise<void> {
    const count = this.locks.size
    for (const entry of Array.from(this.locks.values())) {
      clearTimeout(entry.timer)
    }
    this.locks.clear()
    this.structuredLogger.info("All in-memory locks released", { count })
  }

  async close(): Promise<void> {
    this.structuredLogger.info("Closing MemoryLockManager")
    await this.releaseAll()
  }

  /* ───── inspection helpers (used by tests) ───── */

  /** Current number of held locks. */
  size(): number {
    return this.locks.size
  }

  /** Owner of a lock by streamId, or `undefined` if unlocked. */
  ownerOf(streamId: string): string | undefined {
    return this.locks.get(streamId)?.token.workerId
  }

  /**
   * Test-only escape hatch: inject a lock entry owned by a
   * different `workerId` so the `workerId !== this.workerId`
   * branch of {@link acquire} can be exercised without spinning up
   * a second `MemoryLockManager` instance (which would not share
   * state and so would never see the existing entry in the first
   * place). Production code MUST NOT call this.
   *
   * @internal
   */
  __setEntryForTest(streamId: string, workerId: string, ttlMs: number): LockToken {
    const now = Date.now()
    const tok: LockToken = {
      streamId,
      workerId,
      token: randomUUID(),
      acquiredAt: now,
      expiresAt: now + ttlMs,
    }
    const timer = setTimeout(() => this.evictIfCurrent(streamId, tok.token), ttlMs)
    if (typeof timer.unref === "function") timer.unref()
    this.locks.set(streamId, { token: tok, timer })
    return tok
  }

  /**
   * Pair with {@link __setEntryForTest}: drop the synthetic entry
   * and cancel its eviction timer. Tests call this in their
   * `afterEach` (or at the end of the assertion) to keep Jest's
   * open-handle lint happy when reusing `__setEntryForTest` with
   * long TTLs.
   *
   * @internal
   */
  __clearEntryForTest(streamId: string): void {
    const entry = this.locks.get(streamId)
    if (!entry) return
    clearTimeout(entry.timer)
    this.locks.delete(streamId)
  }

  private evictIfCurrent(streamId: string, expectedToken: string): void {
    const entry = this.locks.get(streamId)
    if (entry && entry.token.token === expectedToken) {
      this.locks.delete(streamId)
      this.logger.warn(
        `[${this.workerId}] in-memory lock for ${streamId} expired after ${this.ttlMs}ms`,
      )
    }
  }
}

/* ------------------------------------------------------------------ *
 *  PostgreSQL implementation                                          *
 * ------------------------------------------------------------------ */

export interface PostgresLockManagerOptions extends LockManagerOptions {
  databaseUrl: string
}

/**
 * Distributed lock manager backed by a small `stream_locks` table.
 *
 * Schema (auto-installed by {@link install}):
 *
 * ```sql
 * CREATE TABLE stream_locks (
 *   stream_id   TEXT PRIMARY KEY,
 *   owner_id    TEXT NOT NULL,
 *   owner_token UUID NOT NULL,
 *   expires_at  TIMESTAMPTZ NOT NULL
 * );
 * CREATE INDEX stream_locks_owner_idx ON stream_locks (owner_id);
 * ```
 *
 * Acquisition is a single round-trip UPSERT that overwrites the row
 * if and only if the previous lock has expired OR is owned by the
 * same worker (re-acquire). The `RETURNING` clause lets us detect
 * loss without a second SELECT.
 *
 * Workers run this query concurrently — PostgreSQL serialises writes
 * to the same primary key, so exactly one worker returns a row and
 * the rest see `INSERT 0` from `rowCount` semantics. (See the
 * `acquire` body for the actual conflict resolution.)
 */
export class PostgresLockManager extends LockManager {
  private readonly client: PgClient
  private readonly databaseUrl: string

  constructor(options: PostgresLockManagerOptions) {
    super(options)
    this.databaseUrl = options.databaseUrl
    this.client = new PgClient({ connectionString: options.databaseUrl })
  }

  async install(): Promise<void> {
    this.structuredLogger.info("Installing PostgresLockManager schema")
    await this.client.connect()
    await this.client.query(/* sql */ `
      CREATE TABLE IF NOT EXISTS stream_locks (
        stream_id   TEXT PRIMARY KEY,
        owner_id    TEXT NOT NULL,
        owner_token UUID NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL
      )
    `)
    await this.client.query(/* sql */ `
      CREATE INDEX IF NOT EXISTS stream_locks_owner_idx
        ON stream_locks (owner_id)
    `)
    this.structuredLogger.info("PostgresLockManager schema installed successfully")
  }

  async acquire(streamId: string): Promise<LockToken | null> {
    const now = Date.now()
    const newToken = randomUUID()
    const expiresAt = new Date(now + this.ttlMs)

    this.structuredLogger.debug("Attempting Postgres lock acquisition", {
      streamId,
      workerId: this.workerId,
    })

    // Atomicity note: PostgreSQL serialises any concurrent
    // INSERT/UPDATE on the same primary key through row-level
    // locking on the index entry. Two workers racing to claim the
    // same streamId cannot both observe a stale `expires_at`
    // snapshot — the second arrival either finds the row already
    // updated (its WHERE clause fails → no row returned) or finds
    // it still expired (its UPSERT succeeds and the previous
    // owner's renew will see rowCount=0 next tick). No explicit
    // `SELECT … FOR UPDATE` or wrapping transaction is required.
    //
    // Cases where the UPSERT actually writes a row:
    //   1. The row does not exist (first claim).
    //   2. The row exists but `expires_at` has passed (previous
    //      owner crashed / TTL elapsed).
    //   3. The row exists and the previous owner IS us (re-entrant
    //      claim, e.g. after a session fail/retry).
    // In every other case the ON CONFLICT DO UPDATE skips and no
    // row is returned, signalling "another live worker still owns
    // this lock".
    const { rows } = await this.client.query<{
      owner_id: string
      owner_token: string
      expires_at: Date
    }>(
      /* sql */ `
        INSERT INTO stream_locks
          (stream_id, owner_id, owner_token, expires_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (stream_id) DO UPDATE
          SET owner_id    = EXCLUDED.owner_id,
              owner_token = EXCLUDED.owner_token,
              expires_at  = EXCLUDED.expires_at
          WHERE stream_locks.expires_at <= NOW()
             OR stream_locks.owner_id    = EXCLUDED.owner_id
        RETURNING owner_id, owner_token, expires_at
      `,
      [streamId, this.workerId, newToken, expiresAt],
    )

    if (rows.length === 0) {
      this.structuredLogger.debug("Postgres lock acquisition denied", {
        streamId,
        reason: "another worker owns lock",
      })
      return null
    }
    const row = rows[0]
    if (row.owner_id !== this.workerId) {
      // Defensive: PostgreSQL would only return a different owner if
      // the WHERE filter expanded somehow. Treat as "lost race".
      this.structuredLogger.warn("Postgres lock returned unexpected owner", {
        streamId,
        expectedOwner: this.workerId,
        actualOwner: row.owner_id,
      })
      return null
    }
    this.structuredLogger.info("Postgres lock acquired", {
      streamId,
      token: row.owner_token,
      expiresAt: row.expires_at.toISOString(),
    })
    return {
      streamId,
      workerId: this.workerId,
      token: row.owner_token,
      acquiredAt: now,
      expiresAt: row.expires_at.getTime(),
    }
  }

  async renew(streamId: string, token: LockToken): Promise<boolean> {
    const expiresAt = new Date(Date.now() + this.ttlMs)
    const { rowCount } = await this.client.query(
      /* sql */ `
        UPDATE stream_locks
           SET expires_at = $1
         WHERE stream_id   = $2
           AND owner_id    = $3
           AND owner_token = $4
           AND expires_at  > NOW()
      `,
      [expiresAt, streamId, this.workerId, token.token],
    )
    if (rowCount === 1) {
      this.structuredLogger.debug("Postgres lock renewed", {
        streamId,
        newExpiresAt: expiresAt.toISOString(),
      })
    } else {
      this.structuredLogger.warn("Postgres lock renewal failed", {
        streamId,
        reason: "lock lost or expired",
      })
    }
    return rowCount === 1
  }

  async release(streamId: string, token: LockToken): Promise<boolean> {
    const { rowCount } = await this.client.query(
      /* sql */ `
        DELETE FROM stream_locks
         WHERE stream_id   = $1
           AND owner_id    = $2
           AND owner_token = $3
      `,
      [streamId, this.workerId, token.token],
    )
    if (rowCount === 1) {
      this.structuredLogger.debug("Postgres lock released", { streamId })
    } else {
      this.structuredLogger.warn("Postgres lock release failed", {
        streamId,
        reason: "lock not found or token mismatch",
      })
    }
    return rowCount === 1
  }

  async releaseAll(): Promise<void> {
    const { rowCount } = await this.client.query(
      /* sql */ `DELETE FROM stream_locks WHERE owner_id = $1`,
      [this.workerId],
    )
    this.structuredLogger.info("All Postgres locks released", {
      workerId: this.workerId,
      count: rowCount,
    })
  }

  async close(): Promise<void> {
    this.structuredLogger.info("Closing PostgresLockManager")
    try {
      await this.releaseAll()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.structuredLogger.error("releaseAll on shutdown failed", {
        error: message,
      })
      this.logger.warn(
        `[${this.workerId}] releaseAll on shutdown failed: ${String(err)}`,
      )
    }
    try {
      await this.client.end()
      this.structuredLogger.info("Postgres client closed successfully")
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.structuredLogger.error("Closing pg client failed", {
        error: message,
      })
      this.logger.warn(
        `[${this.workerId}] closing pg client failed: ${String(err)}`,
      )
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Factory                                                            *
 * ------------------------------------------------------------------ */

export type LockBackend = "memory" | "postgres"

export interface CreateLockManagerOptions extends LockManagerOptions {
  backend: LockBackend
  databaseUrl?: string
}

/**
 * Pick a {@link LockManager} implementation based on the worker's
 * `LOCK_BACKEND` env var and install any one-time setup. Throws a
 * descriptive error if `postgres` is selected without a
 * `DATABASE_URL` — silently falling back to in-process locking
 * would defeat the entire purpose of horizontal scaling, so we
 * prefer fail-fast over a quietly-broken deployment.
 */
export async function createLockManager(
  options: CreateLockManagerOptions,
): Promise<LockManager> {
  const structuredLogger = options.structuredLogger ?? new Logger({ workerId: options.workerId })
  structuredLogger.info("Creating LockManager", {
    backend: options.backend,
    workerId: options.workerId,
    ttlMs: options.ttlMs,
  })
  if (options.backend === "postgres") {
    if (!options.databaseUrl) {
      throw new Error(
        "LOCK_BACKEND=postgres requires DATABASE_URL to be set",
      )
    }
    const pg = new PostgresLockManager({
      workerId: options.workerId,
      ttlMs: options.ttlMs,
      logger: options.logger,
      structuredLogger: options.structuredLogger,
      databaseUrl: options.databaseUrl,
    })
    await pg.install()
    return pg
  }
  const mem = new MemoryLockManager({
    ...options,
    structuredLogger: options.structuredLogger,
  })
  await mem.install()
  return mem
}
