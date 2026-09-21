import type { NextFunction, Request, Response } from "express";

// Coarse per-IP flood guard for the whole API (login has its own per-account
// lockout). Fixed window, in memory - per instance; put a shared limiter at
// the reverse proxy when running several replicas.
export function ipRateLimit(limit = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 600), windowMs = 60_000) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
  }, windowMs);
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (++entry.count > limit) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ statusCode: 429, message: "Too many requests" });
    }
    next();
  };
}
