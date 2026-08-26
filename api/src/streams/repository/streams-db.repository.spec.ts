// Stub the database.module so tests do not pull in env validation
// from the production module graph (#330).
jest.mock("../../database/database.module", () => ({
  PG_POOL: Symbol("PG_POOL"),
}))

import { StreamsDbRepository } from "./streams-db.repository"

/**
 * Builds a stub that satisfies the parts of `pg.Pool` the repository
 * actually calls. `rows` is returned for the SELECT query; the COUNT
 * query is short-circuited so the assertions can focus on the WHERE
 * fragment shared by both.
 */
function makeRepo(rows: unknown[], countRows: unknown[] = [{ count: "0" }]) {
  const pool = {
    query: jest.fn().mockImplementation((sql: string) => {
      if (String(sql).trimStart().startsWith("SELECT COUNT")) {
        return { rows: countRows }
      }
      return { rows }
    }),
  }
  return { repo: new StreamsDbRepository(pool as never), pool }
}

/** The WHERE fragment of a query, i.e. everything from `WHERE` onward. */
function whereFragment(sql: string): string {
  return sql.slice(sql.indexOf("WHERE"))
}

describe("StreamsDbRepository — listPaginated search & tag predicates (issue #532)", () => {
  it("q emits an ILIKE predicate over name and description with a shared placeholder", async () => {
    const { repo, pool } = makeRepo([])
    await repo.listPaginated(1, 10, 1, { q: "football" })

    const countSql = pool.query.mock.calls[0][0] as string
    const selectSql = pool.query.mock.calls[1][0] as string

    // The repository source spells the Postgres escape char as `\\`
    // inside a template literal, which produces `ESCAPE '\'` at runtime.
    const ilikePredicate = `(name ILIKE $2 ESCAPE '\\' OR description ILIKE $2 ESCAPE '\\')`
    expect(countSql).toContain(ilikePredicate)
    expect(selectSql).toContain(ilikePredicate)
  })

  it("COUNT and SELECT share the exact same WHERE fragment so totals cannot disagree with the page", async () => {
    const { repo, pool } = makeRepo([])
    await repo.listPaginated(1, 10, 1, { q: "football", tagId: 3 })

    const countSql = pool.query.mock.calls[0][0] as string
    const selectSql = pool.query.mock.calls[1][0] as string
    // The SELECT appends a newline + ORDER BY / LIMIT / OFFSET after the
    // WHERE, so trim the SELECT's WHERE fragment before comparing.
    const selectWhere = whereFragment(selectSql).split(" ORDER BY")[0].trim()
    expect(whereFragment(countSql).trim()).toBe(selectWhere)
  })

  it("q escapes % and _ so user input cannot become a wildcard", async () => {
    const { repo, pool } = makeRepo([])
    await repo.listPaginated(1, 10, 1, { q: "100%_oops" })

    // params: [$1 = viewer, $2 = pattern]. The pattern wraps the
    // escaped input in %…% (each `\%` / `\_` is one backslash + char).
    const params = pool.query.mock.calls[1][1] as unknown[]
    expect(params[1]).toBe("%100\\%\\_oops%")
  })

  it("tagId emits an EXISTS predicate over stream_tags", async () => {
    const { repo, pool } = makeRepo([])
    await repo.listPaginated(1, 10, 1, { tagId: 7 })

    const selectSql = pool.query.mock.calls[1][0] as string
    expect(selectSql).toContain(
      "EXISTS (SELECT 1 FROM stream_tags st WHERE st.stream_id = streams.id AND st.tag_id = $2)",
    )
    const params = pool.query.mock.calls[1][1] as unknown[]
    expect(params[1]).toBe(7)
  })

  it("q and tagId combine into a single AND-ed WHERE fragment", async () => {
    const { repo, pool } = makeRepo([])
    await repo.listPaginated(1, 10, 1, { q: "football", tagId: 3 })

    const countSql = pool.query.mock.calls[0][0] as string
    const where = whereFragment(countSql)
    expect(where).toContain("ILIKE")
    expect(where).toContain("stream_tags")
    expect(where).toContain(" AND ")

    // $2 = pattern, $3 = tag id — both AFTER the visibility ACL at $1.
    // (The COUNT query carries only the WHERE params; the SELECT appends
    // LIMIT/OFFSET, so assert against the COUNT call.)
    const countParams = pool.query.mock.calls[0][1] as unknown[]
    expect(countParams).toEqual([1, "%football%", 3])
  })

  it("leaves the WHERE fragment untouched when only visibility filters apply", async () => {
    const { repo, pool } = makeRepo([])
    await repo.listPaginated(1, 10, 1, { visibility: "public" })

    const countSql = pool.query.mock.calls[0][0] as string
    const where = whereFragment(countSql)
    expect(where).toContain("(visibility = 'public' OR user_id = $1)")
    expect(where).not.toContain("ILIKE")
    expect(where).not.toContain("stream_tags")
  })
})
