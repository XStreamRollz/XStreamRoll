import { GracefulShutdown, type ShutdownReason } from "../src/lifecycle"

function makeLogger() {
  const entries: { level: string; args: unknown[] }[] = []
  return {
    entries,
    logger: {
      log: (...args: unknown[]) => entries.push({ level: "log", args }),
      warn: (...args: unknown[]) => entries.push({ level: "warn", args }),
      error: (...args: unknown[]) => entries.push({ level: "error", args }),
    } as Pick<Console, "log" | "warn" | "error">,
  }
}

describe("GracefulShutdown", () => {
  it("runs registered hooks in order", async () => {
    const calls: string[] = []
    const exit = jest.fn()
    const { logger } = makeLogger()
    const gs = new GracefulShutdown({ exit, logger, timeoutMs: 1000 })

    gs.register({
      name: "first",
      run: () => {
        calls.push("first")
      },
    })
    gs.register({
      name: "second",
      run: () => {
        calls.push("second")
      },
    })

    await gs.requestShutdown("SIGTERM")
    expect(calls).toEqual(["first", "second"])
    expect(exit).toHaveBeenCalledWith(0)
  })

  it("coalesces repeated calls", async () => {
    const calls: string[] = []
    const exit = jest.fn()
    const { logger } = makeLogger()
    const gs = new GracefulShutdown({ exit, logger, timeoutMs: 1000 })
    gs.register({
      name: "h",
      run: () => {
        calls.push("h")
      },
    })

    await Promise.all([
      gs.requestShutdown("SIGINT"),
      gs.requestShutdown("SIGTERM"),
      gs.requestShutdown("manual"),
    ])
    expect(calls).toEqual(["h"])
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it("exits non-zero when a hook throws", async () => {
    const exit = jest.fn()
    const { logger } = makeLogger()
    const gs = new GracefulShutdown({ exit, logger, timeoutMs: 1000 })
    gs.register({
      name: "boom",
      run: () => {
        throw new Error("nope")
      },
    })
    await gs.requestShutdown("manual")
    expect(exit).toHaveBeenCalledWith(1)
  })

  it("supports async hooks", async () => {
    const calls: string[] = []
    const exit = jest.fn()
    const { logger } = makeLogger()
    const gs = new GracefulShutdown({ exit, logger, timeoutMs: 1000 })
    gs.register({
      name: "async",
      run: async () => {
        await new Promise((r) => setTimeout(r, 5))
        calls.push("done")
      },
    })
    await gs.requestShutdown("manual")
    expect(calls).toEqual(["done"])
  })

  it("transitions to 'done' after running", async () => {
    const exit = jest.fn()
    const { logger } = makeLogger()
    const gs = new GracefulShutdown({ exit, logger, timeoutMs: 1000 })
    expect(gs.getState()).toBe("idle")
    await gs.requestShutdown("SIGTERM" as ShutdownReason)
    expect(gs.getState()).toBe("done")
  })
})
