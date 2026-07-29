import type { CreateStreamDto, UpdateStreamDto } from "@xstreamroll/types"
import { PLACEHOLDER, type Contract } from "./contract"
import { apiErrorSchema, paginatedStreamsSchema, streamSchema } from "./schemas"

const createBody: CreateStreamDto = {
  name: "My stream",
  description: "A stream created by the contract suite",
}

const updateBody: UpdateStreamDto = {
  status: "active",
}

export const streamsContracts: Contract[] = [
  {
    name: "create-stream",
    description: "POST /streams creates a stream owned by the caller",
    consumer: "xstreamroll-sdk",
    provider: "api",
    request: {
      method: "POST",
      path: "/streams",
      body: createBody,
      authenticated: true,
    },
    response: {
      status: 201,
      schema: streamSchema,
    },
  },
  {
    name: "list-streams",
    description: "GET /streams returns a paginated list of streams",
    consumer: "xstreamroll-sdk",
    provider: "api",
    request: {
      method: "GET",
      path: "/streams",
      query: { page: 1, limit: 20 },
      authenticated: true,
    },
    response: {
      status: 200,
      schema: paginatedStreamsSchema,
    },
  },
  {
    name: "get-stream-by-id",
    description: "GET /streams/:id returns a single stream owned by the caller",
    consumer: "xstreamroll-sdk",
    provider: "api",
    request: {
      method: "GET",
      path: "/streams/:id",
      pathParams: { id: PLACEHOLDER.EXISTING_STREAM_ID },
      authenticated: true,
    },
    response: {
      status: 200,
      schema: streamSchema,
    },
  },
  {
    // StreamOwnershipGuard runs before the controller/service, and it
    // can't distinguish "doesn't exist" from "not yours" — both fail the
    // ownership query the same way — so a nonexistent id surfaces as 403,
    // not 404. This is intentional API behavior (see the guard's own
    // `@ApiForbiddenResponse` docs on the route) and exactly the kind of
    // thing a contract test is meant to pin down.
    name: "get-stream-by-id-not-found",
    description: "GET /streams/:id returns a standard API error body for an unknown id",
    consumer: "xstreamroll-sdk",
    provider: "api",
    request: {
      method: "GET",
      path: "/streams/:id",
      pathParams: { id: PLACEHOLDER.MISSING_STREAM_ID },
      authenticated: true,
    },
    response: {
      status: 403,
      schema: apiErrorSchema,
    },
  },
  {
    name: "update-stream",
    description: "PATCH /streams/:id updates a stream owned by the caller",
    consumer: "xstreamroll-sdk",
    provider: "api",
    request: {
      method: "PATCH",
      path: "/streams/:id",
      pathParams: { id: PLACEHOLDER.EXISTING_STREAM_ID },
      body: updateBody,
      authenticated: true,
    },
    response: {
      status: 200,
      schema: streamSchema,
    },
  },
]
