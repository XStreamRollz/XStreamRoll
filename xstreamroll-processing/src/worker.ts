import http from "http"
import axios from "axios"
import { env } from "./config"
import { EventFilter } from "./pipeline"
import { SessionRegistry } from "./session-registry"
import { ProcessedStreamEvent, StreamEvent } from "./session"
import { GracefulShutdown, ShutdownReason } from "./lifecycle"

const API_URL = env.API_URL
const WORKER_ID = `worker-${Date.now()}`
const POLL_INTERVAL_MS = Number(env.POLL_INTERVAL_MS)
const MAX_CONCURRENT_SESSIONS = Math.max(
  1,
  Number(process.env.MAX_CONCURRENT_SESSIONS ?? 32),
)

// Shared keep-alive agent so axios reuses TCP connections and we can
// explicitly destroy the pool on graceful shutdown.
export const httpAgent = new http.Agent({ keepAlive: true })

// Axios instance that routes all requests through the shared agent.
export const axiosInstance = axios.create({ httpAgent })

const registry = new SessionRegistry(
  WORKER_ID,
  {
    async publish(event: ProcessedStreamEvent): Promise<void> {
      await axiosInstance.post(`${API_URL}/streams/processed`, event)
    },
  },
  { maxConcurrentSessions: MAX_CONCURRENT_SESSIONS },
)

const filter = new EventFilter()

let shuttingDown = false

async function pollOnce(): Promise<void> {
  let events: StreamEvent[] = []
  try {
    const response = await axiosInstance.get<StreamEvent[]>(`${API_URL}/streams/pending`)
    events = Array.isArray(response.data) ? response.data : []
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[${WORKER_ID}] polling failed: ${message}`)
    return
  }

  for (const event of events) {
    if (!event || typeof event.streamId !== "string" || event.streamId.length === 0) {
      console.warn(`[${WORKER_ID}] dropping malformed event`, event)
      continue
    }
    if (!filter.allow(event)) {
      continue // silently drop filtered events
    }
    const result = registry.route(event)
    if (result === "capacity") {
      const cap = registry.capacity()
      console.warn(
        `[${WORKER_ID}] at capacity (${cap.used}/${cap.max}); dropping event for stream ${event.streamId}`,
      )
    } else if (result === "rejected") {
      console.warn(
        `[${WORKER_ID}] session for stream ${event.streamId} no longer accepting events`,
      )
    }
  }
}

async function start(): Promise<void> {
  console.log(
    `[${WORKER_ID}] stream processor started (max concurrent sessions=${MAX_CONCURRENT_SESSIONS}, poll=${POLL_INTERVAL_MS}ms)`,
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
  void loop()
}

const gracefulShutdown = new GracefulShutdown({ timeoutMs: 15_000 })

gracefulShutdown.register({
  name: "stop poll loop",
  run: () => {
    shuttingDown = true
  },
})

gracefulShutdown.register({
  name: "drain sessions",
  run: async () => {
    await registry.drainAll()
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

gracefulShutdown.install()

/** Exported for testing: triggers the graceful-shutdown sequence. */
export const shutdown = (signal: string): Promise<void> =>
  gracefulShutdown.requestShutdown(signal as ShutdownReason)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

void start()
