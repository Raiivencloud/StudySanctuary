/**
 * Server configuration loaded from environment variables.
 * Pure module (no side effects) so it can be unit-tested.
 */
import crypto from "crypto";

type Env = Record<string, string | undefined>;
export type SameSite = "none" | "lax" | "strict";

export interface ServerConfig {
  isProduction: boolean;
  /** Public app URL without trailing slash ("" when not configured). */
  appUrl: string;
  /** Number of reverse-proxy hops to trust (Cloud Run: 1). 0 = disabled. */
  trustProxy: number;
  firebase: {
    projectId: string;
    storageBucket?: string;
    /** Firestore database used by the Admin SDK. Undefined = "(default)" (previous behavior). */
    databaseId?: string;
  };
  session: {
    secret: string;
    /** True when a random per-process secret was generated (development only). */
    ephemeral: boolean;
    cookieSecure: boolean;
    cookieSameSite: SameSite;
    maxAgeMs: number;
  };
  admin: {
    /** Lower-cased emails allowed as admin when the ID token has email_verified. */
    emails: string[];
    secretKey?: string;
  };
  uploads: {
    maxBytes: number;
  };
  rateLimit: {
    apiPerMinute: number;
  };
  storage: {
    /** Rewrite the bucket CORS policy on startup (previous behavior). Off by default. */
    corsOnStartup: boolean;
  };
  csp: {
    /** "report-only" (default: reports, never blocks) or "off". */
    mode: "report-only" | "off";
    firebaseAuthDomain?: string;
  };
  ai: {
    /** Server-side Gemini proxy (/api/ai/*). Disabled by default. */
    proxyEnabled: boolean;
    /** "gemini" (real API, needs GEMINI_API_KEY) or "fake" (development only, no cost). */
    provider: "gemini" | "fake";
    geminiApiKey?: string;
    perMinute: number;
    maxConcurrent: number;
    includedDailyQuota: number;
    maxAttempts: number;
    timeoutMs: number;
  };
  payments: {
    /** "mercadopago" (MERCADOPAGO_ACCESS_TOKEN), "fake" (simulated, development only) or "disabled". */
    mode: "mercadopago" | "fake" | "disabled";
    accessToken?: string;
    /** Webhook signature secret (required in production). */
    webhookSecret?: string;
    /** Accept test payments (live_mode false). Always in development; in production only with MERCADOPAGO_ALLOW_TEST_PAYMENTS=true. */
    allowTestPayments: boolean;
  };
}

export class ConfigError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(
      `Configuración del servidor inválida:\n${problems.map((p) => `  - ${p}`).join("\n")}\n` +
      "Ver .env.example y docs/CONFIGURATION.md."
    );
    this.name = "ConfigError";
    this.problems = problems;
  }
}

const read = (env: Env, key: string): string => (env[key] || "").trim();

const MIN_SESSION_SECRET_LENGTH = 32;
const DEFAULT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

function readPositiveInt(env: Env, key: string, fallback: number, problems: string[], { allowZero = false } = {}): number {
  const raw = read(env, key);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || (!allowZero && value === 0)) {
    problems.push(`${key} debe ser un entero ${allowZero ? "mayor o igual a 0" : "positivo"} (valor recibido inválido).`);
    return fallback;
  }
  return value;
}

export function loadServerConfig(env: Env = process.env): ServerConfig {
  const problems: string[] = [];
  const isProduction = read(env, "NODE_ENV") === "production";

  // Firebase project: explicit server var, then Cloud Run's project, then the public web config value.
  const projectId =
    read(env, "FIREBASE_PROJECT_ID") ||
    read(env, "GOOGLE_CLOUD_PROJECT") ||
    read(env, "VITE_FIREBASE_PROJECT_ID");
  if (!projectId) {
    problems.push("Falta FIREBASE_PROJECT_ID (ID del proyecto de Firebase/Google Cloud).");
  }

  const storageBucket =
    read(env, "FIREBASE_STORAGE_BUCKET") || read(env, "VITE_FIREBASE_STORAGE_BUCKET") || undefined;
  const databaseId = read(env, "FIREBASE_DATABASE_ID") || undefined;

  let sessionSecret = read(env, "SESSION_SECRET");
  let ephemeral = false;
  if (!sessionSecret) {
    if (isProduction) {
      problems.push("Falta SESSION_SECRET (obligatoria en producción; generar con: openssl rand -hex 32).");
    } else {
      sessionSecret = crypto.randomBytes(32).toString("hex");
      ephemeral = true;
    }
  } else if (isProduction && sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    problems.push(`SESSION_SECRET debe tener al menos ${MIN_SESSION_SECRET_LENGTH} caracteres en producción.`);
  }

  // SameSite=None requires Secure, which only works over HTTPS (production).
  const sameSiteRaw = read(env, "SESSION_COOKIE_SAMESITE").toLowerCase();
  let cookieSameSite: SameSite = isProduction ? "none" : "lax";
  if (sameSiteRaw) {
    if (sameSiteRaw === "none" || sameSiteRaw === "lax" || sameSiteRaw === "strict") {
      cookieSameSite = sameSiteRaw;
    } else {
      problems.push("SESSION_COOKIE_SAMESITE debe ser none, lax o strict.");
    }
  }
  if (cookieSameSite === "none" && !isProduction) {
    cookieSameSite = "lax";
  }
  const sessionMaxAgeHours = readPositiveInt(env, "SESSION_MAX_AGE_HOURS", 24, problems);

  const trustProxy = readPositiveInt(env, "TRUST_PROXY", isProduction ? 1 : 0, problems, { allowZero: true });

  const adminEmails = read(env, "ADMIN_EMAILS")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const adminSecretKey = read(env, "ADMIN_SECRET_KEY") || undefined;

  const uploadMaxBytes = readPositiveInt(env, "UPLOAD_MAX_BYTES", DEFAULT_UPLOAD_MAX_BYTES, problems);
  const apiPerMinute = readPositiveInt(env, "RATE_LIMIT_API_PER_MINUTE", 300, problems);

  const cspRaw = read(env, "CSP_MODE").toLowerCase() || "report-only";
  if (cspRaw !== "report-only" && cspRaw !== "off") {
    problems.push("CSP_MODE debe ser report-only u off (el modo que bloquea se habilitará después de revisar los reportes).");
  }

  const proxyEnabled = read(env, "AI_PROXY_ENABLED") === "true";
  const geminiApiKey = read(env, "GEMINI_API_KEY") || undefined;
  const providerRaw = read(env, "AI_PROVIDER").toLowerCase() || "gemini";
  if (providerRaw !== "gemini" && providerRaw !== "fake") {
    problems.push("AI_PROVIDER debe ser gemini o fake.");
  }
  const provider: "gemini" | "fake" = providerRaw === "fake" ? "fake" : "gemini";
  if (provider === "fake" && isProduction) {
    problems.push("AI_PROVIDER=fake (respuestas simuladas) no está permitido en producción.");
  }
  if (proxyEnabled && provider === "gemini" && !geminiApiKey) {
    problems.push("AI_PROXY_ENABLED=true requiere GEMINI_API_KEY (clave de servidor, nunca VITE_*).");
  }
  // Credits are charged in the server's database: it must be the one the app reads.
  const clientDatabase = read(env, "VITE_FIREBASE_FIRESTORE_DATABASE_ID") || "(default)";
  const serverDatabase = databaseId || "(default)";
  if (proxyEnabled && read(env, "VITE_FIREBASE_FIRESTORE_DATABASE_ID") && clientDatabase !== serverDatabase) {
    problems.push(
      `FIREBASE_DATABASE_ID ("${serverDatabase}") no coincide con VITE_FIREBASE_FIRESTORE_DATABASE_ID ("${clientDatabase}"): ` +
      "los créditos se cobrarían en una base distinta de la que lee la app (ver docs/FIRESTORE_DATABASES.md)."
    );
  }
  const aiPerMinute = readPositiveInt(env, "AI_RATE_LIMIT_PER_MINUTE", 20, problems);
  const aiMaxConcurrent = readPositiveInt(env, "AI_MAX_CONCURRENT_PER_USER", 3, problems);
  const aiIncludedDailyQuota = readPositiveInt(env, "AI_INCLUDED_DAILY_QUOTA", 60, problems);
  const aiMaxAttempts = readPositiveInt(env, "AI_MAX_UPSTREAM_ATTEMPTS", 4, problems);
  const aiTimeoutMs = readPositiveInt(env, "AI_UPSTREAM_TIMEOUT_MS", 90_000, problems);

  // Payments (Phase 5): Mercado Pago, simulated (development) or disabled.
  const mpAccessToken = read(env, "MERCADOPAGO_ACCESS_TOKEN") || undefined;
  const mpWebhookSecret = read(env, "MERCADOPAGO_WEBHOOK_SECRET") || undefined;
  const mpModeRaw = read(env, "MERCADOPAGO_MODE").toLowerCase();
  if (mpModeRaw && mpModeRaw !== "fake" && mpModeRaw !== "mercadopago") {
    problems.push("MERCADOPAGO_MODE debe ser mercadopago o fake.");
  }
  const paymentsMode: "mercadopago" | "fake" | "disabled" =
    mpModeRaw === "fake" ? "fake" : mpAccessToken ? "mercadopago" : "disabled";
  if (paymentsMode === "fake" && isProduction) {
    problems.push("MERCADOPAGO_MODE=fake (pagos simulados) no está permitido en producción.");
  }
  if (mpModeRaw === "mercadopago" && !mpAccessToken) {
    problems.push("MERCADOPAGO_MODE=mercadopago requiere MERCADOPAGO_ACCESS_TOKEN.");
  }
  if (paymentsMode === "mercadopago" && isProduction && !mpWebhookSecret) {
    problems.push("MERCADOPAGO_WEBHOOK_SECRET es obligatoria en producción (clave secreta de Webhooks del panel de Mercado Pago).");
  }
  if (paymentsMode !== "disabled" && isProduction && !read(env, "APP_URL")) {
    problems.push("Los pagos requieren APP_URL (URLs de retorno y de notificación).");
  }
  // Plans are granted in the server's database: it must be the one the app reads.
  if (paymentsMode !== "disabled" && read(env, "VITE_FIREBASE_FIRESTORE_DATABASE_ID") && clientDatabase !== serverDatabase) {
    problems.push(
      `FIREBASE_DATABASE_ID ("${serverDatabase}") no coincide con VITE_FIREBASE_FIRESTORE_DATABASE_ID ("${clientDatabase}"): ` +
      "los pagos se acreditarían en una base distinta de la que lee la app (ver docs/FIRESTORE_DATABASES.md)."
    );
  }
  // Google Drive always uses the minimal drive.file scope (Phase 7); the old full-read option is gone
  if (read(env, "GOOGLE_DRIVE_ACCESS").toLowerCase() === "all") {
    problems.push("GOOGLE_DRIVE_ACCESS=all ya no se admite: Drive usa solo drive.file (archivos usados desde la app). Quitá la variable.");
  }

  const allowTestPayments = read(env, "MERCADOPAGO_ALLOW_TEST_PAYMENTS") === "true" || !isProduction;

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }

  const rawAppUrl = read(env, "APP_URL");

  return {
    isProduction,
    appUrl: rawAppUrl.endsWith("/") ? rawAppUrl.slice(0, -1) : rawAppUrl,
    trustProxy,
    firebase: { projectId, storageBucket, databaseId },
    session: {
      secret: sessionSecret,
      ephemeral,
      cookieSecure: isProduction,
      cookieSameSite,
      maxAgeMs: sessionMaxAgeHours * 60 * 60 * 1000,
    },
    admin: { emails: adminEmails, secretKey: adminSecretKey },
    uploads: { maxBytes: uploadMaxBytes },
    rateLimit: { apiPerMinute },
    storage: { corsOnStartup: read(env, "STORAGE_CORS_ON_STARTUP") === "true" },
    csp: {
      mode: cspRaw === "off" ? "off" : "report-only",
      firebaseAuthDomain: read(env, "VITE_FIREBASE_AUTH_DOMAIN") || undefined,
    },
    ai: {
      proxyEnabled,
      provider,
      geminiApiKey,
      perMinute: aiPerMinute,
      maxConcurrent: aiMaxConcurrent,
      includedDailyQuota: aiIncludedDailyQuota,
      maxAttempts: aiMaxAttempts,
      timeoutMs: aiTimeoutMs,
    },
    payments: {
      mode: paymentsMode,
      accessToken: mpAccessToken,
      webhookSecret: mpWebhookSecret,
      allowTestPayments,
    },
  };
}
