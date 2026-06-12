import { EventFilter } from "../src/pipeline/event-filter"
import type { StreamEvent } from "../src/session"

function evt(type: string, streamId = "s1"): StreamEvent {
  return { streamId, data: { type }, timestamp: new Date().toISOString() }
}

describe("EventFilter", () => {
  it("passes events through when no config exists for a stream", () => {
    const f = new EventFilter()
    expect(f.allow(evt("any"))).toBe(true)
  })

  it("blocks configured event types", () => {
    const f = new EventFilter()
    f.setConfig("s1", { blockedEventTypes: ["noisy", "debug"] })
    expect(f.allow(evt("noisy"))).toBe(false)
    expect(f.allow(evt("debug"))).toBe(false)
    expect(f.allow(evt("ok"))).toBe(true)
  })

  it("clearConfig removes the filter for a stream", () => {
    const f = new EventFilter()
    f.setConfig("s1", { blockedEventTypes: ["x"] })
    expect(f.allow(evt("x"))).toBe(false)
    f.clearConfig("s1")
    expect(f.allow(evt("x"))).toBe(true)
  })

  it("treats non-string event types as pass-through", () => {
    const f = new EventFilter()
    f.setConfig("s1", { blockedEventTypes: ["x"] })
    expect(f.allow({ streamId: "s1", data: { type: 42 }, timestamp: "" })).toBe(true)
  })

  it("defensively copies the blocked types array", () => {
    const f = new EventFilter()
    const blocked = ["x"]
    f.setConfig("s1", { blockedEventTypes: blocked })
    blocked.push("y")
    expect(f.allow(evt("y"))).toBe(false)
  })
})
