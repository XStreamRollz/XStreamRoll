import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsIn, IsOptional, IsString } from "class-validator"

/**
 * Allowed values for `streams.visibility`. Kept as a plain string
 * union (not a TypeScript `enum`) so the OpenAPI generator emits a
 * oneOf-style literal union and the SDK can re-export it directly
 * via the `components` schema.
 */
export type StreamVisibility = "public" | "private"

export const STREAM_VISIBILITY_VALUES: readonly StreamVisibility[] = [
  "public",
  "private",
] as const

/**
 * Shared validator decorator for the optional `visibility` field on
 * create / update DTOs. Avoids duplicating `@IsIn` and Swagger
 * metadata in every controller payload.
 */
export function IsOptionalStreamVisibility() {
  return (target: object, propertyName: string): void => {
    IsOptional()(target, propertyName)
    IsString()(target, propertyName)
    IsIn(STREAM_VISIBILITY_VALUES as unknown as string[], {
      message: "visibility must be one of: public, private",
    })(target, propertyName)
    ApiPropertyOptional({
      description:
        "Stream visibility. 'private' is the default; 'public' makes the stream discoverable to other users via GET /streams.",
      enum: STREAM_VISIBILITY_VALUES,
      example: "private",
      default: "private",
    })(target, propertyName)
  }
}
