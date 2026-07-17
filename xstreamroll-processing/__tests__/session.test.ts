import { StreamSession, type StreamEvent, type ProcessedStreamEvent } from "../src/session"

function makeEvent(streamId = "s1"): StreamEvent {
  return { streamId, data: { type: "data" }, timestamp: new Date().toISOString() }
}

describe("StreamSession", () => {
  it("starts in the idle state", () => {
    const s = new StreamSession("s1", "w1", { publish: jest.fn() })
    expect(s.getState()).toBe("idle")
  })

  it("transitions to running on start()", () => {
    const s = new StreamSession("s1", "w1", { publish: jest.fn() })
    s.start()
    expect(s.getState()).toBe("running")
  })

  it("enqueues and publishes events in order", async () => {
    const published: ProcessedStreamEvent[] = []
    const s = new StreamSession("s1", "w1", {
      publish: async (e) => {
        published.push(e)
      },
    })
    s.start()
    s.enqueue(makeEvent())
    s.enqueue(makeEvent())
    // wait for pump to drain
    for (let i = 0; i < 20 && (s.pendingCount() > 0 || published.length < 2); i++) {
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(published).toHaveLength(2)
    expect(published[0].streamId).toBe("s1")
    expect(published[0].workerId).toBe("w1")
    expect(published[0].sessionId).toBe(s.id)
    expect(typeof published[0].processingLatencyMs).toBe("number")
  })

  it("publishes null latency for invalid event timestamps", async () => {
    const published: ProcessedStreamEvent[] = []
    const s = new StreamSession("s1", "w1", {
      publish: async (e) => {
        published.push(e)
      },
    })
    s.start()
    s.enqueue({ streamId: "s1", data: {}, timestamp: "not-a-date" })
    for (let i = 0; i < 20 && published.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(published[0].processingLatencyMs).toBeNull()
  })

  it("rejects new events when not running", () => {
    const s = new StreamSession("s1", "w1", { publish: jest.fn() })
    expect(s.enqueue(makeEvent())).toBe(false)
  })

  it("transitions to stopped via stop()", async () => {
    const s = new StreamSession("s1", "w1", { publish: jest.fn() })
    s.start()
    await s.stop()
    expect(s.getState()).toBe("stopped")
  })

  it("emits state and processed events", async () => {
    const s = new StreamSession("s1", "w1", { publish: async () => {} })
    const states: string[] = []
    const processed: string[] = []
    s.on("state", (n: string) => states.push(n))
    s.on("processed", (e: ProcessedStreamEvent) => processed.push(e.sessionId))
    s.start()
    s.enqueue(makeEvent())
    for (let i = 0; i < 20 && processed.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(states).toContain("running")
    expect(processed).toEqual([s.id])
  })

  it("fails on publish error and emits an error event", async () => {
    const s = new StreamSession("s1", "w1", {
      publish: async () => {
        throw new Error("api down")
      },
    })
    const errors: Error[] = []
    s.on("error", (e: Error) => errors.push(e))
    s.start()
    s.enqueue(makeEvent())
    for (let i = 0; i < 20 && errors.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe("api down")
    expect(s.getState()).toBe("errored")
  })

  it("is a no-op when stop() is called on a stopped session", async () => {
    const s = new StreamSession("s1", "w1", { publish: jest.fn() })
    s.start()
    await s.stop()
    await expect(s.stop()).resolves.toBeUndefined()
  })
})
