import { render, screen } from "@testing-library/react"

import { StreamDetailSkeleton } from "./stream-detail-skeleton"

describe("StreamDetailSkeleton", () => {
  it("marks the loading container as busy with singular 'stream' label", () => {
    render(<StreamDetailSkeleton />)

    // Singular — this view resolves a single stream, not a list.
    const region = screen.getByRole("status", { name: /loading stream/i })
    expect(region).toHaveAttribute("aria-busy", "true")
    // role="status" implies aria-live="polite" + aria-atomic="true";
    // keeping it implicit avoids an override that could surprise
    // screen-reader behaviour.
  })

  it("exposes a stable test id for routes that target it", () => {
    render(<StreamDetailSkeleton />)
    expect(screen.getByTestId("stream-detail-skeleton")).toBeInTheDocument()
  })
})
