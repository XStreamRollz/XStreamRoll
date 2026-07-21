import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const token = req.cookies.get('token')?.value
  if (!token) return NextResponse.json({}, { status: 401 })

  const apiRes = await fetch('http://localhost:3001/auth/refresh', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!apiRes.ok) return NextResponse.json({}, { status: 401 })

  const data = await apiRes.json()
  const res = NextResponse.json({ user: data.user })
  res.cookies.set({ name: 'token', value: data.accessToken, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 })
  return res
}