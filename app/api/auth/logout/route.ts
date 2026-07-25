import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  let accessToken = ''

  try {
    const body = await req.json()
    accessToken = body.accessToken || ''
  } catch {
    accessToken = ''
  }

  const apiRes = await fetch('http://localhost:3001/auth/logout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      Cookie: `refresh_token=${req.cookies.get('refresh_token')?.value || ''}`,
    },
  })

  const response = NextResponse.json({ success: true });

  response.cookies.set({
    name: 'refresh_token',
    value: '',
    maxAge: 0,
    path: '/',
  });

  return response;
}