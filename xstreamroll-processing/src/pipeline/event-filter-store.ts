/**
 * Distributed filter-config storage for the worker (issue #351).
 *
 * The {@link EventFilter} hot path is a synchronous `Map` lookup —
 * it takes ~no time per event and happens once for every poll. The
 * Map is populated from a {@link FilterConfigStore} that owns:
 *
 *   1. **Initial bulk-load** — every stream's current config is
 *      loaded into the in-memory map at startup so a freshly-spun
 *      worker doesn't have to wait for the next change to discover
 *      what it should be dropping.
 *
 *   2. **Live propagation** — a subsequent `setConfig`/`clearConfig`
 *      from any worker in the cluster must reach every other worker
 *      within a couple of seconds, otherwise a filtered event slips
 *      through on a peer pod.
 *
 * Two implementations ship:
 *
 *   - {@link MemoryFilterConfigStore} — in-process. Matches the
 *     pre-issue behaviour. Used by default in tests and in any
 *     single-worker deployment.
 *
 *   - {@link RedisFilterConfigStore} — backed by a single Redis hash
 *     (`xstreamroll:event_filter_configs`) plus a pub/sub channel
 *     (`xstreamroll:event_filter_updates`) for live updates. A short
 *     reconcile interval backfills any pub/sub messages that were
 *     missed across reconnects.
 *
 * Pick an implementation through {@link createFilterConfigStore},
 * which mirrors {@link createLockManager} so the worker code stays
 * declarative.
 */

import Redis from "ioredis"
import type { FilterConfig } from "./event-filter"

/** A single change to the per-stream config map. */
export type FilterChange =
  | { kind: "set"; streamId: string; config: FilterConfig }
  | { kind: "clear"; streamId: string }

/** Options common to every {@link FilterConfigStore} implementation. */
export interface FilterConfigStoreOptions {
  /** Free-form worker identity used in log lines. */
  workerId?: string
  logger?: Pick<Console, "log" | "warn" | "error">
}

/**
 * Abstract base. {@link EventFilter} treats the store as a black
 * box; concrete backends are picked through {@link createFilterConfigStore}.
 */
export abstract class FilterConfigStore {
  protected readonly workerId: string
  protected readonly logger: Pick<Console, "log" | "warn" | "error">

  constructor(options: FilterConfigStoreOptions = {}) {
    this.workerId = options.workerId ?? "filter-store"
    this.logger = options.logger ?? console
  }

  /**
   * Wire the store up. Resolves to the canonical snapshot the store
   * believes is current at the moment install returns. The callback
   * fires once for each subsequent change observed by ANY source —
   * the local worker, a peer worker, or (for the Redis backend)
   * the periodic reconcile scan.
   *
   * MUST be called before the store is used. Idempotent in practice
   * — calling twice is safe but will replay the initial snapshot.
   */
  abstract install(
    onChange: (change: FilterChange) => void,
  ): Promise<Map<string, FilterConfig>>

  /** Persist a config and notify peers. */
  abstract setConfig(streamId: string, config: FilterConfig): Promise<void>

  /** Drop a config and notify peers. */
  abstract clearConfig(streamId: string): Promise<void>

  /** Release transport resources. */
  abstract close(): Promise<void>
}

/* ------------------------------------------------------------------ *
 *  In-process implementation                                          *
 * ------------------------------------------------------------------ */

/**
 * Single-process store. Stays consistent only inside a single worker
 * process — the default in tests and in single-worker deployments.
 * `setConfig`/`clearConfig` notify the {@link EventFilter} via the
 * {@link install} callback synchronously, so the in-memory map is
 * updated by the time `setConfig` returns.
 */
export class MemoryFilterConfigStore extends FilterConfigStore {
  private readonly store = new Map<string, FilterConfig>()
  private onChange: ((change: FilterChange) => void) | null = null

  async install(
    onChange: (change: FilterChange) => void,
  ): Promise<Map<string, FilterConfig>> {
    this.onChange = onChange
    return new Map(this.store)
  }

  async setConfig(streamId: string, config: FilterConfig): Promise<void> {
    const snapshot: FilterConfig = {
      blockedEventTypes: [...config.blockedEventTypes],
    }
    this.store.set(streamId, snapshot)
    this.onChange?.({ kind: "set", streamId, config: snapshot })
  }

  async clearConfig(streamId: string): Promise<void> {
    this.store.delete(streamId)
    this.onChange?.({ kind: "clear", streamId })
  }

  async close(): Promise<void> {
    this.store.clear()
    this.onChange = null
  }

  /* ───── inspection helpers (used by tests) ───── */

  /** Number of entries currently held in the snapshot. */
  size(): number {
    return this.store.size
  }

  /**
   * Test-only injector: sets an entry WITHOUT firing the
   * onChange callback so tests can verify initial-install behaviour
   * without subsequently being notified.
   * @internal
   */
  __setEntryForTest(streamId: string, config: FilterConfig): void {
    this.store.set(streamId, { blockedEventTypes: [...config.blockedEventTypes] })
  }
}

/* ------------------------------------------------------------------ *
 *  Redis implementation                                               *
 * ------------------------------------------------------------------ */

export interface RedisFilterConfigStoreOptions extends FilterConfigStoreOptions {
  redisUrl: string
  /** Reconcile cadence in ms. Defaults to 30s. */
  reconcileMs?: number
  /** Override the Redis hash key. Mostly useful for tests. */
  hashKey?: string
  /** Override the pub/sub channel. Mostly useful for tests. */
  channel?: string
}

const DEFAULT_HASH_KEY = "xstreamroll:event_filter_configs"
const DEFAULT_CHANNEL = "xstreamroll:event_filter_updates"
const DEFAULT_RECONCILE_MS = 30_000

/**
 * Distributed store backed by a single Redis hash and a single pub/sub
 * channel. Workers race-free claim ownership of each `streamId`'s
 * config via the hash write; live updates fan out via the channel;
 * a periodic reconcile scan re-reads the hash so messages lost across
 * reconnects are recovered.
 *
 * Two Redis connections are held open per worker (one publisher, one
 * subscriber) — ioredis reuse the same client for everything, but
 * only one connection can be in subscribing mode at a time, and
 * we'd rather keep publish traffic off the subscription stream.
 */
export class RedisFilterConfigStore extends FilterConfigStore {
  private readonly publisher: Redis
  private readonly subscriber: Redis
  private readonly hashKey: string
  private readonly channel: string
  private readonly reconcileMs: number
  private onChange: ((change: FilterChange) => void) | null = null
  private reconcileTimer: NodeJS.Timeout | null = null
  private closed = false

  constructor(options: RedisFilterConfigStoreOptions) {
    super(options)
    this.hashKey = options.hashKey ?? DEFAULT_HASH_KEY
    this.channel = options.channel ?? DEFAULT_CHANNEL
    this.reconcileMs = options.reconcileMs ?? DEFAULT_RECONCILE_MS
    this.publisher = new Redis(options.redisUrl, {
      // Don't crash the worker if Redis is briefly unreachable at
      // startup — `install()` will surface the error in its awaited
      // path. Subsequent reconnects happen automatically.
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    })
    this.subscriber = new Redis(options.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    })
  }

  async install(
    onChange: (change: FilterChange) => void,
  ): Promise<Map<string, FilterConfig>> {
    if (this.closed) {
      throw new Error("RedisFilterConfigStore: install() called after close()")
    }
    this.onChange = onChange

    // Read the existing hash BEFORE subscribing so we don't race with
    // updates that arrive during HGETALL — a subsequent pub/sub
    // message would otherwise overwrite a fresher snapshot we just
    // pulled.
    const snapshot = await this.readHash()

    await this.subscriber.connect()
    await this.subscriber.subscribe(this.channel)
    this.subscriber.on("message", (channel, payload) => {
      if (channel !== this.channel) return
      try {
        const change = parseFilterPayload(payload)
        if (change) onChange(change)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.logger.warn(
          `[${this.workerId}] event_filter pub/sub payload dropped: ${message}`,
        )
      }
    })

    this.reconcileTimer = setInterval(() => {
      void this.reconcile()
    }, this.reconcileMs)
    if (typeof this.reconcileTimer.unref === "function") {
      this.reconcileTimer.unref()
    }

    return snapshot
  }

  async setConfig(streamId: string, config: FilterConfig): Promise<void> {
    if (this.closed) {
      throw new Error("RedisFilterConfigStore: setConfig after close()")
    }
    const payload = stringifyFilterPayload(streamId, config, this.workerId)
    await this.publisher.hset(this.hashKey, streamId, payload)
    await this.publisher.publish(this.channel, payload)
  }

  async clearConfig(streamId: string): Promise<void> {
    if (this.closed) {
      throw new Error("RedisFilterConfigStore: clearConfig after close()")
    }
    const payload = stringifyFilterPayload(streamId, null, this.workerId)
    await this.publisher.hdel(this.hashKey, streamId)
    await this.publisher.publish(this.channel, payload)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer)
      this.reconcileTimer = null
    }
    try {
      await this.subscriber.unsubscribe(this.channel)
    } catch {
      /* swallowed: close must never throw */
    }
    try {
      this.subscriber.disconnect()
    } catch {
      /* swallowed */
    }
    try {
      this.publisher.disconnect()
    } catch {
      /* swallowed */
    }
  }

  /* ───── inspection helpers (used by tests) ───── */

  /** Hash key used by this store instance. */
  hashKeyUsed(): string {
    return this.hashKey
  }

  /** Channel used by this store instance. */
  channelUsed(): string {
    return this.channel
  }

  private async readHash(): Promise<Map<string, FilterConfig>> {
    const raw = (await this.publisher.hgetall(this.hashKey)) as
      | Record<string, string>
      | null
    const out = new Map<string, FilterConfig>()
    if (!raw) return out
    for (const [streamId, payload] of Object.entries(raw)) {
      try {
        const parsed = parseFilterPayload(payload)
        if (parsed?.kind === "set") {
          out.set(streamId, parsed.config)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.logger.warn(
          `[${this.workerId}] stored filter config for ${streamId} could not be parsed: ${message}`,
        )
      }
    }
    return out
  }

  /**
   * Re-read the hash and emit `set` changes for every entry. We
   * deliberately do NOT emit `clear` from the reconcile scan —
   * removing a config that the last restart somehow lost from the
   * snapshot but which the peer still legitimately holds would
   * otherwise ripple deletes across the cluster. Deletes are owned
   * by explicit `clearConfig` calls.
   */
  private async reconcile(): Promise<void> {
    if (!this.onChange) return
    try {
      const snapshot = await this.readHash()
      for (const [streamId, config] of snapshot.entries()) {
        this.onChange({ kind: "set", streamId, config })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.warn(
        `[${this.workerId}] redis reconcile failed: ${message}`,
      )
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Wire format                                                        *
 * ------------------------------------------------------------------ */

interface WirePayload {
  streamId: string
  /** `null` → clear; an object → set. */
  config: FilterConfig | null
  /** Originating worker — for diagnostics only, not used for routing. */
  from: string
}

function stringifyFilterPayload(
  streamId: string,
  config: FilterConfig | null,
  from: string,
): string {
  const payload: WirePayload = { streamId, config, from }
  return JSON.stringify(payload)
}

function parseFilterPayload(raw: string): FilterChange | null {
  const parsed = JSON.parse(raw) as Partial<WirePayload>
  if (!parsed || typeof parsed.streamId !== "string") return null
  if (parsed.config === null) {
    return { kind: "clear", streamId: parsed.streamId }
  }
  if (
    parsed.config &&
    Array.isArray(parsed.config.blockedEventTypes) &&
    parsed.config.blockedEventTypes.every((v) => typeof v === "string")
  ) {
    return {
      kind: "set",
      streamId: parsed.streamId,
      config: {
        blockedEventTypes: [...parsed.config.blockedEventTypes],
      },
    }
  }
  return null
}

/* ------------------------------------------------------------------ *
 *  Factory                                                            *
 * ------------------------------------------------------------------ */

export type FilterBackend = "memory" | "redis"

export interface CreateFilterConfigStoreOptions extends FilterConfigStoreOptions {
  backend: FilterBackend
  redisUrl?: string
  reconcileMs?: number
}

/**
 * Pick a {@link FilterConfigStore} implementation. Mirrors
 * {@link createLockManager}: `memory` for tests + single-worker,
 * `redis` for any horizontally-scaled deployment that wants the
 * per-stream filter to agree across pods (issue #351).
 *
 * Throws a descriptive error if `redis` is selected without a URL —
 * a worker that quietly falls back to in-process state would defeat
 * the purpose of the issue.
 */
export async function createFilterConfigStore(
  options: CreateFilterConfigStoreOptions,
): Promise<FilterConfigStore> {
  if (options.backend === "redis") {
    if (!options.redisUrl) {
      throw new Error(
        "EVENT_FILTER_BACKEND=redis requires EVENT_FILTER_REDIS_URL (or REDIS_URL) to be set",
      )
    }
    return new RedisFilterConfigStore({
      redisUrl: options.redisUrl,
      workerId: options.workerId,
      logger: options.logger,
      reconcileMs: options.reconcileMs,
    })
  }
  return new MemoryFilterConfigStore(options)
}
