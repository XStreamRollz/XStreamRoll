import { render, screen } from "@testing-library/react"

import { ConnectionStatus } from "./ConnectionStatus"

describe("ConnectionStatus", () => {
  it("renders the connecting status correctly", () => {
    const { container } = render(<ConnectionStatus status="connecting" />)
    expect(screen.getByText("connecting")).toBeInTheDocument()
    const dot = container.querySelector(".rounded-full")
    expect(dot).toHaveClass("bg-yellow-500")
  })

  it("renders the connected status correctly", () => {
    const { container } = render(<ConnectionStatus status="connected" />)
    expect(screen.getByText("connected")).toBeInTheDocument()
    const dot = container.querySelector(".rounded-full")
    expect(dot).toHaveClass("bg-green-500")
  })

  it("renders the disconnected status correctly", () => {
    const { container } = render(<ConnectionStatus status="disconnected" />)
    expect(screen.getByText("disconnected")).toBeInTheDocument()
    const dot = container.querySelector(".rounded-full")
    expect(dot).toHaveClass("bg-gray-500")
  })

  it("renders the error status correctly (error state test)", () => {
    const { container } = render(<ConnectionStatus status="error" />)
    expect(screen.getByText("error")).toBeInTheDocument()
    const dot = container.querySelector(".rounded-full")
    expect(dot).toHaveClass("bg-red-500")
  })
})
