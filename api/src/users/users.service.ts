import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import * as bcrypt from "bcrypt"

import { AuditAction } from "../audit/audit-action.enum"
import { AuditService } from "../audit/audit.service"
import { SafeUser, toSafeUser } from "../auth/auth.service"
import { TokenDenylistService } from "../auth/token-denylist.service"
import { User, UsersRepository } from "../auth/users.repository"
import { ChangePasswordDto } from "./dto/change-password.dto"
import { UpdateProfileDto } from "./dto/update-profile.dto"

const BCRYPT_ROUNDS = 12

export interface ProfileResponse {
  user: SafeUser
  accessToken?: string
}

@Injectable()
export class UsersService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersRepository: UsersRepository,
    private readonly tokenDenylistService: TokenDenylistService,
    private readonly auditService: AuditService,
  ) {}

  async getProfile(userId: number): Promise<SafeUser> {
    const user = await this.usersRepository.findById(userId)
    if (!user) {
      throw new UnauthorizedException("user not found")
    }
    return toSafeUser(user)
  }

  async updateProfile(
    userId: number,
    dto: UpdateProfileDto,
    authorizationHeader: string,
  ): Promise<ProfileResponse> {
    const user = await this.usersRepository.findById(userId)
    if (!user) {
      throw new UnauthorizedException("user not found")
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.usersRepository.findByEmail(dto.email)
      if (existing) {
        throw new ConflictException("email is already in use")
      }
    }

    if (dto.username && dto.username !== user.username) {
      const existing = await this.usersRepository.findByUsername(dto.username)
      if (existing) {
        throw new ConflictException("username is already taken")
      }
    }

    const updated = await this.usersRepository.updateProfile(userId, dto)

    const emailChanged = dto.email && dto.email !== user.email
    let accessToken: string | undefined

    if (emailChanged) {
      const token = this.extractBearerToken(authorizationHeader)
      await this.tokenDenylistService.revoke(token, 3600)

      accessToken = this.signToken(updated)
    }

    return {
      user: toSafeUser(updated),
      accessToken,
    }
  }

  async changePassword(
    userId: number,
    dto: ChangePasswordDto,
    authorizationHeader: string,
  ): Promise<ProfileResponse> {
    const user = await this.usersRepository.findById(userId)
    if (!user) {
      throw new UnauthorizedException("user not found")
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.password_hash)
    if (!valid) {
      throw new UnauthorizedException("current password is incorrect")
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS)
    const updated = await this.usersRepository.updatePasswordHash(
      userId,
      passwordHash,
      new Date(),
    )

    const token = this.extractBearerToken(authorizationHeader)
    await this.tokenDenylistService.revoke(token, 3600)

    return {
      user: toSafeUser(updated),
      accessToken: this.signToken(updated),
    }
  }

  private signToken(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      username: user.username,
      passwordChangedAt:
        user.password_changed_at?.getTime() ?? user.created_at.getTime(),
    })
  }

  /**
   * Soft-delete the authenticated user's account (issue #344).
   * Revokes their current token and logs the deletion to the audit trail.
   */
  async deleteAccount(
    userId: number,
    authorizationHeader: string,
    ip: string,
  ): Promise<void> {
    const user = await this.usersRepository.findById(userId)
    if (!user) {
      throw new UnauthorizedException("user not found")
    }

    const deleted = await this.usersRepository.softDelete(userId)
    if (!deleted) {
      throw new NotFoundException("user not found")
    }

    // Revoke the current access token so it cannot be reused
    const token = this.extractBearerToken(authorizationHeader)
    await this.tokenDenylistService.revoke(token, 3600)

    await this.auditService.log(
      userId,
      AuditAction.USER_DELETED,
      { email: user.email, username: user.username },
      ip,
    )
  }

  private extractBearerToken(header: string): string {
    const match = header.trim().match(/^Bearer\s+(.+)$/i)
    if (!match) {
      throw new UnauthorizedException(
        "Authorization header must contain a Bearer token",
      )
    }
    return match[1]
  }
}
