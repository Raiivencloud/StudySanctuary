/**
 * Server-side Gemini proxy (PREPARED, NOT WIRED TO THE CLIENT YET).
 *
 * POST /api/ai/generate
 *   Authorization: Bearer <Firebase ID token>
 *   Body: { model: string, contents: GeminiContent[], config?: object }
 *
 * The Gemini API key lives only on the server. The router is disabled unless
 * AI_PROXY_ENABLED=true. Credits, quotas and per-user rate limits are NOT handled
 * here yet (Phase 4) — do not enable it in production before that.
 * See docs/PROPOSAL_AI_BACKEND.md.
 */
import express, { Router } from "express";
import { GoogleGenAI } from "@google/genai";

export interface GenAIClient {
  models: { generateContent(request: any): Promise<any> };
}

export interface AiProxyOptions {
  enabled: boolean;
  apiKey?: string;
  verifyIdToken: (token: string) => Promise<{ uid: string }>;
  createClient?: (apiKey: string) => GenAIClient;
  allowedModels?: string[];
  /** Max JSON body size (multimodal requests carry base64 files). */
  bodyLimit?: string;
}

// Models currently requested by the client (src/services/geminiService.ts and components).
export const DEFAULT_ALLOWED_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3-flash-preview-search",
  "gemini-3-flash-preview-tts",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.0-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
  "gemini-2.0-flash-lite-preview-02-05",
  "gemini-1.5-flash-8b-latest",
  "gemini-1.5-pro-latest",
];

// Generation options the client is allowed to forward. Anything else is dropped.
const ALLOWED_CONFIG_KEYS = new Set([
  "systemInstruction",
  "responseMimeType",
  "responseSchema",
  "responseModalities",
  "speechConfig",
  "temperature",
  "topP",
  "topK",
  "maxOutputTokens",
]);

const pickAllowedConfig = (config: unknown): Record<string, unknown> => {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  return Object.fromEntries(
    Object.entries(config as Record<string, unknown>).filter(([key]) => ALLOWED_CONFIG_KEYS.has(key))
  );
};

const defaultCreateClient = (apiKey: string): GenAIClient => new GoogleGenAI({ apiKey });

export function createAiProxyRouter(options: AiProxyOptions): Router {
  const router = Router();
  const allowedModels = new Set(options.allowedModels || DEFAULT_ALLOWED_MODELS);
  const createClient = options.createClient || defaultCreateClient;
  let client: GenAIClient | null = null;

  router.use(express.json({ limit: options.bodyLimit || "15mb" }));

  router.use((req, res, next) => {
    if (!options.enabled || !options.apiKey) {
      return res.status(503).json({ error: "AI_PROXY_DISABLED" });
    }
    next();
  });

  router.use(async (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }
    try {
      const decoded = await options.verifyIdToken(token);
      res.locals.uid = decoded.uid;
      next();
    } catch {
      res.status(401).json({ error: "UNAUTHENTICATED" });
    }
  });

  router.post("/generate", async (req, res) => {
    const { model, contents, config } = req.body || {};

    if (typeof model !== "string" || !allowedModels.has(model)) {
      return res.status(400).json({ error: "MODEL_NOT_ALLOWED" });
    }
    if (!Array.isArray(contents) || contents.length === 0) {
      return res.status(400).json({ error: "INVALID_CONTENTS" });
    }

    try {
      client = client || createClient(options.apiKey!);
      const response = await client.models.generateContent({
        model,
        contents,
        config: pickAllowedConfig(config),
      });

      res.json({
        text: response?.text ?? null,
        candidates: response?.candidates ?? [],
        usageMetadata: response?.usageMetadata ?? null,
      });
    } catch (error: any) {
      // Never echo upstream error bodies: they may include request details.
      const status = Number(error?.status || error?.code);
      console.error(`[AI Proxy] uid=${res.locals.uid} model=${model} failed:`, error?.message || error);
      res.status(status === 429 ? 429 : 502).json({ error: status === 429 ? "AI_RATE_LIMITED" : "AI_UPSTREAM_ERROR" });
    }
  });

  return router;
}
