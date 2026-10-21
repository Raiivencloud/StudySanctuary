import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { scanText, scanTrackedFiles } from "../../scripts/scan-secrets";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Fake credentials are assembled at runtime so this file never contains a matching literal.
const fakeGoogleKey = "AIza" + "Q".repeat(35);
const fakeMpToken = ["APP", "USR"].join("_") + "-1234567890123456-010101-" + "a".repeat(32) + "-123456789";

test("detects Google API keys and masks them", () => {
  const findings = scanText(`const k = "${fakeGoogleKey}";`, "bundle.js");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "google-api-key");
  assert.ok(!findings[0].preview.includes(fakeGoogleKey));
});

test("detects Mercado Pago access tokens and private keys", () => {
  const rules = scanText(`${fakeMpToken}\n-----BEGIN ${"PRIVATE"} KEY-----`, "x").map((f) => f.rule);
  assert.deepEqual(rules.sort(), ["mercadopago-access-token", "private-key"]);
});

test("allows the public Firebase web API key from VITE_FIREBASE_API_KEY", () => {
  const findings = scanText(`apiKey:"${fakeGoogleKey}"`, "bundle.js", { env: { VITE_FIREBASE_API_KEY: fakeGoogleKey } });
  assert.equal(findings.length, 0);
});

test("detects values of server-only env vars", () => {
  const env = { SESSION_SECRET: "super-secret-session-value", GEMINI_API_KEY: "server-gemini-value" };
  const findings = scanText("x=super-secret-session-value;y=server-gemini-value", "bundle.js", { env });
  assert.deepEqual(findings.map((f) => f.rule).sort(), ["env-value:GEMINI_API_KEY", "env-value:SESSION_SECRET"]);
});

test("tracked source files contain no secrets", () => {
  const findings = scanTrackedFiles(repoRoot, { env: {} });
  assert.deepEqual(findings, [], findings.map((f) => `${f.file}: ${f.rule}`).join("\n"));
});

test("client code does not read server env vars (process.env) and vite does not inject them", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && /process\.env\./.test(fs.readFileSync(full, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""))) {
        offenders.push(path.relative(repoRoot, full));
      }
    }
  };
  walk(path.join(repoRoot, "src"));
  assert.deepEqual(offenders, []);

  const viteConfig = fs.readFileSync(path.join(repoRoot, "vite.config.ts"), "utf8");
  assert.doesNotMatch(viteConfig, /define\s*:/);
});
