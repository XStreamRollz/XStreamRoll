import { createHash } from "crypto"
import { mkdir, readFile, rename, writeFile } from "fs/promises"
import { dirname } from "path"

import { StreamEvent } from "./session"

export interface DeadLetterRecord {
  key: string
  streamId: string
  event: StreamEvent
  error: string
  attemptCount: number
  timestamp: string
}

export interface DeadLetterStore {
  record(event: StreamEvent, error: Error, attempts: number): Promise<void>
  list(): Promise<DeadLetterRecord[]>
}

/** File-backed dead-letter store used by the dependency-free worker. */
export class FileDeadLetterStore implements DeadLetterStore {
  private pendingWrite: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async record(
    event: StreamEvent,
    error: Error,
    attempts: number,
  ): Promise<void> {
    this.pendingWrite = this.pendingWrite.catch(() => undefined).then(async () => {
      const records = await this.readRecords()
      const key = eventKey(event)
      const existing = records[key]
      records[key] = existing
        ? {
            ...existing,
            error: error.message,
            attemptCount: attempts,
            timestamp: new Date().toISOString(),
          }
        : {
            key,
            streamId: event.streamId,
            event,
            error: error.message,
            attemptCount: attempts,
            timestamp: new Date().toISOString(),
          }
      await this.writeRecords(records)
    })
    return this.pendingWrite
  }

  async list(): Promise<DeadLetterRecord[]> {
    await this.pendingWrite
    const records = await this.readRecords()
    return Object.values(records).sort((left, right) =>
      left.timestamp.localeCompare(right.timestamp),
    )
  }

  private async readRecords(): Promise<Record<string, DeadLetterRecord>> {
    try {
      const raw = await readFile(this.filePath, "utf8")
      return JSON.parse(raw) as Record<string, DeadLetterRecord>
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}
      throw error
    }
  }

  private async writeRecords(
    records: Record<string, DeadLetterRecord>,
  ): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`
    await writeFile(temporaryPath, JSON.stringify(records, null, 2), "utf8")
    await rename(temporaryPath, this.filePath)
  }
}

function eventKey(event: StreamEvent): string {
  if (event.id) return `${event.streamId}:${event.id}`
  return createHash("sha256")
    .update(stableStringify(event))
    .digest("hex")
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`
  }
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}
