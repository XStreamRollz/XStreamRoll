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
