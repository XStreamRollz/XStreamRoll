import {
  Global,
  Inject,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common"
import { Pool } from "pg"
import { env } from "../config/env"
import { MetricsModule } from "../metrics/metrics.module"
import { MetricsService } from "../metrics/metrics.service"

export const PG_POOL = "PG_POOL"

@Global()
@Module({
  imports: [MetricsModule],
  providers: [
    {
      provide: PG_POOL,
      useFactory: (): Pool =>
        new Pool({
          connectionString: env.DATABASE_URL,
          max: env.DB_POOL_MAX,
          min: env.DB_POOL_MIN,
          idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS,
          connectionTimeoutMillis: env.DB_POOL_CONNECTION_TIMEOUT_MS,
          statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
          query_timeout: env.DB_STATEMENT_TIMEOUT_MS,
        }),
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule implements OnModuleInit, OnModuleDestroy {
  private poolMetricsInterval: ReturnType<typeof setInterval> | null = null

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    // Issue #328: Periodically update pool metrics so Prometheus always
    // reflects the current pool state.  The pg Pool exposes totalCount,
    // idleCount, and waitingCount as public properties.
    this.poolMetricsInterval = setInterval(() => {
      this.metrics.dbPoolActive.set(this.pool.totalCount - this.pool.idleCount)
      this.metrics.dbPoolIdle.set(this.pool.idleCount)
      this.metrics.dbPoolWaiting.set(this.pool.waitingCount)
    }, 15_000) // every 15 s
  }

  onModuleDestroy(): void {
    if (this.poolMetricsInterval !== null) {
      clearInterval(this.poolMetricsInterval)
    }
  }
}
