import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from "@nestjs/terminus"
import { Inject, Injectable } from "@nestjs/common"
import { Pool } from "pg"
import { PG_POOL } from "../database/database.module"

@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {
    super()
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.pool.query("SELECT 1")
      return this.getStatus(key, true)
    } catch (error) {
      throw new HealthCheckError("database", error)
    }
  }
}
