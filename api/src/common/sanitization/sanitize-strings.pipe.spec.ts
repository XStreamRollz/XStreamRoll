import { SanitizeStringsPipe } from "./sanitize-strings.pipe"

describe("SanitizeStringsPipe", () => {
  let pipe: SanitizeStringsPipe

  beforeEach(() => {
    pipe = new SanitizeStringsPipe()
  })

  describe("scalar values", () => {
    it("strips HTML tags from simple strings", () => {
      const input = "<b>Hello</b> <i>world</i>"
      const result = pipe.transform(input)
      expect(result).toBe("Hello world")
    })

    it("removes script tags and their content", () => {
      const input = "Hello <script>alert('xss')</script> world"
      const result = pipe.transform(input)
      expect(result).toBe("Hello world")
    })

    it("removes inline event handlers", () => {
      const input = '<a href="javascript:alert(1)">click</a>'
      const result = pipe.transform(input)
      expect(result).toBe("click")
    })

    it("preserves plain text without tags", () => {
      const input = "café — naïve résumé"
      const result = pipe.transform(input)
      expect(result).toBe("café — naïve résumé")
    })

    it("collapses whitespace where tags were removed", () => {
      const input = "Hello <br> <br> world"
      const result = pipe.transform(input)
      expect(result).toBe("Hello world")
    })

    it("decodes common HTML entities", () => {
      const input = "&lt;div&gt; &amp; &quot;test&quot;"
      const result = pipe.transform(input)
      expect(result).toBe('<div> & "test"')
    })

    it("passes through numbers unchanged", () => {
      const input = 42
      const result = pipe.transform(input)
      expect(result).toBe(42)
    })

    it("passes through booleans unchanged", () => {
      const input = true
      const result = pipe.transform(input)
      expect(result).toBe(true)
    })

    it("passes through null unchanged", () => {
      const input = null
      const result = pipe.transform(input)
      expect(result).toBeNull()
    })

    it("passes through undefined unchanged", () => {
      const input = undefined
      const result = pipe.transform(input)
      expect(result).toBeUndefined()
    })
  })

  describe("arrays", () => {
    it("sanitizes each string in an array", () => {
      const input = ["<b>Hello</b>", "<i>world</i>", "plain text"]
      const result = pipe.transform(input)
      expect(result).toEqual(["Hello", "world", "plain text"])
    })

    it("preserves non-string array elements", () => {
      const input = ["<b>test</b>", 42, true, null]
      const result = pipe.transform(input)
      expect(result).toEqual(["test", 42, true, null])
    })

    it("handles nested arrays", () => {
      const input = [["<b>nested</b>", "<i>array</i>"], ["<u>test</u>"]]
      const result = pipe.transform(input)
      expect(result).toEqual([["nested", "array"], ["test"]])
    })

    it("handles empty arrays", () => {
      const input: unknown[] = []
      const result = pipe.transform(input)
      expect(result).toEqual([])
    })

    it("removes script tags from arrays", () => {
      const input = [
        "safe",
        "<script>alert('xss')</script>",
        "also <script>bad()</script> safe",
      ]
      const result = pipe.transform(input)
      expect(result).toEqual(["safe", "", "also safe"])
    })
  })

  describe("nested objects", () => {
    it("sanitizes string fields in flat objects", () => {
      const input = {
        name: "<b>Test</b>",
        description: "<script>alert(1)</script>",
        count: 42,
      }
      const result = pipe.transform(input)
      expect(result).toEqual({
        name: "Test",
        description: "",
        count: 42,
      })
    })

    it("recursively sanitizes deeply nested objects", () => {
      const input = {
        outer: {
          inner: {
            text: "<b>nested</b>",
            value: 123,
          },
        },
      }
      const result = pipe.transform(input)
      expect(result).toEqual({
        outer: {
          inner: {
            text: "nested",
            value: 123,
          },
        },
      })
    })

    it("sanitizes arrays inside objects", () => {
      const input = {
        items: ["<b>one</b>", "<i>two</i>"],
        meta: { count: 2 },
      }
      const result = pipe.transform(input)
      expect(result).toEqual({
        items: ["one", "two"],
        meta: { count: 2 },
      })
    })

    it("sanitizes objects inside arrays", () => {
      const input = [
        { name: "<b>Alice</b>", age: 30 },
        { name: "<i>Bob</i>", age: 25 },
      ]
      const result = pipe.transform(input)
      expect(result).toEqual([
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ])
    })

    it("handles empty objects", () => {
      const input = {}
      const result = pipe.transform(input)
      expect(result).toEqual({})
    })
  })

  describe("special object types", () => {
    it("preserves Date instances", () => {
      const input = new Date("2026-01-01T00:00:00Z")
      const result = pipe.transform(input)
      expect(result).toBeInstanceOf(Date)
      expect(result).toEqual(input)
    })

    it("preserves RegExp instances", () => {
      const input = /test/gi
      const result = pipe.transform(input)
      expect(result).toBeInstanceOf(RegExp)
      expect(result).toEqual(input)
    })

    it("preserves Map instances", () => {
      const input = new Map([["key", "value"]])
      const result = pipe.transform(input)
      expect(result).toBeInstanceOf(Map)
      expect(result).toEqual(input)
    })

    it("preserves Set instances", () => {
      const input = new Set([1, 2, 3])
      const result = pipe.transform(input)
      expect(result).toBeInstanceOf(Set)
      expect(result).toEqual(input)
    })

    it("preserves Buffer instances", () => {
      const input = Buffer.from("test")
      const result = pipe.transform(input)
      expect(Buffer.isBuffer(result)).toBe(true)
      expect(result).toEqual(input)
    })
  })

  describe("XSS attack vectors", () => {
    it("blocks javascript: protocol in links", () => {
      const input = '<a href="javascript:alert(1)">click</a>'
      const result = pipe.transform(input)
      expect(result).toBe("click")
      expect(result).not.toContain("javascript:")
    })

    it("blocks data: URLs with script content", () => {
      const input = '<img src="data:text/html,<script>alert(1)</script>">'
      const result = pipe.transform(input)
      expect(result).toBe("")
    })

    it("removes onclick and other event handlers", () => {
      const input = '<button onclick="alert(1)">Click</button>'
      const result = pipe.transform(input)
      expect(result).toBe("Click")
      expect(result).not.toContain("onclick")
    })

    it("removes style tags and their content", () => {
      const input = "Hello <style>body { display: none; }</style> world"
      const result = pipe.transform(input)
      expect(result).toBe("Hello world")
    })

    it("removes iframe tags", () => {
      const input = '<iframe src="evil.com"></iframe>'
      const result = pipe.transform(input)
      expect(result).toBe("")
    })

    it("removes object and embed tags", () => {
      const input = '<object data="evil.swf"></object>'
      const result = pipe.transform(input)
      expect(result).toBe("")
    })

    it("handles multiple nested malicious tags", () => {
      const input =
        '<div><script>alert(1)</script><iframe src="x"></iframe></div>'
      const result = pipe.transform(input)
      expect(result).toBe("")
    })
  })

  describe("real-world DTO scenarios", () => {
    it("sanitizes CreateStreamDto-like payload", () => {
      const input = {
        name: "<script>alert('xss')</script>Stream Name",
        description: "<b>Bold</b> description with <i>italics</i>",
      }
      const result = pipe.transform(input)
      expect(result).toEqual({
        name: "Stream Name",
        description: "Bold description with italics",
      })
    })

    it("sanitizes UpdateStreamDto-like payload with enum", () => {
      const input = {
        name: "<b>Updated</b> name",
        description: "Safe description",
        status: "active", // enum value passes through untouched
      }
      const result = pipe.transform(input)
      expect(result).toEqual({
        name: "Updated name",
        description: "Safe description",
        status: "active",
      })
    })

    it("sanitizes nested webhook payload", () => {
      const input = {
        streamId: 1,
        url: "https://example.com/webhook",
        events: ["stream:started", "stream:stopped"],
      }
      const result = pipe.transform(input)
      expect(result).toEqual({
        streamId: 1,
        url: "https://example.com/webhook",
        events: ["stream:started", "stream:stopped"],
      })
    })

    it("sanitizes complex nested structure", () => {
      const input = {
        user: {
          name: "<script>xss</script>Alice",
          profile: {
            bio: "<b>Developer</b> and <i>designer</i>",
            tags: ["<b>tag1</b>", "tag2"],
          },
        },
        settings: {
          notifications: true,
          theme: "dark",
        },
      }
      const result = pipe.transform(input)
      expect(result).toEqual({
        user: {
          name: "Alice",
          profile: {
            bio: "Developer and designer",
            tags: ["tag1", "tag2"],
          },
        },
        settings: {
          notifications: true,
          theme: "dark",
        },
      })
    })
  })

  describe("edge cases", () => {
    it("handles very long strings without crashing", () => {
      const input = "<b>" + "x".repeat(10000) + "</b>"
      const result = pipe.transform(input)
      expect(typeof result).toBe("string")
      expect(result).toBe("x".repeat(10000))
    })

    it("handles deeply nested objects without stack overflow", () => {
      let input: Record<string, unknown> = { value: "<b>deep</b>" }
      for (let i = 0; i < 50; i++) {
        input = { nested: input }
      }
      expect(() => pipe.transform(input)).not.toThrow()
    })

    it("handles objects with symbol keys", () => {
      const sym = Symbol("test")
      const input = {
        [sym]: "value",
        name: "<b>test</b>",
      }
      const result = pipe.transform(input) as Record<string, unknown>
      // Symbol keys are ignored by Object.keys()
      expect(result.name).toBe("test")
    })

    it("handles objects with numeric keys", () => {
      const input = {
        "0": "<b>zero</b>",
        "1": "<i>one</i>",
        normal: "key",
      }
      const result = pipe.transform(input)
      expect(result).toEqual({
        "0": "zero",
        "1": "one",
        normal: "key",
      })
    })
  })
})
