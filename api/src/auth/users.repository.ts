import { Inject, Injectable } from "@nestjs/common"
import { Pool } from "pg"
import { PG_POOL } from "../database/database.module"

export interface User {
  id: number
  username: string
  email: string
  password_hash: string
  created_at: Date
  password_changed_at?: Date
}

/**
 * Thin data-access layer for the `users` table.
 *
 * Keeps raw SQL localised so the service layer never deals with
 * connection details and the repository is easy to mock in unit tests.
 */
@Injectable()
export class UsersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<User | null> {
    const { rows } = await this.pool.query(
      "SELECT id, username, email, password_hash, created_at, password_changed_at FROM users WHERE email = $1",
      [email],
    )
    return rows[0] ?? null
  }

  async findByUsername(username: string): Promise<User | null> {
    const { rows } = await this.pool.query(
      "SELECT id, username, email, password_hash, created_at, password_changed_at FROM users WHERE username = $1",
      [username],
    )
    return rows[0] ?? null
  }

  async findById(id: number): Promise<User | null> {
    const { rows } = await this.pool.query(
      "SELECT id, username, email, password_hash, created_at, password_changed_at FROM users WHERE id = $1",
      [id],
    )
    return rows[0] ?? null
  }

  async create(
    username: string,
    email: string,
    passwordHash: string,
  ): Promise<User> {
    const { rows } = await this.pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, password_hash, created_at, password_changed_at`,
      [username, email, passwordHash],
    )
    return rows[0]
  }

  async updateProfile(
    id: number,
    data: { username?: string; email?: string },
  ): Promise<User> {
    const sets: string[] = []
    const values: (string | number)[] = []
    let idx = 1

    if (data.username !== undefined) {
      sets.push(`username = $${idx++}`)
      values.push(data.username)
    }
    if (data.email !== undefined) {
      sets.push(`email = $${idx++}`)
      values.push(data.email)
    }

    if (sets.length === 0) {
      return this.findById(id) as Promise<User>
    }

    values.push(id)
    const { rows } = await this.pool.query(
      `UPDATE users
       SET ${sets.join(", ")}
       WHERE id = $${idx}
       RETURNING id, username, email, password_hash, created_at, password_changed_at`,
      values,
    )
    return rows[0]
  }

  async updatePasswordHash(
    id: number,
    passwordHash: string,
    passwordChangedAt: Date,
  ): Promise<User> {
    const { rows } = await this.pool.query(
      `UPDATE users
       SET password_hash = $1,
           password_changed_at = $2
       WHERE id = $3
       RETURNING id, username, email, password_hash, created_at, password_changed_at`,
      [passwordHash, passwordChangedAt, id],
    )
    return rows[0]
  }
}
