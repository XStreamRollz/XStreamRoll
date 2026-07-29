'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'

interface User { id: number; username: string; email: string }
interface AuthContextValue { user: User | null; accessToken: string | null; isAuthenticated: boolean }

const AuthContext = createContext<AuthContextValue>({ user: null, accessToken: null, isAuthenticated: false })
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' })
        if (!res.ok) throw new Error('refresh failed')
        const data = await res.json()
        setUser(data.user)
        setAccessToken(data.accessToken)
        setState('authenticated')
      } catch {
        setState('unauthenticated')
        if (!pathname.startsWith('/auth/')) router.replace('/auth/login')
      }
    })()
  }, [])

  if (state === 'loading') return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground border-t-primary" />
        <p className="mt-2 text-sm text-muted-foreground">loading…</p>
      </div>
    </div>
  )

  return <AuthContext.Provider value={{ user, accessToken, isAuthenticated: state === 'authenticated' }}>{children}</AuthContext.Provider>
}