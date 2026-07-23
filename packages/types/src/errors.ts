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
