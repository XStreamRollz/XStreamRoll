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

/** Payload for creating a new stream. */
export interface CreateStreamDto {
  name: string
  description?: string
  visibility?: StreamVisibility
}

/** Payload for updating an existing stream. */
export interface UpdateStreamDto {
  name?: string
  description?: string
  status?: StreamStatus
  visibility?: StreamVisibility
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
