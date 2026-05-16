import axios from "axios"
import { env } from "./config"
import { SessionRegistry } from "./session-registry"
import { ProcessedStreamEvent, StreamEvent } from "./session"

const API_URL = env.API_URL
const WORKER_ID = `worker-${Date.now()}`
const POLL_INTERVAL_MS = Number(env.POLL_INTERVAL_MS)
const MAX_CONCURRENT_SESSIONS = Math.max(
  1,
  Number(process.env.MAX_CONCURRENT_SESSIONS ?? 32),
)

const registry = new SessionRegistry(
  WORKER_ID,
  {
    async publish(event: ProcessedStreamEvent): Promise<void> {
      await axios.post(`${API_URL}/streams/processed`, event)
    },
  },
  { maxConcurrentSessions: MAX_CONCURRENT_SESSIONS },
)

async function pollOnce(): Promise<void> {
  let events: StreamEvent[] = []
  try {
    const response = await axios.get<StreamEvent[]>(`${API_URL}/streams/pending`)
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

let shuttingDown = false
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[${WORKER_ID}] ${signal} received — draining sessions`)
  try {
    await registry.drainAll()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[${WORKER_ID}] drain failed: ${message}`)
  }
  console.log(`[${WORKER_ID}] shutdown complete`)
  process.exit(0)
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

void start()
