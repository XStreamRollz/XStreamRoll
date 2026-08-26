import { z, type ZodType } from "zod"

import type {
  ApiErrorResponse,
  PaginatedResponse,
  Stream,
  StreamEventRecord,
  Tag,
  User,
} from "@xstreamroll/types"

/**
 * Pins a hand-written zod schema to a `@xstreamroll/types` interface at
 * compile time: if the schema's inferred shape stops matching `T`, this
 * file fails to typecheck. That's what keeps these contracts from
 * drifting the same way the independent copies they replaced did — a
 * type change in `@xstreamroll/types` forces a schema update here before
 * anything can build.
 */
function typed<T>() {
  return <S extends ZodType<T>>(schema: S): S => schema
}

export const streamStatusSchema = z.enum(["active", "inactive", "error"])

export const streamVisibilitySchema = z.enum(["public", "private"])

export const streamSchema = typed<Stream>()(
  z.object({
    id: z.string(),
    userId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    status: streamStatusSchema,
    visibility: streamVisibilitySchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
)

export const paginatedStreamsSchema = typed<PaginatedResponse<Stream>>()(
  z.object({
    data: z.array(streamSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
  }),
)

export const tagSchema = typed<Tag>()(
  z.object({
    id: z.number(),
    name: z.string(),
    slug: z.string(),
    createdAt: z.string(),
  }),
)

/**
 * Envelope returned by `GET /streams/:id/tags` (issue #517). Uses the
 * `PagedTags` shape (with `hasMore`) that the app's `useStreamTags`
 * hook parses — deliberately not pinned via `typed<>` because no
 * shared `@xstreamroll/types` interface carries `hasMore` yet.
 */
export const pagedTagsSchema = z.object({
  data: z.array(tagSchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  hasMore: z.boolean(),
})

export const userSchema = typed<User>()(
  z.object({
    id: z.string(),
    username: z.string(),
    email: z.string(),
    createdAt: z.string(),
  }),
)

/** Shape of `POST /auth/register` and `POST /auth/login` responses. */
export const authResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
})

/** The closed set of stream lifecycle/data event types. */
export const streamEventTypeSchema = z.enum([
  "stream:started",
  "stream:stopped",
  "stream:error",
  "viewer:joined",
  "viewer:left",
  "data",
])

/**
 * A single persisted stream event, as returned by `GET /streams/:id/events`
 * (issue #396). The `id`/`streamId` are strings on the wire — the same
 * stringification that already bit `Stream` and `User` — and the schema
 * pins that choice so a regression fails the provider suite.
 */
export const streamEventRecordSchema = typed<StreamEventRecord>()(
  z.object({
    id: z.string(),
    streamId: z.string(),
    eventType: streamEventTypeSchema,
    payload: z.record(z.string(), z.unknown()),
    occurredAt: z.string(),
  }),
)

export const paginatedStreamEventsSchema = z.object({
  data: z.array(streamEventRecordSchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  hasMore: z.boolean(),
})

/**
 * Aggregate analytics returned by `GET /streams/:id/analytics`.
 * Mirrors `StreamAnalyticsDto` in the API — no shared
 * `@xstreamroll/types` interface exists yet, so the schema is written
 * by hand and pinned by the consumer test's type assertion.
 */
export const streamAnalyticsSchema = z.object({
  streamId: z.number(),
  totalEventsProcessed: z.object({
    last24h: z.number(),
    last7d: z.number(),
    last30d: z.number(),
  }),
  errorRate: z.object({
    window: z.literal("30d"),
    totalEvents: z.number(),
    errorEvents: z.number(),
    percentage: z.number(),
  }),
  processingLatency: z.object({
    window: z.literal("30d"),
    averageMs: z.number().nullable(),
    p99Ms: z.number().nullable(),
  }),
  eventsPerMinute: z.array(
    z.object({
      minute: z.string(),
      count: z.number(),
    }),
  ),
  generatedAt: z.string(),
})

/**
 * A single unread notification, as returned by `GET /notifications`.
 * Numeric ids and ISO-string timestamps on the wire.
 */
export const notificationSchema = z.object({
  id: z.number(),
  userId: z.number(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  readAt: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
})

export const notificationsPageSchema = z.object({
  data: z.array(notificationSchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  unreadCount: z.number(),
})

/**
 * Shape returned by `POST /streams/events` (issue #514) and, per row,
 * by `GET /streams/pending` — the `stream_data` wire shape the worker
 * consumes.
 */
export const pendingStreamEventSchema = z.object({
  streamId: z.string(),
  data: z.record(z.string(), z.unknown()),
  timestamp: z.string(),
})

/**
 * A webhook subscription as returned by `POST /webhooks` — the only
 * response that includes the signing `secret`. Field types mirror the
 * SDK's `WebhookSubscription` exactly (ids accept string or number on
 * the wire; `events` is pinned to the closed {@link streamEventTypeSchema}
 * union the SDK's `StreamEventType` declares) so a server-side type
 * change fails CI (issue #534).
 */
export const webhookSubscriptionSchema = z.object({
  id: z.union([z.string(), z.number()]),
  userId: z.union([z.string(), z.number()]),
  streamId: z.union([z.string(), z.number()]),
  url: z.string(),
  events: z.array(streamEventTypeSchema),
  secret: z.string(),
  active: z.boolean(),
  createdAt: z.string(),
})

/**
 * A webhook subscription on every non-creation endpoint (`GET /webhooks`,
 * `PATCH /webhooks/:id`) — identical to `webhookSubscriptionSchema` minus
 * the secret, which is creation-time-only.
 */
export const webhookSubscriptionSummarySchema = webhookSubscriptionSchema.omit({
  secret: true,
})

export const paginatedWebhookSubscriptionsSchema = z.object({
  data: z.array(webhookSubscriptionSummarySchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

/**
 * A single webhook delivery, as returned by the deliveries endpoints.
 * Field types mirror the SDK's `WebhookDelivery` exactly (issue #534),
 * including the `id`/`webhookSubscriptionId` string-vs-number choice and
 * the closed `event` union.
 */
export const webhookDeliverySchema = z.object({
  id: z.union([z.string(), z.number()]),
  webhookSubscriptionId: z.union([z.string(), z.number()]),
  event: streamEventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  status: z.enum(["pending", "success", "failed"]),
  attemptCount: z.number(),
  lastStatusCode: z.number().nullable(),
  lastResponseBody: z.string().nullable(),
  lastError: z.string().nullable(),
  nextAttemptAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  createdAt: z.string(),
})

export const paginatedWebhookDeliveriesSchema = z.object({
  data: z.array(webhookDeliverySchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

export const apiErrorSchema = typed<ApiErrorResponse>()(
  z.object({
    statusCode: z.number(),
    message: z.union([z.string(), z.array(z.string())]),
    error: z.string(),
    validationErrors: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional(),
  }),
)
