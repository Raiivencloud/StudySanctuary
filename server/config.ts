/**
 * Server configuration loaded from environment variables.
 * Pure module (no side effects) so it can be unit-tested.
 */
import crypto from "crypto";

type Env = Record<string, string | undefined>;

export interface ServerConfig {
  isProduction: boolean;
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

  const proxyEnabled = read(env, "AI_PROXY_ENABLED") === "true";
  const geminiApiKey = read(env, "GEMINI_API_KEY") || undefined;
  if (proxyEnabled && !geminiApiKey) {
    problems.push("AI_PROXY_ENABLED=true requiere GEMINI_API_KEY (clave de servidor, nunca VITE_*).");
  }

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }

  return {
    isProduction,
    firebase: { projectId, storageBucket, databaseId },
    session: { secret: sessionSecret, ephemeral },
    ai: { proxyEnabled, geminiApiKey },
  };
}
