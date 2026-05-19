import { Injectable } from "@nestjs/common"
import { Pool } from "pg"

@Injectable()
export class AuditService {
  private pool = new Pool({ connectionString: process.env.DATABASE_URL })

  async log(userId: number | null, action: string, ip: string) {
    await this.pool.query(
      "INSERT INTO audit_logs (user_id, action, ip) VALUES ($1, $2, $3)",
      [userId, action, ip],
    )
  }

  async findAll(page = 1, limit = 20) {
    const offset = (page - 1) * limit
    const totalResult = await this.pool.query(
      "SELECT COUNT(*)::int AS total FROM audit_logs",
    )
    const total = totalResult.rows[0]?.total ?? 0
    const { rows } = await this.pool.query(
      "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [limit, offset],
    )

    return {
      data: rows,
      total,
      page,
      limit,
    }
  }
}
