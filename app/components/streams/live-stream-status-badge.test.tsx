import { render, screen } from "@testing-library/react"
import { useStreamSocket } from "@/hooks/useStreamSocket"
import { LiveStreamStatusBadge } from "./live-stream-status-badge"

jest.mock("@/hooks/useStreamSocket", () => ({
  useStreamSocket: jest.fn(),
}))

const mockUseStreamSocket = useStreamSocket as jest.MockedFunction<
  typeof useStreamSocket
>

describe("LiveStreamStatusBadge", () => {
  beforeEach(() => {
    mockUseStreamSocket.mockReset()
  })

  it("subscribes to the stream's room via useStreamSocket", () => {
    mockUseStreamSocket.mockReturnValue({
      status: "connected",
      events: [],
      streamStatus: null,
    })

    render(<LiveStreamStatusBadge streamId={42} initialStatus="inactive" />)

    expect(mockUseStreamSocket).toHaveBeenCalledWith(
      expect.stringContaining("/streams/42"),
    )
  })

  it("shows initialStatus until a live event updates streamStatus", () => {
    mockUseStreamSocket.mockReturnValue({
      status: "connected",
      events: [],
      streamStatus: null,
    })

    render(<LiveStreamStatusBadge streamId={42} initialStatus="inactive" />)

    expect(screen.getByText("Offline")).toBeInTheDocument()
  })

  it("prefers the live streamStatus over initialStatus once available", () => {
    mockUseStreamSocket.mockReturnValue({
      status: "connected",
      events: [],
      streamStatus: "active",
    })

    render(<LiveStreamStatusBadge streamId={42} initialStatus="inactive" />)

    expect(screen.getByText("Live")).toBeInTheDocument()
  })
})
