import { act, render, screen, waitFor } from "@testing-library/react"

import { AdminStats, fetchAdminStats } from "@/lib/api/admin-stats"

import { AdminDashboard } from "./admin-dashboard"

jest.mock("@/lib/api/admin-stats")

const mockFetchAdminStats = fetchAdminStats as jest.MockedFunction<
  typeof fetchAdminStats
>

describe("AdminDashboard", () => {
  const mockStats: AdminStats = {
    totalUsers: 150,
    totalStreams: 45,
    activeStreams: 12,
    eventsLast24h: 9800,
    generatedAt: "2026-06-18T12:00:00.000Z",
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("renders loading state initially (rendering test)", () => {
    // Keep fetch pending
    mockFetchAdminStats.mockReturnValue(new Promise(() => {}))

    const { container } = render(<AdminDashboard />)

    expect(screen.getByText("Admin Dashboard")).toBeInTheDocument()
    expect(screen.getByText("loading…")).toBeInTheDocument()

    // Skeletons should be displayed for each stat card
    const skeletons = container.querySelectorAll(".animate-pulse")
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it("renders ready state with stats on successful fetch (interaction/rendering test)", async () => {
    mockFetchAdminStats.mockResolvedValue(mockStats)

    render(<AdminDashboard />)

    // Wait for mock fetch to resolve
    await waitFor(() => {
      expect(screen.getByText("150")).toBeInTheDocument()
    })

    expect(screen.getByText("45")).toBeInTheDocument()
    expect(screen.getByText("12")).toBeInTheDocument()
    expect(screen.getByText("9,800")).toBeInTheDocument()

    expect(screen.getByText(/updated/)).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("renders error state when fetch fails initially (error state test)", async () => {
    mockFetchAdminStats.mockRejectedValue(new Error("API Error"))

    render(<AdminDashboard />)

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument()
    })

    expect(screen.getByText("Failed to refresh stats")).toBeInTheDocument()
    expect(screen.getByText("API Error")).toBeInTheDocument()
    expect(screen.getByText("stale")).toBeInTheDocument()
  })

  it("retains and renders last successful snapshot when a refresh fails (stale cache test)", async () => {
    mockFetchAdminStats
      .mockResolvedValueOnce(mockStats) // First call succeeds
      .mockRejectedValueOnce(new Error("Network Timeout")) // Refresh fails

    render(<AdminDashboard />)

    // First load is successful
    await waitFor(() => {
      expect(screen.getByText("150")).toBeInTheDocument()
    })

    // Advance timers to trigger refresh interval (60 seconds)
    await act(async () => {
      jest.advanceTimersByTime(60000)
    })

    // Now showing error alert
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument()
    })

    expect(screen.getByText("Network Timeout")).toBeInTheDocument()
    expect(screen.getByText("stale")).toBeInTheDocument()

    // Still displays the previous counts (cached/stale snapshot)
    expect(screen.getByText("150")).toBeInTheDocument()
    expect(screen.getByText("45")).toBeInTheDocument()
    expect(
      screen.getByText(/Showing last successful snapshot/),
    ).toBeInTheDocument()
  })

  it("auto-refreshes data every 60 seconds", async () => {
    mockFetchAdminStats.mockResolvedValue(mockStats)

    render(<AdminDashboard />)

    await waitFor(() => {
      expect(mockFetchAdminStats).toHaveBeenCalledTimes(1)
    })

    // Advance timers by 60 seconds
    await act(async () => {
      jest.advanceTimersByTime(60000)
    })
    expect(mockFetchAdminStats).toHaveBeenCalledTimes(2)

    // Advance another 60 seconds
    await act(async () => {
      jest.advanceTimersByTime(60000)
    })
    expect(mockFetchAdminStats).toHaveBeenCalledTimes(3)
  })
})
