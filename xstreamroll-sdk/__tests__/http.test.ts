import { HttpClient } from "../src/http"

// Minimal fetch mock
function makeFetchMock(status = 200, body = "{}") {
  return jest.fn().mockResolvedValue(
    new Response(body, { status, headers: { "Content-Type": "application/json" } })
  )
}

describe("HttpClient interceptors", () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("calls request interceptors in registration order", async () => {
    const order: number[] = []
    global.fetch = makeFetchMock()
    const http = new HttpClient("http://localhost:3001")

    http.addRequestInterceptor((cfg) => { order.push(1); return cfg })
    http.addRequestInterceptor((cfg) => { order.push(2); return cfg })

    await http.request("/test")
    expect(order).toEqual([1, 2])
  })

  it("calls response interceptors in registration order", async () => {
    const order: number[] = []
    global.fetch = makeFetchMock()
    const http = new HttpClient("http://localhost:3001")

    http.addResponseInterceptor((res) => { order.push(1); return res })
    http.addResponseInterceptor((res) => { order.push(2); return res })

    await http.request("/test")
    expect(order).toEqual([1, 2])
  })

  it("request interceptor can mutate headers", async () => {
    const mockFetch = makeFetchMock()
    global.fetch = mockFetch
    const http = new HttpClient("http://localhost:3001")

    http.addRequestInterceptor((cfg) => ({
      ...cfg,
      headers: { ...(cfg.headers as Record<string, string>), Authorization: "Bearer token" },
    }))

    await http.request("/test")
    const calledInit = mockFetch.mock.calls[0][1] as RequestInit
    expect((calledInit.headers as Record<string, string>).Authorization).toBe("Bearer token")
  })

  it("removeInterceptor stops the interceptor from being called", async () => {
    global.fetch = makeFetchMock()
    const http = new HttpClient("http://localhost:3001")
    let called = false

    const handle = http.addRequestInterceptor((cfg) => { called = true; return cfg })
    http.removeInterceptor(handle)

    await http.request("/test")
    expect(called).toBe(false)
  })

  it("builds correct URL from base + path", async () => {
    const mockFetch = makeFetchMock()
    global.fetch = mockFetch
    const http = new HttpClient("http://localhost:3001")

    await http.request("/streams/123")
    expect(mockFetch.mock.calls[0][0]).toBe("http://localhost:3001/streams/123")
  })
})
