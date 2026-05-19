import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from "@nestjs/terminus"
import { Injectable, OnModuleDestroy } from "@nestjs/common"
import { Pool } from "pg"

@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator implements OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: process.env.DATABASE_URL })

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.pool.query("SELECT 1")
      return this.getStatus(key, true)
    } catch (error) {
      throw new HealthCheckError("database", error)
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end()
  }
}
