/**
 * Client helpers for the notifications API.
 *
 *   GET    /notifications?limit=10  -> { items, unreadCount }
 *   POST   /notifications/:id/read  -> { id, readAt }
 */

export interface Notification {
  id: string
  /** ISO-8601 timestamp. */
  createdAt: string
  /** ISO-8601 timestamp; null when the notification is unread. */
  readAt: string | null
  title: string
  body: string
  /** Optional URL the UI should navigate to on click. */
  href?: string
  /** Lightweight category — used to pick the icon. */
  category?: "stream" | "system" | "billing" | "default"
}

export interface NotificationsPage {
  items: Notification[]
  unreadCount: number
}

const DEFAULT_API_BASE = "http://localhost:3001"

function apiBase(): string {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }
  return DEFAULT_API_BASE
}

export class NotificationsApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = "NotificationsApiError"
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string }
    if (typeof body.message === "string") return body.message
  } catch {
    /* ignore */
  }
  return `request failed with ${res.status}`
}

export async function fetchNotifications(
  init: { limit?: number; signal?: AbortSignal } = {},
): Promise<NotificationsPage> {
  const url = new URL(`${apiBase()}/notifications`)
  url.searchParams.set("limit", String(init.limit ?? 10))

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: init.signal,
    cache: "no-store",
  })
  if (!res.ok) throw new NotificationsApiError(res.status, await readError(res))
  return (await res.json()) as NotificationsPage
}

export async function markNotificationRead(
  id: string,
  init: { signal?: AbortSignal } = {},
): Promise<void> {
  const res = await fetch(`${apiBase()}/notifications/${id}/read`, {
    method: "POST",
    headers: { Accept: "application/json" },
    signal: init.signal,
  })
  if (!res.ok) throw new NotificationsApiError(res.status, await readError(res))
}
