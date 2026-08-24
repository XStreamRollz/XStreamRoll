import { NextResponse } from "next/server"

/**
 * Health endpoint used by the Kubernetes Deployment's liveness and
 * readiness probes. Intentionally minimal: returns a fixed `ok` payload
 * with the current timestamp so the kubelet can verify the process is
 * responsive without depending on the downstream API or database.
 *
 * Mounted at `/api/health` so that it sits *under* the Next.js Route
 * Handler matcher (which excludes the project-level middleware, see
 * `src/middleware.ts`, whose matcher is restricted to `/dashboard/:path*`).
 */
export const dynamic = "force-dynamic"

export function GET(): NextResponse {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  })
}
