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
    if (req.method === "GET" && req.url === "/metrics") {
      const body = JSON.stringify(getMetrics())
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(body)
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  server.listen(port, () => {
    console.log(`[metrics] server listening on port ${port}`)
  })

  return server
}
