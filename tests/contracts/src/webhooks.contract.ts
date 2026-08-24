import { z } from "zod"

import { PLACEHOLDER, type Contract } from "./contract"
import {
  apiErrorSchema,
  paginatedWebhookSubscriptionsSchema,
  webhookDeliverySchema,
  webhookSubscriptionSchema,
  webhookSubscriptionSummarySchema,
} from "./schemas"

/** Empty (204) responses have no body; supertest yields `{}`. */
const emptyBodySchema = z.object({})

const createBody = {
  streamId: PLACEHOLDER.EXISTING_STREAM_ID,
  url: "https://example.com/webhooks/contract",
  events: ["stream:started"],
}

export const webhooksContracts: Contract[] = [
  {
    name: "create-webhook",
    description: "POST /webhooks registers a subscription and returns the secret once",
    consumer: "xstreamroll-sdk",
    provider: "api",
    request: {
      method: "POST",
      path: "/webhooks",
      body: createBody,
      authenticated: true,
    },
    response: {
      status: 201,
      schema: webhookSubscriptionSchema,
    },
  },
  {
    name: "list-webhooks",
    description: "GET /webhooks returns the caller's subscriptions without secrets",
    consumer: "xstreamroll-sdk",
    provider: "api",
    request: {
      method: "GET",
      path: "/webhooks",
      query: { page: 1, limit: 20 },
      authenticated: true,
    },
    response: {
      status: 200,
      schema: paginatedWebhookSubscriptionsSchema,
    },
  },
  {
    name: "update-webhook",
    description: "PATCH /webhooks/:id updates url/events/active but never the secret",
    consumer: "xstreamroll-sdk",
    provider: "api",
    request: {
      method: "PATCH",
      path: "/webhooks/:id",
      pathParams: { id: PLACEHOLDER.EXISTING_WEBHOOK_ID },
      body: { active: false },
      authenticated: true,
    },
    response: {
      status: 200,
      schema: webhookSubscriptionSummarySchema,
    },
  },
  {
    name: "retry-webhook-delivery",
    description: "POST /webhooks/:id/deliveries/:deliveryId/retry re-queues a failed delivery",
    consumer: "xstreamroll-sdk",
    provider: "api",
    request: {
      method: "POST",
      path: "/webhooks/:id/deliveries/:deliveryId/retry",
      pathParams: {
        id: PLACEHOLDER.EXISTING_WEBHOOK_ID,
        deliveryId: PLACEHOLDER.EXISTING_DELIVERY_ID,
      },
      authenticated: true,
    },
    response: {
      status: 200,
      schema: webhookDeliverySchema,
    },
  },
  {
    name: "retry-webhook-delivery-not-found",
    description: "POST retry on a nonexistent webhook returns the standard API error body",
    consumer: "xstreamroll-sdk",
    provider: "api",
    request: {
      method: "POST",
      path: "/webhooks/:id/deliveries/:deliveryId/retry",
      pathParams: {
        id: PLACEHOLDER.MISSING_WEBHOOK_ID,
        deliveryId: PLACEHOLDER.EXISTING_DELIVERY_ID,
      },
      authenticated: true,
    },
    response: {
      status: 404,
      schema: apiErrorSchema,
    },
  },
  {
    // Runs last on purpose: it removes the seeded subscription the retry
    // contracts above depend on. Contracts execute in array order.
    name: "delete-webhook",
    description: "DELETE /webhooks/:id removes the subscription and returns 204",
    consumer: "xstreamroll-sdk",
    provider: "api",
    request: {
      method: "DELETE",
      path: "/webhooks/:id",
      pathParams: { id: PLACEHOLDER.EXISTING_WEBHOOK_ID },
      authenticated: true,
    },
    response: {
      status: 204,
      schema: emptyBodySchema,
    },
  },
]
