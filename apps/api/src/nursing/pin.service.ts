import { Injectable, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { LoginRateLimiterService } from "../auth/login-rate-limiter.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";

// A 4-6 digit PIN has far fewer combinations than a real password, so it
// needs the same brute-force guard as login - keyed separately (pin:<user>)
// so PIN and password lockouts never interact.
const PIN_RATE_LIMIT_PREFIX = "pin:";

@Injectable()
export class PinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimiter: LoginRateLimiterService,
  ) {}

  async setMyPin(actor: AuthenticatedUser, pin: string) {
    const pinHash = await argon2.hash(pin);
    await this.prisma.user.update({ where: { id: actor.id }, data: { pinHash } });
    return { ok: true };
  }

  async verify(username: string, pin: string) {
    const key = PIN_RATE_LIMIT_PREFIX + username;
    const retryAfter = this.rateLimiter.getRetryAfterSeconds(key);
    if (retryAfter !== null) {
      throw new UnauthorizedException(`Too many PIN attempts - try again in ${retryAfter}s`);
    }

    const user = await this.prisma.user.findUnique({ where: { username } });
    // Same generic message whether the username or PIN is wrong, and
    // whether or not a PIN has ever been set - never reveal which part
    // failed (same reasoning as password login).
    if (!user || !user.isActive || !user.pinHash || !(await argon2.verify(user.pinHash, pin))) {
      this.rateLimiter.recordFailure(key);
      throw new UnauthorizedException("Invalid username or PIN");
    }

    this.rateLimiter.recordSuccess(key);
    return { id: user.id, username: user.username, fullName: user.fullName };
  }
}
