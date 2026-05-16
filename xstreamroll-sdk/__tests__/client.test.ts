import { StreamingClient } from "../src/client"

describe("StreamingClient env presets", () => {
  it("defaults to development URL when no config given", () => {
    const client = new StreamingClient({})
    expect((client as any).apiUrl).toBe("http://localhost:3001")
  })

  it("resolves production preset", () => {
    const client = new StreamingClient({ env: "production" })
    expect((client as any).apiUrl).toBe("https://api.xstreamroll.io")
  })

  it("resolves staging preset", () => {
    const client = new StreamingClient({ env: "staging" })
    expect((client as any).apiUrl).toBe("https://staging-api.xstreamroll.io")
  })

  it("resolves development preset explicitly", () => {
    const client = new StreamingClient({ env: "development" })
    expect((client as any).apiUrl).toBe("http://localhost:3001")
  })

  it("custom baseUrl overrides env preset", () => {
    const client = new StreamingClient({ env: "production", baseUrl: "https://custom.example.com" })
    expect((client as any).apiUrl).toBe("https://custom.example.com")
  })

  it("legacy apiUrl still works", () => {
    const client = new StreamingClient({ apiUrl: "http://legacy:9000" })
    expect((client as any).apiUrl).toBe("http://legacy:9000")
  })
})
