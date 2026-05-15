/**
 * In-memory representation of a tag. The shape mirrors what a future
 * Postgres-backed entity will expose so the controller / service layer
 * does not need to change when we swap the repository implementation.
 */
export interface Tag {
  id: number
  name: string
  slug: string
  createdAt: Date
}

/**
 * Row in the join table that associates a stream with a tag.
 */
export interface StreamTag {
  streamId: number
  tagId: number
  createdAt: Date
}
