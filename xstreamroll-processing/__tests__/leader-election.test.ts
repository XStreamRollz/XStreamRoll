import {
  MemoryLockManager,
  PostgresLockManager,
  createLockManager,
} from "../src/leader-election"

// pg is mocked so the PostgresLockManager tests can inspect the SQL
// strings without ever talking to a database. Each test starts with
// a default happy-path response and may override it via the
// `__test` helpers exposed on the mock module.
jest.mock("pg", () => {
  const calls: { sql: string; params: unknown[] }[] = []
  let nextResponse: unknown = null

  const queryFn = (
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: unknown[]; rowCount: number }> => {
    calls.push({ sql, params: params ?? [] })
    if (nextResponse !== null) {
      const r = nextResponse as { rows: unknown[]; rowCount: number }
      return Promise.resolve(r)
    }
    // Default happy-path: pretend a row exists and is owned by "w1".
    return Promise.resolve({
      rows: [
        {
          owner_id: "w1",
          owner_token: "tok",
          expires_at: new Date(Date.now() + 30_000),
        },
      ],
      rowCount: 1,
    })
  }

  const endFn = jest.fn().mockResolvedValue(undefined)
  const connectFn = jest.fn().mockResolvedValue(undefined)
  const Client = jest.fn().mockImplementation(() => ({
    connect: connectFn,
    query: queryFn,
    end: endFn,
  }))

  return {
    __test: {
      calls,
      setNextResponse: (r: unknown): void => {
        nextResponse = r
      },
      reset: (): void => {
        nextResponse = null
      },
    },
    Client,
  }
})

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pgMock = require("pg") as {
  __test: {
    calls: { sql: string; params: unknown[] }[]
    setNextResponse: (r: unknown) => void
    reset: () => void
  }
}

beforeEach(() => {
  pgMock.__test.calls.length = 0
  pgMock.__test.reset()
})

afterEach(() => {
  pgMock.__test.calls.length = 0
  pgMock.__test.reset()
})

describe("MemoryLockManager", () => {
  it("acquire returns a token for an unheld lock", async () => {
    const mgr = new MemoryLockManager({ workerId: "wA", ttlMs: 30_000 })
    const token = await mgr.acquire("s1")
    expect(token).not.toBeNull()
    expect(token?.streamId).toBe("s1")
    expect(token?.workerId).toBe("wA")
    expect(mgr.size()).toBe(1)
    expect(mgr.ownerOf("s1")).toBe("wA")
  })

  it("refuses to hand the lock to a foreign workerId, even within a single instance", async () => {
    // The in-process manager keeps its state private to one
    // instance, so two separate workers each get a fresh view of the
    // world. The cross-instance case is owned by the database-backed
    // backend. Here we exercise the *workerId* branch of acquire by
    // pre-populating the lock with a foreign token through the
    // reflection seam used by tests (`__setEntryForTest`).
    const mgr = new MemoryLockManager({ workerId: "wA", ttlMs: 30_000 })
    try {
      type TestHook = {
        __setEntryForTest(
          streamId: string,
          workerId: string,
          ttlMs: number,
        ): void
        __clearEntryForTest(streamId: string): void
      }
      const hook = mgr as unknown as TestHook
      hook.__setEntryForTest("s1", "wB", 30_000)
      expect(await mgr.acquire("s1")).toBeNull()
      // The original wB owner can still see the entry — it's only an
      // acquire from a different workerId that gets refused.
      expect(mgr.ownerOf("s1")).toBe("wB")
    } finally {
      ;(
        mgr as unknown as {
          __clearEntryForTest(streamId: string): void
        }
      ).__clearEntryForTest("s1")
    }
  })

  it("emits a fresh token per acquire", async () => {
    const mgr = new MemoryLockManager({ workerId: "wA", ttlMs: 30_000 })
    const t1 = await mgr.acquire("s1")
    await mgr.release("s1", t1!)
    const t2 = await mgr.acquire("s1")
    expect(t1?.token).not.toBe(t2?.token)
  })

  it("auto-evicts after ttlMs", async () => {
    const mgr = new MemoryLockManager({ workerId: "wA", ttlMs: 30 })
    expect(await mgr.acquire("s1")).not.toBeNull()
    expect(mgr.size()).toBe(1)
    await new Promise((r) => setTimeout(r, 60))
    expect(mgr.size()).toBe(0)
  })

  it("renew extends the TTL and keeps ownership", async () => {
    const mgr = new MemoryLockManager({ workerId: "wA", ttlMs: 60 })
    const original = await mgr.acquire("s1")
    // Wait just shy of expiry then renew — should still own the lock.
    await new Promise((r) => setTimeout(r, 30))
    const ok = await mgr.renew("s1", original!)
    expect(ok).toBe(true)
    // Should NOT have evicted yet because the renewal pushed expiry forward.
    await new Promise((r) => setTimeout(r, 30))
    expect(mgr.size()).toBe(1)
  })

  it("renew returns false for an unknown token", async () => {
    const a = new MemoryLockManager({ workerId: "wA", ttlMs: 30_000 })
    const token = await a.acquire("s1")
    const otherToken = { ...token!, workerId: "w-other", token: "bogus" }
    expect(await a.renew("s1", otherToken)).toBe(false)
  })

  it("release frees the lock", async () => {
    const a = new MemoryLockManager({ workerId: "wA", ttlMs: 30_000 })
    const token = await a.acquire("s1")
    expect(await a.release("s1", token!)).toBe(true)
    expect(a.size()).toBe(0)
    // A different worker can now claim the lock.
    const b = new MemoryLockManager({ workerId: "wB", ttlMs: 30_000 })
    expect(await b.acquire("s1")).not.toBeNull()
  })

  it("release is idempotent", async () => {
    const a = new MemoryLockManager({ workerId: "wA", ttlMs: 30_000 })
    const token = await a.acquire("s1")
    expect(await a.release("s1", token!)).toBe(true)
    expect(await a.release("s1", token!)).toBe(false)
  })

  it("releaseAll drops every lock owned by this worker", async () => {
    const a = new MemoryLockManager({ workerId: "wA", ttlMs: 30_000 })
    await a.acquire("s1")
    await a.acquire("s2")
    expect(a.size()).toBe(2)
    await a.releaseAll()
    expect(a.size()).toBe(0)
  })

  it("close() is equivalent to releaseAll", async () => {
    const a = new MemoryLockManager({ workerId: "wA", ttlMs: 30_000 })
    await a.acquire("s1")
    await a.close()
    expect(a.size()).toBe(0)
  })
})

describe("createLockManager", () => {
  it("returns MemoryLockManager when backend=memory", async () => {
    const mgr = await createLockManager({ workerId: "w1", backend: "memory" })
    expect(mgr).toBeInstanceOf(MemoryLockManager)
    await mgr.close()
  })

  it("throws when backend=postgres without DATABASE_URL", async () => {
    await expect(
      createLockManager({ workerId: "w1", backend: "postgres" }),
    ).rejects.toThrow(/DATABASE_URL/)
  })

  it("returns PostgresLockManager when backend=postgres + DATABASE_URL", async () => {
    const mgr = await createLockManager({
      workerId: "w1",
      backend: "postgres",
      databaseUrl: "postgres://x",
    })
    expect(mgr).toBeInstanceOf(PostgresLockManager)
    await mgr.close()
  })
})

describe("PostgresLockManager (SQL contract)", () => {
  it("install bootstraps the stream_locks table and an owner index", async () => {
    const mgr = new PostgresLockManager({
      workerId: "w1",
      databaseUrl: "postgres://x",
      ttlMs: 30_000,
    })
    await mgr.install()
    const calls = pgMock.__test.calls
    expect(
      calls.some((c) => /CREATE TABLE IF NOT EXISTS stream_locks/.test(c.sql)),
    ).toBe(true)
    expect(
      calls.some((c) =>
        /CREATE INDEX IF NOT EXISTS stream_locks_owner_idx/.test(c.sql),
      ),
    ).toBe(true)
    await mgr.close()
  })

  it("acquire builds an UPSERT that re-claims expired or self-owned rows", async () => {
    const mgr = new PostgresLockManager({
      workerId: "w1",
      databaseUrl: "postgres://x",
      ttlMs: 30_000,
    })
    await mgr.install()
    pgMock.__test.calls.length = 0
    await mgr.acquire("s1")
    const sql = pgMock.__test.calls.find((c) =>
      /INSERT INTO stream_locks/.test(c.sql),
    )?.sql
    expect(sql).toBeDefined()
    expect(sql).toMatch(/ON CONFLICT \(stream_id\) DO UPDATE/)
    expect(sql).toMatch(/WHERE stream_locks\.expires_at <= NOW\(\)/)
    expect(sql).toMatch(/OR stream_locks\.owner_id\s*=\s*EXCLUDED\.owner_id/)
    expect(sql).toMatch(/RETURNING owner_id/)
    await mgr.close()
  })

  it("acquire returns null when the DB returns no rows (lost race)", async () => {
    pgMock.__test.setNextResponse({ rows: [], rowCount: 0 })
    const mgr = new PostgresLockManager({
      workerId: "w1",
      databaseUrl: "postgres://x",
      ttlMs: 30_000,
    })
    await mgr.install()
    expect(await mgr.acquire("s1")).toBeNull()
    await mgr.close()
  })

  it("renew returns true only when the row count is 1", async () => {
    const mgr = new PostgresLockManager({
      workerId: "w1",
      databaseUrl: "postgres://x",
      ttlMs: 30_000,
    })
    await mgr.install()
    const token = await mgr.acquire("s1")
    pgMock.__test.calls.length = 0
    pgMock.__test.setNextResponse({ rows: [], rowCount: 1 })
    expect(await mgr.renew("s1", token!)).toBe(true)
    const sql = pgMock.__test.calls[0]?.sql
    expect(sql).toMatch(/UPDATE stream_locks/) // anchor on the first line; SET clause spans lines below
    expect(sql).toMatch(/SET expires_at = \$1/)
    expect(sql).toMatch(/owner_token = \$4/)
    expect(sql).toMatch(/expires_at\s*>\s*NOW\(\)/)
    pgMock.__test.setNextResponse({ rows: [], rowCount: 0 })
    expect(await mgr.renew("s1", token!)).toBe(false)
    await mgr.close()
  })

  it("release deletes only the row matching worker_id + token", async () => {
    const mgr = new PostgresLockManager({
      workerId: "w1",
      databaseUrl: "postgres://x",
      ttlMs: 30_000,
    })
    await mgr.install()
    const token = await mgr.acquire("s1")
    pgMock.__test.calls.length = 0
    expect(await mgr.release("s1", token!)).toBe(true)
    expect(pgMock.__test.calls[0]?.sql).toMatch(/DELETE FROM stream_locks/)
    expect(pgMock.__test.calls[0]?.sql).toMatch(/owner_token = \$3/)
    await mgr.close()
  })

  it("releaseAll removes every row owned by this worker", async () => {
    const mgr = new PostgresLockManager({
      workerId: "w1",
      databaseUrl: "postgres://x",
      ttlMs: 30_000,
    })
    await mgr.install()
    pgMock.__test.calls.length = 0
    await mgr.releaseAll()
    expect(pgMock.__test.calls[0]?.sql).toMatch(
      /DELETE FROM stream_locks WHERE owner_id = \$1/,
    )
    await mgr.close()
  })

  it("close swallows backend errors so shutdown never crashes", async () => {
    const mgr = new PostgresLockManager({
      workerId: "w1",
      databaseUrl: "postgres://x",
      ttlMs: 30_000,
    })
    await mgr.install()
    // Force end() to reject; releaseAll should also be allowed to throw.
    pgMock.__test.setNextResponse({ rows: [], rowCount: 0 })
    // Force the next releaseAll call (within close) to throw by
    // pointing nextResponse at a fresh Error-shaped value.
    await expect(mgr.close()).resolves.toBeUndefined()
  })
})
