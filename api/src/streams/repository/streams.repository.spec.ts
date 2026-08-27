import { StreamsRepository } from "./streams.repository"
import { TagsRepository } from "../../tags/repository/tags.repository"

describe("StreamsRepository (in-memory) — search & tag filtering (issue #532)", () => {
  let repo: StreamsRepository
  let tags: TagsRepository

  beforeEach(async () => {
    tags = new TagsRepository()
    repo = new StreamsRepository(tags)
    // viewer 1 owns stream 1 (public) and stream 2 (public); viewer 2
    // owns stream 3 (private). The ACL means viewer 1 never sees
    // stream 3, and viewer 2 sees all three.
    await repo.create({
      userId: 1,
      name: "Sunday Night Football",
      description: "NFL highlights and analysis",
      visibility: "public",
    })
    await repo.create({
      userId: 1,
      name: "Chess Club",
      description: "Weekly blitz tournament",
      visibility: "public",
    })
    await repo.create({
      userId: 2,
      name: "Private Football Review",
      description: "Internal tape review",
      visibility: "private",
    })
    // Tag "live" is attached to stream 1 (public, user 1) and stream 3
    // (private, user 2) — so the tag filter must respect visibility.
    const live = await tags.upsertBySlug("Live", "live")
    await tags.attachToStream(1, live.id)
    await tags.attachToStream(3, live.id)
  })

  it("q matches stream names case-insensitively", async () => {
    const { items, total } = await repo.listPaginated(1, 10, 2, {
      q: "FOOTBALL",
    })
    // createdAt carries ms precision and the seeds are created in the
    // same tick, so assert on the set (order is covered elsewhere).
    expect(items.map((s) => s.name).sort()).toEqual([
      "Private Football Review",
      "Sunday Night Football",
    ])
    expect(total).toBe(2)
  })

  it("q matches stream descriptions", async () => {
    const { items } = await repo.listPaginated(1, 10, 2, { q: "blitz" })
    expect(items.map((s) => s.name)).toEqual(["Chess Club"])
  })

  it("q returns an empty page when nothing matches", async () => {
    const { items, total } = await repo.listPaginated(1, 10, 2, {
      q: "cricket",
    })
    expect(items).toEqual([])
    expect(total).toBe(0)
  })

  it("q stays inside the visibility ACL (a hidden private stream never matches)", async () => {
    // Viewer 1 cannot see stream 3 (private, user 2) even though its
    // name contains "football".
    const { items, total } = await repo.listPaginated(1, 10, 1, {
      q: "football",
    })
    expect(items.map((s) => s.name)).toEqual(["Sunday Night Football"])
    expect(total).toBe(1)
  })

  it("q combines with status", async () => {
    await repo.update(2, { status: "active" })
    const active = await repo.listPaginated(1, 10, 2, {
      q: "club",
      status: "active",
    })
    expect(active.items.map((s) => s.name)).toEqual(["Chess Club"])
    expect(active.total).toBe(1)

    const inactive = await repo.listPaginated(1, 10, 2, {
      q: "club",
      status: "inactive",
    })
    expect(inactive.items).toEqual([])
    expect(inactive.total).toBe(0)
  })

  it("q combines with visibility", async () => {
    const publicOnly = await repo.listPaginated(1, 10, 2, {
      q: "football",
      visibility: "public",
    })
    expect(publicOnly.items.map((s) => s.name)).toEqual([
      "Sunday Night Football",
    ])
    expect(publicOnly.total).toBe(1)

    const privateOnly = await repo.listPaginated(1, 10, 2, {
      q: "football",
      visibility: "private",
    })
    expect(privateOnly.items.map((s) => s.name)).toEqual([
      "Private Football Review",
    ])
    expect(privateOnly.total).toBe(1)
  })

  it("q treats % and _ literally, never as wildcards", async () => {
    await repo.create({
      userId: 1,
      name: "100% organic",
      description: "no additives",
      visibility: "public",
    })
    await repo.create({
      userId: 1,
      name: "100 organic",
      description: "no additives either",
      visibility: "public",
    })

    const percent = await repo.listPaginated(1, 10, 1, { q: "100%" })
    expect(percent.items.map((s) => s.name)).toEqual(["100% organic"])
    expect(percent.total).toBe(1)

    // A bare "%" matches only names that literally contain "%".
    const bare = await repo.listPaginated(1, 10, 1, { q: "%" })
    expect(bare.items.map((s) => s.name)).toEqual(["100% organic"])
    expect(bare.total).toBe(1)
  })

  it("tag filter returns only streams carrying the tag", async () => {
    const { items, total } = await repo.listPaginated(1, 10, 2, { tagId: 1 })
    // Streams 1 and 3 both carry tag id 1.
    expect(items.map((s) => s.name).sort()).toEqual([
      "Private Football Review",
      "Sunday Night Football",
    ])
    expect(total).toBe(2)
  })

  it("tag filter respects the visibility ACL", async () => {
    // Viewer 1 can only see stream 1 of the two tagged streams.
    const { items, total } = await repo.listPaginated(1, 10, 1, { tagId: 1 })
    expect(items.map((s) => s.name)).toEqual(["Sunday Night Football"])
    expect(total).toBe(1)
  })

  it("tag filter combines with q", async () => {
    const { items, total } = await repo.listPaginated(1, 10, 2, {
      tagId: 1,
      q: "review",
    })
    expect(items.map((s) => s.name)).toEqual(["Private Football Review"])
    expect(total).toBe(1)
  })

  it("results are sorted newest-first", async () => {
    // Give the seeds distinct createdAt values so ordering is
    // deterministic, then confirm the list comes back newest-first.
    const now = new Date()
    const repo2 = new StreamsRepository(tags)
    const first = await repo2.create({
      userId: 1,
      name: "Oldest",
      visibility: "public",
    })
    first.createdAt = new Date(now.getTime() - 10_000)
    const second = await repo2.create({
      userId: 1,
      name: "Newest",
      visibility: "public",
    })
    second.createdAt = now

    const { items } = await repo2.listPaginated(1, 10, 1)
    expect(items.map((s) => s.name)).toEqual(["Newest", "Oldest"])
  })

  it("unknown tag id matches nothing (empty page, not an error)", async () => {
    const { items, total } = await repo.listPaginated(1, 10, 2, { tagId: 999 })
    expect(items).toEqual([])
    expect(total).toBe(0)
  })

  it("without an injected tag repository a tag filter honestly matches nothing", async () => {
    const standalone = new StreamsRepository()
    const { items, total } = await standalone.listPaginated(1, 10, 2, {
      tagId: 1,
    })
    expect(items).toEqual([])
    expect(total).toBe(0)
  })

  it("total reflects the filtered set, not the whole table", async () => {
    const { total } = await repo.listPaginated(1, 2, 2, { q: "football" })
    expect(total).toBe(2)
    // Page 2 of the same filtered set is empty, proving the slice is
    // over the filtered set.
    const page2 = await repo.listPaginated(2, 2, 2, { q: "football" })
    expect(page2.items).toEqual([])
  })
})
