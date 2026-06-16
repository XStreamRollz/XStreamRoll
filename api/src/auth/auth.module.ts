import { Module } from "@nestjs/common"
import { CacheModule } from "@nestjs/cache-manager"
import { JwtModule } from "@nestjs/jwt"
import { AuthController } from "./auth.controller"
import { AuthService } from "./auth.service"
import { UsersRepository } from "./users.repository"
import { PasswordResetService } from "./password-reset.service"

const JWT_EXPIRES_IN = "15m"

@Module({
  imports: [
    CacheModule.register({
      ttl: 3600,
      max: 1024,
    }),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "dev-secret-change-me",
      signOptions: { expiresIn: JWT_EXPIRES_IN },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordResetService, UsersRepository],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
