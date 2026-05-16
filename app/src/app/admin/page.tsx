import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { AdminDashboard } from "./admin-dashboard"
import { getCurrentUser, hasRole } from "@/lib/api/current-user"

export const metadata: Metadata = {
  title: "Admin Dashboard | XStreamRoll",
  description: "Platform-wide stats for XStreamRoll administrators.",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function AdminDashboardPage() {
  const user = await getCurrentUser()
  if (!hasRole(user, "admin")) {
    // 404 rather than 403 so unauthorised callers can't enumerate
    // admin-only surface area.
    notFound()
  }

  return (
    <main className="container mx-auto max-w-6xl px-4 py-10">
      <AdminDashboard />
    </main>
  )
}
