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
  deleted_at?: Date | null
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
      "SELECT id, username, email, password_hash, created_at, password_changed_at, deleted_at FROM users WHERE email = $1 AND deleted_at IS NULL",
      [email],
    )
    return rows[0] ?? null
  }

  async findByUsername(username: string): Promise<User | null> {
    const { rows } = await this.pool.query(
      "SELECT id, username, email, password_hash, created_at, password_changed_at, deleted_at FROM users WHERE username = $1 AND deleted_at IS NULL",
      [username],
    )
    return rows[0] ?? null
  }

  async findById(id: number): Promise<User | null> {
    const { rows } = await this.pool.query(
      "SELECT id, username, email, password_hash, created_at, password_changed_at, deleted_at FROM users WHERE id = $1 AND deleted_at IS NULL",
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
       WHERE id = $3 AND deleted_at IS NULL
       RETURNING id, username, email, password_hash, created_at, password_changed_at, deleted_at`,
      [passwordHash, passwordChangedAt, id],
    )
    return rows[0]
  }

  /**
   * Soft-delete a user by setting deleted_at (issue #344).
   * Returns the soft-deleted user row or null if the user was not
   * found or was already deleted.
   */
  async softDelete(id: number): Promise<User | null> {
    const { rows } = await this.pool.query(
      `UPDATE users
       SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, username, email, password_hash, created_at, password_changed_at, deleted_at`,
      [id],
    )
    return rows[0] ?? null
  }
}
