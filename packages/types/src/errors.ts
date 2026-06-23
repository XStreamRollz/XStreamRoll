export interface ValidationError {
  field: string
  message: string
}

export interface ApiErrorResponse {
  statusCode: number
  message: string | string[]
  error: string
  validationErrors?: ValidationError[]
}

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
