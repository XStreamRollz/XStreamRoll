import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from "@nestjs/terminus"
import { Injectable } from "@nestjs/common"

const HEAP_THRESHOLD_BYTES = 512 * 1024 * 1024 // 512 MiB — matches container memory limit
const EVENT_LOOP_LAG_THRESHOLD_MS = 100

@Injectable()
export class MemoryHealthIndicator extends HealthIndicator {
  async checkHeap(key: string): Promise<HealthIndicatorResult> {
    const heapUsed = process.memoryUsage().heapUsed
    if (heapUsed >= HEAP_THRESHOLD_BYTES) {
      throw new HealthCheckError(
        key,
        this.getStatus(key, false, { heapUsed, threshold: HEAP_THRESHOLD_BYTES }),
      )
    }
    return this.getStatus(key, true, { heapUsed })
  }

  async checkEventLoopLag(key: string): Promise<HealthIndicatorResult> {
    const lagMs = await this.sampleEventLoopLag()
    if (lagMs >= EVENT_LOOP_LAG_THRESHOLD_MS) {
      throw new HealthCheckError(
        key,
        this.getStatus(key, false, { lagMs, threshold: EVENT_LOOP_LAG_THRESHOLD_MS }),
      )
    }
    return this.getStatus(key, true, { lagMs })
  }

  private sampleEventLoopLag(): Promise<number> {
    return new Promise((resolve) => {
      const start = process.hrtime.bigint()
      setImmediate(() => {
        resolve(Number(process.hrtime.bigint() - start) / 1_000_000)
      })
    })
  }
}
