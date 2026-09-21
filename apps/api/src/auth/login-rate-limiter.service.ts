import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

// Keyed by username (not IP): a brute-force attempt against one account never
// locks out anyone else's. Attempts live in the database (login_attempts) so
// a restart does not reset the lockout and several API instances share it.
// IP-based limiting still needs a trusted-proxy decision (X-Forwarded-For).
@Injectable()
export class LoginRateLimiterService {
  constructor(private readonly prisma: PrismaService) {}

  private key(username: string) {
    return username.trim().toLowerCase();
  }

  // Returns remaining seconds to wait if blocked, or null if the attempt may proceed.
  async getRetryAfterSeconds(username: string): Promise<number | null> {
    const since = new Date(Date.now() - WINDOW_MS);
    const attempts = await this.prisma.loginAttempt.findMany({
      where: { username: this.key(username), createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    if (attempts.length < MAX_ATTEMPTS) return null;
    return Math.ceil((attempts[0].createdAt.getTime() + WINDOW_MS - Date.now()) / 1000);
  }

  async recordFailure(username: string): Promise<void> {
    await this.prisma.loginAttempt.create({ data: { username: this.key(username) } });
    // Opportunistic cleanup keeps the table tiny.
    await this.prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - WINDOW_MS) } } });
  }

  async recordSuccess(username: string): Promise<void> {
    await this.prisma.loginAttempt.deleteMany({ where: { username: this.key(username) } });
  }
}
