/**
 * Calls the model with controlled retries and model fallback (moved from the browser's
 * callGemini). A response only counts as successful if it is usable: non-empty text, valid
 * JSON when JSON was requested, or audio data for speech. Otherwise the caller refunds.
 */
export interface GenAIClient {
  models: { generateContent(request: any): Promise<any> };
}

export interface GenerateRequest {
  model: string;
  contents: unknown[];
  config: Record<string, unknown>;
}

export interface GenerationOptions {
  allowedModels: Set<string>;
  maxAttempts: number;
  timeoutMs: number;
  /** Injected in tests to avoid real waiting. */
  sleep?: (ms: number) => Promise<void>;
  baseDelayMs?: number;
}

export class GenerationError extends Error {
  constructor(readonly code: "AI_RATE_LIMITED" | "AI_UPSTREAM_ERROR" | "AI_INVALID_OUTPUT" | "AI_TIMEOUT", readonly attempts: number) {
    super(code);
    this.name = "GenerationError";
  }
}

// Order of the previous client-side cascade (src/services/geminiService.ts before Phase 4).
export const TEXT_FALLBACK_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3-flash-preview-search",
  "gemini-2.0-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
  "gemini-2.0-flash-lite-preview-02-05",
  "gemini-1.5-flash-8b-latest",
  "gemini-1.5-pro-latest",
];
export const SPEECH_FALLBACK_MODELS = ["gemini-3-flash-preview-tts", "gemini-2.5-flash-preview-tts"];

export const isSpeechRequest = (config: Record<string, unknown>) =>
  Array.isArray(config.responseModalities) && config.responseModalities.includes("AUDIO");

/** Same tolerance as the client's extractJSON: plain JSON, ```json fences or the outer [...] / {...}. */
export function containsJson(text: string): boolean {
  const attempts = [text.trim()];
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (fenced) attempts.push(fenced[1]);
  const start = [text.indexOf("["), text.indexOf("{")].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  const end = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"));
  if (start !== undefined && end > start) attempts.push(text.slice(start, end + 1));
  return attempts.some((candidate) => {
    try {
      JSON.parse(candidate);
      return true;
    } catch {
      return false;
    }
  });
}

function usable(response: any, config: Record<string, unknown>): boolean {
  if (isSpeechRequest(config)) {
    return Boolean(response?.candidates?.[0]?.content?.parts?.some((p: any) => p?.inlineData?.data));
  }
  const text = typeof response?.text === "string" ? response.text : "";
  if (!text.trim()) return false;
  return config.responseMimeType === "application/json" ? containsJson(text) : true;
}

const statusOf = (error: any) => Number(error?.status ?? error?.code ?? error?.error?.code) || 0;
const messageOf = (error: any) => String(error?.message || error?.error?.message || "").toLowerCase();

const isModelUnavailable = (error: any) =>
  statusOf(error) === 404 || /not found|requested entity|not supported|unknown model/.test(messageOf(error));

const isTransient = (error: any) =>
  [429, 500, 503, 504].includes(statusOf(error)) || /unavailable|overloaded|high demand|temporar|resource_exhausted|deadline/.test(messageOf(error));

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("deadline exceeded"), { status: 504, timeout: true })), ms);
    }),
  ]);
}

export async function generateWithFallback(client: GenAIClient, request: GenerateRequest, options: GenerationOptions) {
  const sleep = options.sleep || ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const baseDelay = options.baseDelayMs ?? 800;
  const fallbacks = isSpeechRequest(request.config) ? SPEECH_FALLBACK_MODELS : TEXT_FALLBACK_MODELS;
  const models = [request.model, ...fallbacks].filter((m, i, all) => m && all.indexOf(m) === i && options.allowedModels.has(m));

  let attempts = 0;
  let lastError: any = null;
  let sawInvalidOutput = false;
  let sawRateLimit = false;

  for (const model of models) {
    for (let retry = 0; retry < 2 && attempts < options.maxAttempts; retry++) {
      attempts++;
      try {
        const response = await withTimeout(client.models.generateContent({ model, contents: request.contents, config: request.config }), options.timeoutMs);
        if (usable(response, request.config)) return { response, model, attempts };
        sawInvalidOutput = true;
        lastError = new Error("invalid output");
      } catch (error: any) {
        lastError = error;
        if (statusOf(error) === 429) sawRateLimit = true;
        if (isModelUnavailable(error)) break; // next model
        if (!isTransient(error)) {
          throw new GenerationError("AI_UPSTREAM_ERROR", attempts);
        }
      }
      if (attempts < options.maxAttempts) await sleep(baseDelay * 2 ** retry);
    }
    if (attempts >= options.maxAttempts) break;
  }

  if (lastError?.timeout) throw new GenerationError("AI_TIMEOUT", attempts);
  if (sawRateLimit) throw new GenerationError("AI_RATE_LIMITED", attempts);
  throw new GenerationError(sawInvalidOutput ? "AI_INVALID_OUTPUT" : "AI_UPSTREAM_ERROR", attempts);
}
