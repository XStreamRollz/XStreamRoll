import { Module } from "@nestjs/common"
import { CacheModule } from "@nestjs/cache-manager"
import { JwtModule } from "@nestjs/jwt"
import { cacheConfig } from "../config/cache.config"
import { createJwtConfig, createRefreshJwtConfig, JWT_ACCESS_TOKEN_EXPIRES_IN } from "../config/jwt.config"
import { AuthController } from "./auth.controller"
import { AuthService } from "./auth.service"
import { TokenDenylistService } from "./token-denylist.service"
import { UsersRepository } from "./users.repository"
import { PasswordResetService } from "./password-reset.service"
import { AuditModule } from "../audit/audit.module"

@Module({
  imports: [
    AuditModule,
    CacheModule.register(cacheConfig()),
    JwtModule.registerAsync({
      useFactory: () => createJwtConfig(JWT_ACCESS_TOKEN_EXPIRES_IN),
    }),
    JwtModule.registerAsync({
      name: "JWT_REFRESH",
      useFactory: () => createRefreshJwtConfig(),
    } as any),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenDenylistService,
    PasswordResetService,
    UsersRepository,
  ],
  exports: [AuthService, JwtModule, TokenDenylistService, UsersRepository],
})
export class AuthModule {}
