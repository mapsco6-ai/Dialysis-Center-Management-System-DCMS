import { ConflictException, HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { toAuthenticatedUser, USER_WITH_ROLES_INCLUDE } from "./auth.utils";
import { LoginRateLimiterService } from "./login-rate-limiter.service";
import { SettingsService } from "../settings/settings.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly rateLimiter: LoginRateLimiterService,
    private readonly settings: SettingsService,
  ) {}

  async login(username: string, password: string) {
    const retryAfterSeconds = await this.rateLimiter.getRetryAfterSeconds(username);
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

    if (!user || !user.isActive || (user.expiresAt && user.expiresAt < new Date())) {
      await this.rateLimiter.recordFailure(username);
      throw new UnauthorizedException("Invalid username or password");
    }

    const passwordMatches = await argon2.verify(user.passwordHash, password);
    if (!passwordMatches) {
      await this.rateLimiter.recordFailure(username);
      throw new UnauthorizedException("Invalid username or password");
    }

    await this.rateLimiter.recordSuccess(username);

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
  async logout(user: AuthenticatedUser) {
    const status = await this.shiftReportStatus(user);
    if (status.missing) {
      throw new ConflictException({
        statusCode: 409,
        code: "SHIFT_REPORT_REQUIRED",
        message: "A shift report is required before signing out (submit one under Reports & actions).",
      });
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });
    return { success: true };
  }

  // When the super admin makes shift reports mandatory, anyone who did work
  // today (left any audit trace) must file one before signing out. Accounts
  // that cannot write entries, and SUPER_ADMIN, are exempt.
  async shiftReportStatus(user: AuthenticatedUser) {
    const required = await this.settings.get<boolean>("shiftReportRequired");
    if (!required || user.roles.includes("SUPER_ADMIN") || !user.permissions.includes("entry.create")) {
      return { required, missing: false };
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [worked, submitted] = await Promise.all([
      this.prisma.auditLog.count({ where: { actorId: user.id, createdAt: { gte: start } } }),
      this.prisma.staffEntry.count({ where: { authorId: user.id, type: "SHIFT_REPORT", createdAt: { gte: start } } }),
    ]);
    return { required, missing: worked > 0 && submitted === 0 };
  }

  // Bumps tokenVersion like logout: every session (including this one) must
  // sign in again with the new password.
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await argon2.hash(newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
    });
    return { success: true };
  }
}
