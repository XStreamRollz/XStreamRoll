export interface Tag {
  id: number
  name: string
  slug: string
  createdAt: string
}

export interface PagedTags {
  items: Tag[]
  page: number
  limit: number
  total: number
  hasMore: boolean
}
