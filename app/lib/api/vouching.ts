export interface VouchRequest {
  id: string
  learnerAddress: string
  reputationScore: number
  loanAmount: string
  purpose: string
  requestedAt: string
}

export interface ActiveVouch {
  id: string
  learnerAddress: string
  reputationBoost: number
  expiresAt: string
  repaymentStatus: "on_track" | "late" | "completed" | "defaulted"
}

export interface VouchImpact {
  scoreBefore: number
  scoreAfter: number
  interestRateBefore: string
  interestRateAfter: string
}

const DEFAULT_API_BASE = "http://localhost:3001"

function apiBase(): string {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }
  return DEFAULT_API_BASE
}

export class VouchingApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = "VouchingApiError"
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string }
    if (typeof body.message === "string") return body.message
  } catch {
    /* ignore */
  }
  return `request failed with ${res.status}`
}

export async function getVouchRequests(
  init: { signal?: AbortSignal } = {},
): Promise<VouchRequest[]> {
  const res = await fetch(`${apiBase()}/vouching/requests`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: init.signal,
    cache: "no-store",
  })
  if (!res.ok) throw new VouchingApiError(res.status, await readError(res))
  return (await res.json()) as VouchRequest[]
}

export async function getMyVouches(
  init: { signal?: AbortSignal } = {},
): Promise<ActiveVouch[]> {
  const res = await fetch(`${apiBase()}/vouching/given`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: init.signal,
    cache: "no-store",
  })
  if (!res.ok) throw new VouchingApiError(res.status, await readError(res))
  return (await res.json()) as ActiveVouch[]
}

export async function submitVouch(
  learnerAddress: string,
  init: { signal?: AbortSignal } = {},
): Promise<void> {
  const res = await fetch(`${apiBase()}/vouching`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ learnerAddress }),
    signal: init.signal,
  })
  if (!res.ok) throw new VouchingApiError(res.status, await readError(res))
}

export async function revokeVouch(
  id: string,
  init: { signal?: AbortSignal } = {},
): Promise<void> {
  const res = await fetch(`${apiBase()}/vouching/${id}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
    signal: init.signal,
  })
  if (!res.ok) throw new VouchingApiError(res.status, await readError(res))
}
