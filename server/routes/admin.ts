/**
 * Admin API: every route requires a verified Firebase ID token with admin rights
 * (custom claim `admin: true` or a verified email in ADMIN_EMAILS).
 */
import { Router } from "express";
import crypto from "crypto";
import { requireAdmin, getUser, type AuthOptions } from "../security/auth";
import { createRateLimiter } from "../security/rateLimit";
import { logError } from "../security/http";

/** Subset of the Firestore Admin API used here (allows fakes in tests). */
export interface AdminDb {
  collection(name: string): {
    get(): Promise<{ size: number; forEach(cb: (doc: { data(): any }) => void): void }>;
    doc(id: string): {
      get(): Promise<{ data(): any }>;
      set(data: Record<string, unknown>, options: { merge: boolean }): Promise<unknown>;
    };
  };
}

export interface RuntimeStats {
  activeUsers: number;
  requestHistory: readonly number[];
  totalRequestsToday: number;
  historyWindowMs: number;
}

export interface AdminRouterOptions {
  auth: AuthOptions;
  adminSecretKey?: string;
  db: AdminDb;
  getRuntimeStats: () => RuntimeStats;
}

/** Constant-time comparison that does not leak the key length. */
export function secretsMatch(received: unknown, expected: string | undefined): boolean {
  if (!expected || typeof received !== "string" || !received) return false;
  const a = crypto.createHash("sha256").update(received).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function createAdminRouter(options: AdminRouterOptions): Router {
  const router = Router();
  router.use(requireAdmin(options.auth));

  router.get("/stats", async (req, res) => {
    try {
      const now = Date.now();
      const runtime = options.getRuntimeStats();

      // 1. Subscription Stats
      const usersSnapshot = await options.db.collection('users').get();
      const stats = {
        total: usersSnapshot.size,
        free: 0,
        mensual: 0,
        trimestral: 0,
        anual: 0,
        activeSubscribers: 0
      };

      usersSnapshot.forEach(doc => {
        const data = doc.data();
        const sub = data.subscription;
        if (sub && sub.status === 'active') {
          stats.activeSubscribers++;
          if (sub.type === 'mensual') stats.mensual++;
          else if (sub.type === 'trimestral') stats.trimestral++;
          else if (sub.type === 'anual') stats.anual++;
        } else {
          stats.free++;
        }
      });

      // 2. Credit Consumption (Last 24h)
      const statsDoc = await options.db.collection('stats').doc('global').get();
      const statsData = statsDoc.data() || {};
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const creditsToday = statsData[`credits_${today}`] || 0;
      const creditsYesterday = statsData[`credits_${yesterday}`] || 0;
      const totalCreditsConsumed = creditsToday + creditsYesterday; // Approximate 24h
      const isAiSuspendedForFree = statsData.isAiSuspendedForFree || false;

      // 3. Request History (Bucketed by minute for the last hour)
      const bucketSize = 60 * 1000; // 1 minute
      const buckets: Record<number, number> = {};
      const oneHourAgo = now - runtime.historyWindowMs;

      // Initialize buckets
      for (let i = 0; i < 60; i++) {
        const bucketTime = Math.floor((oneHourAgo + i * bucketSize) / bucketSize) * bucketSize;
        buckets[bucketTime] = 0;
      }

      runtime.requestHistory.forEach(timestamp => {
        const bucketTime = Math.floor(timestamp / bucketSize) * bucketSize;
        if (buckets[bucketTime] !== undefined) {
          buckets[bucketTime]++;
        }
      });

      const requestGraphData = Object.entries(buckets)
        .map(([time, count]) => ({ time: parseInt(time), count }))
        .sort((a, b) => a.time - b.time);

      // Estimated cost calculation ($0.0001 per request as a safe average)
      const estimatedCost = runtime.totalRequestsToday * 0.0001;

      res.json({
        activeUsers: runtime.activeUsers,
        subscriptionStats: stats,
        creditsConsumed24h: totalCreditsConsumed,
        requestGraphData,
        totalRequestsToday: runtime.totalRequestsToday,
        estimatedCost,
        isAiSuspendedForFree,
        serverTime: now
      });
    } catch (error) {
      logError("Admin stats", error);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  });

  const keyAttemptsLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    key: (_req, res) => `admin-key:${getUser(res).uid}`,
  });

  router.post("/verify-key", keyAttemptsLimiter, (req, res) => {
    if (!options.adminSecretKey) {
      return res.status(503).json({ error: "ADMIN_KEY_NOT_CONFIGURED" });
    }
    if (secretsMatch(req.body?.key, options.adminSecretKey)) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: "Invalid Admin Key" });
    }
  });

  const toggleLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    key: (_req, res) => `admin-toggle:${getUser(res).uid}`,
  });

  router.post("/toggle-ai", toggleLimiter, async (req, res) => {
    const { key, suspend } = req.body || {};

    // Fails closed: a missing ADMIN_SECRET_KEY no longer authorizes everyone.
    if (!secretsMatch(key, options.adminSecretKey)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (typeof suspend !== "boolean") {
      return res.status(400).json({ error: "INVALID_REQUEST" });
    }

    try {
      await options.db.collection('stats').doc('global').set({
        isAiSuspendedForFree: suspend
      }, { merge: true });

      res.json({ success: true, isAiSuspendedForFree: suspend });
    } catch (error) {
      logError("Admin toggle-ai", error);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  });

  return router;
}
