import { render, screen } from "@testing-library/react"
import { ConnectionStatus } from "./ConnectionStatus"

describe("ConnectionStatus", () => {
  it("renders the connecting status correctly", () => {
    const { container } = render(<ConnectionStatus status="connecting" />)
    expect(screen.getByText("Connecting")).toBeInTheDocument()
    const dot = container.querySelector(".rounded-full")
    expect(dot).toHaveClass("bg-yellow-500")
  })

  it("renders the connected status correctly", () => {
    const { container } = render(<ConnectionStatus status="connected" />)
    expect(screen.getByText("Connected")).toBeInTheDocument()
    const dot = container.querySelector(".rounded-full")
    expect(dot).toHaveClass("bg-green-500")
  })

  it("renders the disconnected status correctly", () => {
    const { container } = render(<ConnectionStatus status="disconnected" />)
    expect(screen.getByText("Disconnected")).toBeInTheDocument()
    const dot = container.querySelector(".rounded-full")
    expect(dot).toHaveClass("bg-gray-500")
  })

  it("renders the error status correctly (error state test)", () => {
    const { container } = render(<ConnectionStatus status="error" />)
    expect(screen.getByText("Connection error")).toBeInTheDocument()
    const dot = container.querySelector(".rounded-full")
    expect(dot).toHaveClass("bg-red-500")
  })

  it("has accessible role and label", () => {
    render(<ConnectionStatus status="connected" />)
    const region = screen.getByRole("status")
    expect(region).toBeInTheDocument()
    expect(region).toHaveAttribute(
      "aria-label",
      "Stream connection status: Connected",
    )
  })
})
