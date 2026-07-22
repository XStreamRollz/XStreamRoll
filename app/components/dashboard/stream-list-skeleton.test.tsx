import { render, screen } from "@testing-library/react"

import { StreamListSkeleton } from "./stream-list-skeleton"

describe("StreamListSkeleton", () => {
  it("marks the loading container as busy with the required 'Loading streams' label", () => {
    render(<StreamListSkeleton />)

    const region = screen.getByRole("status", { name: /loading streams/i })
    expect(region).toHaveAttribute("aria-busy", "true")
    // role="status" implies aria-live="polite" + aria-atomic="true";
    // we keep it implicit so we don't override the implicit semantics.
  })

  it("exposes a stable test id for routes that target it", () => {
    render(<StreamListSkeleton />)
    expect(screen.getByTestId("stream-list-skeleton")).toBeInTheDocument()
  })
})
