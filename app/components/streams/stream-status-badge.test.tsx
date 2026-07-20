import { render, screen } from "@testing-library/react"

import { StreamStatusBadge } from "./stream-status-badge"

describe("StreamStatusBadge", () => {
  it("renders the human label for known statuses", () => {
    render(<StreamStatusBadge status="active" />)
    expect(screen.getByText("Live")).toBeInTheDocument()
  })

  it("exposes an accessible name for screen readers", () => {
    render(<StreamStatusBadge status="error" />)
    expect(screen.getByLabelText("Stream status: Error")).toBeInTheDocument()
  })

  it("falls back to the offline label for unknown statuses", () => {
    // Cast keeps the test honest about runtime safety: we should
    // degrade gracefully if a future API value sneaks through.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<StreamStatusBadge status={"unknown" as any} />)
    expect(screen.getByText("Offline")).toBeInTheDocument()
  })

  it("hides the icon when showIcon is false", () => {
    const { container } = render(
      <StreamStatusBadge status="active" showIcon={false} />,
    )
    expect(container.querySelector("svg")).not.toBeInTheDocument()
  })

  it("uses the destructive variant for error state", () => {
    render(<StreamStatusBadge status="error" />)
    const badge = screen.getByLabelText("Stream status: Error")
    expect(badge.className).toMatch(/destructive/)
  })
})
