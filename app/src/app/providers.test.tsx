import * as React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AppProviders } from "./providers"

/**
 * Issue #345 phase A only ships the {@link AppProviders} tree.
 * Verifying the wrapping client is sufficient because every phase-B
 * consumer hook depends on this client being available. All consumer
 * behaviour is covered by the dedicated hook tests in phase B.
 */
describe("AppProviders (issue #345 phase A)", () => {
  it("exposes a QueryClient to a consumer mounted under AppProviders", () => {
    let clientSeen: ReturnType<typeof useQueryClient> | undefined
    function ClientSpy() {
      clientSeen = useQueryClient()
      return null
    }
    render(
      <AppProviders>
        <ClientSpy />
      </AppProviders>,
    )
    expect(clientSeen).toBeDefined()
    // Mount and request options survive: the 30s staleTime defined in
    // providers.tsx must be observable through the client API.
    expect(
      clientSeen?.getDefaultOptions().queries?.staleTime,
    ).toBe(30_000)
  })

  it("shares the same QueryClient across nested consumers in one tree", () => {
    const clients: Array<ReturnType<typeof useQueryClient> | undefined> = []
    function SpyA() {
      clients[0] = useQueryClient()
      return null
    }
    function SpyB() {
      clients[1] = useQueryClient()
      return null
    }
    render(
      <AppProviders>
        <SpyA />
        <SpyB />
      </AppProviders>,
    )
    expect(clients[0]).toBeDefined()
    expect(clients[1]).toBeDefined()
    expect(clients[0]).toBe(clients[1])
  })

  it("lets useQuery return data after a successful fetch", async () => {
    function Fetch() {
      const { data } = useQuery({
        queryKey: ["test", "ok"],
        queryFn: async () => "hello",
      })
      return <span data-testid="t">{data ?? "loading"}</span>
    }
    render(
      <AppProviders>
        <Fetch />
      </AppProviders>,
    )
    // Initially shows loading state...
    expect(screen.getByTestId("t")).toHaveTextContent("loading")
    // ...and transitions to the resolved value once the query resolves.
    // waitFor retries until the assertion passes, which handles React
    // Query's multi-tick async resolution (a single Promise.resolve()
    // is not enough to flush the query lifecycle).
    await waitFor(() => {
      expect(screen.getByTestId("t")).toHaveTextContent("hello")
    })
  })
})
