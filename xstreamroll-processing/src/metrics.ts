import { createServer, IncomingMessage, ServerResponse } from "http"

export interface Metrics {
  messagesProcessed: number
  errors: number
  queueDepth: number
  uptimeSeconds: number
  // Lock-related metrics (issue #338)
  lockAcquisitionsTotal: number
  lockAcquisitionsDenied: number
  lockRenewalsTotal: number
  lockRenewalsFailed: number
  lockReleasesTotal: number
  lockReleasesFailed: number
  activeLocks: number
  concurrentRouteDedupes: number
}

const startTime = Date.now()
const counters = {
  messagesProcessed: 0,
  errors: 0,
  queueDepth: 0,
  // Lock-related metrics (issue #338)
  lockAcquisitionsTotal: 0,
  lockAcquisitionsDenied: 0,
  lockRenewalsTotal: 0,
  lockRenewalsFailed: 0,
  lockReleasesTotal: 0,
  lockReleasesFailed: 0,
  activeLocks: 0,
  concurrentRouteDedupes: 0,
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

// Lock-related metrics (issue #338)
export function incrementLockAcquisitions(): void {
  counters.lockAcquisitionsTotal++
  counters.activeLocks++
}

export function incrementLockAcquisitionsDenied(): void {
  counters.lockAcquisitionsDenied++
}

export function incrementLockRenewals(): void {
  counters.lockRenewalsTotal++
}

export function incrementLockRenewalsFailed(): void {
  counters.lockRenewalsFailed++
  counters.activeLocks--
}

export function incrementLockReleases(): void {
  counters.lockReleasesTotal++
  counters.activeLocks--
}

export function incrementLockReleasesFailed(): void {
  counters.lockReleasesFailed++
}

export function incrementConcurrentRouteDedupes(): void {
  counters.concurrentRouteDedupes++
}

export function setActiveLocks(count: number): void {
  counters.activeLocks = count
}

export function getMetrics(): Metrics {
  return {
    ...counters,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
  }
}

/**
 * State that the metrics server exposes to its /healthz endpoint. The
 * worker toggles this from its top-level `shuttingDown` flag so that
 * Kubernetes can drain traffic before SIGTERM completes.
 */
let live = true

/** Mark the server as no-longer-ready. Called by the worker on shutdown. */
export function markShuttingDown(): void {
  live = false
}

/** Mark the server as ready again. Exposed for tests. */
export function markReady(): void {
  live = true
}

export function startMetricsServer(port = 3002): ReturnType<typeof createServer> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url || ""
    const accept = (req.headers.accept || "").toLowerCase()

    if (req.method === "GET") {
      // Pure liveness probe — always 200 if the process is alive.
      // We deliberately do not consult the `live` flag here so that
      // Kubernetes does not restart the pod during a graceful drain.
      if (url === "/livez") {
        const body = JSON.stringify({
          status: "ok",
          timestamp: new Date().toISOString(),
        })
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(body)
        return
      }

      // Readiness probe — returns 503 once shutdown begins so that the
      // pod is removed from any service endpoints before the loop dies.
      if (url === "/healthz" || url === "/health") {
        if (!live) {
          res.writeHead(503, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ status: "shutting-down" }))
          return
        }
        const body = JSON.stringify({
          status: "ok",
          timestamp: new Date().toISOString(),
        })
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(body)
        return
      }

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
            `# HELP xstreamroll_lock_acquisitions_total Total lock acquisitions attempted`,
            `# TYPE xstreamroll_lock_acquisitions_total counter`,
            `xstreamroll_lock_acquisitions_total ${m.lockAcquisitionsTotal}`,
            `# HELP xstreamroll_lock_acquisitions_denied Total lock acquisitions denied (another worker owns stream)`,
            `# TYPE xstreamroll_lock_acquisitions_denied counter`,
            `xstreamroll_lock_acquisitions_denied ${m.lockAcquisitionsDenied}`,
            `# HELP xstreamroll_lock_renewals_total Total lock renewals attempted`,
            `# TYPE xstreamroll_lock_renewals_total counter`,
            `xstreamroll_lock_renewals_total ${m.lockRenewalsTotal}`,
            `# HELP xstreamroll_lock_renewals_failed Total lock renewals that failed (lock lost)`,
            `# TYPE xstreamroll_lock_renewals_failed counter`,
            `xstreamroll_lock_renewals_failed ${m.lockRenewalsFailed}`,
            `# HELP xstreamroll_lock_releases_total Total lock releases attempted`,
            `# TYPE xstreamroll_lock_releases_total counter`,
            `xstreamroll_lock_releases_total ${m.lockReleasesTotal}`,
            `# HELP xstreamroll_lock_releases_failed Total lock releases that failed`,
            `# TYPE xstreamroll_lock_releases_failed counter`,
            `xstreamroll_lock_releases_failed ${m.lockReleasesFailed}`,
            `# HELP xstreamroll_active_locks Current number of active locks held`,
            `# TYPE xstreamroll_active_locks gauge`,
            `xstreamroll_active_locks ${m.activeLocks}`,
            `# HELP xstreamroll_concurrent_route_dedupes Total concurrent route() calls deduplicated`,
            `# TYPE xstreamroll_concurrent_route_dedupes counter`,
            `xstreamroll_concurrent_route_dedupes ${m.concurrentRouteDedupes}`,
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
