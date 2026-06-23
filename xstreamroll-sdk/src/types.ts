// Re-export all shared types from the platform types package.
export type {
  UserRole,
  User,
  CreateUserDto,
  UpdateUserDto,
  AuthTokens,
  StreamStatus,
  StreamVisibility,
  Stream,
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
export { ApiError } from "@xstreamroll/types"

// SDK-specific config type — not part of the shared platform contract.
export interface StreamConfig {
  /** @deprecated Use `env` or `baseUrl` instead. */
  apiUrl?: string
  clientId?: string
  /** Named environment preset. Overridden by `baseUrl`. */
  env?: "development" | "staging" | "production"
  /** Explicit base URL. Takes precedence over `env` and `apiUrl`. */
  baseUrl?: string
}
