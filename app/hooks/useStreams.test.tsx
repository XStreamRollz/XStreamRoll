import * as React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { useStreamList, streamKeys } from "@/hooks/useStreams"

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
  }
}

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
})

describe("useStreamList (issue #345 phase B)", () => {
  it("exposes the centralised query-key factory so consumers can invalidate by group", () => {
    expect(streamKeys.all).toEqual(["streams"])
    expect(streamKeys.lists()).toEqual(["streams", "list"])
    expect(streamKeys.list(2, 10)).toEqual(["streams", "list", 2, 10])
    expect(streamKeys.detail(42)).toEqual(["streams", "detail", "42"])
    expect(streamKeys.tags(42)).toEqual(["streams", "detail", "42", "tags"])
  })

  it("calls GET /streams with mapped page/limit and returns the parsed payload", async () => {
    // `Response` is a browser API not available in Node.js; use a
    // minimal mock that satisfies fetch's contract.
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: [
          {
            id: "1",
            userId: "u1",
            name: "First",
            description: null,
            status: "inactive",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            tags: [],
          },
        ],
        page: 1,
        limit: 20,
        total: 1,
        hasMore: false,
      }),
    }
    const mock = jest.fn().mockResolvedValue(mockResponse)
    global.fetch = mock as unknown as typeof fetch

    const { result } = renderHook(() => useStreamList({ page: 1, limit: 20 }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mock).toHaveBeenCalledTimes(1)
    const calledUrl = (mock.mock.calls[0]?.[0] as URL | string).toString()
    expect(calledUrl).toMatch(/\/streams\?page=1&limit=20$/)
    expect(result.current.data?.data[0]?.name).toBe("First")
    expect(result.current.data?.data[0]?.tags).toEqual([])
  })
})
