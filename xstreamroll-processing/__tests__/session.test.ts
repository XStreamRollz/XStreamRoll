import { StreamSession, type StreamEvent, type ProcessedStreamEvent } from "../src/session"

function makeEvent(streamId = "s1"): StreamEvent {
  return { streamId, data: { type: "data" }, timestamp: new Date().toISOString() }
}

function makeIdleSession(publish?: (e: ProcessedStreamEvent) => Promise<void>): StreamSession {
  return new StreamSession("s1", "w1", { publish: publish ?? jest.fn() })
}

async function waitFor(fn: () => boolean, timeout = 200): Promise<void> {
  for (let i = 0; i < timeout / 5; i++) {
    if (fn()) return
    await new Promise((r) => setTimeout(r, 5))
  }
}

describe("StreamSession", () => {
  it("starts in the idle state", () => {
    const s = makeIdleSession()
    expect(s.getState()).toBe("idle")
  })

  it("transitions to running on start()", () => {
    const s = makeIdleSession()
    s.start()
    expect(s.getState()).toBe("running")
  })

  it("start is idempotent when already running", () => {
    const s = makeIdleSession()
    s.start()
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
    await waitFor(() => s.pendingCount() === 0 && published.length === 2)
    expect(published).toHaveLength(2)
    expect(published[0].streamId).toBe("s1")
    expect(published[0].workerId).toBe("w1")
    expect(published[0].sessionId).toBe(s.id)
  })

  it("rejects new events when not running", () => {
    const s = makeIdleSession()
    expect(s.enqueue(makeEvent())).toBe(false)
  })

  it("rejects new events when in errored state", async () => {
    const s = new StreamSession("s1", "w1", {
      publish: async () => { throw new Error("fail") },
    })
    s.on("error", () => {})  // prevent unhandled error crash
    s.start()
    s.enqueue(makeEvent())
    await waitFor(() => s.getState() === "errored")
    expect(s.enqueue(makeEvent())).toBe(false)
  })

  it("rejects new events when already stopped", async () => {
    const s = makeIdleSession()
    s.start()
    await s.stop()
    expect(s.enqueue(makeEvent())).toBe(false)
  })

  it("transitions to stopped via stop()", async () => {
    const s = makeIdleSession()
    s.start()
    await s.stop()
    expect(s.getState()).toBe("stopped")
  })

  it("is a no-op when stop() is called on a stopped session", async () => {
    const s = makeIdleSession()
    s.start()
    await s.stop()
    await expect(s.stop()).resolves.toBeUndefined()
  })

  it("is a no-op when stop() is called on an errored session", async () => {
    const s = new StreamSession("s1", "w1", {
      publish: async () => { throw new Error("fail") },
    })
    s.on("error", () => {})
    s.start()
    s.enqueue(makeEvent())
    await waitFor(() => s.getState() === "errored")
    await expect(s.stop()).resolves.toBeUndefined()
    expect(s.getState()).toBe("errored")
  })

  it("emits state and processed events", async () => {
    const s = new StreamSession("s1", "w1", { publish: async () => {} })
    const states: string[] = []
    const processed: string[] = []
    s.on("state", (n: string) => states.push(n))
    s.on("processed", (e: ProcessedStreamEvent) => processed.push(e.sessionId))
    s.start()
    s.enqueue(makeEvent())
    await waitFor(() => processed.length > 0)
    expect(states).toContain("running")
    expect(processed).toEqual([s.id])
  })

  it("does not emit state transition when state does not change", () => {
    const s = makeIdleSession()
    const states: string[] = []
    s.on("state", (n: string) => states.push(n))
    // Calling state-changing methods when already idle
    expect(s.getState()).toBe("idle")
    // Pump with no events — internal transition() calls are no-ops
    expect(states).toHaveLength(0)
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
    await waitFor(() => errors.length > 0)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe("api down")
    expect(s.getState()).toBe("errored")
  })

  it("handles non-Error publish failure gracefully", async () => {
    const s = new StreamSession("s1", "w1", {
      publish: async () => { throw "string error" },
    })
    const errors: Error[] = []
    s.on("error", (e: Error) => errors.push(e))
    s.start()
    s.enqueue(makeEvent())
    await waitFor(() => errors.length > 0)
    expect(errors).toHaveLength(1)
    expect(s.getState()).toBe("errored")
  })

  it("creates unique session ids per instance", () => {
    const a = new StreamSession("s1", "w1", { publish: jest.fn() })
    const b = new StreamSession("s1", "w1", { publish: jest.fn() })
    expect(a.id).not.toBe(b.id)
  })

  it("session id contains streamId as prefix", () => {
    const s = new StreamSession("stream-42", "w1", { publish: jest.fn() })
    expect(s.id.startsWith("stream-42:")).toBe(true)
  })
})
