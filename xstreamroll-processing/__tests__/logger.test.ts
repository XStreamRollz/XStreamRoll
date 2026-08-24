import { Logger, newCorrelationId, withCorrelation } from "../src/logger"

function makeLogger(level: "debug" | "info" | "warn" | "error" = "debug") {
  const entries: Record<string, unknown>[] = []
  const logger = new Logger({
    workerId: "worker-test",
    level,
    sink: (e) => entries.push(e),
  })
  return { logger, entries }
}

describe("Logger", () => {
  it("emits structured JSON entries with workerId", () => {
    const { logger, entries } = makeLogger()
    logger.info("hello", { streamId: "s1" })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      level: "info",
      msg: "hello",
      workerId: "worker-test",
      streamId: "s1",
    })
    expect(typeof entries[0].ts).toBe("string")
  })

  it("respects the minimum level", () => {
    const { logger, entries } = makeLogger("warn")
    logger.debug("d")
    logger.info("i")
    logger.warn("w")
    logger.error("e")
    expect(entries.map((e) => e.level)).toEqual(["warn", "error"])
  })

  it("threads correlation id through AsyncLocalStorage", () => {
    const { logger, entries } = makeLogger()
    withCorrelation("corr-42", () => {
      logger.info("inside")
    })
    logger.info("outside")
    expect(entries[0].corrId).toBe("corr-42")
    expect(entries[1].corrId).toBeUndefined()
  })

  it("newCorrelationId returns a non-empty string", () => {
    const id = newCorrelationId()
    expect(typeof id).toBe("string")
    expect(id.length).toBeGreaterThan(0)
  })

  it("child logger merges default fields", () => {
    const { logger, entries } = makeLogger()
    const sessionLogger = logger.child({ sessionId: "sess-1" })
    sessionLogger.warn("slow", { latencyMs: 123 })
    expect(entries[0]).toMatchObject({
      level: "warn",
      sessionId: "sess-1",
      latencyMs: 123,
    })
  })

  it("never throws when the sink throws", () => {
    const logger = new Logger({
      workerId: "w",
      sink: () => {
        throw new Error("sink boom")
      },
    })
    expect(() => logger.info("hi")).not.toThrow()
  })
})
