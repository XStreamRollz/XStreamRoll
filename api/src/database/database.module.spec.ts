import { Test, TestingModule } from "@nestjs/testing"
import { DatabaseModule, PG_POOL } from "./database.module"
import { Pool } from "pg"

describe("DatabaseModule", () => {
  let module: TestingModule

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [DatabaseModule],
    }).compile()
  })

  afterEach(async () => {
    await module.close()
  })

  it("provides PG_POOL token as a Pool instance", () => {
    const pool = module.get<Pool>(PG_POOL)
    expect(pool).toBeDefined()
    expect(pool).toBeInstanceOf(Pool)
  })

  it("provides the same Pool instance on repeated resolution (singleton)", () => {
    const pool1 = module.get<Pool>(PG_POOL)
    const pool2 = module.get<Pool>(PG_POOL)
    expect(pool1).toBe(pool2)
  })
})
