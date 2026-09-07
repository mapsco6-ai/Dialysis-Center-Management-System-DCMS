import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../prisma/prisma.service";
import { toAuthenticatedUser, USER_WITH_ROLES_INCLUDE } from "./auth.utils";

interface JwtPayload {
  sub: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? "dev-secret-change-me",
    });
  }

  // Runs on every authenticated request, so permission/role changes and
  // account deactivation take effect immediately (no stale JWT claims).
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: USER_WITH_ROLES_INCLUDE,
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    return toAuthenticatedUser(user);
  }
}
