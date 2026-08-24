import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsBoolean, IsIn, IsOptional, IsString, Matches } from "class-validator"

import { STREAM_EVENTS } from "../../gateways/stream-events"

const ALLOWED_EVENTS = Object.values(STREAM_EVENTS)

/**
 * Payload accepted by `PATCH /webhooks/:id`.
 *
 * Every field is optional — a PATCH updates only the fields present.
 * There is deliberately **no `secret` field**: the signing secret is
 * creation-time-only and can never be changed through the API (see the
 * controller JSDoc). Event and URL validation mirrors
 * {@link CreateWebhookDto} so the update path accepts exactly the same
 * values the create path does.
 */
export class UpdateWebhookDto {
  @ApiPropertyOptional({
    description: "New URL that receives the signed POST on matching events.",
    example: "https://example.com/webhooks/xstreamroll",
  })
  @IsOptional()
  @Matches(/^https?:\/\/.+/, {
    message: "url must be a valid absolute URL",
  })
  url?: string

  @ApiPropertyOptional({
    description: "Stream lifecycle events this webhook should fire on.",
    example: ["stream:started", "stream:stopped"],
    enum: ALLOWED_EVENTS,
    isArray: true,
  })
  @IsOptional()
  @IsString({ each: true, message: "events must be an array of strings" })
  @IsIn(ALLOWED_EVENTS, {
    each: true,
    message: `each event must be one of: ${ALLOWED_EVENTS.join(", ")}`,
  })
  events?: string[]

  @ApiPropertyOptional({
    description:
      "Deactivate (false) or reactivate (true) the subscription. Deactivation " +
      "stops new fan-out and the retry sweep immediately; reactivation resumes both.",
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: "active must be a boolean" })
  active?: boolean
}
