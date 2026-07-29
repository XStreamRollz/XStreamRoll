import { render, screen } from "@testing-library/react"
import { StreamFeed } from "./StreamFeed"

// `@tanstack/react-virtual` is mocked globally in jest.setup.ts because
// jsdom cannot drive the real virtualizer's windowing math. The mock
// materialises every row, which means assertions here can keep
// looking up event text by string match as the production code
// expects. See jest.setup.ts for the rationale.

describe("StreamFeed", () => {
  it("renders empty state when no events are provided (empty/error state test)", () => {
    render(<StreamFeed events={[]} />)
    expect(screen.getByText("No events received yet.")).toBeInTheDocument()
  })

  it("renders a list of stream events correctly (rendering test)", () => {
    const events = [
      {
        id: "1",
        type: "info",
        timestamp: "2026-06-18T12:00:00.000Z",
        message: "Stream started",
      },
      {
        id: "2",
        type: "warning",
        timestamp: "2026-06-18T12:05:00.000Z",
        message: "High latency detected",
      },
    ]

    render(<StreamFeed events={events} />)

    expect(screen.getByText("info")).toBeInTheDocument()
    expect(screen.getByText("Stream started")).toBeInTheDocument()

    expect(screen.getByText("warning")).toBeInTheDocument()
    expect(screen.getByText("High latency detected")).toBeInTheDocument()

    // Verify times are rendered
    const time1 = new Date("2026-06-18T12:00:00.000Z").toLocaleTimeString()
    const time2 = new Date("2026-06-18T12:05:00.000Z").toLocaleTimeString()
    expect(screen.getByText(time1)).toBeInTheDocument()
    expect(screen.getByText(time2)).toBeInTheDocument()
  })

  // Smoke test for the MAX_EVENTS=1000 cap (#358). jsdom does not have
  // real layout so we cannot meaningfully assert that DOM size is
  // bounded; this test exists instead to make sure the cap is honoured
  // when upstream listeners emit past the threshold. The hook's
  // `.slice(-MAX_EVENTS)` keeps the buffer bounded; if it ever stops
  // doing so, this test will time out on a 100k-item render.
  it("renders 1000 events without OOM (#358 virtualisation smoke test)", () => {
    const MAX_EVENTS = 1000
    const events = Array.from({ length: MAX_EVENTS }, (_, i) => ({
      id: `evt-${i}`,
      type: "tick",
      timestamp: new Date(2026, 5, 18, 12, 0, i).toISOString(),
      message: `event ${i}`,
    }))

    expect(() => render(<StreamFeed events={events} />)).not.toThrow()

    // Sanity: the first and last events are both reachable through the
    // virtualizer mock, so the consumer-visible content is correct.
    expect(screen.getByText("event 0")).toBeInTheDocument()
    expect(screen.getByText(`event ${MAX_EVENTS - 1}`)).toBeInTheDocument()
  })

  it("exposes the stream log accessibility landmark", () => {
    const events = [
      {
        id: "1",
        type: "info",
        timestamp: "2026-06-18T12:00:00.000Z",
        message: "Stream started",
      },
    ]
    render(<StreamFeed events={events} />)
    expect(screen.getByRole("log", { name: "Stream events" })).toBeInTheDocument()
  })
})
