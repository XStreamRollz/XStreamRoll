import { ApiProperty } from "@nestjs/swagger"
import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  Min,
} from "class-validator"

import { STREAM_EVENTS } from "../../gateways/stream-events"

const ALLOWED_EVENTS = Object.values(STREAM_EVENTS)

/**
 * Payload accepted by `POST /webhooks`.
 *
 * NOTE: `IsUrl`, `IsArray`, `ArrayMinSize`, and `ArrayUnique` are
 * unavailable at type-check time due to a class-validator / Node10
 * module-resolution issue (TS2305). The `url` field is validated via
 * `Matches` instead of `IsUrl`. The `events` array shape (non-empty,
 * no duplicates) is validated in the service layer; `@IsString({ each:
 * true })` ensures every element is a string and the value is iterable.
 */
export class CreateWebhookDto {
  @ApiProperty({
    description: "Id of the stream this webhook subscribes to.",
    example: 1,
  })
  @IsInt({ message: "streamId must be an integer" })
  @Min(1, { message: "streamId must be >= 1" })
  streamId!: number

  @ApiProperty({
    description: "URL that receives the signed POST on matching events.",
    example: "https://example.com/webhooks/xstreamroll",
  })
  @Matches(/^https?:\/\/.+/, {
    message: "url must be a valid absolute URL",
  })
  url!: string

  @ApiProperty({
    description: "Stream lifecycle events this webhook should fire on.",
    example: ["stream:started", "stream:stopped"],
    enum: ALLOWED_EVENTS,
    isArray: true,
  })
  @IsString({ each: true, message: "events must be an array of strings" })
  @IsIn(ALLOWED_EVENTS, {
    each: true,
    message: `each event must be one of: ${ALLOWED_EVENTS.join(", ")}`,
  })
  events!: string[]
}
