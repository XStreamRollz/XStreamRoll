import { type Contract } from "./contract"
import { notificationsPageSchema } from "./schemas"

/**
 * Contract coverage for `api/src/notifications/notifications.controller.ts`
 * (issue #534). The provider suite seeds one unread notification for the
 * fixture user in beforeAll, so this contract validates the non-empty
 * shape — including the numeric ids and ISO-string timestamps.
 */
export const notificationsContracts: Contract[] = [
  {
    name: "list-notifications",
    description: "GET /notifications returns the caller's unread notifications in the paginated envelope",
    consumer: "xstreamroll-sdk",
    provider: "api",
    request: {
      method: "GET",
      path: "/notifications",
      query: { page: 1, limit: 20 },
      authenticated: true,
    },
    response: {
      status: 200,
      schema: notificationsPageSchema,
    },
  },
]
