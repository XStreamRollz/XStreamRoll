/**
 * Tests for {@link RedisFilterConfigStore}. The module mocks
 * `ioredis` with a tiny in-process fake that:
 *
 *   - shares a single hash across every FakeRedis instance (so
 *     the publisher's HSET is visible to a peer's HGETALL), and
 *   - wires publish() to subscribers via a closure-captured
 *     handler table (so cross-instance pub/sub delivers messages).
 *
 * No real Redis server is required. The fake exposes a `__test`
 * namespace for ad-hoc inspection (state resets, subscriber counts)
 * that production code never reaches.
 */

interface FakeBus {
  // channel -> list of `handler(message: string)` callables.
  [channel: string]: Array<(message: string) => void>
}

interface FakeHash {
  [key: string]: Record<string, string>
}

interface FakeTestNamespace {
  hash: FakeHash
  subscribers: FakeBus
  clearAll: () => void
  subscriberCountFor: (channel: string) => number
}

jest.mock("ioredis", () => {
  const hash: FakeHash = {}
  const subscribers: FakeBus = {}

  class FakeRedis {
    private url: string
    private handlers: Record<string, Array<(...args: unknown[]) => void>> = {}
    private subbedChannels: string[] = []
    private boundHandler: ((message: string) => void) | null = null
    public disconnectCount = 0

    constructor(url: string) {
      this.url = url
    }

    async connect(): Promise<void> {
      // No-op: this fake never actually opens a socket.
    }

    disconnect(): void {
      this.disconnectCount += 1
    }

    async subscribe(channel: string): Promise<void> {
      if (!subscribers[channel]) subscribers[channel] = []
      this.subbedChannels.push(channel)
      const handler = (message: string): void => {
        this.handlers["message"]?.forEach((fn) => fn(channel, message))
      }
      this.boundHandler = handler
      subscribers[channel].push(handler)
    }

    async unsubscribe(channel: string): Promise<void> {
      this.subbedChannels = this.subbedChannels.filter((c) => c !== channel)
      const list = subscribers[channel]
      if (list && this.boundHandler) {
        const idx = list.indexOf(this.boundHandler)
        if (idx >= 0) list.splice(idx, 1)
      }
    }

    async publish(channel: string, message: string): Promise<number> {
      const list = subscribers[channel] || []
      list.forEach((fn) => fn(message))
      return list.length
    }

    async hset(key: string, field: string, value: string): Promise<number> {
      hash[key] = hash[key] || {}
      hash[key][field] = value
      return 1
    }

    async hdel(key: string, field: string): Promise<number> {
      if (!hash[key] || !(field in hash[key])) return 0
      delete hash[key][field]
      return 1
    }

    async hgetall(key: string): Promise<Record<string, string>> {
      return { ...(hash[key] || {}) }
    }

    on(event: string, handler: (...args: unknown[]) => void): void {
      ;(this.handlers[event] = this.handlers[event] || []).push(handler)
    }
  }

  // Mark as ESM so TypeScript's `import Redis from "ioredis"`
  // (compiled to `new ioredis_1.default(...)`) resolves correctly.
  return {
    __esModule: true,
    default: FakeRedis,
    __test: {
      hash,
      subscribers,
      clearAll: (): void => {
        for (const k of Object.keys(hash)) delete hash[k]
        for (const k of Object.keys(subscribers)) delete subscribers[k]
      },
      subscriberCountFor: (channel: string): number =>
        (subscribers[channel] ?? []).length,
    },
  }
})

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RedisMock = require("ioredis").__test as FakeTestNamespace

import { RedisFilterConfigStore } from "../src/pipeline/event-filter-store"

beforeEach(() => {
  RedisMock.clearAll()
})

describe("RedisFilterConfigStore", () => {
  it("install() returns the current contents of the Redis hash", async () => {
    // Seed the hash as if a peer had already written it.
    RedisMock.hash["xstreamroll:event_filter_configs"] = {
      s1: JSON.stringify({
        streamId: "s1",
        config: { blockedEventTypes: ["noisy"] },
        from: "peer",
      }),
    }

    const store = new RedisFilterConfigStore({ redisUrl: "redis://test" })
    const seen: unknown[] = []
    const snapshot = await store.install((c) => seen.push(c))
    expect(snapshot.size).toBe(1)
    expect(snapshot.get("s1")?.blockedEventTypes).toEqual(["noisy"])
    // No synthetic change should be fired for the snapshot replay
    // — the snapshot is delivered through the return value.
    expect(seen).toEqual([])
    await store.close()
  })

  it("setConfig writes to the hash AND publishes a set change", async () => {
    const writer = new RedisFilterConfigStore({ redisUrl: "redis://test" })
    const seen: unknown[] = []
    await writer.install((c) => seen.push(c))
    expect(seen).toEqual([])

    await writer.setConfig("s1", { blockedEventTypes: ["x", "y"] })

    const stored = RedisMock.hash["xstreamroll:event_filter_configs"]
    expect(stored?.s1).toBeDefined()
    const parsed = JSON.parse(stored!.s1)
    expect(parsed).toMatchObject({
      streamId: "s1",
      config: { blockedEventTypes: ["x", "y"] },
    })
    // The writer's own subscriber also receives the publish, so the
    // local change callback fires once.
    expect(seen).toHaveLength(1)
    expect((seen[0] as { kind: string }).kind).toBe("set")
    await writer.close()
  })

  it("clearConfig removes from the hash AND publishes a clear change", async () => {
    const writer = new RedisFilterConfigStore({ redisUrl: "redis://test" })
    const seen: unknown[] = []
    await writer.install((c) => seen.push(c))
    await writer.setConfig("s1", { blockedEventTypes: ["x"] })
    seen.length = 0
    await writer.clearConfig("s1")

    const stored = RedisMock.hash["xstreamroll:event_filter_configs"]
    expect(stored?.s1).toBeUndefined()
    expect(seen).toHaveLength(1)
    expect((seen[0] as { kind: string }).kind).toBe("clear")
    await writer.close()
  })

  it("publishes a fan-out change that a peer receives via install()", async () => {
    const writer = new RedisFilterConfigStore({ redisUrl: "redis://test" })
    await writer.install(() => undefined)

    // Encourage a peer worker AFTER the writer is installed so the
    // pub/sub subscription is live by the time we publish.
    const peer = new RedisFilterConfigStore({ redisUrl: "redis://test" })
    const seen: Array<{ kind: string; streamId: string }> = []
    await peer.install((c) => seen.push(c))

    expect(
      RedisMock.subscriberCountFor("xstreamroll:event_filter_updates"),
    ).toBe(2)

    await writer.setConfig("s1", { blockedEventTypes: ["x"] })

    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({
      kind: "set",
      streamId: "s1",
    })

    await writer.close()
    await peer.close()
  })

  it("ignores malformed pub/sub payloads instead of throwing", async () => {
    const store = new RedisFilterConfigStore({ redisUrl: "redis://test" })
    const seen: unknown[] = []
    await store.install((c) => seen.push(c))

    // Inject a payload that doesn't match the wire schema directly
    // through the subscriber bus.
    const subscribersList =
      RedisMock.subscribers["xstreamroll:event_filter_updates"]
    expect(subscribersList).toBeDefined()

    // Malformed: missing `config` → must be silently dropped.
    subscribersList!.forEach((fn: (msg: string) => void) =>
      fn(JSON.stringify({ streamId: "s1" })),
    )

    // Clear configs notifications are valid shapes too — push one
    // through and verify the listener does not throw.
    subscribersList!.forEach((fn: (msg: string) => void) =>
      fn(
        JSON.stringify({
          streamId: "s2",
          config: null,
          from: "peer",
        }),
      ),
    )

    // The valid clear message should fire the callback; the
    // malformed one should be silently dropped.
    expect(seen).toHaveLength(1)
    expect((seen[0] as { kind: string }).kind).toBe("clear")
    expect((seen[0] as { streamId: string }).streamId).toBe("s2")
    await store.close()
  })

  it("close() disconnects both publishers and subscribers", async () => {
    const store = new RedisFilterConfigStore({ redisUrl: "redis://test" })
    const snapshot = await store.install(() => undefined)
    expect(snapshot.size).toBe(0)
    expect(
      RedisMock.subscriberCountFor("xstreamroll:event_filter_updates"),
    ).toBe(1)
    await store.close()
    // After close: subscribers on the channel are removed.
    expect(
      RedisMock.subscriberCountFor("xstreamroll:event_filter_updates"),
    ).toBe(0)
  })
})
