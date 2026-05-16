import { Injectable, PipeTransform } from "@nestjs/common"
import { sanitizeUserText } from "./sanitize"

/**
 * Strips HTML/script tags from every string value reachable through
 * the incoming payload. Numbers, booleans, Date instances, Buffers,
 * and other non-string scalars pass through untouched — the pipe is
 * intentionally narrow so it never coerces data types unexpectedly.
 *
 * Apply globally via:
 *
 *   app.useGlobalPipes(new SanitizeStringsPipe(), new ValidationPipe(...))
 *
 * Order matters: sanitisation runs BEFORE class-validator so DTO
 * validators see already-stripped text and `forbidNonWhitelisted`
 * decisions stay deterministic.
 */
@Injectable()
export class SanitizeStringsPipe implements PipeTransform {
  transform(value: unknown): unknown {
    return sanitizeValue(value)
  }
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeUserText(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item))
  }

  if (value && typeof value === "object") {
    // Skip well-known non-plain-object values so we don't tear apart
    // Buffers, Dates, or stream-like things if a future controller
    // ever receives them via the body / query pipeline.
    if (
      value instanceof Date ||
      value instanceof RegExp ||
      value instanceof Map ||
      value instanceof Set ||
      (typeof Buffer !== "undefined" && Buffer.isBuffer(value))
    ) {
      return value
    }

    const source = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(source)) {
      out[key] = sanitizeValue(source[key])
    }
    return out
  }

  return value
}
