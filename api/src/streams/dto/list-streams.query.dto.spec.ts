import { validate } from "class-validator"

import { ListStreamsQueryDto } from "./list-streams.query.dto"

async function validateDto(overrides: Partial<ListStreamsQueryDto>) {
  const dto = new ListStreamsQueryDto()
  Object.assign(dto, overrides)
  return validate(dto)
}

describe("ListStreamsQueryDto — search & tag params (issue #532)", () => {
  it("accepts a valid q", async () => {
    const errors = await validateDto({ q: "football" })
    expect(errors).toHaveLength(0)
  })

  it("rejects q longer than 200 characters", async () => {
    const errors = await validateDto({ q: "x".repeat(201) })
    expect(errors).toHaveLength(1)
    expect(errors[0]?.property).toBe("q")
    expect(errors[0]?.constraints?.maxLength).toMatch(/at most 200/)
  })

  it("accepts a 200-character q", async () => {
    const errors = await validateDto({ q: "x".repeat(200) })
    expect(errors).toHaveLength(0)
  })

  it("accepts a valid slug tag", async () => {
    const errors = await validateDto({ tag: "live-streaming" })
    expect(errors).toHaveLength(0)
  })

  it("accepts a numeric tag id", async () => {
    const errors = await validateDto({ tag: "42" })
    expect(errors).toHaveLength(0)
  })

  it("rejects a tag that is neither a slug nor an id", async () => {
    const errors = await validateDto({ tag: "Live Streaming" })
    expect(errors).toHaveLength(1)
    expect(errors[0]?.property).toBe("tag")
    expect(errors[0]?.constraints?.matches).toMatch(/slug/)
  })

  it("rejects a tag with uppercase characters", async () => {
    const errors = await validateDto({ tag: "Live" })
    expect(errors).toHaveLength(1)
    expect(errors[0]?.property).toBe("tag")
  })

  it("rejects a tag with a leading dash", async () => {
    const errors = await validateDto({ tag: "-live" })
    expect(errors).toHaveLength(1)
  })

  it("rejects a non-string q", async () => {
    const errors = await validateDto({ q: 123 as unknown as string })
    expect(errors).toHaveLength(1)
    expect(errors[0]?.property).toBe("q")
  })

  it("treats absent q and tag as valid (no filter)", async () => {
    const errors = await validateDto({})
    expect(errors).toHaveLength(0)
  })
})
