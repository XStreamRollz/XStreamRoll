import { Server } from "http"
import { AddressInfo } from "net"
import axios from "axios"
import {
  getMetrics,
  incrementProcessed,
  incrementErrors,
  markReady,
  markShuttingDown,
  setQueueDepth,
  startMetricsServer,
} from "../src/metrics"

describe("metrics counters", () => {
  it("getMetrics returns expected shape", () => {
    const m = getMetrics()
    expect(typeof m.messagesProcessed).toBe("number")
    expect(typeof m.errors).toBe("number")
    expect(typeof m.queueDepth).toBe("number")
    expect(typeof m.uptimeSeconds).toBe("number")
  })

  it("incrementProcessed increases messagesProcessed", () => {
    const before = getMetrics().messagesProcessed
    incrementProcessed()
    expect(getMetrics().messagesProcessed).toBe(before + 1)
  })

  it("incrementErrors increases errors", () => {
    const before = getMetrics().errors
    incrementErrors()
    expect(getMetrics().errors).toBe(before + 1)
  })

  it("setQueueDepth updates queueDepth", () => {
    setQueueDepth(42)
    expect(getMetrics().queueDepth).toBe(42)
    setQueueDepth(0)
  })

  it("uptimeSeconds is non-negative", () => {
    expect(getMetrics().uptimeSeconds).toBeGreaterThanOrEqual(0)
  })
})

describe("metrics server", () => {
  let server: Server
  let baseUrl: string

  beforeAll((done) => {
    server = startMetricsServer(0)
    server.on("listening", () => {
      const addr = server.address() as AddressInfo
      baseUrl = `http://localhost:${addr.port}`
      done()
    })
  })

  afterAll((done) => {
    server.close(done)
  })

  it("GET /metrics returns Prometheus format by default", async () => {
    const res = await axios.get(`${baseUrl}/metrics`)
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toBe("text/plain; version=0.0.4")
    expect(res.data).toContain("# HELP xstreamroll_messages_processed_total")
    expect(res.data).toContain("# TYPE xstreamroll_messages_processed_total counter")
    expect(res.data).toContain("xstreamroll_messages_processed_total")
    expect(res.data).toContain("# HELP xstreamroll_uptime_seconds")
  })

  it("GET /metrics/prometheus returns Prometheus format", async () => {
    const res = await axios.get(`${baseUrl}/metrics/prometheus`)
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toBe("text/plain; version=0.0.4")
    expect(res.data).toContain("xstreamroll_uptime_seconds")
  })

  it("GET /metrics/json returns JSON format", async () => {
    const res = await axios.get(`${baseUrl}/metrics/json`)
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toBe("application/json")
    expect(res.data).toHaveProperty("uptimeSeconds")
    expect(res.data).toHaveProperty("messagesProcessed")
  })

  it("GET /metrics with Accept: application/json returns JSON format", async () => {
    const res = await axios.get(`${baseUrl}/metrics`, {
      headers: { Accept: "application/json" },
    })
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toBe("application/json")
    expect(res.data).toHaveProperty("uptimeSeconds")
  })

  it("GET /metrics with Accept: application/json, text/plain returns Prometheus format", async () => {
    const res = await axios.get(`${baseUrl}/metrics`, {
      headers: { Accept: "application/json, text/plain" },
    })
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toBe("text/plain; version=0.0.4")
    expect(res.data).toContain("xstreamroll_uptime_seconds")
  })

  it("GET /metrics with Accept: */* returns Prometheus format", async () => {
    const res = await axios.get(`${baseUrl}/metrics`, {
      headers: { Accept: "*/*" },
    })
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toBe("text/plain; version=0.0.4")
    expect(res.data).toContain("xstreamroll_uptime_seconds")
  })

  it("GET /invalid-route returns 404", async () => {
    await expect(axios.get(`${baseUrl}/invalid-route`)).rejects.toThrow()
    try {
      await axios.get(`${baseUrl}/invalid-route`)
    } catch (err: unknown) {
      const axiosError = err as { response?: { status: number } }
      expect(axiosError.response?.status).toBe(404)
    }
  })

  describe("health endpoints", () => {
    afterEach(() => {
      // Ensure readiness flag never leaks across tests.
      markReady()
    })

    it("GET /livez returns 200 even when shutting down", async () => {
      markShuttingDown()
      const res = await axios.get(`${baseUrl}/livez`)
      expect(res.status).toBe(200)
      expect(res.data.status).toBe("ok")
    })

    it("GET /healthz returns 200 and ok payload when ready", async () => {
      markReady()
      const res = await axios.get(`${baseUrl}/healthz`)
      expect(res.status).toBe(200)
      expect(res.data.status).toBe("ok")
      expect(typeof res.data.timestamp).toBe("string")
    })

    it("GET /healthz returns 503 when shutting down", async () => {
      markShuttingDown()
      try {
        await axios.get(`${baseUrl}/healthz`)
        throw new Error("expected request to fail")
      } catch (err: unknown) {
        const axiosError = err as { response?: { status: number; data?: { status: string } } }
        expect(axiosError.response?.status).toBe(503)
        expect(axiosError.response?.data?.status).toBe("shutting-down")
      }
    })
  })
})
