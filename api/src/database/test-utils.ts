import { Test, TestingModule } from "@nestjs/testing"
import { INestApplication, ValidationPipe } from "@nestjs/common"
import { Pool } from "pg"
import { readFileSync } from "fs"
import { resolve } from "path"
import { DatabaseModule, PG_POOL } from "./database.module"

let schemaApplied = false

export async function applySchema(pool: Pool): Promise<void> {
  if (schemaApplied) return
  const schemaPath = resolve(__dirname, "../../database/schema.sql")
  const schema = readFileSync(schemaPath, "utf8")
  await pool.query(schema)
  schemaApplied = true
}

export async function resetDb(pool: Pool): Promise<void> {
  const tables = await pool.query(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename != 'spatial_ref_sys'`,
  )
  const tableNames = tables.rows.map((r) => r.tablename).join(", ")
  if (tableNames) {
    await pool.query(`TRUNCATE TABLE ${tableNames} CASCADE`)
  }
}

export interface TestAppContext {
  app: INestApplication
  pool: Pool
}

export async function createTestApp(): Promise<TestAppContext> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [DatabaseModule],
  }).compile()

  const app = moduleFixture.createNestApplication()
  app.useGlobalPipes(new ValidationPipe())
  await app.init()

  const pool = moduleFixture.get<Pool>(PG_POOL)
  await applySchema(pool)

  return { app, pool }
}

export async function destroyTestApp(ctx: TestAppContext): Promise<void> {
  await ctx.app.close()
  await ctx.pool.end()
}
