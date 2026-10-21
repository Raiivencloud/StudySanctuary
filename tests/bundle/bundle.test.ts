import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { scanDirectory, SERVER_SECRET_ENV } from "../../scripts/scan-secrets";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const viteBin = path.join(repoRoot, "node_modules", ".bin", "vite");

// Note: Vite also reads .env files from the repo root. If a local .env defines
// VITE_GEMINI_API_KEY, these tests fail on purpose (that key would be public).
function build(env: Record<string, string>) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-bundle-"));
  const result = spawnSync(viteBin, ["build", "--outDir", outDir, "--emptyOutDir"], {
    cwd: repoRoot,
    env: { PATH: process.env.PATH || "", HOME: process.env.HOME || "", ...env },
    encoding: "utf8",
    timeout: 300_000,
  });
  return { outDir, result };
}

const readBundle = (dir: string) =>
  fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(js|html|css|json)$/.test(entry.name))
    .map((entry) => fs.readFileSync(path.join(entry.parentPath, entry.name), "utf8"))
    .join("\n");

test("builds without firebase-applet-config.json and without any credentials", { timeout: 300_000 }, () => {
  const { outDir, result } = build({});
  try {
    assert.equal(result.status, 0, `vite build falló:\n${result.stdout}\n${result.stderr}`);
    assert.ok(fs.existsSync(path.join(outDir, "index.html")));
    assert.deepEqual(scanDirectory(outDir, { env: {} }), []);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("server-only secrets never reach the client bundle", { timeout: 300_000 }, () => {
  const fakeFirebaseKey = "AIza" + "F".repeat(35); // public by design, must be allowed
  const env: Record<string, string> = {
    VITE_FIREBASE_API_KEY: fakeFirebaseKey,
    VITE_FIREBASE_AUTH_DOMAIN: "sentinel-project.firebaseapp.com",
    VITE_FIREBASE_PROJECT_ID: "sentinel-project",
    VITE_FIREBASE_STORAGE_BUCKET: "sentinel-project.appspot.com",
    VITE_FIREBASE_APP_ID: "1:000:web:sentinel",
  };
  for (const name of SERVER_SECRET_ENV) {
    env[name] = `SENTINEL_${name}_must_not_leak_0123456789`;
  }

  const { outDir, result } = build(env);
  try {
    assert.equal(result.status, 0, `vite build falló:\n${result.stdout}\n${result.stderr}`);
    const bundle = readBundle(outDir);

    // Sanity check: public VITE_* values are injected (so the test would catch a leak).
    assert.ok(bundle.includes("sentinel-project.firebaseapp.com"));

    for (const name of SERVER_SECRET_ENV) {
      assert.ok(!bundle.includes(env[name]), `${name} apareció en el bundle`);
      assert.ok(!bundle.includes("SENTINEL_"), "un valor de servidor apareció en el bundle");
    }
    assert.deepEqual(scanDirectory(outDir, { env }), []);

    // Phase 4: the browser bundle has no Gemini SDK and no Google AI endpoint.
    assert.ok(!bundle.includes("generativelanguage.googleapis.com"), "Gemini endpoint found in the bundle");
    assert.ok(!bundle.includes("@google/genai"), "Gemini SDK found in the bundle");
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
