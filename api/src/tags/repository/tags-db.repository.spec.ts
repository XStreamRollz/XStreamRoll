// Stub the database.module so tests do not pull in env validation
// from the production module graph (#330).
// Stub the database.module so tests do not pull in env validation
// from the production module graph (#330).
// Path: file is at api/src/tags/repository/, target is at api/src/database/
jest.mock("../../database/database.module", () => ({
  PG_POOL: Symbol("PG_POOL"),
}))

import { TagsDbRepository } from "./tags-db.repository"

/**
 * Builds a minimal stub that satisfies the parts of `pg.Pool` the
 * repository actually calls. We avoid `jest-mock-extended` so the test
 * file stays dependency-light; the production code only touches
 * `query`.
 */
function makeRepo(rows: unknown[]) {
  const pool = {
    query: jest.fn().mockImplementation(() => ({ rows })),
  }
  return { repo: new TagsDbRepository(pool as never), pool }
}

describe("TagsDbRepository — listForStreamIds (issue #330)", () => {
  it("returns an empty Map without touching the database when no ids are requested", async () => {
    const { repo, pool } = makeRepo([])
    const res = await repo.listForStreamIds([])
    expect(res.size).toBe(0)
    expect(pool.query).not.toHaveBeenCalled()
  })

  it("issues a single batched SELECT with `stream_id = ANY($1::int[])`", async () => {
    const { repo, pool } = makeRepo([])
    await repo.listForStreamIds([1, 2, 3])

    expect(pool.query).toHaveBeenCalledTimes(1)
    const [sql, params] = pool.query.mock.calls[0]
    expect(sql).toMatch(/stream_id = ANY\(\$1::int\[\]\)/)
    expect(sql).toMatch(/FROM stream_tags st/)
    expect(sql).toMatch(/JOIN tags t ON t\.id = st\.tag_id/)
    expect(sql).toMatch(/ORDER BY st\.stream_id ASC, t\.slug ASC/)
    expect(params).toEqual([[1, 2, 3]])
  })

  it("groups every returned row under its stream id and parses the Tag shape", async () => {
    const now = new Date("2026-01-02T03:04:05Z")
    const rows = [
      { stream_id: 10, id: 1, name: "Live", slug: "live", created_at: now },
      { stream_id: 10, id: 2, name: "Music", slug: "music", created_at: now },
      { stream_id: 11, id: 3, name: "Gaming", slug: "gaming", created_at: now },
    ]
    const { repo } = makeRepo(rows)

    const res = await repo.listForStreamIds([10, 11, 99])

    expect(res.get(10)).toHaveLength(2)
    expect(res.get(10)?.[0]).toMatchObject({ id: 1, slug: "live", name: "Live" })
    expect(res.get(11)).toHaveLength(1)
    expect(res.get(11)?.[0]).toMatchObject({ id: 3, slug: "gaming" })
    // streams with no rows still appear, with an empty array
    expect(res.get(99)).toEqual([])
  })

  it("preserves the stream_id ASC, slug ASC ORDER BY for a stable wire order", async () => {
    // The mock simulates the DB returning rows already sorted by
    // (stream_id ASC, slug ASC). The test data must replicate that
    // order so the test verifies the grouping logic, not the sort.
    // SQL ORDER BY asserts are covered by the regex match in the
    // "single batched SELECT" test above.
    const rows = [
      { stream_id: 1, id: 7, name: "alpha", slug: "alpha", created_at: new Date() },
      { stream_id: 1, id: 5, name: "mike", slug: "mike", created_at: new Date() },
      { stream_id: 2, id: 4, name: "alpha", slug: "alpha", created_at: new Date() },
      { stream_id: 2, id: 9, name: "zeta", slug: "zeta", created_at: new Date() },
    ]
    const { repo } = makeRepo(rows)

    const res = await repo.listForStreamIds([1, 2])
    expect(res.get(1)?.map((t) => t.slug)).toEqual(["alpha", "mike"])
    expect(res.get(2)?.map((t) => t.slug)).toEqual(["alpha", "zeta"])
  })

  it("wraps pool errors in ServiceUnavailableException with a clear context", async () => {
    const pool = {
      query: jest.fn().mockRejectedValue(new Error("connection lost")),
    }
    const repo = new TagsDbRepository(pool as never)
    await expect(repo.listForStreamIds([1])).rejects.toThrow(
      /Database is unavailable/,
    )
  })
})
