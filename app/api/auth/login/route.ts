import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const body = await req.json()

  const { email, password } = body

  // Replace with backend API call
  const apiResponse = await fetch("http://localhost:3001/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  })

  if (!apiResponse.ok) {
    return NextResponse.json(
      { message: "Invalid credentials" },
      { status: 401 },
    )
  }

  const data = await apiResponse.json()

  const response = NextResponse.json({
    success: true,
  })

  response.cookies.set({
    name: "token",
    value: data.access_token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  })

  return response
}
