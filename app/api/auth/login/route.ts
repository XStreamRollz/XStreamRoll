import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();

  const { email, password } = body;

  const apiResponse = await fetch('http://localhost:3001/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  if (!apiResponse.ok) {
    return NextResponse.json(
      { message: 'Invalid credentials' },
      { status: 401 },
    );
  }

  const data = await apiResponse.json();

  const response = NextResponse.json({
    success: true,
    user: data.user,
    accessToken: data.accessToken,
  });

  response.cookies.set({
    name: 'refresh_token',
    value: data.refreshToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });

  return response;
}