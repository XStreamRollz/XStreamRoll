import { render, screen } from "@testing-library/react"
import { StreamFeed } from "./StreamFeed"

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
})
