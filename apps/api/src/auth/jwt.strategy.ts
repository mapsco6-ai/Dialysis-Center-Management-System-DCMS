import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../prisma/prisma.service";
import { toAuthenticatedUser, USER_WITH_ROLES_INCLUDE } from "./auth.utils";

interface JwtPayload {
  sub: string;
  tokenVersion: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    // JWT_SECRET is guaranteed present and non-default by env.validation.ts
    // at bootstrap - no fallback here on purpose (see docs review DCMS-002).
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET as string,
    });
  }

  // Runs on every authenticated request, so permission/role changes and
  // account deactivation take effect immediately (no stale JWT claims).
  // tokenVersion mismatch means the user logged out (or was force-logged-out)
  // since this token was issued.
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: USER_WITH_ROLES_INCLUDE,
    });

    if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException();
    }

    return toAuthenticatedUser(user);
  }
}
