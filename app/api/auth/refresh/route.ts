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
  const response = NextResponse.json({
    user: data.user,
    accessToken: data.accessToken,
  })

  const setCookieHeader = apiRes.headers.get('set-cookie')
  if (setCookieHeader) {
    response.headers.set('set-cookie', setCookieHeader)
  }

  return response
}