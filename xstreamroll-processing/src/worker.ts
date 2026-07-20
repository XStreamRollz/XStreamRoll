import http from "http"

import axios from "axios"

import { env } from "./config"
import { type LockManager, createLockManager } from "./leader-election"
import { GracefulShutdown, ShutdownReason } from "./lifecycle"
import { markShuttingDown, startMetricsServer } from "./metrics"
import { EventFilter } from "./pipeline"
import { ProcessedStreamEvent, StreamEvent } from "./session"
import { SessionRegistry } from "./session-registry"

const API_URL = env.API_URL
const WORKER_ID = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const POLL_INTERVAL_MS = Number(env.POLL_INTERVAL_MS)
const MAX_CONCURRENT_SESSIONS = Math.max(
  1,
  Number(process.env.MAX_CONCURRENT_SESSIONS ?? 32),
)
// `env.LOCK_BACKEND` may be missing in hand-rolled test mocks; fall
// back to the safe default so we don't crash on import.
const LOCK_BACKEND: "memory" | "postgres" =
  (env.LOCK_BACKEND as "memory" | "postgres" | undefined) ?? "memory"
const LOCK_TTL_MS: number = (env.LOCK_TTL_MS as number | undefined) ?? 30_000

// Shared keep-alive agent so axios reuses TCP connections and we can
// explicitly destroy the pool on graceful shutdown.
export const httpAgent = new http.Agent({ keepAlive: true })

/**
 * HTTP server that exposes worker metrics and probes to Kubernetes.
 * Started at module load only when NOT in tests so the production
 * container has a stable port that the kubelet can probe. The server
 * is held in module scope so the graceful shutdown sequence (registered
 * below) can close it without losing the reference.
 */
export const metricsServer =
  env.NODE_ENV !== "test" ? startMetricsServer(3002) : null

// Axios instance that routes all requests through the shared agent.
export const axiosInstance = axios.create({ httpAgent })

// Module-scoped state used by the shutdown hooks. Both are assigned
// by `start()` once the lock manager has been installed and the
// registry has been constructed. Kept as `let` rather than `const`
// to keep the option open for tests that re-initialise them.
let lockManager: LockManager | null = null
let registry: SessionRegistry | null = null
let shuttingDown = false
let pollPromise: Promise<void> = Promise.resolve()
// Errors-per-dedupe-key are kept in a single Map with an LRU cap so
// a sustained outage with varied error messages cannot grow memory
// without bound. Map preserves insertion order so `keys().next()`
// is always the oldest entry. Bump a key by `delete` + `set` when
// it's seen again to make sure the LRU scan treats it as newest.
const ROUTE_ERROR_DEDUPE_MS = 30_000
const MAX_TRACKED_ERROR_KEYS = 100
interface DedupeState {
  lastLoggedAtMs: number
  /** suppressed-repeats since the last log line that escaped the window */
  suppressedBatch: number
}
const routeErrorDedupe = new Map<string, DedupeState>()

const filter = new EventFilter()

async function initLockManager(): Promise<LockManager> {
  return await createLockManager({
    workerId: WORKER_ID,
    backend: LOCK_BACKEND,
    databaseUrl: env.DATABASE_URL,
    ttlMs: LOCK_TTL_MS,
  })
}

async function pollOnce(): Promise<void> {
  if (!registry) return
  let events: StreamEvent[] = []
  try {
    const response = await axiosInstance.get<StreamEvent[]>(
      `${API_URL}/streams/pending`,
    )
    events = Array.isArray(response.data) ? response.data : []
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[${WORKER_ID}] polling failed: ${message}`)
    return
  }

  for (const event of events) {
    if (
      !event ||
      typeof event.streamId !== "string" ||
      event.streamId.length === 0
    ) {
      console.warn(`[${WORKER_ID}] dropping malformed event`, event)
      continue
    }
    if (!filter.allow(event)) {
      continue // silently drop filtered events
    }
    let result: "enqueued" | "capacity" | "rejected" | "locked"
    try {
      // `route()` re-throws coordinator errors (lock backend
      // unreachable, etc.). Catching here keeps one bad event
      // from tearing down the entire poll loop — the next batch
      // gets a chance, the worker stays up, and we surface the
      // error in the logs (deduplicated so a sustained outage
      // doesn't flood stderr).
      result = await registry.route(event)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logRouteError(event.streamId, message)
      continue
    }
    if (result === "capacity") {
      const cap = registry.capacity()
      console.warn(
        `[${WORKER_ID}] at capacity (${cap.used}/${cap.max}); dropping event for stream ${event.streamId}`,
      )
    } else if (result === "rejected") {
      console.warn(
        `[${WORKER_ID}] session for stream ${event.streamId} no longer accepting events`,
      )
    } else if (result === "locked") {
      // Another live worker owns this stream; the event will be
      // re-polled by us or another worker after the holder
      // releases or its TTL expires (issue #216).
      console.log(
        `[${WORKER_ID}] stream ${event.streamId} owned by another worker; skipping`,
      )
    }
  }
}

async function start(): Promise<void> {
  try {
    lockManager = await initLockManager()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(
      `[${WORKER_ID}] failed to initialise ${LOCK_BACKEND} lock manager: ${message}`,
    )
    if (env.NODE_ENV === "test") {
      // In tests, surface the failure as a rejected module load would
      // do, but `void start()` swallows rejections. Re-throw via a
      // process-warning so test runners see the cause.
      console.warn(
        `[${WORKER_ID}] tests will see previously-routed events only`,
      )
    }
    return
  }

  registry = new SessionRegistry(
    WORKER_ID,
    {
      async publish(event: ProcessedStreamEvent): Promise<void> {
        await axiosInstance.post(`${API_URL}/streams/processed`, event)
      },
    },
    {
      maxConcurrentSessions: MAX_CONCURRENT_SESSIONS,
      lockManager,
    },
  )

  console.log(
    `[${WORKER_ID}] stream processor started ` +
      `(max concurrent sessions=${MAX_CONCURRENT_SESSIONS}, ` +
      `poll=${POLL_INTERVAL_MS}ms, lockBackend=${LOCK_BACKEND})`,
  )

  // Drive the first poll immediately so the worker doesn't wait a full
  // interval on startup, then chain polls so a slow API call cannot
  // produce overlapping pollers.
  const loop = async (): Promise<void> => {
    while (!shuttingDown) {
      await pollOnce()
      if (shuttingDown) break
      await sleep(POLL_INTERVAL_MS)
    }
  }
  pollPromise = loop()
}

const gracefulShutdown = new GracefulShutdown({
  timeoutMs: 15_000,
})

gracefulShutdown.register({
  name: "stop poll loop",
  run: () => {
    shuttingDown = true
  },
})

gracefulShutdown.register({
  name: "drain sessions",
  run: async () => {
    // Wait for the in-flight poll cycle to finish before draining
    // sessions so we don't tear state out from under it.
    await pollPromise
    if (!registry) return
    await registry.drainAll()
  },
})

gracefulShutdown.register({
  name: "release locks",
  run: async () => {
    if (!lockManager) return
    try {
      await lockManager.releaseAll()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[${WORKER_ID}] lockManager.releaseAll failed: ${message}`)
    }
  },
})

gracefulShutdown.register({
  name: "close lock manager",
  run: async () => {
    if (!lockManager) return
    try {
      await lockManager.close()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[${WORKER_ID}] lockManager.close failed: ${message}`)
    }
  },
})

gracefulShutdown.register({
  name: "close http pool",
  run: () => {
    // Destroy the shared keep-alive agent so all pooled sockets are
    // released and the process can exit promptly after drain.
    httpAgent.destroy()
  },
})

gracefulShutdown.register({
  name: "stop metrics server",
  run: () =>
    new Promise<void>((resolve, reject) => {
      // Flip the readiness flag first so any in-flight probe sees
      // 503 and the kubelet removes us from service endpoints.
      markShuttingDown()
      if (!metricsServer) {
        resolve()
        return
      }
      metricsServer.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    }),
})

if (env.NODE_ENV !== "test") {
  gracefulShutdown.install()
}

/** Exported for testing: triggers the graceful-shutdown sequence. */
export const shutdown = (signal: string): Promise<void> =>
  gracefulShutdown.requestShutdown(signal as ShutdownReason)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(), ms)
    if (typeof timer.unref === "function") timer.unref()
  })
}

/**
 * Log a routing error, deduplicating identical messages that
 * recur within {@link ROUTE_ERROR_DEDUPE_MS}. The first occurrence
 * prints immediately; repeats are counted and surface in a single
 * summary line when the next occurrence crosses the dedupe window.
 */
function logRouteError(streamId: string, message: string): void {
  const key = `${streamId}::${message}`
  const now = Date.now()

  // Bound memory: when a brand-new key arrives and we are at the
  // LRU cap, evict the entry whose `lastLoggedAtMs` is the
  // smallest — that key's dedup window has spent the most time
  // outside the active suppression period, so it is the most
  // likely candidate for a post-suppression log next.
  if (
    !routeErrorDedupe.has(key) &&
    routeErrorDedupe.size >= MAX_TRACKED_ERROR_KEYS
  ) {
    let evictKey: string | undefined
    let evictAt = Number.POSITIVE_INFINITY
    for (const [k, v] of routeErrorDedupe) {
      if (v.lastLoggedAtMs < evictAt) {
        evictAt = v.lastLoggedAtMs
        evictKey = k
      }
    }
    if (evictKey !== undefined) {
      routeErrorDedupe.delete(evictKey)
    }
  }
  const existing = routeErrorDedupe.get(key) ?? {
    lastLoggedAtMs: 0,
    suppressedBatch: 0,
  }
  routeErrorDedupe.delete(key)
  routeErrorDedupe.set(key, existing)

  if (now - existing.lastLoggedAtMs >= ROUTE_ERROR_DEDUPE_MS) {
    const tag =
      existing.suppressedBatch > 0
        ? ` (${existing.suppressedBatch} similar errors suppressed in the last ${ROUTE_ERROR_DEDUPE_MS / 1000}s)`
        : ""
    console.error(
      `[${WORKER_ID}] routing event for ${streamId} failed: ${message}${tag}`,
    )
    existing.lastLoggedAtMs = now
    existing.suppressedBatch = 0
  } else {
    existing.suppressedBatch += 1
  }
}

void start()
