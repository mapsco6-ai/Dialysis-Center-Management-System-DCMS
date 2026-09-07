import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { toAuthenticatedUser, USER_WITH_ROLES_INCLUDE } from "./auth.utils";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: USER_WITH_ROLES_INCLUDE,
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid username or password");
    }

    const passwordMatches = await argon2.verify(user.passwordHash, password);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid username or password");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const authenticatedUser = toAuthenticatedUser(user);
    const accessToken = await this.jwtService.signAsync({ sub: user.id });

    return { accessToken, user: authenticatedUser };
  }
}
