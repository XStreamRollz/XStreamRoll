import { z, type ZodType } from "zod"
import type {
  ApiErrorResponse,
  PaginatedResponse,
  Stream,
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

export const streamSchema = typed<Stream>()(
  z.object({
    id: z.string(),
    userId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    status: streamStatusSchema,
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
