import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { LoginRateLimiterService } from "./login-rate-limiter.service";

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      // JWT_SECRET is guaranteed present and non-default by env.validation.ts
      // at bootstrap - no fallback here on purpose (see docs review DCMS-002).
      secret: process.env.JWT_SECRET as string,
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? "8h") as `${number}h` },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LoginRateLimiterService],
  exports: [AuthService],
})
export class AuthModule {}
