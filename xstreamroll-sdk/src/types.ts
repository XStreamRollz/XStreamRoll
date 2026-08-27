// ─── Generated types from OpenAPI spec ─────────────────────────────────────
// Regenerate with `npm run generate:types` (requires API server running).
import type {
  ApiErrorResponse,
  PaginatedResponse,
  StreamEventType,
  Tag,
  User,
} from "@xstreamroll/types"
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
  StreamVisibility,
  CreateStreamDto,
  UpdateStreamDto,
  Tag,
  StreamEventType,
  StreamEvent,
  StreamEventRecord,
  PaginatedResponse,
  PaginationParams,
  ValidationError,
  ApiErrorResponse,
} from "@xstreamroll/types"

// ─── Tags ────────────────────────────────────────────────────────────────────

/**
 * Paginated tag envelope returned by `GET /streams/:id/tags` (issue #517).
 * Same shape as the API's `PagedTags` wire contract: the standard
 * pagination envelope plus the legacy `hasMore` boolean.
 */
export interface PagedTags extends PaginatedResponse<Tag> {
  hasMore: boolean
}

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
  /**
   * The stream API key (`STREAM_API_KEY` on the server). Sent as the
   * `X-Stream-Api-Key` header on {@link StreamingClient.publishEvent} so
   * event ingestion authenticates without a per-user JWT (issue #514).
   */
  apiKey?: string
}

// ─── User ─────────────────────────────────────────────────────────────────────

/** Payload for updating user profile. */
export interface UpdateUserDto {
  displayName?: string
  email?: string
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

/** Response returned after a successful login or token refresh. */
export interface AuthResponse {
  user: User
  accessToken: string
  refreshToken: string
}

/**
 * The token pair returned by login/register/refresh. Kept as a separate
 * alias (rather than using {@link AuthResponse} directly) because the
 * client stores only the tokens — the `user` object rides along on the
 * auth responses but isn't persisted by {@link StreamingClient}.
 */
export type AuthTokens = AuthResponse

// ─── Streams: analytics & event replay ───────────────────────────────────────

/**
 * Aggregate analytics returned by `GET /streams/:id/analytics`. Mirrors
 * the API's `StreamAnalyticsDto` exactly (issue #534).
 */
export interface StreamAnalytics {
  streamId: number
  totalEventsProcessed: {
    last24h: number
    last7d: number
    last30d: number
  }
  errorRate: {
    window: "30d"
    totalEvents: number
    errorEvents: number
    percentage: number
  }
  processingLatency: {
    window: "30d"
    averageMs: number | null
    p99Ms: number | null
  }
  eventsPerMinute: Array<{
    minute: string
    count: number
  }>
  generatedAt: string
}

// ─── Notifications ───────────────────────────────────────────────────────────

/**
 * A single unread notification, as returned by `GET /notifications`
 * (issue #534). Numeric ids and ISO-string timestamps on the wire.
 */
export interface Notification {
  id: number
  userId: number
  type: string
  payload: Record<string, unknown>
  readAt: string | null
  createdAt: string
  expiresAt: string
}

/** Paginated unread-notification envelope from `GET /notifications`. */
export interface NotificationsPage extends PaginatedResponse<Notification> {
  unreadCount: number
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

/**
 * A webhook subscription as returned by every endpoint except creation
 * (`GET /webhooks`, `PATCH /webhooks/:id`). Identical to
 * {@link WebhookSubscription} minus the `secret`, which the API only
 * ever returns once, from `subscribeWebhook()`.
 */
export interface WebhookSubscriptionSummary {
  id: string | number
  userId: string | number
  streamId: string | number
  url: string
  events: StreamEventType[]
  active: boolean
  createdAt: string
}

/**
 * Partial payload accepted by `updateWebhook()` / `PATCH /webhooks/:id`.
 * The signing secret cannot be changed through this endpoint — it is
 * creation-time-only.
 */
export interface UpdateWebhookDto {
  url?: string
  events?: StreamEventType[]
  active?: boolean
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
