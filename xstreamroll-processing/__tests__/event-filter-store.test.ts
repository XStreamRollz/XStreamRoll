import {
  createFilterConfigStore,
  MemoryFilterConfigStore,
  type FilterChange,
} from "../src/pipeline/event-filter-store"

describe("MemoryFilterConfigStore", () => {
  it("returns an empty snapshot when no configs are set", async () => {
    const store = new MemoryFilterConfigStore()
    const seen: FilterChange[] = []
    const snapshot = await store.install((c) => seen.push(c))
    expect(snapshot.size).toBe(0)
    expect(seen).toEqual([])
  })

  it("setConfig stores a defensive copy of the blocked-types array", async () => {
    const store = new MemoryFilterConfigStore()
    const seen: FilterChange[] = []
    await store.install((c) => seen.push(c))
    const blocked = ["noisy"]
    await store.setConfig("s1", { blockedEventTypes: blocked })
    // Mutating the caller's array after setConfig must NOT be
    // reflected in the store.
    blocked.push("debug")
    expect(store.size()).toBe(1)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toEqual({
      kind: "set",
      streamId: "s1",
      config: { blockedEventTypes: ["noisy"] },
    })
  })

  it("clearConfig deletes the entry AND fires a clear change", async () => {
    const store = new MemoryFilterConfigStore()
    const seen: FilterChange[] = []
    await store.install((c) => seen.push(c))
    await store.setConfig("s1", { blockedEventTypes: ["x"] })
    await store.clearConfig("s1")
    expect(store.size()).toBe(0)
    expect(seen).toEqual([
      { kind: "set", streamId: "s1", config: { blockedEventTypes: ["x"] } },
      { kind: "clear", streamId: "s1" },
    ])
  })

  it("replays pre-existing entries through the snapshot callback", async () => {
    const store = new MemoryFilterConfigStore()
    await store.setConfig("old", { blockedEventTypes: ["v"] })
    const snapshot = await store.install(() => {
      /* install registers the listener; no per-change forwarding */
    })
    expect(snapshot.get("old")?.blockedEventTypes).toEqual(["v"])
  })

  it("close() drops in-memory state and detaches the change callback", async () => {
    const store = new MemoryFilterConfigStore()
    const seen: FilterChange[] = []
    await store.install((c) => seen.push(c))
    await store.setConfig("s1", { blockedEventTypes: ["x"] })
    await store.close()
    // Subsequent setConfig should NOT fire the callback (close
    // detached it) AND should not explode.
    await expect(
      store.setConfig("s1", { blockedEventTypes: ["y"] }),
    ).resolves.toBeUndefined()
    expect(seen).toHaveLength(1)
  })

  it("__setEntryForTest installs a snapshot entry without firing onChange", async () => {
    const store = new MemoryFilterConfigStore()
    const seen: FilterChange[] = []
    await store.install((c) => seen.push(c))
    store.__setEntryForTest("seeded", { blockedEventTypes: ["z"] })
    const snapshot = await store.install(() => undefined)
    expect(snapshot.get("seeded")?.blockedEventTypes).toEqual(["z"])
    // No synthetic change was broadcast — only the real setConfig above.
    expect(seen).toEqual([])
  })
})

describe("createFilterConfigStore", () => {
  it("returns a MemoryFilterConfigStore when backend=memory", async () => {
    const store = await createFilterConfigStore({ backend: "memory" })
    expect(store).toBeInstanceOf(MemoryFilterConfigStore)
    await store.close()
  })

  it("throws when backend=redis without a URL", async () => {
    await expect(
      createFilterConfigStore({ backend: "redis" }),
    ).rejects.toThrow(/EVENT_FILTER_REDIS_URL|REDIS_URL/)
  })

  it("returns a RedisFilterConfigStore when backend=redis + URL", async () => {
    // Use jest.requireActual so the test does not need a live
    // Redis server — the construction succeeds because the
    // lazyConnect:true client does not actually open a socket.
    const { RedisFilterConfigStore } = jest.requireActual(
      "../src/pipeline/event-filter-store",
    )
    const store = await createFilterConfigStore({
      backend: "redis",
      redisUrl: "redis://unused-for-construction",
    })
    expect(store).toBeInstanceOf(RedisFilterConfigStore)
    await store.close()
  })
})

describe("EventFilter ↔ FilterConfigStore recovery", () => {
  // Regression for the startPromise-stuck-on-failure bug: when
  // store.install() throws once (e.g. Redis unreachable at startup),
  // the next setConfig/clearConfig call must attempt to install
  // again rather than forever returning the original rejection.
  it("setConfig retries install() after a transient install failure", async () => {
    // Pull the actual classes out of the source modules so we can
    // subclass them and reason about the real signatures.
    const eventFilterModule = jest.requireActual(
      "../src/pipeline/event-filter",
    ) as typeof import("../src/pipeline/event-filter")
    const storeModule = jest.requireActual(
      "../src/pipeline/event-filter-store",
    ) as typeof import("../src/pipeline/event-filter-store")
    const { EventFilter } = eventFilterModule
    const { FilterConfigStore } = storeModule
    type RealFilterChange = import("../src/pipeline/event-filter-store").FilterChange

    let attempts = 0
    class FlakyStore extends FilterConfigStore {
      async install(
        _onChange: (change: RealFilterChange) => void,
      ): Promise<Map<string, import("../src/pipeline/event-filter").FilterConfig>> {
        attempts += 1
        if (attempts === 1) {
          throw new Error("simulated install failure")
        }
        return new Map()
      }
      async setConfig(): Promise<void> {}
      async clearConfig(): Promise<void> {}
      async close(): Promise<void> {}
    }

    const flakyStore = new FlakyStore()
    const filter = new EventFilter(flakyStore)

    // First call hits install() which throws. setConfig opts in to
    // retry because the cached startPromise has been cleared.
    await expect(
      filter.setConfig("s1", { blockedEventTypes: ["x"] }),
    ).rejects.toThrow(/simulated install failure/)
    expect(attempts).toBe(1)

    // Second call must retry and succeed. The optimistic local
    // update inside EventFilter.setConfig means `allow()` would be
    // correct even before install() returns, but we still want to
    // confirm the install() retry path itself.
    await filter.setConfig("s1", { blockedEventTypes: ["x"] })
    expect(attempts).toBe(2)
    expect(
      filter.allow({
        streamId: "s1",
        data: { type: "x" },
        timestamp: new Date().toISOString(),
      }),
    ).toBe(false)
  })
})
