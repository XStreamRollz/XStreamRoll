import { Module } from "@nestjs/common"
import { CacheModule } from "@nestjs/cache-manager"
import { JwtModule } from "@nestjs/jwt"
import createJwtConfig from "../config/jwt.config"
import { AuthController } from "./auth.controller"
import { AuthService } from "./auth.service"
import { TokenDenylistService } from "./token-denylist.service"
import { UsersRepository } from "./users.repository"
import { PasswordResetService } from "./password-reset.service"

const JWT_EXPIRES_IN = "15m"

@Module({
  imports: [
    CacheModule.register({
      ttl: 3600,
      max: 1024,
    }),
    JwtModule.registerAsync({
      useFactory: () => createJwtConfig(JWT_EXPIRES_IN),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenDenylistService,
    PasswordResetService,
    UsersRepository,
  ],
  exports: [AuthService, JwtModule, TokenDenylistService],
})
export class AuthModule {}
