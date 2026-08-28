import { mkdtemp, readFile, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"

import { FileDeadLetterStore } from "../src/dead-letter-store"
import { StreamEvent } from "../src/session"

describe("FileDeadLetterStore", () => {
  let directory: string
  let store: FileDeadLetterStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "xstreamroll-dlq-"))
    store = new FileDeadLetterStore(join(directory, "dead-letters.json"))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it("persists a dead-letter and deduplicates the same event", async () => {
    const event: StreamEvent = {
      id: "event-1",
      streamId: "stream-1",
      data: { value: 1 },
      timestamp: "2026-08-28T00:00:00.000Z",
    }

    await store.record(event, new Error("first failure"), 3)
    await store.record(event, new Error("second failure"), 4)

    const records = await store.list()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      key: "stream-1:event-1",
      streamId: "stream-1",
      event,
      error: "second failure",
      attemptCount: 4,
    })
    expect(JSON.parse(await readFile(join(directory, "dead-letters.json"), "utf8")))
      .toHaveProperty("stream-1:event-1")
  })

  it("deduplicates events without an id using stable event content", async () => {
    const event: StreamEvent = {
      streamId: "stream-1",
      data: { z: 2, a: 1 },
      timestamp: "2026-08-28T00:00:00.000Z",
    }
    const sameEventWithDifferentKeyOrder: StreamEvent = {
      streamId: "stream-1",
      data: { a: 1, z: 2 },
      timestamp: "2026-08-28T00:00:00.000Z",
    }

    await store.record(event, new Error("failure"), 1)
    await store.record(sameEventWithDifferentKeyOrder, new Error("failure"), 1)

    expect(await store.list()).toHaveLength(1)
  })
})