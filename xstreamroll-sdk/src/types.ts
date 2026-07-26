// ─── Generated types from OpenAPI spec ─────────────────────────────────────
// Regenerate with `npm run generate:types` (requires API server running).
import type { components } from "./generated/schema"

export type { components }

// Convenience aliases for generated DTOs.
//
// CreateStreamDto/UpdateStreamDto/CreateTagDto are deliberately NOT
// aliased here even though the generator emits them: the corresponding
// api DTOs (api/src/streams/dto/*.ts, api/src/tags/dto/*.ts) have no
// @ApiProperty() decorators, so NestJS Swagger can't infer their shape
// and openapi-typescript generates `Record<string, never>` — a type
// that rejects every property. Aliasing that here would make the SDK
// unusable for those calls. CreateStreamDto/UpdateStreamDto still come
// from @xstreamroll/types below, which are hand-verified against the
// real DTOs. Add the generated aliases once the api DTOs are annotated.
export type RegisterDto = components["schemas"]["RegisterDto"]
export type LoginDto = components["schemas"]["LoginDto"]
export type ForgotPasswordDto = components["schemas"]["ForgotPasswordDto"]
export type ResetPasswordDto = components["schemas"]["ResetPasswordDto"]
export type HealthCheckResponseDto = components["schemas"]["HealthCheckResponseDto"]

// ─── Shared domain types ────────────────────────────────────────────────────
//
// User, Stream, StreamEvent, and pagination shapes are defined once in
// @xstreamroll/types and re-exported here so SDK consumers keep importing
// from "xstreamroll-sdk" without needing to know about the shared package.
// See that package for the canonical definitions.

export type {
  User,
  CreateUserDto,
  Stream,
  StreamStatus,
  CreateStreamDto,
  UpdateStreamDto,
  StreamEventType,
  StreamEvent,
  StreamEventRecord,
  PaginatedResponse,
  PaginationParams,
  ValidationError,
  ApiErrorResponse,
} from "@xstreamroll/types"

import type { ApiErrorResponse, StreamEventType } from "@xstreamroll/types"

// ─── Config ──────────────────────────────────────────────────────────────────

/** Configuration for the StreamingClient. */
export interface StreamConfig {
  /** @deprecated Use `env` or `baseUrl` instead. */
  apiUrl?: string
  clientId?: string
  /** Named environment preset. Overridden by `baseUrl`. */
  env?: "development" | "staging" | "production"
  /** Explicit base URL. Takes precedence over `env` and `apiUrl`. */
  baseUrl?: string
}

// ─── User ─────────────────────────────────────────────────────────────────────

/** Payload for updating user profile. */
export interface UpdateUserDto {
  displayName?: string
  email?: string
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

/** Response returned after a successful login or token refresh. */
export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

/** Payload for `subscribeWebhook()` / `POST /webhooks`. */
export interface CreateWebhookDto {
  streamId: string | number
  url: string
  events: StreamEventType[]
}

/**
 * A registered webhook subscription. `secret` is only ever present in the
 * response returned by `subscribeWebhook()` at creation time — store it
 * immediately, since it is needed to verify future delivery signatures via
 * {@link verifyWebhookSignature}.
 */
export interface WebhookSubscription {
  id: string | number
  userId: string | number
  streamId: string | number
  url: string
  events: StreamEventType[]
  secret: string
  active: boolean
  createdAt: string
}

/** A single delivery attempt, as returned by `GET /webhooks/:id/deliveries`. */
export interface WebhookDelivery {
  id: string | number
  webhookSubscriptionId: string | number
  event: StreamEventType
  payload: Record<string, unknown>
  status: "pending" | "success" | "failed"
  attemptCount: number
  lastStatusCode: number | null
  lastResponseBody: string | null
  lastError: string | null
  nextAttemptAt: string | null
  deliveredAt: string | null
  createdAt: string
}

/** Typed error thrown by the SDK on non-2xx responses. */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly response?: ApiErrorResponse
  ) {
    super(message)
    this.name = "ApiError"
  }
}
