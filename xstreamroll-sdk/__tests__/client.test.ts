import { StreamingClient } from "../src/client"

// Helper to read the private apiUrl field for test assertions.
function getApiUrl(client: StreamingClient): string {
  return (client as unknown as { apiUrl: string }).apiUrl
}

describe("StreamingClient env presets", () => {
  it("defaults to development URL when no config given", () => {
    const client = new StreamingClient({})
    expect(getApiUrl(client)).toBe("http://localhost:3001")
  })

  it("resolves production preset", () => {
    const client = new StreamingClient({ env: "production" })
    expect(getApiUrl(client)).toBe("https://api.xstreamroll.io")
  })

  it("resolves staging preset", () => {
    const client = new StreamingClient({ env: "staging" })
    expect(getApiUrl(client)).toBe("https://staging-api.xstreamroll.io")
  })

  it("resolves development preset explicitly", () => {
    const client = new StreamingClient({ env: "development" })
    expect(getApiUrl(client)).toBe("http://localhost:3001")
  })

  it("custom baseUrl overrides env preset", () => {
    const client = new StreamingClient({ env: "production", baseUrl: "https://custom.example.com" })
    expect(getApiUrl(client)).toBe("https://custom.example.com")
  })

  it("legacy apiUrl still works", () => {
    const client = new StreamingClient({ apiUrl: "http://legacy:9000" })
    expect(getApiUrl(client)).toBe("http://legacy:9000")
  })

  it("uses HttpClient internally (not axios)", () => {
    const client = new StreamingClient({ baseUrl: "http://api.test" })
    const http = (client as unknown as { http: { constructor: { name: string } } }).http
    expect(http.constructor.name).toBe("HttpClient")
  })
})
