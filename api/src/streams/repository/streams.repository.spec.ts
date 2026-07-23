import { StreamsRepository } from "./streams.repository"
import { Tag } from "../../tags/tag.entity"

describe("StreamsRepository — listPaginatedWithTags (in-memory parity, issue #330)", () => {
  it("returns the tags attached to each stream in the page", async () => {
    const repo = new StreamsRepository()
    await repo.create({ userId: 1, name: "live-1" })
    await repo.create({ userId: 2, name: "live-2" })
    await repo.create({ userId: 3, name: "silent-1" })

    const tags: Tag[] = [
      { id: 10, name: "gaming", slug: "gaming", createdAt: new Date() },
      { id: 11, name: "music", slug: "music", createdAt: new Date() },
    ]
    // Stream 1 has both tags; stream 2 has none; stream 3 has one tag.
    repo.__seedTags(tags, [
      { streamId: 1, tagId: 10 },
      { streamId: 1, tagId: 11 },
      { streamId: 3, tagId: 10 },
    ])

    const page = await repo.listPaginatedWithTags(1, 10)
    const tagsFor = (id: number) =>
      page.items.find((s) => s.id === id)!.tags.map((t) => t.slug)

    expect(tagsFor(1)).toEqual(["gaming", "music"])
    expect(tagsFor(2)).toEqual([])
    expect(tagsFor(3)).toEqual(["gaming"])
  })

  it("respects the status filter and pagination envelope", async () => {
    const repo = new StreamsRepository()
    for (let i = 0; i < 6; i++) {
      const created = await repo.create({ userId: 1, name: `s${i}` })
      if (i % 2 === 0) {
        await repo.update(created.id, { status: "active" })
      }
    }

    const page = await repo.listPaginatedWithTags(1, 2, { status: "active" })
    expect(page.total).toBe(3)
    expect(page.items).toHaveLength(2)
    page.items.forEach((s) => expect(s.status).toBe("active"))
  })
})
