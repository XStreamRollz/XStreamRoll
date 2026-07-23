"use client"

import * as React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

/**
 * App-wide providers — issue #345 phase A (foundation).
 *
 * Phase A only ships the {@link QueryClientProvider} wiring so any
 * component can mount hooks against it. Consumer hooks (useStreamList,
 * useStreamDetail, useAttachTag, useDetachTag, ...) are added in
 * phase B.
 *
 * Why this file:
 *
 *   - Next.js App Router requires React Context providers to live in a
 *     "use client" component. Putting `<QueryClientProvider>` directly
 *     in the server-rendered `app/layout.tsx` would error.
 *
 *   - The `QueryClient` is instantiated with `useState(() => new ...)`
 *     so each browser session owns exactly one client. Without the
 *     lazy initializer every render during SSR would create a fresh
 *     client, defeating deduplication.
 *
 *   - Defaults: 30s `staleTime` (matches the cache TTL promised by
 *     `lib/cache/cache-config.ts#streamList`), `refetchOnWindowFocus`
 *     enabled so the dashboard always shows fresh totals when the
 *     user returns to a tab, and an aggressive `retry: 1` to keep a
 *     transient 502 on the streams endpoint from stalling the UI.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  })
}

let browserClient: QueryClient | undefined

function getQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    // SSR / RSC: a brand-new client per render is fine because the
    // request is short-lived and we never cache across users.
    return makeQueryClient()
  }
  // Browser: reuse a single client so React Query's in-memory cache
  // survives re-renders and route transitions.
  if (!browserClient) browserClient = makeQueryClient()
  return browserClient
}

export interface AppProvidersProps {
  children: React.ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  // useState's lazy initializer runs once per mount on the server and
  // once per browser tab on the client, giving each context its own
  // QueryClient — the canonical client-side React Query pattern.
  const [queryClient] = React.useState(() => getQueryClient())

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
