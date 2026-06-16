import { createServer, IncomingMessage, ServerResponse } from "http"

export interface Metrics {
  messagesProcessed: number
  errors: number
  queueDepth: number
  uptimeSeconds: number
}

const startTime = Date.now()
const counters = {
  messagesProcessed: 0,
  errors: 0,
  queueDepth: 0,
}

export function incrementProcessed(): void {
  counters.messagesProcessed++
}

export function incrementErrors(): void {
  counters.errors++
}

export function setQueueDepth(depth: number): void {
  counters.queueDepth = depth
}

export function getMetrics(): Metrics {
  return {
    ...counters,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
  }
}

export function startMetricsServer(port = 3002): ReturnType<typeof createServer> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url || ""
    const accept = (req.headers.accept || "").toLowerCase()

    if (req.method === "GET") {
      if (url === "/metrics/json") {
        const body = JSON.stringify(getMetrics())
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(body)
        return
      }

      if (url === "/metrics" || url === "/metrics/" || url === "/metrics/prometheus") {
        const wantsJson =
          accept.includes("application/json") &&
          !accept.includes("text/plain") &&
          !accept.includes("*/*")

        if (wantsJson) {
          const body = JSON.stringify(getMetrics())
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(body)
        } else {
          const m = getMetrics()
          const body = [
            `# HELP xstreamroll_messages_processed_total Total messages processed by the worker`,
            `# TYPE xstreamroll_messages_processed_total counter`,
            `xstreamroll_messages_processed_total ${m.messagesProcessed}`,
            `# HELP xstreamroll_errors_total Total errors encountered by the worker`,
            `# TYPE xstreamroll_errors_total counter`,
            `xstreamroll_errors_total ${m.errors}`,
            `# HELP xstreamroll_queue_depth Current queue depth of the worker`,
            `# TYPE xstreamroll_queue_depth gauge`,
            `xstreamroll_queue_depth ${m.queueDepth}`,
            `# HELP xstreamroll_uptime_seconds Uptime of the worker in seconds`,
            `# TYPE xstreamroll_uptime_seconds gauge`,
            `xstreamroll_uptime_seconds ${m.uptimeSeconds}`,
          ].join("\n") + "\n"

          res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" })
          res.end(body)
        }
        return
      }
    }

    res.writeHead(404)
    res.end()
  })

  server.listen(port, () => {
    console.log(`[metrics] server listening on port ${port}`)
  })

  return server
}
