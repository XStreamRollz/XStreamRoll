import { render, screen } from "@testing-library/react"
import { StreamViewer } from "./StreamViewer"
import { useStreamSocket } from "../../hooks/useStreamSocket"

// Mock the useStreamSocket hook
jest.mock("../../hooks/useStreamSocket")

const mockUseStreamSocket = useStreamSocket as jest.MockedFunction<
  typeof useStreamSocket
>

describe("StreamViewer", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("renders connecting state and empty feed (rendering test)", () => {
    mockUseStreamSocket.mockReturnValue({
      status: "connecting",
      events: [],
      streamStatus: null,
    })

    render(<StreamViewer socketUrl="ws://localhost:3001" />)

    expect(screen.getByText("Live Stream Feed")).toBeInTheDocument()
    expect(screen.getByText("connecting")).toBeInTheDocument()
    expect(screen.getByText("No events received yet.")).toBeInTheDocument()
    expect(mockUseStreamSocket).toHaveBeenCalledWith("ws://localhost:3001")
  })

  it("renders connected state with events (interaction / data rendering test)", () => {
    const mockEvents = [
      {
        id: "event-1",
        type: "click",
        timestamp: "2026-06-18T12:00:00.000Z",
        message: "User clicked submit",
      },
    ]
    mockUseStreamSocket.mockReturnValue({
      status: "connected",
      events: mockEvents,
      streamStatus: null,
    })

    render(<StreamViewer socketUrl="ws://localhost:3001" />)

    expect(screen.getByText("connected")).toBeInTheDocument()
    expect(screen.getByText("click")).toBeInTheDocument()
    expect(screen.getByText("User clicked submit")).toBeInTheDocument()
  })

  it("renders error state (error state test)", () => {
    mockUseStreamSocket.mockReturnValue({
      status: "error",
      events: [],
      streamStatus: null,
    })

    render(<StreamViewer socketUrl="ws://localhost:3001" />)

    expect(screen.getByText("error")).toBeInTheDocument()
    expect(screen.getByText("No events received yet.")).toBeInTheDocument()
  })
})
