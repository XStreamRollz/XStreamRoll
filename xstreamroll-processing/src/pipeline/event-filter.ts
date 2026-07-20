import { StreamEvent } from "../session"

export interface FilterConfig {
  /** Event types to suppress. Events matching any entry are dropped silently. */
  blockedEventTypes: string[]
}

/**
 * Per-stream filter config store with hot-reload support.
 *
 * Configs are keyed by streamId. Calling `setConfig` replaces the
 * config for that stream immediately — no worker restart required.
 */
export class EventFilter {
  private readonly configs = new Map<string, FilterConfig>()

  /** Update (or set) the filter config for a stream. */
  setConfig(streamId: string, config: FilterConfig): void {
    this.configs.set(streamId, {
      blockedEventTypes: [...config.blockedEventTypes],
    })
  }

  /** Remove the filter config for a stream (all events pass through). */
  clearConfig(streamId: string): void {
    this.configs.delete(streamId)
  }

  /**
   * Returns `true` when the event should be forwarded to subscribers,
   * `false` when it should be dropped silently.
   */
  allow(event: StreamEvent): boolean {
    const config = this.configs.get(event.streamId)
    if (!config) return true
    const eventType = event.data["type"]
    if (typeof eventType !== "string") return true
    return !config.blockedEventTypes.includes(eventType)
  }
}
