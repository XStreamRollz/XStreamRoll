import { SessionRegistry } from "../src/session-registry"
import type { StreamEvent, ProcessedStreamEvent } from "../src/session"

function evt(streamId: string): StreamEvent {
  return { streamId, data: { type: "data" }, timestamp: new Date().toISOString() }
}

describe("SessionRegistry", () => {
  it("lazily creates a session for a new stream", () => {
    const registry = new SessionRegistry("w1", { publish: jest.fn() }, { maxConcurrentSessions: 4 })
    const result = registry.route(evt("s1"))
    expect(result).toBe("enqueued")
    expect(registry.size()).toBe(1)
  })

  it("returns capacity when the registry is full", () => {
    const registry = new SessionRegistry("w1", { publish: jest.fn() }, { maxConcurrentSessions: 1 })
    expect(registry.route(evt("s1"))).toBe("enqueued")
    expect(registry.route(evt("s2"))).toBe("capacity")
  })

  it("reuses an existing session for the same stream", () => {
    const registry = new SessionRegistry("w1", { publish: jest.fn() }, { maxConcurrentSessions: 4 })
    registry.route(evt("s1"))
    registry.route(evt("s1"))
    expect(registry.size()).toBe(1)
  })

  it("evicts stopped sessions and frees capacity", async () => {
    const registry = new SessionRegistry("w1", { publish: jest.fn() }, { maxConcurrentSessions: 1 })
    registry.route(evt("s1"))
    const session = registry.get("s1")!
    await session.stop()
    // allow microtask queue to settle so the state listener evicts
    await new Promise((r) => setTimeout(r, 5))
    expect(registry.size()).toBe(0)
    expect(registry.route(evt("s2"))).toBe("enqueued")
  })

  it("drainAll resolves once every session has stopped", async () => {
    const registry = new SessionRegistry("w1", { publish: jest.fn() }, { maxConcurrentSessions: 4 })
    registry.route(evt("s1"))
    registry.route(evt("s2"))
    await registry.drainAll()
    expect(registry.size()).toBe(0)
  })

  it("capacity() reports used vs max", () => {
    const registry = new SessionRegistry("w1", { publish: jest.fn() }, { maxConcurrentSessions: 8 })
    registry.route(evt("s1"))
    registry.route(evt("s2"))
    expect(registry.capacity()).toEqual({ used: 2, max: 8 })
  })

  it("publishes processed events through the handlers", async () => {
    const published: ProcessedStreamEvent[] = []
    const registry = new SessionRegistry(
      "w1",
      {
        publish: async (e) => {
          published.push(e)
        },
      },
      { maxConcurrentSessions: 4 },
    )
    registry.route(evt("s1"))
    for (let i = 0; i < 40 && published.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(published).toHaveLength(1)
    expect(published[0].workerId).toBe("w1")
  })
})
