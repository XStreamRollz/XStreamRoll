// ─── Generated types from OpenAPI spec ─────────────────────────────────────
// Regenerate with `npm run generate:types` (requires API server running).
import type { components } from "./generated/schema"

export type { components }

// Convenience aliases for generated DTOs
export type RegisterDto = components["schemas"]["RegisterDto"]
export type LoginDto = components["schemas"]["LoginDto"]
export type ForgotPasswordDto = components["schemas"]["ForgotPasswordDto"]
export type ResetPasswordDto = components["schemas"]["ResetPasswordDto"]
export type CreateStreamDto = components["schemas"]["CreateStreamDto"]
export type UpdateStreamDto = components["schemas"]["UpdateStreamDto"]
export type CreateTagDto = components["schemas"]["CreateTagDto"]
export type HealthCheckResponseDto = components["schemas"]["HealthCheckResponseDto"]

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

/** User roles available in the platform. */
export type UserRole = "admin" | "viewer"

/** A registered user account. */
export interface User {
  id: string
  email: string
  displayName: string
  role: UserRole
  createdAt: string
  updatedAt: string
}

/** Payload for creating a new user. */
export interface CreateUserDto {
  email: string
  password: string
  displayName: string
}

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

// ─── Stream ───────────────────────────────────────────────────────────────────

/** Possible lifecycle states of a stream. */
export type StreamStatus = "active" | "inactive" | "error"

/** Visibility setting for a stream. */
export type StreamVisibility = "public" | "private"

/** A stream resource. */
export interface Stream {
  id: string
  userId: string
  name: string
  description: string | null
  status: StreamStatus
  visibility: StreamVisibility
  createdAt: string
  updatedAt: string
}

// ─── Stream Events ────────────────────────────────────────────────────────────

/** Types of events that can occur on a stream. */
export type StreamEventType =
  | "stream:started"
  | "stream:stopped"
  | "stream:error"
  | "viewer:joined"
  | "viewer:left"
  | "data"

/** A real-time event emitted by a stream. */
export interface StreamEvent {
  streamId: string
  eventType: StreamEventType
  data: Record<string, unknown>
  timestamp?: string
}

/** A persisted stream event record from the API. */
export interface StreamEventRecord {
  id: string
  streamId: string
  eventType: StreamEventType
  payload: Record<string, unknown>
  occurredAt: string
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

// ─── Pagination ───────────────────────────────────────────────────────────────

/** Standard paginated API response wrapper. */
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

/** Query parameters for paginated list endpoints. */
export interface PaginationParams {
  page?: number
  limit?: number
}

// ─── Errors ───────────────────────────────────────────────────────────────────

/** A single field-level validation error. */
export interface ValidationError {
  field: string
  message: string
}

/** Standard API error response shape. */
export interface ApiErrorResponse {
  statusCode: number
  message: string | string[]
  error: string
  validationErrors?: ValidationError[]
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
