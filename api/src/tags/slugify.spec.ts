import { slugify } from "./slugify"

describe("slugify", () => {
  it("lowercases and replaces spaces with dashes", () => {
    expect(slugify("Live Streaming")).toBe("live-streaming")
  })

  it("strips leading/trailing whitespace", () => {
    expect(slugify("  hello world  ")).toBe("hello-world")
  })

  it("strips diacritics via NFD normalisation", () => {
    expect(slugify("Café")).toBe("cafe")
    expect(slugify("Café / Brunch")).toBe("cafe-brunch")
  })

  it("collapses multiple non-alphanumeric runs into a single dash", () => {
    expect(slugify("a   ---   b")).toBe("a-b")
  })

  it("removes leading and trailing dashes", () => {
    expect(slugify("!!!hello!!!")).toBe("hello")
  })

  it("handles purely punctuation/symbol input → empty string", () => {
    expect(slugify("!!!")).toBe("")
    expect(slugify("---")).toBe("")
  })

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("")
  })

  it("returns empty string for non-string input", () => {
    expect(slugify(null)).toBe("")
    expect(slugify(undefined)).toBe("")
  })

  it("strips C++ style special chars, leaving alphanumeric", () => {
    expect(slugify("C++")).toBe("c")
  })

  it("caps slug length at 64 characters", () => {
    const long = "a".repeat(100)
    expect(slugify(long)).toHaveLength(64)
  })

  it("handles unicode letters that have no combining marks", () => {
    // Chinese characters have no combining marks; they become dashes
    expect(slugify("tag-你好")).toBe("tag")
  })

  it("preserves numbers", () => {
    expect(slugify("Stream 2024")).toBe("stream-2024")
  })
})
