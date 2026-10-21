/**
 * Local development environment with NO real services and NO cost:
 *   - Firebase Auth, Firestore and Storage emulators (project demo-studysanctuary)
 *   - the AI proxy enabled with the simulated provider (AI_PROVIDER=fake)
 *   - server-side credits
 *
 *   npm run dev:emulators                 # transitional rules (current firestore.rules)
 *   npm run dev:emulators -- --final-rules  # final rules: the client cannot write credits
 *   npm run demo                          # final rules + demo data + "demo" banner (docs/DEMO.md)
 *
 * Open http://localhost:3000 and sign in with any test account from the Auth emulator page.
 * Nothing here can reach real Firebase, Gemini or Mercado Pago (demo-* project, fake providers).
 */
import fs from "fs";
import os from "os";
import crypto from "crypto";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demo = process.argv.includes("--demo");
const finalRules = demo || process.argv.includes("--final-rules");

let config = path.join(repoRoot, "firebase.test.json");
if (finalRules) {
  // Same rules with the transitional credit switch turned off (what Phase 4 deploys).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-final-rules-"));
  const rules = fs.readFileSync(path.join(repoRoot, "firestore.rules"), "utf8")
    .replace("return true; // CLIENT_CREDIT_TRANSITIONS", "return false; // CLIENT_CREDIT_TRANSITIONS");
  fs.writeFileSync(path.join(dir, "firestore.rules"), rules);
  fs.copyFileSync(path.join(repoRoot, "storage.rules"), path.join(dir, "storage.rules"));
  const base = JSON.parse(fs.readFileSync(config, "utf8"));
  config = path.join(dir, "firebase.json");
  fs.writeFileSync(config, JSON.stringify(base, null, 2));
  console.log("[dev] Reglas FINALES de créditos activas en el emulador.");
}

const env = {
  ...process.env,
  NODE_ENV: "development",
  FIREBASE_PROJECT_ID: "demo-studysanctuary",
  FIREBASE_STORAGE_BUCKET: "demo-studysanctuary.appspot.com",
  APP_URL: "http://localhost:3000",
  AI_PROXY_ENABLED: "true",
  AI_PROVIDER: "fake",
  GEMINI_API_KEY: "",
  // Simulated Mercado Pago with signed webhooks (random secret per run, never a real credential)
  MERCADOPAGO_MODE: "fake",
  MERCADOPAGO_ACCESS_TOKEN: "",
  MERCADOPAGO_WEBHOOK_SECRET: crypto.randomBytes(24).toString("hex"),
  VITE_USE_FIREBASE_EMULATORS: "true",
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-studysanctuary.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "demo-studysanctuary",
  VITE_FIREBASE_STORAGE_BUCKET: "demo-studysanctuary.appspot.com",
  VITE_FIREBASE_APP_ID: "1:000000000000:web:demo",
  VITE_FIREBASE_FIRESTORE_DATABASE_ID: "",
  VITE_DEMO_MODE: demo ? "true" : "",
};

const firebaseBin = path.join(repoRoot, "node_modules", ".bin", "firebase");
const tsxBin = path.join(repoRoot, "node_modules", ".bin", "tsx");
const child = spawn(firebaseBin, [
  "emulators:exec", "--config", config, "--project", "demo-studysanctuary", "--only", "auth,firestore,storage",
  demo
    ? `${tsxBin} ${path.join(repoRoot, "scripts", "demo", "seed.ts")} && ${tsxBin} ${path.join(repoRoot, "server.ts")}`
    : `${tsxBin} ${path.join(repoRoot, "server.ts")}`,
], { cwd: repoRoot, env, stdio: "inherit" });

child.on("exit", (code) => process.exit(code ?? 0));
