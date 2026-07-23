/**
 * A registered user account, as returned by the API.
 *
 * `id` is always a string on the wire: the API's Postgres column is a
 * numeric `SERIAL`, but numeric IDs are never exposed to consumers —
 * they're serialized to strings at the API boundary so the wire
 * contract stays stable even if the storage type changes later.
 */
export interface User {
  id: string
  username: string
  email: string
  createdAt: string
}

/** Payload accepted by `POST /auth/register`. */
export interface CreateUserDto {
  username: string
  email: string
  password: string
}
