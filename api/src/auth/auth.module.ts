import { Module } from "@nestjs/common"
import { CacheModule } from "@nestjs/cache-manager"
import { JwtModule } from "@nestjs/jwt"
import createJwtConfig, { JWT_ACCESS_TOKEN_EXPIRES_IN } from "../config/jwt.config"
import { AuthController } from "./auth.controller"
import { AuthService } from "./auth.service"
import { TokenDenylistService } from "./token-denylist.service"
import { UsersRepository } from "./users.repository"
import { PasswordResetService } from "./password-reset.service"
import { AuditModule } from "../audit/audit.module"

@Module({
  imports: [
    AuditModule,
    CacheModule.register({
      ttl: 3600,
      max: 1024,
    }),
    JwtModule.registerAsync({
      useFactory: () => createJwtConfig(JWT_ACCESS_TOKEN_EXPIRES_IN),
    }),
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
