import {
  JWT_SECRET_MIN_LENGTH,
  validateJwtSecret,
} from "./jwt-secret-validator"

describe("validateJwtSecret (Issue #318)", () => {
  let exitSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    exitSpy = jest.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called")
    }) as never)
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {})
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    exitSpy.mockRestore()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it("returns ok when no secret is configured", () => {
    // Pass an empty string, not `undefined`: the function's default
    // parameter (`secret = process.env.JWT_SECRET`) means an explicit
    // `undefined` argument falls back to the environment, which is set
    // in CI — so `undefined` would not exercise the "no secret" branch.
    // An empty string is falsy and hits the same early return.
    const result = validateJwtSecret("", "production")
    expect(result.ok).toBe(true)
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it("returns ok when the secret meets the minimum length", () => {
    const good = "x".repeat(JWT_SECRET_MIN_LENGTH)
    expect(validateJwtSecret(good, "production").ok).toBe(true)
    expect(validateJwtSecret(good, "development").ok).toBe(true)
    expect(validateJwtSecret(good, "test").ok).toBe(true)
    expect(exitSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("exits the process in production when the secret is too short", () => {
    const short = "x".repeat(JWT_SECRET_MIN_LENGTH - 1)
    expect(() => validateJwtSecret(short, "production")).toThrow(
      /process\.exit called/,
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Environment validation failed"),
    )
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `Minimum required length is ${JWT_SECRET_MIN_LENGTH} characters`,
      ),
    )
  })

  it("warns but does NOT exit in development when the secret is too short", () => {
    const short = "x".repeat(8)
    const result = validateJwtSecret(short, "development")
    expect(result.ok).toBe(false)
    expect(exitSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[JWT Warning]"),
    )
  })

  it("stays silent in test env when the secret is too short (fixtures only)", () => {
    const short = "test-secret" // 11 chars; deliberately used by the api test fixtures
    const result = validateJwtSecret(short, "test")
    expect(result.ok).toBe(false)
    expect(exitSpy).not.toHaveBeenCalled()
    // Nothing for a developer to act on; emitting the warning on every
    // `npm test` run would just spam CI logs.
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it("exposes the minimum-length constant", () => {
    expect(JWT_SECRET_MIN_LENGTH).toBe(32)
  })
})
