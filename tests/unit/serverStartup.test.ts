import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tsxBin = path.join(repoRoot, "node_modules", ".bin", "tsx");

// Starts server.ts with an empty environment from a directory without .env.
// It must stop before touching Firebase, with a message naming the missing variables.
function startServer(env: Record<string, string>) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ss-startup-"));
  try {
    return spawnSync(tsxBin, [path.join(repoRoot, "server.ts")], {
      cwd,
      env: { PATH: process.env.PATH || "", HOME: process.env.HOME || "", ...env },
      encoding: "utf8",
      timeout: 60_000,
    });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

test("server exits with a clear error when Firebase config is missing", () => {
  const result = startServer({});
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Configuración del servidor inválida/);
  assert.match(result.stderr, /FIREBASE_PROJECT_ID/);
});

test("server refuses to start in production without SESSION_SECRET", () => {
  const result = startServer({ NODE_ENV: "production", FIREBASE_PROJECT_ID: "demo-project" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /SESSION_SECRET/);
});
