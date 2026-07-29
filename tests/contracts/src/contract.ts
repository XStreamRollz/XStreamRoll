import type { ZodTypeAny } from "zod"

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE"

export interface ContractRequest {
  method: HttpMethod
  /** Path template, e.g. "/streams/:id". */
  path: string
  /** Values substituted into `:param` placeholders in `path`. */
  pathParams?: Record<string, string>
  /** Query string params appended to the resolved path. */
  query?: Record<string, string | number>
  body?: unknown
  /** Whether the request must carry a valid bearer token. */
  authenticated?: boolean
}

export interface ContractResponse {
  status: number
  /** Zod schema the response body must satisfy. */
  schema: ZodTypeAny
}

/**
 * A single documented interaction between the SDK (consumer) and the API
 * (provider): what the SDK sends, and the shape it's entitled to expect
 * back. `tests/contracts` is the single place this shape is written down —
 * both the provider verification suite (api) and the consumer suite
 * (xstreamroll-sdk) import the same `Contract` objects, so the two sides
 * can never independently drift the way the plain TS interfaces they
 * replaced did.
 */
export interface Contract {
  /** Unique, human-readable name — shown in test output. */
  name: string
  description: string
  consumer: "xstreamroll-sdk"
  provider: "api"
  request: ContractRequest
  response: ContractResponse
}

/**
 * Placeholder path-param values that stand in for ids the provider
 * verification suite only knows at test time (e.g. the id of a stream
 * it just created). The provider spec resolves these before making the
 * request; consumer-side specs never see them because they mock the
 * response directly instead of routing through path params.
 */
export const PLACEHOLDER = {
  EXISTING_STREAM_ID: "__EXISTING_STREAM_ID__",
  MISSING_STREAM_ID: "__MISSING_STREAM_ID__",
} as const

/** Substitutes `:param` placeholders and appends the query string. */
export function resolvePath(request: ContractRequest): string {
  let path = request.path
  for (const [key, value] of Object.entries(request.pathParams ?? {})) {
    path = path.replace(`:${key}`, encodeURIComponent(value))
  }
  const queryEntries = Object.entries(request.query ?? {})
  if (queryEntries.length > 0) {
    const qs = new URLSearchParams(
      queryEntries.map(([k, v]) => [k, String(v)]),
    ).toString()
    path = `${path}?${qs}`
  }
  return path
}
