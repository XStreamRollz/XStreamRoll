import nock from "nock"
import type { StreamEvent, ProcessedStreamEvent } from "../../src/session"

jest.setTimeout(20000)

let workerMod: { shutdown(signal: string): Promise<void> } | null = null
let exitSpy: jest.SpyInstance | null = null

beforeEach(() => {
  exitSpy = jest
    .spyOn(process, "exit")
    .mockImplementation((() => undefined) as never)
})

afterEach(async () => {
  if (workerMod) {
    await workerMod.shutdown("test")
    workerMod = null
  }
  exitSpy?.mockRestore()
  exitSpy = null
  nock.cleanAll()
  jest.clearAllTimers()
  jest.resetModules()
  await new Promise((r) => setTimeout(r, 100))
})

test("filtered events are not published (integration)", async () => {
  // We'll mock the pipeline's EventFilter so the worker drops events
  // with type === 'blocked'. Do the mock before importing the worker.
  jest.doMock("../../src/pipeline", () => {
    return {
      EventFilter: class {
        allow(event: StreamEvent) {
          return event.data?.type !== "blocked"
        }
      },
    }
  })

  process.env.NODE_ENV = "test"
  process.env.API_URL = "http://mock-api"
  process.env.POLL_INTERVAL_MS = "50"

  const now = new Date().toISOString()
  const good = { streamId: "s", data: { type: "ok" }, timestamp: now }
  const bad = { streamId: "s2", data: { type: "blocked" }, timestamp: now }

  let sent = false
  nock("http://mock-api")
    .get("/streams/pending")
    .times(100)
    .reply(() => {
      if (!sent) {
        sent = true
        return [200, [good, bad]]
      }
      return [200, []]
    })

  const published: ProcessedStreamEvent[] = []
  const publishedPromise = new Promise<void>((resolve) => {
    nock("http://mock-api")
      .post("/streams/processed")
      .reply(200, function (_u, body: unknown) {
        published.push(body as ProcessedStreamEvent)
        resolve()
        return "ok"
      })
  })

  workerMod = await import("../../src/worker")
  await publishedPromise

  // Only the unblocked event should have been published
  expect(published.length).toBeGreaterThanOrEqual(1)
  expect(published.some((p) => p.streamId === good.streamId)).toBe(true)
  expect(published.some((p) => p.streamId === bad.streamId)).toBe(false)
})
