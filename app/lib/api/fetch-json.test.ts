import { ApiRequestError, fetchJson } from "./fetch-json"
import {
  clearAccessToken,
  setAccessToken,
} from "./token-store"

const originalFetch = global.fetch

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

beforeEach(() => {
  clearAccessToken()
  global.fetch = jest.fn()
  jest.spyOn(window.location, "assign").mockImplementation(() => {})
})

afterEach(() => {
  global.fetch = originalFetch
  jest.restoreAllMocks()
})

describe("fetchJson (issue #518)", () => {
  it("injects Authorization: Bearer when a token is stored", async () => {
    setAccessToken("token-123")
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { ok: true }))
    global.fetch = fetchMock as unknown as typeof fetch

    await fetchJson<{ ok: boolean }>("http://localhost:3001/streams")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get("Authorization")).toBe("Bearer token-123")
  })

  it("omits the Authorization header when no token is stored", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { ok: true }))
    global.fetch = fetchMock as unknown as typeof fetch

    await fetchJson<{ ok: boolean }>("http://localhost:3001/streams")

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get("Authorization")).toBeNull()
  })

  it("refreshes once and retries the failed request on 401", async () => {
    setAccessToken("stale-token")
    const fetchMock = jest
      .fn()
      // original request -> 401
      .mockResolvedValueOnce(jsonResponse(401, { message: "unauthorized" }))
      // refresh endpoint -> fresh token
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: "fresh-token" }),
      )
      // retried request -> success
      .mockResolvedValueOnce(jsonResponse(200, { data: [1] }))
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await fetchJson<{ data: number[] }>(
      "http://localhost:3001/streams",
    )

    expect(result).toEqual({ data: [1] })
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // The refresh call goes to the app's own /api/auth/refresh route.
    const refreshCall = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(String(refreshCall[0])).toBe("/api/auth/refresh")

    // The retried request carries the fresh token.
    const retryCall = fetchMock.mock.calls[2] as [string, RequestInit]
    const headers = new Headers(retryCall[1]?.headers)
    expect(headers.get("Authorization")).toBe("Bearer fresh-token")
  })

  it("does not retry when skipAuthRefresh is set", async () => {
    setAccessToken("token-123")
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(401, { message: "unauthorized" }))
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(
      fetchJson("http://localhost:3001/streams", { skipAuthRefresh: true }),
    ).rejects.toThrow(ApiRequestError)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("redirects to /auth/login and clears the token when refresh fails", async () => {
    setAccessToken("stale-token")
    const fetchMock = jest
      .fn()
      // original request -> 401
      .mockResolvedValueOnce(jsonResponse(401, { message: "unauthorized" }))
      // refresh endpoint -> 401 (session truly expired)
      .mockResolvedValueOnce(jsonResponse(401, {}))
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(
      fetchJson("http://localhost:3001/streams"),
    ).rejects.toThrow(ApiRequestError)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(window.location.assign).toHaveBeenCalledWith("/auth/login")
    expect(clearAccessToken).toBeDefined()
  })

  it("maps non-2xx responses to the provided error class with a status", async () => {
    class CustomError extends ApiRequestError {}

    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(500, { message: "boom" })) as unknown as typeof fetch

    await expect(
      fetchJson("http://localhost:3001/streams", {}, CustomError),
    ).rejects.toMatchObject({ status: 500, message: "boom" })
    await expect(
      fetchJson("http://localhost:3001/streams", {}, CustomError),
    ).rejects.toBeInstanceOf(CustomError)
  })

  it("returns undefined for 204 responses", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => {
          throw new Error("no body")
        },
      } as unknown as Response)

    const result = await fetchJson<void>("http://localhost:3001/streams/1/tags/2", {
      method: "DELETE",
    })
    expect(result).toBeUndefined()
  })
})
