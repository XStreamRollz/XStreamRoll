"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  Bell,
  CreditCard,
  Inbox,
  RadioTower,
  Server,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  Notification,
  NotificationsApiError,
  NotificationsPage,
  fetchNotifications,
  markNotificationRead,
} from "@/lib/api/notifications"

/**
 * Navbar bell icon with a dropdown listing the last 10 notifications.
 *
 * Behaviour (per issue 94 acceptance criteria):
 *
 *   - The bell shows a small badge with the unread count. The badge is
 *     hidden when the count is zero. Counts above 99 render as "99+"
 *     to keep the badge width predictable.
 *   - Opening the menu fetches /notifications?limit=10. The result is
 *     stored in component state so re-opening within the same render
 *     cycle is instant; a manual "Refresh" affordance is exposed in
 *     the menu footer for users who want to force a refetch.
 *   - Clicking a notification marks it read (POST /notifications/:id/read)
 *     and navigates to `notification.href` when present. The optimistic
 *     update flips `readAt` immediately and decrements the badge; on
 *     API failure we roll back so the badge stays truthful.
 */
const POLL_INTERVAL_MS = 60_000

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; page: NotificationsPage }
  | { kind: "error"; message: string; lastPage?: NotificationsPage }

export function NotificationsDropdown() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [state, setState] = React.useState<LoadState>({ kind: "idle" })
  const [unreadCount, setUnreadCount] = React.useState(0)

  // Lightweight background poll so the unread badge stays fresh even
  // when the menu is closed. We only poll every minute to keep the
  // request volume sane.
  React.useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function probe() {
      try {
        const page = await fetchNotifications({ limit: 1, signal: controller.signal })
        if (cancelled) return
        setUnreadCount(page.unreadCount)
      } catch {
        // network errors silently drop — the dropdown will surface them
        // if the user opens it.
      }
    }

    void probe()
    const id = setInterval(probe, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      controller.abort()
      clearInterval(id)
    }
  }, [])

  // Fetch full page lazily when the dropdown opens.
  React.useEffect(() => {
    if (!open) return
    if (state.kind === "loading" || state.kind === "ready") return

    const controller = new AbortController()
    setState({ kind: "loading" })
    fetchNotifications({ limit: 10, signal: controller.signal })
      .then((page) => {
        setState({ kind: "ready", page })
        setUnreadCount(page.unreadCount)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        const message =
          err instanceof NotificationsApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "failed to load notifications"
        setState((prev) => ({
          kind: "error",
          message,
          lastPage: prev.kind === "ready" ? prev.page : undefined,
        }))
      })
    return () => controller.abort()
  }, [open, state.kind])

  async function handleItemClick(notification: Notification) {
    if (state.kind !== "ready") return

    const wasUnread = notification.readAt === null
    if (wasUnread) {
      // Optimistic flip: update local state immediately and decrement
      // the badge so the UI feels instant.
      const optimistic: NotificationsPage = {
        ...state.page,
        items: state.page.items.map((n) =>
          n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n,
        ),
        unreadCount: Math.max(0, state.page.unreadCount - 1),
      }
      setState({ kind: "ready", page: optimistic })
      setUnreadCount(optimistic.unreadCount)

      try {
        await markNotificationRead(notification.id)
      } catch {
        // roll back on failure so the badge stays truthful
        setState({ kind: "ready", page: state.page })
        setUnreadCount(state.page.unreadCount)
      }
    }

    setOpen(false)
    if (notification.href) router.push(notification.href)
  }

  async function refresh() {
    try {
      setState({ kind: "loading" })
      const page = await fetchNotifications({ limit: 10 })
      setState({ kind: "ready", page })
      setUnreadCount(page.unreadCount)
    } catch (err) {
      const message = err instanceof Error ? err.message : "refresh failed"
      setState({ kind: "error", message })
    }
  }

  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            unreadCount > 0
              ? `Notifications (${unreadCount} unread)`
              : "Notifications"
          }
          className="relative"
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 min-w-5 justify-center rounded-full px-1.5 py-0.5 text-[10px] leading-none"
            >
              {badgeLabel}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <DropdownMenuLabel className="flex items-center justify-between px-3 py-2">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {unreadCount} unread
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {state.kind === "loading" && <NotificationListSkeleton />}
          {state.kind === "error" && (
            <div className="flex flex-col gap-1 px-3 py-4 text-sm">
              <span className="flex items-center gap-2 font-medium text-destructive">
                <AlertCircle className="size-4" />
                Failed to load
              </span>
              <span className="text-xs text-muted-foreground">{state.message}</span>
            </div>
          )}
          {state.kind === "ready" && state.page.items.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-sm text-muted-foreground">
              <Inbox className="size-6 opacity-60" />
              <span>No notifications yet.</span>
            </div>
          )}
          {state.kind === "ready" && state.page.items.length > 0 && (
            <ul className="flex flex-col">
              {state.page.items.map((n) => (
                <li key={n.id}>
                  <NotificationRow
                    notification={n}
                    onSelect={() => void handleItemClick(n)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            disabled={state.kind === "loading"}
          >
            Refresh
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => {
              setOpen(false)
              router.push("/notifications")
            }}
          >
            View all
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationRow({
  notification,
  onSelect,
}: {
  notification: Notification
  onSelect: () => void
}) {
  const unread = notification.readAt === null
  const Icon = iconForCategory(notification.category)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-accent focus:bg-accent focus:outline-none",
        unread && "bg-accent/30",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          unread ? "text-primary" : "text-muted-foreground",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-sm",
              unread ? "font-medium" : "text-muted-foreground",
            )}
          >
            {notification.title}
          </span>
          {unread && (
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-primary"
            />
          )}
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {notification.body}
        </p>
        <time
          dateTime={notification.createdAt}
          className="text-[10px] uppercase tracking-wide text-muted-foreground"
        >
          {formatRelative(notification.createdAt)}
        </time>
      </div>
    </button>
  )
}

function NotificationListSkeleton() {
  return (
    <ul className="flex flex-col">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="border-b px-3 py-3 last:border-b-0">
          <div className="flex gap-3">
            <Skeleton className="size-4 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-2 w-16" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function iconForCategory(category: Notification["category"]) {
  switch (category) {
    case "stream":
      return RadioTower
    case "billing":
      return CreditCard
    case "system":
      return Server
    default:
      return Bell
  }
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const diff = Date.now() - then
  const sec = Math.round(diff / 1000)
  if (sec < 60) return "just now"
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}
