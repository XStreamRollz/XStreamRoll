"use client"

import {
  Activity,
  AlertCircle,
  RadioTower,
  Users,
  Waypoints,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AdminStats,
  AdminStatsError,
  fetchAdminStats,
} from "@/lib/api/admin-stats"

const REFRESH_INTERVAL_MS = 60_000

type FetchState =
  | { kind: "loading" }
  | { kind: "ready"; data: AdminStats; loadedAt: Date }
  | {
      kind: "error"
      message: string
      lastData?: AdminStats
      lastLoadedAt?: Date
    }

export function AdminDashboard() {
  const [state, setState] = useState<FetchState>({ kind: "loading" })
  const lastDataRef = useRef<{ data: AdminStats; loadedAt: Date } | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function load() {
      try {
        const data = await fetchAdminStats({ signal: controller.signal })
        if (cancelled) return
        const loadedAt = new Date()
        lastDataRef.current = { data, loadedAt }
        setState({ kind: "ready", data, loadedAt })
      } catch (err) {
        if (cancelled) return
        if (err instanceof DOMException && err.name === "AbortError") return
        const message =
          err instanceof AdminStatsError
            ? `API responded ${err.status}`
            : err instanceof Error
              ? err.message
              : "unknown error"
        setState({
          kind: "error",
          message,
          lastData: lastDataRef.current?.data,
          lastLoadedAt: lastDataRef.current?.loadedAt,
        })
      }
    }

    void load()
    const interval = setInterval(load, REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      controller.abort()
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Platform-wide stats. Auto-refreshes every 60 seconds.
          </p>
        </div>
        <RefreshStatus state={state} />
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total users"
          icon={<Users className="size-4 text-muted-foreground" />}
          state={state}
          select={(s) => s.totalUsers}
        />
        <StatCard
          title="Total streams"
          icon={<Waypoints className="size-4 text-muted-foreground" />}
          state={state}
          select={(s) => s.totalStreams}
        />
        <StatCard
          title="Active streams"
          icon={<RadioTower className="size-4 text-muted-foreground" />}
          state={state}
          select={(s) => s.activeStreams}
        />
        <StatCard
          title="Events (last 24h)"
          icon={<Activity className="size-4 text-muted-foreground" />}
          state={state}
          select={(s) => s.eventsLast24h}
        />
      </section>

      {state.kind === "error" && (
        <Card role="alert" className="border-destructive/50 bg-destructive/5">
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertCircle className="size-4 text-destructive" />
            <CardTitle className="text-base">Failed to refresh stats</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            {state.lastData && state.lastLoadedAt && (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing last successful snapshot from{" "}
                {state.lastLoadedAt.toLocaleString()}.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function RefreshStatus({ state }: { state: FetchState }) {
  if (state.kind === "loading") {
    return <Badge variant="secondary">loading…</Badge>
  }
  if (state.kind === "ready") {
    return (
      <Badge variant="outline">
        updated {state.loadedAt.toLocaleTimeString()}
      </Badge>
    )
  }
  return <Badge variant="destructive">stale</Badge>
}

function StatCard({
  title,
  icon,
  state,
  select,
}: {
  title: string
  icon: React.ReactNode
  state: FetchState
  select: (s: AdminStats) => number
}) {
  const data =
    state.kind === "ready"
      ? state.data
      : state.kind === "error"
        ? state.lastData
        : undefined

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {state.kind === "loading" && !data ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <p className="text-3xl font-semibold tabular-nums">
            {data ? formatNumber(select(data)) : "—"}
          </p>
        )}
        <CardDescription className="mt-1 text-xs">
          {data
            ? `as of ${new Date(data.generatedAt).toLocaleTimeString()}`
            : "waiting for first update"}
        </CardDescription>
      </CardContent>
    </Card>
  )
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined).format(value)
}
