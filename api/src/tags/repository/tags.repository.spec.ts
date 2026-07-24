import { TagsRepository } from "./tags.repository"
import { Tag } from "../tag.entity"

const makeTag = (overrides: Partial<Tag> = {}): Tag => ({
  id: 1,
  name: "Live",
  slug: "live",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
})

describe("TagsRepository (in-memory) — issue #330", () => {
  let repo: TagsRepository

  beforeEach(() => {
    repo = new TagsRepository()
  })

  describe("listForStreamIds", () => {
    it("returns an empty Map when no stream ids are requested", async () => {
      const res = await repo.listForStreamIds([])
      expect(res.size).toBe(0)
    })

    it("returns every requested stream id as a key, even when the stream has no tags", async () => {
      const res = await repo.listForStreamIds([1, 2, 3])
      expect(res.size).toBe(3)
      expect(res.get(1)).toEqual([])
      expect(res.get(2)).toEqual([])
      expect(res.get(3)).toEqual([])
    })

    it("groups every tag attached to the listed stream ids", async () => {
      const live = makeTag({ id: 1, slug: "live" })
      const music = makeTag({ id: 2, slug: "music" })
      const gaming = makeTag({ id: 3, slug: "gaming" })
      await repo.upsertBySlug(live.name, live.slug)
      await repo.upsertBySlug(music.name, music.slug)
      await repo.upsertBySlug(gaming.name, gaming.slug)
      await repo.attachToStream(10, 1)
      await repo.attachToStream(10, 2)
      await repo.attachToStream(11, 3)

      const res = await repo.listForStreamIds([10, 11, 12])

      expect(res.get(10)?.map((t) => t.slug)).toEqual(["live", "music"])
      expect(res.get(11)?.map((t) => t.slug)).toEqual(["gaming"])
      expect(res.get(12)).toEqual([])
    })

    it("sorts each stream's tags by slug for stable wire order", async () => {
      const a = makeTag({ id: 1, slug: "zeta" })
      const b = makeTag({ id: 2, slug: "alpha" })
      const c = makeTag({ id: 3, slug: "mike" })
      for (const t of [a, b, c]) await repo.upsertBySlug(t.name, t.slug)
      // attach in non-alphabetical order on purpose
      await repo.attachToStream(7, 1)
      await repo.attachToStream(7, 2)
      await repo.attachToStream(7, 3)

      const res = await repo.listForStreamIds([7])
      expect(res.get(7)?.map((t) => t.slug)).toEqual(["alpha", "mike", "zeta"])
    })

    it("ignores stream_tags rows whose stream id is not in the request", async () => {
      const t = makeTag({ id: 1, slug: "live" })
      await repo.upsertBySlug(t.name, t.slug)
      await repo.attachToStream(20, 1)
      // 20 is NOT in the request -- it must not appear in the result.
      const res = await repo.listForStreamIds([21])
      expect(res.get(21)).toEqual([])
      expect(res.has(20)).toBe(false)
    })

    it("ignores stream_tags rows that reference a tag that was deleted", async () => {
      // No upsert -- the tag id 999 doesn't exist in tagsBySlug, but
      // we still insert a stale stream_tags row via the in-memory API.
      const t = makeTag({ id: 1, slug: "live" })
      await repo.upsertBySlug(t.name, t.slug)
      await repo.attachToStream(5, 1)
      // Directly poke a dangling stream_tags row to simulate a FK
      // orphaned in a real DB (shouldn't happen there, but the
      // defensive check is worth locking in).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(repo as any).streamTags.set("5:999", {
        streamId: 5,
        tagId: 999,
        createdAt: new Date(),
      })

      const res = await repo.listForStreamIds([5])
      expect(res.get(5)?.map((tt) => tt.id)).toEqual([1])
    })
  })
})
