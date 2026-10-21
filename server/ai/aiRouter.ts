/**
 * POST /api/ai/generate — the only way the app reaches Gemini (Phase 4).
 *
 *   Authorization: Bearer <Firebase ID token>
 *   Body: { model, contents, config?, billing: { feature, actionId } }
 *
 * Order of checks: proxy enabled → identity → per-user rate/concurrency limits →
 * duplicate in-flight request → AI kill switch (free users) → credits (charged BEFORE the
 * model call, transactional) or daily quota for included features → model call with
 * controlled retries/fallback → refund of the whole action if the call fails.
 */
import express, { Router } from "express";
import crypto from "crypto";
import { requireUser, getUser, type AuthOptions } from "../security/auth";
import { createRateLimiter } from "../security/rateLimit";
import { logError } from "../security/http";
import { CreditError, type CreditService } from "../credits/creditService";
import { generateWithFallback, GenerationError, TEXT_FALLBACK_MODELS, SPEECH_FALLBACK_MODELS, type GenAIClient } from "./generation";
import { AI_FEATURES, isAiFeature } from "../../src/shared/aiFeatures";

export interface AiLimits {
  perMinute: number;
  maxConcurrent: number;
  includedDailyQuota: number;
  maxAttempts: number;
  timeoutMs: number;
  bodyLimit: string;
}

export interface AiRouterOptions {
  enabled: boolean;
  auth: AuthOptions;
  createClient: () => GenAIClient;
  credits: Pick<CreditService, "consume" | "refund" | "recordIncludedUsage" | "getBalance">;
  /** stats/global.isAiSuspendedForFree (the admin kill switch), cached by the caller. */
  isAiSuspendedForFree: () => Promise<boolean>;
  /** Best-effort usage counters for the admin dashboard. */
  recordUsage?: (feature: string, billed: boolean) => void;
  limits: AiLimits;
  allowedModels?: string[];
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_AI_MODEL = "gemini-3-flash-preview";
export const DEFAULT_ALLOWED_MODELS = [...TEXT_FALLBACK_MODELS, ...SPEECH_FALLBACK_MODELS];

// Generation options the client may forward. Anything else is dropped.
const ALLOWED_CONFIG_KEYS = new Set([
  "systemInstruction", "responseMimeType", "responseSchema", "responseModalities", "speechConfig",
  "temperature", "topP", "topK", "maxOutputTokens",
]);

const ACTION_ID = /^[A-Za-z0-9_-]{8,128}$/;

const pickAllowedConfig = (config: unknown): Record<string, unknown> => {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  return Object.fromEntries(Object.entries(config as Record<string, unknown>).filter(([key]) => ALLOWED_CONFIG_KEYS.has(key)));
};

const validContents = (contents: unknown): contents is unknown[] =>
  Array.isArray(contents) && contents.length > 0 && contents.length <= 60 &&
  contents.every((c: any) => c && typeof c === "object" && Array.isArray(c.parts) && c.parts.length > 0 && c.parts.length <= 20);

const CREDIT_ERRORS: Record<string, [number, string]> = {
  INSUFFICIENT_CREDITS: [402, "INSUFFICIENT_CREDITS"],
  USER_NOT_FOUND: [404, "PROFILE_NOT_FOUND"],
  ACTION_LIMIT: [429, "ACTION_LIMIT"],
  ACTION_CLOSED: [409, "ACTION_CLOSED"],
  DAILY_QUOTA_EXCEEDED: [429, "DAILY_QUOTA_EXCEEDED"],
  INVALID_REQUEST_ID: [400, "INVALID_REQUEST"],
};

const GENERATION_ERRORS: Record<GenerationError["code"], number> = {
  AI_RATE_LIMITED: 429,
  AI_UPSTREAM_ERROR: 502,
  AI_INVALID_OUTPUT: 502,
  AI_TIMEOUT: 504,
};

export function createAiRouter(options: AiRouterOptions): Router {
  const router = Router();
  const allowedModels = new Set(options.allowedModels || DEFAULT_ALLOWED_MODELS);
  const inFlight = new Set<string>();
  const concurrent = new Map<string, number>();
  let client: GenAIClient | null = null;

  router.use(express.json({ limit: options.limits.bodyLimit }));

  router.use((_req, res, next) => {
    if (!options.enabled) return res.status(503).json({ error: "AI_PROXY_DISABLED" });
    next();
  });

  router.use(requireUser(options.auth));
  router.use(createRateLimiter({ windowMs: 60_000, max: options.limits.perMinute, key: (_req, res) => `ai:${getUser(res).uid}` }));

  router.post("/generate", async (req, res) => {
    const { uid } = getUser(res);
    const { model = DEFAULT_AI_MODEL, contents, config, billing } = req.body || {};

    if (typeof model !== "string" || !allowedModels.has(model)) return res.status(400).json({ error: "MODEL_NOT_ALLOWED" });
    if (!validContents(contents)) return res.status(400).json({ error: "INVALID_REQUEST" });
    if (!isAiFeature(billing?.feature) || typeof billing?.actionId !== "string" || !ACTION_ID.test(billing.actionId)) {
      return res.status(400).json({ error: "INVALID_BILLING" });
    }

    // Identical request already being processed for this user (double click / retry storm).
    const fingerprint = `${uid}:${crypto.createHash("sha256").update(JSON.stringify({ model, contents, config, billing })).digest("hex")}`;
    if (inFlight.has(fingerprint)) return res.status(409).json({ error: "DUPLICATE_REQUEST" });
    if ((concurrent.get(uid) || 0) >= options.limits.maxConcurrent) return res.status(429).json({ error: "TOO_MANY_CONCURRENT" });

    inFlight.add(fingerprint);
    concurrent.set(uid, (concurrent.get(uid) || 0) + 1);
    const feature = AI_FEATURES[billing.feature as keyof typeof AI_FEATURES];

    try {
      if (await options.isAiSuspendedForFree()) {
        const balance = await options.credits.getBalance(uid);
        if (!balance.planActive) return res.status(503).json({ error: "AI_SUSPENDED_FREE" });
      }

      let credits: number | undefined;
      if (feature.billing === "credit") {
        const result = await options.credits.consume(uid, billing.actionId, 1, billing.feature, { maxCalls: feature.maxCalls });
        credits = result.credits;
      } else {
        await options.credits.recordIncludedUsage(uid, billing.feature, options.limits.includedDailyQuota);
      }

      client = client || options.createClient();
      const { response, model: usedModel } = await generateWithFallback(client, {
        model,
        contents,
        config: pickAllowedConfig(config),
      }, {
        allowedModels,
        maxAttempts: options.limits.maxAttempts,
        timeoutMs: options.limits.timeoutMs,
        sleep: options.sleep,
      });

      options.recordUsage?.(billing.feature, feature.billing === "credit");
      res.json({
        text: typeof response?.text === "string" ? response.text : null,
        candidates: response?.candidates ?? [],
        usageMetadata: response?.usageMetadata ?? null,
        model: usedModel,
        credits: credits ?? null,
      });
    } catch (error) {
      if (error instanceof CreditError) {
        const [status, code] = CREDIT_ERRORS[error.code] || [400, error.code];
        return res.status(status).json({ error: code });
      }

      // The model call failed: the whole action is refunded (e.g. podcast audio failed).
      if (feature.billing === "credit") {
        await options.credits.refund(uid, billing.actionId).catch((refundError) => logError(`AI refund uid=${uid}`, refundError));
      }
      if (error instanceof GenerationError) {
        logError(`AI ${billing.feature} uid=${uid} attempts=${error.attempts}`, error);
        return res.status(GENERATION_ERRORS[error.code]).json({ error: error.code, refunded: feature.billing === "credit" });
      }
      logError(`AI ${billing.feature} uid=${uid}`, error);
      res.status(500).json({ error: "INTERNAL_ERROR", refunded: feature.billing === "credit" });
    } finally {
      inFlight.delete(fingerprint);
      const remaining = (concurrent.get(uid) || 1) - 1;
      if (remaining > 0) concurrent.set(uid, remaining);
      else concurrent.delete(uid);
    }
  });

  return router;
}
