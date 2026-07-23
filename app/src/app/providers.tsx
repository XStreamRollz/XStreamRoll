"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"

/**
 * Client-side provider tree for the App Router. Today this only adds
 * React Query (issue #345) — but having a single Client boundary here
 * keeps future server-state libs out of {@link layout.tsx}.
 *
 * The QueryClient is held in `useState` so React 19 StrictMode's
 * deliberate double-mount in dev doesn't construct two clients — every
 * mount returns the same instance within a given request.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Match the 30s SWR window the issue requires; AC: "Cache
            // stream list queries (30-second stale-while-revalidate
            // window). We pick `staleTime` over `gcTime` because the
            // acceptance is about freshness, not memory residency.
            staleTime: 30 * 1000,
            // Keep the prior data mounted across navigation so the UI
            // doesn't flicker back to a loading skeleton (#345).
            // Keep the prior data mounted across navigation so the UI
            // doesn't flicker back to a loading skeleton (#345). The
            // identity function preserves any prior payload across
            // navigation; the explicit generic lets TanStack Query
            // infer the placeholder type for every query key.
            placeholderData: <TData,>(previousData: TData | undefined) =>
              previousData,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
