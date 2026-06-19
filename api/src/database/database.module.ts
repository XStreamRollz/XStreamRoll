import { Global, Module } from "@nestjs/common"
import { Pool } from "pg"
import { env } from "../config/env"

export const PG_POOL = "PG_POOL"

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (): Pool => new Pool({ connectionString: env.DATABASE_URL }),
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
