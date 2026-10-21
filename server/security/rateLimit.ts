/**
 * Minimal fixed-window rate limiter kept in memory.
 * Valid while Cloud Run runs a single instance (maxScale: 1); with more instances
 * it must move to a shared store (Redis/Firestore).
 */
import type { Request, Response, RequestHandler } from "express";

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Returns the bucket key, or null to skip limiting this request. */
  key: (req: Request, res: Response) => string | null;
  now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();
  const now = options.now || Date.now;
  let nextSweep = now() + options.windowMs;

  return (req, res, next) => {
    const key = options.key(req, res);
    if (key === null) return next();

    const current = now();
    if (current >= nextSweep) {
      for (const [k, bucket] of buckets) {
        if (bucket.resetAt <= current) buckets.delete(k);
      }
      nextSweep = current + options.windowMs;
    }

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= current) {
      bucket = { count: 0, resetAt: current + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;

    if (bucket.count > options.max) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - current) / 1000))));
      return res.status(429).json({ error: "RATE_LIMITED" });
    }
    next();
  };
}

export const ipKey = (req: Request) => `ip:${req.ip || req.socket.remoteAddress || "unknown"}`;
