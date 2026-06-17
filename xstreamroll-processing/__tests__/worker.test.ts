/**
 * Tests that the graceful shutdown destroys the shared HTTP keep-alive
 * agent (issue #225: the old code created a brand-new Agent and called
 * destroy() on it — a no-op for the actual connection pool).
 */

import http from "http"

jest.mock("../src/config", () => ({
  env: {
    API_URL: "http://localhost:3001",
    NODE_ENV: "test",
    POLL_INTERVAL_MS: "5000",
  },
}))

// Capture the config passed to axios.create so we can assert it
// includes the shared httpAgent.
let axiosCreateConfig: Record<string, unknown> | undefined
jest.mock("axios", () => {
  const noop = () => Promise.resolve({ data: [] })
  return {
    __esModule: true,
    default: {
      create: (config: Record<string, unknown>) => {
        axiosCreateConfig = config
        return { get: noop, post: noop }
      },
    },
  }
})

// Prevent process.exit from terminating the test runner.
const exitSpy = jest.spyOn(process, "exit").mockImplementation((() => {}) as never)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { httpAgent, shutdown } = require("../src/worker")

afterAll(() => {
  exitSpy.mockRestore()
})

describe("worker HTTP agent", () => {
  it("exports a keep-alive http.Agent", () => {
    expect(httpAgent).toBeInstanceOf(http.Agent)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((httpAgent as any).keepAlive).toBe(true)
  })

  it("axios.create is called with the shared httpAgent", () => {
    expect(axiosCreateConfig?.httpAgent).toBe(httpAgent)
  })
})

describe("worker shutdown", () => {
  it("destroys the shared httpAgent on shutdown", async () => {
    const destroySpy = jest.spyOn(httpAgent, "destroy")
    await shutdown("SIGTERM")
    expect(destroySpy).toHaveBeenCalledTimes(1)
    destroySpy.mockRestore()
  })

  it("calls process.exit(0) on shutdown", async () => {
    await shutdown("SIGINT")
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it("shutdown is idempotent — second call is a no-op", async () => {
    const destroySpy = jest.spyOn(httpAgent, "destroy")
    // shuttingDown is already true from the previous tests
    await shutdown("SIGTERM")
    expect(destroySpy).not.toHaveBeenCalled()
    destroySpy.mockRestore()
  })
})
