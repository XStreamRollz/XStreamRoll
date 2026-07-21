import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('refresh_token')?.value
  if (!refreshToken) return NextResponse.json({}, { status: 401 })

  const apiRes = await fetch('http://localhost:3001/auth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `refresh_token=${refreshToken}`,
    },
  })
  if (!apiRes.ok) return NextResponse.json({}, { status: 401 })

  const data = await apiRes.json()
  return NextResponse.json({
    accessToken: data.accessToken,
  })
}