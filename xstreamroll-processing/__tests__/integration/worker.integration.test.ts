import nock from "nock"
import type { ProcessedStreamEvent } from "../../src/session"

jest.setTimeout(20000)

function awaitWithTimeout<T>(p: Promise<T>, ms: number, msg = "timeout") {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms)),
  ])
}

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

test("single event: polled -> session -> published", async () => {
  // Arrange env and nock before importing the worker (worker starts on import)
  process.env.NODE_ENV = "test"
  process.env.API_URL = "http://mock-api"
  process.env.POLL_INTERVAL_MS = "50"

  const now = new Date().toISOString()
  const event = { streamId: "s1", data: { type: "t1", v: 1 }, timestamp: now }

  let sent = false
  nock("http://mock-api")
    .get("/streams/pending")
    .times(100)
    .reply(() => {
      if (!sent) {
        sent = true
        return [200, [event]]
      }
      return [200, []]
    })

  let publishedBody: ProcessedStreamEvent | null = null
  const publishedPromise = new Promise<void>((resolve) => {
    nock("http://mock-api")
      .post("/streams/processed")
      .reply(200, function (_uri, body: unknown) {
        publishedBody = body as ProcessedStreamEvent
        resolve()
        return "ok"
      })
  })

  // Act: import worker (starts polling)
  workerMod = await import("../../src/worker")
  // wait for publish
  await awaitWithTimeout(publishedPromise, 5000, "publish timeout")

  expect(publishedBody).not.toBeNull()
  const actual = publishedBody as unknown as ProcessedStreamEvent
  expect(actual.streamId).toBe("s1")
})

test("multiple events same stream -> routed to same session", async () => {
  process.env.API_URL = "http://mock-api"
  process.env.POLL_INTERVAL_MS = "50"

  const now = new Date().toISOString()
  const e1 = { streamId: "same", data: { type: "t1", i: 1 }, timestamp: now }
  const e2 = { streamId: "same", data: { type: "t1", i: 2 }, timestamp: now }

  let sentOnce = false
  nock("http://mock-api")
    .get("/streams/pending")
    .times(100)
    .reply(() => {
      if (!sentOnce) {
        sentOnce = true
        return [200, [e1, e2]]
      }
      return [200, []]
    })

  const received: ProcessedStreamEvent[] = []
  const publishedPromise = new Promise<void>((resolve) => {
    nock("http://mock-api")
      .post("/streams/processed")
      .times(2)
      .reply(200, function (_u, body: unknown) {
        received.push(body as ProcessedStreamEvent)
        if (received.length === 2) resolve()
        return "ok"
      })
  })

  workerMod = await import("../../src/worker")
  await awaitWithTimeout(publishedPromise, 5000, "publish timeout")

  expect(received.length).toBe(2)
  expect(received[0].sessionId).toBe(received[1].sessionId)
  expect(received[0].streamId).toBe("same")
})

test("capacity exceeded -> event dropped, not published", async () => {
  process.env.API_URL = "http://mock-api"
  process.env.POLL_INTERVAL_MS = "50"
  process.env.MAX_CONCURRENT_SESSIONS = "1"

  const now = new Date().toISOString()
  const a = { streamId: "a", data: { type: "t" }, timestamp: now }
  const b = { streamId: "b", data: { type: "t" }, timestamp: now }

  let once = false
  nock("http://mock-api")
    .get("/streams/pending")
    .times(100)
    .reply(() => {
      if (!once) {
        once = true
        return [200, [a, b]]
      }
      return [200, []]
    })

  const published: ProcessedStreamEvent[] = []
  const publishedPromise = new Promise<void>((resolve) => {
    nock("http://mock-api")
      .post("/streams/processed")
      .reply(200, function (_u, body: unknown) {
        published.push(body as ProcessedStreamEvent)
        // resolve after at most one publish (capacity should drop the other)
        if (published.length >= 1) resolve()
        return "ok"
      })
  })

  workerMod = await import("../../src/worker")
  await awaitWithTimeout(publishedPromise, 5000, "publish timeout")

  expect(published.length).toBe(1)
})

test("graceful shutdown flushes pending publishes", async () => {
  process.env.API_URL = "http://mock-api"
  process.env.POLL_INTERVAL_MS = "50"

  const now = new Date().toISOString()
  const event = { streamId: "slow", data: { type: "t" }, timestamp: now }

  let sent = false
  nock("http://mock-api")
    .get("/streams/pending")
    .times(100)
    .reply(() => {
      if (!sent) {
        sent = true
        return [200, [event]]
      }
      return [200, []]
    })

  let published = false
  nock("http://mock-api")
    .post("/streams/processed")
    .reply(200, async function () {
      // simulate slow publish
      await new Promise((r) => setTimeout(r, 200))
      published = true
      return "ok"
    })

  const workerMod = await import("../../src/worker")

  // give worker a moment to pick up the event
  await new Promise((r) => setTimeout(r, 100))
  // request shutdown and wait for it to complete (should wait for publish)
  await workerMod.shutdown("test")
  expect(published).toBe(true)
})

test("api error then recovery -> worker retries next poll", async () => {
  process.env.API_URL = "http://mock-api"
  process.env.POLL_INTERVAL_MS = "50"

  const now = new Date().toISOString()
  const event = { streamId: "r1", data: { type: "t" }, timestamp: now }

  let calls = 0
  nock("http://mock-api")
    .get("/streams/pending")
    .times(100)
    .reply(() => {
      calls++
      if (calls === 1) return [500, "fail"]
      if (calls === 2) return [200, []]
      return [200, [event]]
    })

  const publishedPromise = new Promise<void>((resolve) => {
    nock("http://mock-api")
      .post("/streams/processed")
      .reply(200, function () {
        resolve()
        return "ok"
      })
  })

  const workerMod = await import("../../src/worker")
  await awaitWithTimeout(publishedPromise, 5000, "publish timeout")
  await workerMod.shutdown("test")
})
