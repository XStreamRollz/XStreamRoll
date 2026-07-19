import { ArgumentsHost, Catch, HttpStatus } from "@nestjs/common"
import { BaseExceptionFilter } from "@nestjs/core"
import { Response } from "express"

// Postgres error code for a statement cancelled by statement_timeout.
const PG_QUERY_CANCELED = "57014"

interface PgError extends Error {
  code?: string
}

function isQueryTimeout(error: unknown): error is PgError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as PgError).code === PG_QUERY_CANCELED
  )
}

@Catch()
export class QueryTimeoutExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (!isQueryTimeout(exception)) {
      super.catch(exception, host)
      return
    }

    const res = host.switchToHttp().getResponse<Response>()
    res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      statusCode: 503,
      message: "Database query timed out",
    })
  }
}
