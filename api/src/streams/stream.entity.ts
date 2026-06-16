/**
 * In-memory representation of a stream. Mirrors the `streams` table
 * defined in `database/schema.sql`. The controller and service layers
 * depend on this interface so they stay unchanged when the repository
 * is swapped for a real DB-backed implementation.
 */
export interface Stream {
  id: number
  userId: number
  name: string
  description: string | null
  status: "inactive" | "active" | "error"
  createdAt: Date
  updatedAt: Date
}
