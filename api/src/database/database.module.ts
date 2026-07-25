import { Global, Module } from "@nestjs/common"
import { Pool } from "pg"
import { env } from "../config/env"

export const PG_POOL = "PG_POOL"

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (): Pool =>
        new Pool({
          connectionString: env.DATABASE_URL,
          statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
          query_timeout: env.DB_STATEMENT_TIMEOUT_MS,
        }),
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
