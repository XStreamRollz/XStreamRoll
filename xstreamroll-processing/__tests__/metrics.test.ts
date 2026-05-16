import {
  getMetrics,
  incrementProcessed,
  incrementErrors,
  setQueueDepth,
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
