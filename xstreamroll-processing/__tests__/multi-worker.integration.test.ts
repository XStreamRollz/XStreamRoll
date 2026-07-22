/**
 * Integration test for race condition prevention (issue #338).
 *
 * This test verifies that the race condition fix works correctly by testing
 * the order of operations within a single SessionRegistry. The comprehensive
 * multi-worker distributed locking behavior is already covered by the unit
 * tests in session-registry.test.ts (lines 174-260).
 */

import { SessionRegistry } from "../src/session-registry"
import { MemoryLockManager } from "../src/leader-election"
import type { StreamEvent } from "../src/session"

function evt(streamId: string): StreamEvent {
  return { streamId, data: { type: "data" }, timestamp: new Date().toISOString() }
}

describe("Race condition prevention (issue #338)", () => {
  it("lock acquisition happens before session spawn", async () => {
    const lockManager = new MemoryLockManager({ workerId: "worker-1", ttlMs: 30_000 })
    const acquireOrder: string[] = []

    // Spy on lock manager to track order of operations
    const originalAcquire = lockManager.acquire.bind(lockManager)
    jest.spyOn(lockManager, "acquire").mockImplementation(async (streamId) => {
      acquireOrder.push("acquire-start")
      const result = await originalAcquire(streamId)
      acquireOrder.push("acquire-end")
      return result
    })

    const worker = new SessionRegistry(
      "worker-1",
      { publish: jest.fn() },
      { maxConcurrentSessions: 10, lockManager },
    )

    // Track when session is created
    let sessionCreated = false
    const originalSpawn = (worker as unknown as { spawn: (streamId: string) => unknown }).spawn.bind(worker)
    jest.spyOn(worker as unknown as { spawn: jest.Mock }, "spawn").mockImplementation((streamId: string) => {
      sessionCreated = true
      acquireOrder.push("session-spawn")
      return originalSpawn(streamId)
    })

    await worker.route(evt("stream-1"))

    // Verify order: acquire must complete before spawn
    expect(acquireOrder).toEqual(["acquire-start", "acquire-end", "session-spawn"])
    expect(sessionCreated).toBe(true)

    // Clean up
    await worker.drainAll()
    await lockManager.close()
  })

  it("concurrent route calls are deduplicated within single registry", async () => {
    const lockManager = new MemoryLockManager({ workerId: "worker-1", ttlMs: 30_000 })
    let acquireCount = 0

    // Track acquire calls
    const originalAcquire = lockManager.acquire.bind(lockManager)
    jest.spyOn(lockManager, "acquire").mockImplementation(async (streamId) => {
      acquireCount++
      return originalAcquire(streamId)
    })

    const worker = new SessionRegistry(
      "worker-1",
      { publish: jest.fn() },
      { maxConcurrentSessions: 10, lockManager },
    )

    // Fire concurrent routes for the same stream
    const results = await Promise.all([
      worker.route(evt("stream-1")),
      worker.route(evt("stream-1")),
      worker.route(evt("stream-1")),
    ])

    // All should succeed (deduplication)
    expect(results).toEqual(["enqueued", "enqueued", "enqueued"])

    // Only one acquire should have happened
    expect(acquireCount).toBe(1)

    // Only one session should exist
    expect(worker.size()).toBe(1)

    // Clean up
    await worker.drainAll()
    await lockManager.close()
  })
})
