import { cookies, headers } from "next/headers"

export interface CurrentUser {
  id: string
  roles: string[]
}

/**
 * Resolve the actor for the current request.
 *
 * Until the real auth pipeline lands this reads either:
 *
 *   1. an `x-user` request header (typically injected by an edge
 *      middleware), or
 *   2. an `xstreamroll_user` cookie storing a JSON blob.
 *
 * Both formats are `{"id":"<id>","roles":["admin",...]}`. The function
 * returns `null` when no actor can be resolved so callers can route to
 * the sign-in flow.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const headerStore = await headers()
  const rawHeader = headerStore.get("x-user")
  if (rawHeader) {
    const parsed = safeParse(rawHeader)
    if (parsed) return parsed
  }

  const cookieStore = await cookies()
  const cookie = cookieStore.get("xstreamroll_user")
  if (cookie?.value) {
    const parsed = safeParse(cookie.value)
    if (parsed) return parsed
  }

  return null
}

export function hasRole(user: CurrentUser | null, role: string): boolean {
  return !!user && Array.isArray(user.roles) && user.roles.includes(role)
}

function safeParse(raw: string): CurrentUser | null {
  try {
    const decoded = decodeURIComponent(raw)
    const obj = JSON.parse(decoded) as Partial<CurrentUser>
    if (typeof obj?.id !== "string") return null
    if (!Array.isArray(obj.roles)) return null
    return {
      id: obj.id,
      roles: obj.roles.filter((r): r is string => typeof r === "string"),
    }
  } catch {
    return null
  }
}
