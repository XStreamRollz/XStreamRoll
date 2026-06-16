"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Radio,
  Settings,
  Users,
  BarChart2,
  Menu,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/streams", label: "Streams", icon: Radio },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/dashboard/users", label: "Users", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)

  // Close sidebar on route change (mobile)
  React.useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <>
      {/* Mobile toggle button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 md:hidden"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        aria-controls="sidebar-nav"
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </Button>

      {/* Backdrop (mobile only) */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <nav
        id="sidebar-nav"
        aria-label="Main navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform duration-200",
          // Mobile: slide in/out
          open ? "translate-x-0" : "-translate-x-full",
          // Desktop: always visible, icon-only when collapsed
          "md:static md:translate-x-0 md:w-64",
        )}
      >
        <div className="flex h-14 items-center border-b px-4">
          <span className="font-semibold text-sm">XStreamRoll</span>
        </div>

        <ul className="flex flex-1 flex-col gap-1 p-2" role="list">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/")
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
