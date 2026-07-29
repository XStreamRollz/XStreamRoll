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

  // -- Per-step timeout (issue #342) ------------------------------------

  it("logs a warning and continues when a hook exceeds its timeout", async () => {
    const calls: string[] = []
    const exit = jest.fn()
    const { logger, entries } = makeLogger()
    const gs = new GracefulShutdown({ exit, logger, timeoutMs: 50 })

    gs.register({
      name: "hanging hook",
      timeoutMs: 20,
      run: async () => {
        await new Promise(() => {}) // never resolves
      },
    })
    gs.register({
      name: "fast hook",
      run: () => {
        calls.push("fast")
      },
    })

    await gs.requestShutdown("manual")

    // The fast hook should have run despite the hanging hook
    expect(calls).toEqual(["fast"])
    // The hanging hook should have triggered a timeout warning
    expect(
      entries.some(
        (e) =>
          e.level === "warn" &&
          (e.args as string[]).some((a) => String(a).includes("timed out")),
      ),
    ).toBe(true)
    // Overall shutdown had an error from the timed-out hook
    expect(exit).toHaveBeenCalledWith(1)
  })

  it("uses the per-step timeoutMs override when provided", async () => {
    const exit = jest.fn()
    const { logger } = makeLogger()
    // Global timeout is very short, but the hook has a longer override
    const gs = new GracefulShutdown({ exit, logger, timeoutMs: 1000 })

    gs.register({
      name: "fast but with long override",
      timeoutMs: 200,
      run: async () => {
        await new Promise((r) => setTimeout(r, 5))
      },
    })

    await gs.requestShutdown("manual")
    expect(exit).toHaveBeenCalledWith(0)
  })

  it("falls back to the global timeout when per-step timeoutMs is omitted", async () => {
    const exit = jest.fn()
    const { logger, entries } = makeLogger()
    const gs = new GracefulShutdown({ exit, logger, timeoutMs: 20 })

    gs.register({
      name: "hanging no-override",
      // no timeoutMs — falls back to global 20ms
      run: async () => {
        await new Promise(() => {})
      },
    })
    gs.register({
      name: "still runs",
      run: () => {},
    })

    await gs.requestShutdown("manual")
    expect(
      entries.some(
        (e) =>
          e.level === "warn" &&
          (e.args as string[]).some((a) => String(a).includes("timed out")),
      ),
    ).toBe(true)
    expect(exit).toHaveBeenCalledWith(1)
  })

  it("continues through multiple timed-out hooks", async () => {
    const calls: string[] = []
    const exit = jest.fn()
    const { logger, entries } = makeLogger()
    const gs = new GracefulShutdown({ exit, logger, timeoutMs: 50 })

    gs.register({
      name: "hang1",
      timeoutMs: 10,
      run: async () => {
        await new Promise(() => {})
      },
    })
    gs.register({
      name: "hang2",
      timeoutMs: 10,
      run: async () => {
        await new Promise(() => {})
      },
    })
    gs.register({
      name: "clean",
      run: () => {
        calls.push("clean")
      },
    })

    await gs.requestShutdown("manual")

    expect(calls).toEqual(["clean"])
    const warnCount = entries.filter(
      (e) =>
        e.level === "warn" &&
        (e.args as string[]).some((a) => String(a).includes("timed out")),
    ).length
    expect(warnCount).toBe(2)
    expect(exit).toHaveBeenCalledWith(1)
  })
})
