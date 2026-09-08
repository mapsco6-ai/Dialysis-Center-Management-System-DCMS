import { Injectable } from "@nestjs/common";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

interface AttemptRecord {
  count: number;
  windowStartedAt: number;
}

// Keyed by username (not IP): a single-instance, in-memory guard is enough
// for now (no Redis/multi-replica need yet, per the review's own advice
// against introducing that infra prematurely). Scoping by username means a
// brute-force attempt against one account never locks out anyone else's.
// IP-based limiting would need a trusted-proxy decision (X-Forwarded-For) -
// deferred until there's an actual reverse proxy in front of this.
@Injectable()
export class LoginRateLimiterService {
  private readonly attempts = new Map<string, AttemptRecord>();

  private currentRecord(key: string): AttemptRecord | undefined {
    const record = this.attempts.get(key);
    if (!record) return undefined;
    if (Date.now() - record.windowStartedAt > WINDOW_MS) {
      this.attempts.delete(key);
      return undefined;
    }
    return record;
  }

  // Returns remaining seconds to wait if blocked, or null if the attempt may proceed.
  getRetryAfterSeconds(key: string): number | null {
    const record = this.currentRecord(key);
    if (!record || record.count < MAX_ATTEMPTS) return null;
    return Math.ceil((WINDOW_MS - (Date.now() - record.windowStartedAt)) / 1000);
  }

  recordFailure(key: string): void {
    const record = this.currentRecord(key);
    if (!record) {
      this.attempts.set(key, { count: 1, windowStartedAt: Date.now() });
      return;
    }
    record.count += 1;
  }

  recordSuccess(key: string): void {
    this.attempts.delete(key);
  }
}
