import { HttpClient, HttpRequestError } from "../src/http"
import { defaultShouldRetry, withRetry } from "../src/retry"

describe("withRetry", () => {
  it("returns the resolved value on first success", async () => {
    const fn = jest.fn().mockResolvedValue("ok")
    await expect(withRetry(fn)).resolves.toBe("ok")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("retries on retryable errors and eventually succeeds", async () => {
    const err = new Error("boom") as { status: number } & Error
    err.status = 503
    const fn = jest
      .fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValue("ok")
    const sleeps: number[] = []
    await expect(
      withRetry(fn, {
        baseDelayMs: 1,
        maxDelayMs: 1,
        jitterMs: 0,
        sleep: async (ms) => {
          sleeps.push(ms)
        },
      }),
    ).resolves.toBe("ok")
    expect(fn).toHaveBeenCalledTimes(3)
    expect(sleeps).toHaveLength(2)
  })

  it("throws after maxAttempts", async () => {
    const err = new Error("boom") as { status: number } & Error
    err.status = 500
    const fn = jest.fn().mockRejectedValue(err)
    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 1,
        jitterMs: 0,
        sleep: async () => {},
      }),
    ).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("does not retry when shouldRetry returns false", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("permanent"))
    await expect(
      withRetry(fn, {
        maxAttempts: 5,
        shouldRetry: () => false,
        sleep: async () => {},
      }),
    ).rejects.toThrow("permanent")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("defaultShouldRetry recognises network + transient statuses", () => {
    expect(defaultShouldRetry(new TypeError("network"))).toBe(true)
    expect(defaultShouldRetry({ status: 429 })).toBe(true)
    expect(defaultShouldRetry({ status: 500 })).toBe(true)
    expect(defaultShouldRetry({ status: 404 })).toBe(false)
    expect(defaultShouldRetry(new Error("other"))).toBe(false)
  })
})

describe("HttpClient retry integration", () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("retries 503 responses and eventually returns the success body", async () => {
    let calls = 0
    global.fetch = jest.fn().mockImplementation(async () => {
      calls++
      if (calls < 3) {
        return new Response("{} ", { status: 503 })
      }
      return new Response('{"ok":true}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    })

    const http = new HttpClient("http://localhost:3001", {
      maxAttempts: 5,
      baseDelayMs: 1,
      jitterMs: 0,
      sleep: async () => {},
    })
    const res = await http.request("/test")
    expect(res.status).toBe(200)
    expect(calls).toBe(3)
  })

  it("throws HttpRequestError after retry budget is exhausted", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response("err", { status: 500 }))
    const http = new HttpClient("http://localhost:3001", {
      maxAttempts: 2,
      baseDelayMs: 1,
      jitterMs: 0,
      sleep: async () => {},
    })
    await expect(http.request("/test")).rejects.toBeInstanceOf(HttpRequestError)
  })

  it("respects enabled=false (no retries)", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response("err", { status: 503 }))
    global.fetch = fetchMock
    const http = new HttpClient("http://localhost:3001", { enabled: false })
    await expect(http.request("/test")).rejects.toBeInstanceOf(HttpRequestError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("wraps raw network failures in HttpRequestError", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("fetch failed"))
    const http = new HttpClient("http://localhost:3001", {
      maxAttempts: 1,
      baseDelayMs: 1,
      jitterMs: 0,
      sleep: async () => {},
    })
    await expect(http.request("/test")).rejects.toMatchObject({
      name: "HttpRequestError",
      message: "fetch failed",
    })
  })
})
