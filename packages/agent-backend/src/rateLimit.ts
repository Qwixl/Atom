import type { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

/** In-memory sliding-window rate limiter (single-instance; sufficient for v1 fleet agents). */
export function createRateLimiter(windowMs: number, maxRequests: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = clientIp(req);
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (bucket.count >= maxRequests) {
      res.status(429).json({ error: "Too many requests — try again later" });
      return;
    }
    bucket.count += 1;
    next();
  };
}
