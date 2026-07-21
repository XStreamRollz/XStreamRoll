import { ApiProperty } from "@nestjs/swagger"
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsUrl,
  Min,
} from "class-validator"
import { STREAM_EVENTS } from "../../gateways/stream-events"

const ALLOWED_EVENTS = Object.values(STREAM_EVENTS)

/**
 * Payload accepted by `POST /webhooks`.
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
  @IsUrl(
    { require_tld: false, require_protocol: true },
    { message: "url must be a valid absolute URL" },
  )
  url!: string

  @ApiProperty({
    description: "Stream lifecycle events this webhook should fire on.",
    example: ["stream:started", "stream:stopped"],
    enum: ALLOWED_EVENTS,
    isArray: true,
  })
  @IsArray({ message: "events must be an array" })
  @ArrayMinSize(1, { message: "events must contain at least one event name" })
  @ArrayUnique({ message: "events must not contain duplicates" })
  @IsIn(ALLOWED_EVENTS, {
    each: true,
    message: `each event must be one of: ${ALLOWED_EVENTS.join(", ")}`,
  })
  events!: string[]
}
