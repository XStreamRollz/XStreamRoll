import { SessionRegistry } from "../src/session-registry"
import type { StreamEvent, ProcessedStreamEvent } from "../src/session"
import { LockManager, LockToken, MemoryLockManager } from "../src/leader-election"

function evt(streamId: string): StreamEvent {
  return { streamId, data: { type: "data" }, timestamp: new Date().toISOString() }
}

function makeRegistry(max = 4, opts: { lockManager?: LockManager; ttlMs?: number } = {}) {
  const lockManager =
    opts.lockManager ??
    new MemoryLockManager({ workerId: "w1", ttlMs: opts.ttlMs ?? 30_000 })
  return new SessionRegistry(
    "w1",
    { publish: jest.fn() },
    { maxConcurrentSessions: max, lockManager },
  )
}

/**
 * Returns a {@link LockManager} that always denies acquisition,
 * simulating "another live worker owns every stream". Used to drive
 * the `route()` `"locked"` branch without depending on a DB-backed
 * distributed coordinator.
 */
function makeDenyAllLockManager(): jest.Mocked<LockManager> {
  const mgr = {
    ttlMs: 30_000,
    workerId: "mock-host",
    logger: console,
    install: jest.fn().mockResolvedValue(undefined),
    acquire: jest.fn().mockResolvedValue(null as LockToken | null),
    renew: jest.fn().mockResolvedValue(true),
    release: jest.fn().mockResolvedValue(false),
    releaseAll: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<LockManager>
  return mgr
}

/**
 * A lock manager whose `acquire()` blocks on an externally-resolved
 * gate before returning a token. Lets a test hold several concurrent
 * `route()` calls inside the acquire round trip simultaneously so the
 * in-flight dedupe path (issue #338) can be observed. `acquireCalls`
 * counts how many times the backend was actually hit.
 */
function makeGatedLockManager(workerId = "w1"): {
  manager: jest.Mocked<LockManager>
  release: () => void
  acquireCalls: () => number
} {
  let calls = 0
  let openGate: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    openGate = resolve
  })
  const manager = {
    ttlMs: 30_000,
    workerId,
    logger: console,
    install: jest.fn().mockResolvedValue(undefined),
    acquire: jest.fn(async (streamId: string): Promise<LockToken | null> => {
      calls += 1
      await gate
      return {
        streamId,
        workerId,
        token: `tok-${calls}`,
        acquiredAt: Date.now(),
        expiresAt: Date.now() + 30_000,
      }
    }),
    renew: jest.fn().mockResolvedValue(true),
    release: jest.fn().mockResolvedValue(true),
    releaseAll: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<LockManager>
  return { manager, release: () => openGate(), acquireCalls: () => calls }
}

describe("SessionRegistry", () => {
  it("lazily creates a session for a new stream", async () => {
    const registry = makeRegistry()
    const result = await registry.route(evt("s1"))
    expect(result).toBe("enqueued")
    expect(registry.size()).toBe(1)
    expect(registry.lockCount()).toBe(1)
  })

  it("returns capacity when the registry is full", async () => {
    const registry = makeRegistry(1)
    await expect(registry.route(evt("s1"))).resolves.toBe("enqueued")
    await expect(registry.route(evt("s2"))).resolves.toBe("capacity")
    expect(registry.lockCount()).toBe(1)
  })

  it("reuses an existing session for the same stream", async () => {
    const registry = makeRegistry()
    await registry.route(evt("s1"))
    await registry.route(evt("s1"))
    expect(registry.size()).toBe(1)
    expect(registry.lockCount()).toBe(1)
  })

  it("evicts stopped sessions and frees capacity", async () => {
    const registry = makeRegistry(1)
    await registry.route(evt("s1"))
    const session = registry.get("s1")!
    await session.stop()
    // allow microtask queue to settle so the state listener evicts
    await new Promise((r) => setTimeout(r, 5))
    expect(registry.size()).toBe(0)
    expect(registry.lockCount()).toBe(0)
    await expect(registry.route(evt("s2"))).resolves.toBe("enqueued")
  })

  it("drainAll resolves once every session has stopped", async () => {
    const registry = makeRegistry()
    await registry.route(evt("s1"))
    await registry.route(evt("s2"))
    await registry.drainAll()
    expect(registry.size()).toBe(0)
    expect(registry.lockCount()).toBe(0)
  })

  it("capacity() reports used vs max", async () => {
    const registry = makeRegistry(8)
    await registry.route(evt("s1"))
    await registry.route(evt("s2"))
    expect(registry.capacity()).toEqual({ used: 2, max: 8 })
  })

  it("publishes processed events through the handlers", async () => {
    const published: ProcessedStreamEvent[] = []
    const lockManager = new MemoryLockManager({ workerId: "w1", ttlMs: 30_000 })
    const registry = new SessionRegistry(
      "w1",
      {
        publish: async (e) => {
          published.push(e)
        },
      },
      { maxConcurrentSessions: 4, lockManager },
    )
    await registry.route(evt("s1"))
    for (let i = 0; i < 40 && published.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(published).toHaveLength(1)
    expect(published[0].workerId).toBe("w1")
  })

  it("returns 'locked' when the LockManager reports another worker owns the stream", async () => {
    // We deliberately exercise the SessionRegistry's `route()`
    // branch with a controllable mock LockManager rather than the
    // in-process one — MemoryLockManager is per-instance, so
    // sharing it between two registries can't reproduce the
    // cross-worker claim-loss a distributed backend produces.
    const deniedLockManager = makeDenyAllLockManager()
    const registry = new SessionRegistry(
      "w-foreign",
      { publish: jest.fn() },
      { maxConcurrentSessions: 4, lockManager: deniedLockManager },
    )
    await expect(registry.route(evt("s1"))).resolves.toBe("locked")
    expect(registry.size()).toBe(0)
    // Acquisition is now attempted BEFORE spawning (issue #338), so a
    // denied lock never creates a session and there is no token to
    // release.
    expect(deniedLockManager.release).not.toHaveBeenCalled()
  })

  it("acquires the lock before spawning a session (issue #338)", async () => {
    // A lock manager that records the registry state at the moment
    // acquire() is invoked. If the session were spawned first, the
    // registry would already report size()===1 here.
    let sizeAtAcquire = -1
    const lockManager = new MemoryLockManager({ workerId: "w1", ttlMs: 30_000 })
    const realAcquire = lockManager.acquire.bind(lockManager)
    jest.spyOn(lockManager, "acquire").mockImplementation(async (streamId) => {
      sizeAtAcquire = registry.size()
      return realAcquire(streamId)
    })
    const registry = new SessionRegistry(
      "w1",
      { publish: jest.fn() },
      { maxConcurrentSessions: 4, lockManager },
    )
    await registry.route(evt("s1"))
    expect(sizeAtAcquire).toBe(0)
    expect(registry.size()).toBe(1)
    expect(registry.lockCount()).toBe(1)
  })

  it("does not spawn or start a session when the lock is denied (issue #338)", async () => {
    const deniedLockManager = makeDenyAllLockManager()
    const registry = new SessionRegistry(
      "w1",
      { publish: jest.fn() },
      { maxConcurrentSessions: 4, lockManager: deniedLockManager },
    )
    await expect(registry.route(evt("s1"))).resolves.toBe("locked")
    // No placeholder session is ever created, so nothing needs
    // failing or evicting.
    expect(registry.size()).toBe(0)
    expect(registry.lockCount()).toBe(0)
    expect(registry.get("s1")).toBeUndefined()
  })

  it("deduplicates concurrent route() calls for the same stream (issue #338)", async () => {
    const { manager, release, acquireCalls } = makeGatedLockManager("w1")
    const registry = new SessionRegistry(
      "w1",
      { publish: jest.fn() },
      { maxConcurrentSessions: 4, lockManager: manager },
    )

    // Fire three concurrent routes for the same stream while acquire
    // is gated open. All three are in-flight before any resolves.
    const routes = Promise.all([
      registry.route(evt("s1")),
      registry.route(evt("s1")),
      registry.route(evt("s1")),
    ])
    // Let the microtasks run so every route() reaches acquire().
    await Promise.resolve()
    release()
    const results = await routes

    // Every caller is satisfied...
    expect(results).toEqual(["enqueued", "enqueued", "enqueued"])
    // ...by a SINGLE acquire round trip and a SINGLE session/lock.
    expect(acquireCalls()).toBe(1)
    expect(registry.size()).toBe(1)
    expect(registry.lockCount()).toBe(1)
    // No duplicate token leaked, so no compensating release happened.
    expect(manager.release).not.toHaveBeenCalled()
  })

  it("starts a fresh acquisition after the previous session stops (issue #338)", async () => {
    // Deduplication must not cache a settled acquire forever: once a
    // session stops and its lock is released, a later route() for the
    // same stream must hit the backend again.
    const lockManager = new MemoryLockManager({ workerId: "w1", ttlMs: 30_000 })
    const acquireSpy = jest.spyOn(lockManager, "acquire")
    const registry = new SessionRegistry(
      "w1",
      { publish: jest.fn() },
      { maxConcurrentSessions: 4, lockManager },
    )
    await registry.route(evt("s1"))
    const session = registry.get("s1")!
    await session.stop()
    await new Promise((r) => setTimeout(r, 5))
    expect(registry.size()).toBe(0)
    await registry.route(evt("s1"))
    expect(acquireSpy).toHaveBeenCalledTimes(2)
    expect(registry.size()).toBe(1)
  })

  it("constructing without a lock manager throws", () => {
    expect(() => {
      // Bypass the typed shape to exercise the runtime guard.
      new SessionRegistry(
        "w1",
        { publish: jest.fn() },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { maxConcurrentSessions: 1 } as any,
      )
    }).toThrow(/requires a LockManager/)
  })

  it("rejects heartbeat intervals >= lock TTL", () => {
    const lockManager = new MemoryLockManager({ workerId: "w1", ttlMs: 5_000 })
    expect(() => {
      new SessionRegistry(
        "w1",
        { publish: jest.fn() },
        { maxConcurrentSessions: 1, lockManager, heartbeatMs: 5_000 },
      )
    }).toThrow(/heartbeatMs.*must be strictly less/)
  })
})
