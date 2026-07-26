import { StreamEvent } from "../session"
import {
  FilterConfigStore,
  MemoryFilterConfigStore,
  type FilterChange,
} from "./event-filter-store"

/**
 * Per-stream filter config. The worker only ever strips out events
 * by-type, so the config shape stays deliberately minimal.
 */
export interface FilterConfig {
  /** Event types to suppress. Events matching any entry are dropped silently. */
  blockedEventTypes: string[]
}

/**
 * Per-stream filter that decides which events to forward.
 *
 * The hot path (`allow`) is a synchronous `Map` lookup, O(1) per
 * event. The Map is populated by an injected
 * {@link FilterConfigStore}, which owns persistence and propagation
 * across the worker cluster.
 *
 * Behaviour summary (issue #351):
 *
 *   - `setConfig` / `clearConfig` are routed through the store, so
 *     with a Redis-backed store every worker picks up the change
 *     within a couple of seconds. Without one, they only affect the
 *     local process.
 *
 *   - `start()` initialises the store and seeds the in-memory map
 *     from the snapshot the store knows about at install time. It
 *     is implicitly called the first time `setConfig` or
 *     `clearConfig` fires, so callers that never touch the store
 *     don't need to await anything.
 *
 *   - `allow(event)` is unchanged from the pre-#351 implementation
 *     and never awaits the store. A transient Redis outage does not
 *     stall the polling loop.
 */
export class EventFilter {
  private readonly configs = new Map<string, FilterConfig>()
  private store: FilterConfigStore
  private started = false
  private startPromise: Promise<void> | null = null

  constructor(store?: FilterConfigStore) {
    this.store = store ?? new MemoryFilterConfigStore()
  }

  /**
   * Replace the backing store. The in-process `configs` map is
   * preserved; the new store's `install()` snapshot is merged into
   * it. Used by tests + by future PRs that want to swap backends
   * mid-flight.
   */
  setStore(store: FilterConfigStore): void {
    this.store = store
    this.started = false
    this.startPromise = null
  }

  /**
   * Initialise the store. Idempotent — extra calls are no-ops.
   *
   * Resolves once the in-memory `configs` map is seeded from the
   * store snapshot. Safe to call even for an in-memory store
   * (resolves immediately to the empty snapshot).
   */
  async start(): Promise<void> {
    await this.ensureStarted()
  }

  /**
   * Update (or set) the filter config for a stream. The local
   * `configs` map is updated synchronously so a subsequent
   * `allow(event)` call observes the change without waiting for the
   * store round trip. The store write (which fans the change out to
   * peer workers when Redis-backed) happens via the returned
   * promise.
   */
  setConfig(streamId: string, config: FilterConfig): Promise<void> {
    const snapshot: FilterConfig = {
      blockedEventTypes: [...config.blockedEventTypes],
    }
    this.configs.set(streamId, snapshot)
    return this.runWhenStarted(() => this.store.setConfig(streamId, snapshot))
  }

  /**
   * Remove the filter config for a stream. The local map is updated
   * synchronously so the next `allow(event)` reflects the change
   * immediately; the returned promise resolves once peer workers
   * have been notified (no-op for the in-memory store).
   */
  clearConfig(streamId: string): Promise<void> {
    this.configs.delete(streamId)
    return this.runWhenStarted(() => this.store.clearConfig(streamId))
  }

  /**
   * Returns `true` when the event should be forwarded to subscribers,
   * `false` when it should be dropped silently. Synchronous — never
   * awaits the store. A Redis outage cannot stall the polling loop.
   */
  allow(event: StreamEvent): boolean {
    const config = this.configs.get(event.streamId)
    if (!config) return true
    const eventType = event?.data?.["type"]
    if (typeof eventType !== "string") return true
    return !config.blockedEventTypes.includes(eventType)
  }

  /** Tear the store down on graceful worker shutdown. */
  async close(): Promise<void> {
    try {
      await this.store.close()
    } catch {
      // Store shutdown failures must not abort the rest of the
      // shutdown sequence; the worker logs them separately.
    }
  }

  /* -------------------------------------------------------------- */

  private async ensureStarted(): Promise<void> {
    if (this.startPromise) return this.startPromise
    this.startPromise = this.doStart().catch((err) => {
      // Clear the cached promise on failure so a transient install
      // error (e.g. Redis unreachable at startup) does not brick
      // the filter forever. The next setConfig/clearConfig call will
      // attempt install() again; until then `allow()` keeps working
      // against whatever the optimistic local-update path has set.
      this.startPromise = null
      throw err
    })
    return this.startPromise
  }

  private async doStart(): Promise<void> {
    const snapshot = await this.store.install((change) =>
      this.applyChange(change),
    )
    for (const [streamId, cfg] of snapshot.entries()) {
      this.configs.set(streamId, {
        blockedEventTypes: [...cfg.blockedEventTypes],
      })
    }
    this.started = true
  }

  private runWhenStarted(
    fn: () => Promise<void>,
  ): Promise<void> {
    return this.ensureStarted().then(fn)
  }

  private applyChange(change: FilterChange): void {
    if (change.kind === "clear") {
      this.configs.delete(change.streamId)
      return
    }
    this.configs.set(change.streamId, {
      blockedEventTypes: [...change.config.blockedEventTypes],
    })
  }
}
