import { registerSchema } from "./page"

describe("Register form validation", () => {
  it("accepts valid registration values", () => {
    const data = {
      username: "streamer_42",
      email: "user@example.com",
      password: "Password1",
    }

    expect(registerSchema.parse(data)).toEqual(data)
  })

  it("rejects invalid usernames", () => {
    expect(() =>
      registerSchema.parse({
        username: "ab",
        email: "user@example.com",
        password: "Password1",
      }),
    ).toThrow(/Username must be between 3 and 30 characters/)

    expect(() =>
      registerSchema.parse({
        username: "invalid user",
        email: "user@example.com",
        password: "Password1",
      }),
    ).toThrow(/Username may only contain letters, digits, and underscores/)
  })

  it("rejects invalid emails", () => {
    expect(() =>
      registerSchema.parse({
        username: "streamer_42",
        email: "not-an-email",
        password: "Password1",
      }),
    ).toThrow(/Enter a valid email address/)
  })

  it("rejects weak passwords", () => {
    expect(() =>
      registerSchema.parse({
        username: "streamer_42",
        email: "user@example.com",
        password: "short",
      }),
    ).toThrow(/Password must be at least 8 characters/)

    expect(() =>
      registerSchema.parse({
        username: "streamer_42",
        email: "user@example.com",
        password: "password",
      }),
    ).toThrow(/Password must contain at least one digit/)

    expect(() =>
      registerSchema.parse({
        username: "streamer_42",
        email: "user@example.com",
        password: "12345678",
      }),
    ).toThrow(/Password must contain at least one letter/)
  })
})
