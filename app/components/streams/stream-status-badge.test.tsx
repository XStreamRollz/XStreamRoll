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
      <StreamStatusBadge status="active" showIcon={false} />
    )
    expect(container.querySelector("svg")).not.toBeInTheDocument()
  })

  it("uses the destructive variant for error state", () => {
    render(<StreamStatusBadge status="error" />)
    const badge = screen.getByLabelText("Stream status: Error")
    expect(badge.className).toMatch(/destructive/)
  })

  describe("live status changes (#362)", () => {
    it("does not flash on the initial render", () => {
      render(<StreamStatusBadge status="active" />)
      const badge = screen.getByLabelText("Stream status: Live")
      expect(badge.className).not.toMatch(/animate-status-live-flash/)
    })

    it("flashes when status changes after mount", () => {
      const { rerender } = render(<StreamStatusBadge status="inactive" />)

      rerender(<StreamStatusBadge status="active" />)

      const badge = screen.getByLabelText("Stream status: Live")
      expect(badge.className).toMatch(/animate-status-live-flash/)
    })

    it("does not flash on a re-render with the same status", () => {
      const { rerender } = render(<StreamStatusBadge status="active" />)

      rerender(<StreamStatusBadge status="active" />)

      const badge = screen.getByLabelText("Stream status: Live")
      expect(badge.className).not.toMatch(/animate-status-live-flash/)
    })
  })
})
