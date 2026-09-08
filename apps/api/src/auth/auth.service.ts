import { HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { toAuthenticatedUser, USER_WITH_ROLES_INCLUDE } from "./auth.utils";
import { LoginRateLimiterService } from "./login-rate-limiter.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly rateLimiter: LoginRateLimiterService,
  ) {}

  async login(username: string, password: string) {
    const retryAfterSeconds = this.rateLimiter.getRetryAfterSeconds(username);
    if (retryAfterSeconds !== null) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many failed login attempts. Try again in ${retryAfterSeconds}s.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { username },
      include: USER_WITH_ROLES_INCLUDE,
    });

    if (!user || !user.isActive) {
      this.rateLimiter.recordFailure(username);
      throw new UnauthorizedException("Invalid username or password");
    }

    const passwordMatches = await argon2.verify(user.passwordHash, password);
    if (!passwordMatches) {
      this.rateLimiter.recordFailure(username);
      throw new UnauthorizedException("Invalid username or password");
    }

    this.rateLimiter.recordSuccess(username);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const authenticatedUser = toAuthenticatedUser(user);
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      tokenVersion: user.tokenVersion,
    });

    return { accessToken, user: authenticatedUser };
  }

  // Bumping tokenVersion invalidates every outstanding JWT for this user
  // immediately (see JwtStrategy), not just the one used to call this -
  // the right default for a shared-workstation clinical setting.
  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    return { success: true };
  }
}
