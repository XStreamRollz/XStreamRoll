export interface Notification {
  id: string
  createdAt: string
  readAt: string | null
  title: string
  body: string
  href?: string
  category?: "stream" | "system" | "billing" | "default"
}

export interface NotificationsPage {
  items: Notification[]
  unreadCount: number
}
