/**
 * Credits API for the client (Phase 4). The server is the only authority:
 *   GET  /api/credits        balance (applies the daily refill, plan expiration and credit expiry)
 *   POST /api/credits/trial  7-day free trial, once per account
 *   POST /api/credits/spend  spend 1 credit on a non-AI action (Arena cooldown skip)
 * Paid plans are never activated here: only by a verified payment (Phase 5 webhook).
 */
import { Router } from "express";
import { requireUser, getUser, type AuthOptions } from "../security/auth";
import { createRateLimiter } from "../security/rateLimit";
import { logError } from "../security/http";
import { CreditError, type CreditService } from "../credits/creditService";

export interface CreditsRouterOptions {
  auth: AuthOptions;
  credits: Pick<CreditService, "getBalance" | "startFreeTrial" | "consume" | "expireIfDue">;
}

// Non-AI actions that cost one credit (AI actions are charged by /api/ai/generate).
export const SPEND_REASONS = new Set(["arena_cooldown"]);

const ERRORS: Record<string, number> = {
  INSUFFICIENT_CREDITS: 402,
  TRIAL_ALREADY_USED: 409,
  USER_NOT_FOUND: 404,
  ACTION_LIMIT: 409,
  ACTION_CLOSED: 409,
  INVALID_REQUEST_ID: 400,
};

export function createCreditsRouter(options: CreditsRouterOptions): Router {
  const router = Router();
  router.use(requireUser(options.auth));
  router.use(createRateLimiter({ windowMs: 60_000, max: 60, key: (_req, res) => `credits:${getUser(res).uid}` }));

  const fail = (res: any, error: unknown, context: string) => {
    if (error instanceof CreditError) {
      return res.status(ERRORS[error.code] || 400).json({ error: error.code === "USER_NOT_FOUND" ? "PROFILE_NOT_FOUND" : error.code });
    }
    logError(context, error);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  };

  router.get("/", async (_req, res) => {
    const { uid } = getUser(res);
    try {
      await options.credits.expireIfDue(uid);
      const balance = await options.credits.getBalance(uid);
      res.json({
        credits: balance.credits,
        subscriptionStatus: balance.subscriptionType,
        hasUsedFreeTrial: balance.hasUsedFreeTrial,
        planActive: balance.planActive,
        // Next credits that expire (trial or plan), for the advance notice
        expiring: balance.expiring,
      });
    } catch (error) {
      fail(res, error, `Credits balance uid=${uid}`);
    }
  });

  router.post("/trial", async (_req, res) => {
    const { uid } = getUser(res);
    try {
      const balance = await options.credits.startFreeTrial(uid);
      res.json({ credits: balance.credits, subscriptionStatus: balance.subscriptionType, hasUsedFreeTrial: true });
    } catch (error) {
      fail(res, error, `Credits trial uid=${uid}`);
    }
  });

  router.post("/spend", async (req, res) => {
    const { uid } = getUser(res);
    const { reason, actionId } = req.body || {};
    if (typeof reason !== "string" || !SPEND_REASONS.has(reason)) return res.status(400).json({ error: "INVALID_REASON" });
    try {
      const result = await options.credits.consume(uid, String(actionId || ""), 1, reason);
      res.json({ credits: result.credits });
    } catch (error) {
      fail(res, error, `Credits spend uid=${uid}`);
    }
  });

  return router;
}
