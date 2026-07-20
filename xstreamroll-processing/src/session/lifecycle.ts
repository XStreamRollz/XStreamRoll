import axios from "axios"

export type LifecycleState =
  "idle" | "starting" | "active" | "stopping" | "ended" | "error"

export interface LifecycleManagerOptions {
  apiUrl: string
  workerId: string
}

/**
 * Manages the full lifecycle of a stream session and notifies the API
 * via PATCH /streams/:id on each state transition.
 *
 * State machine:
 *   idle → starting → active → stopping → ended
 *                                        ↑
 *   (any state) → error  (on unexpected disconnect)
 */
export class SessionLifecycleManager {
  private state: LifecycleState = "idle"
  private readonly streamId: string
  private readonly apiUrl: string
  private readonly workerId: string

  constructor(streamId: string, options: LifecycleManagerOptions) {
    this.streamId = streamId
    this.apiUrl = options.apiUrl
    this.workerId = options.workerId
  }

  getState(): LifecycleState {
    return this.state
  }

  async start(): Promise<void> {
    this.assertState("idle")
    await this.transition("starting")
    await this.transition("active")
  }

  async stop(): Promise<void> {
    this.assertState("active")
    await this.transition("stopping")
    await this.transition("ended")
  }

  async handleDisconnect(err?: Error): Promise<void> {
    if (this.state === "ended" || this.state === "error") return
    await this.transition("error", err?.message ?? "unexpected disconnect")
  }

  private assertState(expected: LifecycleState): void {
    if (this.state !== expected) {
      throw new Error(
        `Invalid transition: expected state "${expected}", current state is "${this.state}"`,
      )
    }
  }

  private async transition(
    next: LifecycleState,
    reason?: string,
  ): Promise<void> {
    this.state = next
    try {
      await axios.patch(`${this.apiUrl}/streams/${this.streamId}`, {
        status: next,
        workerId: this.workerId,
        ...(reason ? { reason } : {}),
        updatedAt: new Date().toISOString(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(
        `[lifecycle] PATCH /streams/${this.streamId} failed (state=${next}): ${message}`,
      )
    }
  }
}
