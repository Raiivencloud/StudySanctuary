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
    geminiApiKey?: string;
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
  if (proxyEnabled && !geminiApiKey) {
    problems.push("AI_PROXY_ENABLED=true requiere GEMINI_API_KEY (clave de servidor, nunca VITE_*).");
  }

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
    ai: { proxyEnabled, geminiApiKey },
  };
}
