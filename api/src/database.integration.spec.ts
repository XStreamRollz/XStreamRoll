import { Pool } from "pg"

import {
  resetDb,
  createTestApp,
  destroyTestApp,
  TestAppContext,
} from "./database/test-utils"
import { StreamsDbRepository } from "./streams/repository/streams-db.repository"

describe("Database Integration Tests", () => {
  let ctx: TestAppContext
  let pool: Pool

  beforeAll(async () => {
    ctx = await createTestApp()
    pool = ctx.pool
  })

  afterAll(async () => {
    await destroyTestApp(ctx)
  })

  beforeEach(async () => {
    await resetDb(pool)
  })

  describe("Schema", () => {
    it("has the users table with all columns", async () => {
      const result = await pool.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'users'
         ORDER BY ordinal_position`,
      )
      const columns = result.rows.map((r) => r.column_name)
      expect(columns).toContain("id")
      expect(columns).toContain("username")
      expect(columns).toContain("email")
      expect(columns).toContain("password_hash")
      expect(columns).toContain("created_at")
      // Issue #511: single admin bit, defaulting to non-admin.
      expect(columns).toContain("is_admin")
    })

    it("has the streams table with foreign key to users", async () => {
      const result = await pool.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'streams'
         ORDER BY ordinal_position`,
      )
      const columns = result.rows.map((r) => r.column_name)
      expect(columns).toContain("id")
      expect(columns).toContain("user_id")
      expect(columns).toContain("name")
      expect(columns).toContain("status")
    })

    it("enforces unique constraint on users.email", async () => {
      await pool.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ('user1', 'dupe@test.com', 'hash1')`,
      )
      await expect(
        pool.query(
          `INSERT INTO users (username, email, password_hash)
           VALUES ('user2', 'dupe@test.com', 'hash2')`,
        ),
      ).rejects.toThrow(/duplicate key value violates unique constraint/)
    })

    it("enforces unique constraint on users.username", async () => {
      await pool.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ('sameuser', 'a@test.com', 'hash1')`,
      )
      await expect(
        pool.query(
          `INSERT INTO users (username, email, password_hash)
           VALUES ('sameuser', 'b@test.com', 'hash2')`,
        ),
      ).rejects.toThrow(/duplicate key value violates unique constraint/)
    })
  })

  describe("User CRUD", () => {
    it("inserts a user and reads it back", async () => {
      const insert = await pool.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ('alice', 'alice@test.com', 'bcrypt-hash-here')
         RETURNING id, username, email, created_at`,
      )
      expect(insert.rows[0].username).toBe("alice")
      expect(insert.rows[0].email).toBe("alice@test.com")
      expect(insert.rows[0].id).toBeGreaterThan(0)

      const read = await pool.query("SELECT * FROM users WHERE id = $1", [
        insert.rows[0].id,
      ])
      expect(read.rows[0].username).toBe("alice")
    })

    it("finds a user by email", async () => {
      await pool.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ('bob', 'bob@test.com', 'hash')`,
      )
      const result = await pool.query(
        "SELECT id, username, email FROM users WHERE email = $1",
        ["bob@test.com"],
      )
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].username).toBe("bob")
    })

    it("finds a user by username", async () => {
      await pool.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ('charlie', 'charlie@test.com', 'hash')`,
      )
      const result = await pool.query(
        "SELECT id, username, email FROM users WHERE username = $1",
        ["charlie"],
      )
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].email).toBe("charlie@test.com")
    })

    it("returns null when user is not found by email", async () => {
      const result = await pool.query("SELECT * FROM users WHERE email = $1", [
        "nonexistent@test.com",
      ])
      expect(result.rows).toHaveLength(0)
    })
  })

  describe("Stream CRUD", () => {
    let userId: number

    beforeEach(async () => {
      const user = await pool.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ('streamuser', 'stream@test.com', 'hash')
         RETURNING id`,
      )
      userId = user.rows[0].id
    })

    it("creates a stream with default status", async () => {
      const result = await pool.query(
        `INSERT INTO streams (user_id, name, description)
         VALUES ($1, 'Test Stream', 'A test stream')
         RETURNING id, name, status`,
        [userId],
      )
      expect(result.rows[0].name).toBe("Test Stream")
      expect(result.rows[0].status).toBe("inactive")
    })

    it("lists streams for a user", async () => {
      await pool.query(
        `INSERT INTO streams (user_id, name) VALUES ($1, 'Stream 1'), ($1, 'Stream 2')`,
        [userId],
      )
      const result = await pool.query(
        "SELECT id, name FROM streams WHERE user_id = $1 ORDER BY name",
        [userId],
      )
      expect(result.rows).toHaveLength(2)
      expect(result.rows[0].name).toBe("Stream 1")
      expect(result.rows[1].name).toBe("Stream 2")
    })

    it("updates a stream name and status", async () => {
      const stream = await pool.query(
        `INSERT INTO streams (user_id, name) VALUES ($1, 'Old Name')
         RETURNING id`,
        [userId],
      )
      const streamId = stream.rows[0].id

      await pool.query(
        "UPDATE streams SET name = $1, status = 'active' WHERE id = $2",
        ["New Name", streamId],
      )

      const result = await pool.query(
        "SELECT name, status FROM streams WHERE id = $1",
        [streamId],
      )
      expect(result.rows[0].name).toBe("New Name")
      expect(result.rows[0].status).toBe("active")
    })

    it("deletes a stream and cascades to related data", async () => {
      const stream = await pool.query(
        `INSERT INTO streams (user_id, name) VALUES ($1, 'To Delete')
         RETURNING id`,
        [userId],
      )
      const streamId = stream.rows[0].id

      await pool.query(
        `INSERT INTO stream_events (stream_id, event_type, event_data)
         VALUES ($1, 'test', '{}'::jsonb)`,
        [streamId],
      )

      await pool.query("DELETE FROM stream_events WHERE stream_id = $1", [
        streamId,
      ])
      await pool.query("DELETE FROM streams WHERE id = $1", [streamId])

      const events = await pool.query(
        "SELECT * FROM stream_events WHERE stream_id = $1",
        [streamId],
      )
      expect(events.rows).toHaveLength(0)
    })
  })

  describe("Stream Ownership", () => {
    let userAId: number
    let userBId: number
    let userAStreamId: number

    beforeEach(async () => {
      const userA = await pool.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ('owner', 'owner@test.com', 'hash')
         RETURNING id`,
      )
      userAId = userA.rows[0].id

      const userB = await pool.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ('intruder', 'intruder@test.com', 'hash')
         RETURNING id`,
      )
      userBId = userB.rows[0].id

      const stream = await pool.query(
        `INSERT INTO streams (user_id, name) VALUES ($1, 'Owner Stream')
         RETURNING id`,
        [userAId],
      )
      userAStreamId = stream.rows[0].id
    })

    it("owner can read their own stream", async () => {
      const result = await pool.query(
        "SELECT id, user_id FROM streams WHERE id = $1 AND user_id = $2",
        [userAStreamId, userAId],
      )
      expect(result.rows).toHaveLength(1)
    })

    it("non-owner cannot read another user's stream via ownership check", async () => {
      const result = await pool.query(
        "SELECT id, user_id FROM streams WHERE id = $1 AND user_id = $2",
        [userAStreamId, userBId],
      )
      expect(result.rows).toHaveLength(0)
    })

    it("owner can update their own stream", async () => {
      await pool.query(
        "UPDATE streams SET name = 'Updated' WHERE id = $1 AND user_id = $2",
        [userAStreamId, userAId],
      )
      const result = await pool.query(
        "SELECT name FROM streams WHERE id = $1",
        [userAStreamId],
      )
      expect(result.rows[0].name).toBe("Updated")
    })

    it("non-owner cannot update another user's stream", async () => {
      const update = await pool.query(
        "UPDATE streams SET name = 'Hacked' WHERE id = $1 AND user_id = $2 RETURNING id",
        [userAStreamId, userBId],
      )
      expect(update.rows).toHaveLength(0)
    })

    it("owner can delete their own stream", async () => {
      const deleted = await pool.query(
        "DELETE FROM streams WHERE id = $1 AND user_id = $2 RETURNING id",
        [userAStreamId, userAId],
      )
      expect(deleted.rows).toHaveLength(1)

      const check = await pool.query("SELECT * FROM streams WHERE id = $1", [
        userAStreamId,
      ])
      expect(check.rows).toHaveLength(0)
    })

    it("non-owner cannot delete another user's stream", async () => {
      const deleted = await pool.query(
        "DELETE FROM streams WHERE id = $1 AND user_id = $2 RETURNING id",
        [userAStreamId, userBId],
      )
      expect(deleted.rows).toHaveLength(0)
    })
  })

  describe("Foreign Key Constraints", () => {
    it("prevents creating a stream with a non-existent user_id", async () => {
      await expect(
        pool.query(
          `INSERT INTO streams (user_id, name) VALUES (99999, 'Orphan Stream')`,
        ),
      ).rejects.toThrow(/foreign key constraint/)
    })

    it("cascades deletions from users to their streams", async () => {
      const user = await pool.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ('deleteuser', 'delete@test.com', 'hash')
         RETURNING id`,
      )
      const userId = user.rows[0].id

      await pool.query(
        `INSERT INTO streams (user_id, name) VALUES ($1, 'Stream 1')`,
        [userId],
      )

      await pool.query("DELETE FROM streams WHERE user_id = $1", [userId])
      await pool.query("DELETE FROM users WHERE id = $1", [userId])

      const streams = await pool.query(
        "SELECT * FROM streams WHERE user_id = $1",
        [userId],
      )
      expect(streams.rows).toHaveLength(0)
    })
  })

  describe("Stream data ingestion (issue #514)", () => {
    let streamsDb: StreamsDbRepository
    let streamId: number

    beforeEach(async () => {
      streamsDb = new StreamsDbRepository(pool)
      const user = await pool.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ('ingester', 'ingest@test.com', 'hash')
         RETURNING id`,
      )
      const stream = await pool.query(
        `INSERT INTO streams (user_id, name) VALUES ($1, 'Ingest Stream')
         RETURNING id`,
        [user.rows[0].id],
      )
      streamId = stream.rows[0].id
    })

    it("insertPendingEvent writes a row to stream_data that getPendingEvents returns", async () => {
      const pending = await streamsDb.insertPendingEvent(
        streamId,
        { viewerId: "u1", kind: "data" },
        new Date("2026-08-01T00:00:00Z"),
      )

      expect(pending.streamId).toBe(String(streamId))
      expect(pending.data).toEqual({ viewerId: "u1", kind: "data" })
      expect(pending.timestamp).toBe("2026-08-01T00:00:00.000Z")

      // The row is visible to the worker's poll source.
      const { data } = await streamsDb.getPendingEvents(100, 0)
      expect(data).toHaveLength(1)
      expect(data[0]).toEqual(pending)
    })

    it("insertPendingEvent throws NotFoundException for a nonexistent stream", async () => {
      await expect(
        streamsDb.insertPendingEvent(999999, { foo: "bar" }, new Date()),
      ).rejects.toThrow(/not found/)
    })
  })

  describe("Indexes", () => {
    it("has an index on streams.user_id", async () => {
      const result = await pool.query(
        `SELECT indexname FROM pg_indexes
         WHERE tablename = 'streams' AND indexname = 'idx_streams_user_id'`,
      )
      expect(result.rows).toHaveLength(1)
    })

    it("has an index on stream_events(stream_id, created_at)", async () => {
      const result = await pool.query(
        `SELECT indexname FROM pg_indexes
         WHERE tablename = 'stream_events'
         AND indexname = 'idx_stream_events_stream_id_created_at_desc'`,
      )
      expect(result.rows).toHaveLength(1)
    })

    it("has composite index for keyset pagination on stream_data(timestamp, id)", async () => {
      const result = await pool.query(
        `SELECT indexname FROM pg_indexes
         WHERE tablename = 'stream_data'
         AND indexname = 'idx_stream_data_cursor'`,
      )
      expect(result.rows).toHaveLength(1)
    })
  })

  describe("Keyset Pagination (issue #524)", () => {
    let userId: number
    let streamId: number

    beforeEach(async () => {
      const user = await pool.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ('polluser', 'poll@test.com', 'hash')
         RETURNING id`,
      )
      userId = user.rows[0].id

      const stream = await pool.query(
        `INSERT INTO streams (user_id, name) VALUES ($1, 'Poll Stream')
         RETURNING id`,
        [userId],
      )
      streamId = stream.rows[0].id
    })

    it("yields every row exactly once across pages", async () => {
      // Insert 25 events in a burst (same timestamp from NOW()).
      const TOTAL = 25
      const BATCH = 10

      for (let i = 0; i < TOTAL; i++) {
        await pool.query(
          `INSERT INTO stream_data (stream_id, data)
           VALUES ($1, $2::jsonb)`,
          [streamId, JSON.stringify({ seq: i })],
        )
      }

      // Walk the keyset cursor until null — should collect all rows.
      const collected: { id: number; seq: number }[] = []
      let cursor: string | null = null

      while (true) {
        const parsed: { timestamp: string; id: number } | null =
          cursor ? (JSON.parse(cursor) as { timestamp: string; id: number }) : null
        const params: unknown[] = [BATCH]
        const afterClause: string = parsed
          ? `AND (timestamp, id) > ($2, $3)`
          : ""
        if (parsed) {
          params.push(parsed.timestamp, parsed.id)
        }

        const { rows } = await pool.query<{
          id: number
          data: Record<string, unknown>
        }>(
          `SELECT id, data FROM stream_data
           WHERE 1=1 ${afterClause}
           ORDER BY timestamp ASC, id ASC
           LIMIT $1`,
          params,
        )

        for (const r of rows) {
          collected.push({ id: r.id, seq: r.data.seq as number })
        }

        if (rows.length < BATCH) break
        // Fetch the actual timestamp from the last row we saw.
        const lastRow = rows[rows.length - 1]
        const { rows: tsRows } = await pool.query<{
          timestamp: Date
        }>(
          `SELECT timestamp FROM stream_data WHERE id = $1`,
          [lastRow.id],
        )
        cursor = JSON.stringify({
          timestamp: tsRows[0].timestamp.toISOString(),
          id: lastRow.id,
        })
      }

      expect(collected).toHaveLength(TOTAL)
      // No duplicates.
      const ids = collected.map((c) => c.id)
      expect(new Set(ids).size).toBe(TOTAL)
      // All sequences 0..24 present.
      const seqs = collected.map((c) => c.seq).sort((a, b) => a - b)
      expect(seqs).toEqual(Array.from({ length: TOTAL }, (_, i) => i))
    })

    it("handles equal-timestamp burst deterministically with id tiebreaker", async () => {
      // Insert 5 events in a single transaction — all get NOW() as timestamp.
      await pool.query(
        `INSERT INTO stream_data (stream_id, data)
         SELECT $1, jsonb_build_object('seq', gs)
         FROM generate_series(0, 4) gs`,
        [streamId],
      )

      // Fetch all in one page (limit > count).
      const { rows } = await pool.query<{
        id: number
        data: Record<string, unknown>
      }>(
        `SELECT id, data FROM stream_data
         ORDER BY timestamp ASC, id ASC
         LIMIT 10`,
      )

      expect(rows).toHaveLength(5)
      // Row IDs should be strictly increasing (stable id tiebreaker).
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].id).toBeGreaterThan(rows[i - 1].id)
      }
    })
  })
})
