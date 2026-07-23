/**
 * Regression spec for issue #330 — the "N+1 query in stream tag
 * loading" issue. The Acceptance Criteria state:
 *
 *   • Single database round-trip per call site.
 *   • Implementation may use LEFT JOIN + json_agg(), or batch fetching
 *     via `ANY($1)`, but must not loop per-stream.
 *
 * This spec mocks the `pg` `Pool#query` method with a spy so we can
 * assert the exact call count. The SQL string itself is also asserted
 * to guard against a future regression that re-introduces a per-stream
 * fan-out.
 */
import type { Pool } from "pg"
import { StreamsDbRepository } from "./streams-db.repository"

type QueryRow = Record<string, unknown>

function makePool(rows: QueryRow[][]): {
  pool: { query: jest.Mock }
  callLog: { text: string; values: unknown[] }[]
} {
  const callLog: { text: string; values: unknown[] }[] = []
  let callIndex = 0
  const pool = {
    query: jest.fn(async (text: string, values: unknown[] = []) => {
      callLog.push({ text, values })
      const idx = callIndex++
      const { rows: batch } = rows[idx] ? { rows: rows[idx] } : { rows: [] }
      return { rows: batch ?? [] }
    }),
  }
  return { pool: pool as unknown as { query: jest.Mock }, callLog }
}

describe("StreamsDbRepository — listPaginatedWithTags (issue #330)", () => {
  function buildRepo(pool: { query: jest.Mock }): StreamsDbRepository {
    return new StreamsDbRepository(pool as unknown as Pool)
  }  it("issues exactly two queries (count + page) regardless of limit", async () => {
    const { pool, callLog } = makePool([
      [{ count: "12" }],
      Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        user_id: 99,
        name: `s${i}`,
        description: null,
        status: "inactive",
        created_at: new Date("2026-01-01T00:00:00Z"),
        updated_at: new Date("2026-01-01T00:00:00Z"),
        tags: JSON.stringify([
          {
            id: 100 + i,
            name: `t${i}`,
            slug: `t-${i}`,
            createdAt: "2026-01-01T00:00:00Z",
          },
        ]),
      })),
    ])

    const repo = buildRepo(pool)
    const res = await repo.listPaginatedWithTags(1, 5)

    expect(pool.query).toHaveBeenCalledTimes(2)
    expect(res.total).toBe(12)
    expect(res.items).toHaveLength(5)
    expect(res.items[0].tags).toEqual([
      {
        id: 100,
        name: "t0",
        slug: "t-0",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ])

    // Sanity-check that both queries came from the same call site and
    // didn't smuggle in a per-stream tag fetch loop.
    expect(callLog).toHaveLength(2)
    for (const call of callLog) {
      expect(call.text).not.toMatch(/FOR\s+EACH\s+stream/i)
    }
  })

  it("applies status filter without introducing additional queries", async () => {
    const { pool } = makePool([
      [{ count: "3" }],
      [
        {
          id: 7,
          user_id: 1,
          name: "live",
          description: null,
          status: "active",
          created_at: new Date("2026-01-01T00:00:00Z"),
          updated_at: new Date("2026-01-01T00:00:00Z"),
          tags: "[]",
        },
      ],
    ])

    const repo = buildRepo(pool)
    await repo.listPaginatedWithTags(1, 1, { status: "active" })

    expect(pool.query).toHaveBeenCalledTimes(2)
    expect(pool.query.mock.calls[0][1]).toEqual(["active"])
  })

  it("returns an empty tags array when the json_agg payload is null", async () => {
    const { pool } = makePool([
      [{ count: "1" }],
      [
        {
          id: 9,
          user_id: 1,
          name: "no-tags",
          description: null,
          status: "inactive",
          created_at: new Date("2026-01-01T00:00:00Z"),
          updated_at: new Date("2026-01-01T00:00:00Z"),
          tags: null,
        },
      ],
    ])

    const repo = buildRepo(pool)
    const res = await repo.listPaginatedWithTags(1, 10)

    expect(res.items[0].tags).toEqual([])
  })
})
