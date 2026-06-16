import nock from "nock"
import type { StreamEvent, ProcessedStreamEvent } from "../../src/session"

jest.setTimeout(20000)

afterEach(() => {
  nock.cleanAll()
  jest.resetModules()
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
      .reply(200, function (_u, body) {
        published.push(body)
        resolve()
        return "ok"
      })
  })

  const workerMod = await import("../../src/worker")
  await publishedPromise
  await workerMod.shutdown("test")

  // Only the unblocked event should have been published
  expect(published.length).toBeGreaterThanOrEqual(1)
  expect(published.some((p) => p.streamId === good.streamId)).toBe(true)
  expect(published.some((p) => p.streamId === bad.streamId)).toBe(false)
})
