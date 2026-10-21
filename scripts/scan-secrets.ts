/**
 * Secret scanner for the compiled bundle and the tracked source tree.
 *
 *   tsx scripts/scan-secrets.ts dist        # scan a build output directory
 *   tsx scripts/scan-secrets.ts --tracked   # scan files tracked by git
 *
 * Flags credential-shaped strings (Google API keys, Mercado Pago tokens, private keys)
 * and the literal values of server-only env vars present in the environment.
 * The public Firebase web API key (VITE_FIREBASE_API_KEY) is allowed: it is public by design.
 * Matches are printed masked; secret values are never written to the output.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";

export interface Finding {
  file: string;
  rule: string;
  preview: string;
}

type Env = Record<string, string | undefined>;

const PATTERNS: { rule: string; regex: RegExp }[] = [
  { rule: "google-api-key", regex: /AIza[0-9A-Za-z_\-]{35}/g },
  { rule: "mercadopago-access-token", regex: /\b(?:APP_USR|TEST)-\d{10,}-\d{6}-[0-9a-f]{32}-\d{6,}\b/g },
  { rule: "private-key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  // Session secret that was hardcoded in server.ts (built from parts so this file does not match itself).
  { rule: "legacy-hardcoded-session-secret", regex: new RegExp(["study", "sanctuary", "secret"].join("-"), "g") },
];

/** Server-only variables whose values must never appear in client code or the bundle. */
export const SERVER_SECRET_ENV = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "SESSION_SECRET",
  "ADMIN_SECRET_KEY",
  "MERCADOPAGO_ACCESS_TOKEN",
  "MERCADOPAGO_WEBHOOK_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "OUTLOOK_CLIENT_SECRET",
];

/** Public values that may legitimately appear in the bundle. */
export const PUBLIC_ALLOWED_ENV = ["VITE_FIREBASE_API_KEY"];

const MIN_SECRET_VALUE_LENGTH = 8;

export const mask = (value: string) => `${value.slice(0, 4)}…(${value.length} chars)`;

export interface ScanOptions {
  env?: Env;
}

export function scanText(text: string, file: string, options: ScanOptions = {}): Finding[] {
  const env = options.env || {};
  const allowed = new Set(PUBLIC_ALLOWED_ENV.map((k) => (env[k] || "").trim()).filter(Boolean));
  const findings: Finding[] = [];

  for (const { rule, regex } of PATTERNS) {
    for (const match of text.matchAll(regex)) {
      if (allowed.has(match[0])) continue;
      findings.push({ file, rule, preview: mask(match[0]) });
    }
  }

  for (const name of SERVER_SECRET_ENV) {
    const value = (env[name] || "").trim();
    if (value.length >= MIN_SECRET_VALUE_LENGTH && text.includes(value)) {
      findings.push({ file, rule: `env-value:${name}`, preview: mask(value) });
    }
  }

  return findings;
}

const isProbablyBinary = (buffer: Buffer) => buffer.subarray(0, 8000).includes(0);

function scanFile(absPath: string, displayPath: string, options: ScanOptions): Finding[] {
  const buffer = fs.readFileSync(absPath);
  if (isProbablyBinary(buffer)) return [];
  return scanText(buffer.toString("utf8"), displayPath, options);
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

export function scanDirectory(dir: string, options: ScanOptions = {}): Finding[] {
  if (!fs.existsSync(dir)) {
    throw new Error(`No existe el directorio a escanear: ${dir} (¿falta ejecutar npm run build?)`);
  }
  return walk(dir).flatMap((file) => scanFile(file, path.relative(process.cwd(), file), options));
}

export function scanTrackedFiles(repoRoot: string, options: ScanOptions = {}): Finding[] {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  return files
    .filter((file) => fs.existsSync(path.join(repoRoot, file)))
    .flatMap((file) => scanFile(path.join(repoRoot, file), file, options));
}

function main(argv: string[]) {
  const target = argv[0];
  if (!target) {
    console.error("Uso: tsx scripts/scan-secrets.ts <directorio> | --tracked");
    process.exit(2);
  }

  const options = { env: process.env };
  const findings = target === "--tracked"
    ? scanTrackedFiles(process.cwd(), options)
    : scanDirectory(path.resolve(target), options);

  if (findings.length === 0) {
    console.log(`[scan-secrets] OK: no se encontraron secretos en ${target}.`);
    return;
  }

  console.error(`[scan-secrets] Se encontraron ${findings.length} posibles secretos en ${target}:`);
  for (const f of findings) {
    console.error(`  - ${f.file}: ${f.rule} ${f.preview}`);
  }
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2));
}
