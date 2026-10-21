import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRateLimiter } from "../../server/security/rateLimit";
import { securityHeaders, apiErrorHandler, logError, requireSameOrigin } from "../../server/security/http";
import { withApp } from "../helpers/http";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file: string) => fs.readFileSync(path.join(repoRoot, file), "utf8");

test("rate limiter: blocks after max, sets Retry-After, resets after the window", async () => {
  let now = 0;
  const app = express();
  app.use(createRateLimiter({ windowMs: 1000, max: 2, key: (req) => (req.path === "/skip" ? null : "k"), now: () => now }));
  app.get("*", (_req, res) => res.send("ok"));

  await withApp(app, async (base) => {
    assert.equal((await fetch(`${base}/a`)).status, 200);
    assert.equal((await fetch(`${base}/a`)).status, 200);
    const limited = await fetch(`${base}/a`);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "1");
    assert.deepEqual(await limited.json(), { error: "RATE_LIMITED" });
    assert.equal((await fetch(`${base}/skip`)).status, 200, "null key is never limited");

    now = 1001;
    assert.equal((await fetch(`${base}/a`)).status, 200);
  });
});

test("security headers are set; HSTS only in production", async () => {
  for (const isProduction of [true, false]) {
    const app = express();
    app.disable("x-powered-by");
    app.use(securityHeaders(isProduction));
    app.get("/", (_req, res) => res.send("ok"));
    await withApp(app, async (base) => {
      const res = await fetch(base);
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
      assert.equal(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
      assert.equal(Boolean(res.headers.get("strict-transport-security")), isProduction);
      assert.equal(res.headers.get("x-powered-by"), null);
    });
  }
});

test("API error handler returns JSON without stack traces or internal messages", async () => {
  const app = express();
  app.use(express.json());
  app.post("/api/echo", (_req, res) => res.json({ ok: true }));
  app.get("/api/boom", () => { throw new Error("db password=hunter2 at /srv/internal.ts:42"); });
  app.use("/api", apiErrorHandler);

  const originalError = console.error;
  console.error = () => {};
  try {
    await withApp(app, async (base) => {
      const bad = await fetch(`${base}/api/echo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
      assert.equal(bad.status, 400);
      assert.deepEqual(await bad.json(), { error: "INVALID_JSON" });

      const boom = await fetch(`${base}/api/boom`);
      assert.equal(boom.status, 500);
      const text = await boom.text();
      assert.equal(text, JSON.stringify({ error: "INTERNAL_ERROR" }));
    });
  } finally {
    console.error = originalError;
  }
});

test("logError never prints request headers or tokens from SDK/axios errors", () => {
  const lines: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  try {
    logError("ctx", Object.assign(new Error("Request failed with status code 401"), {
      code: "ERR_BAD_REQUEST",
      config: { headers: { Authorization: "Bearer very-secret-access-token" } },
      response: { status: 401, data: { token: "another-secret" } },
    }));
  } finally {
    console.error = originalError;
  }
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Request failed with status code 401 \(code=ERR_BAD_REQUEST httpStatus=401\)/);
  assert.doesNotMatch(lines[0], /very-secret-access-token|another-secret|Authorization/);
});

test("requireSameOrigin allows missing/own/configured origins and blocks others", async () => {
  const app = express();
  app.post("/x", requireSameOrigin("https://app.example.com/"), (_req, res) => res.send("ok"));
  await withApp(app, async (base) => {
    assert.equal((await fetch(`${base}/x`, { method: "POST" })).status, 200);
    assert.equal((await fetch(`${base}/x`, { method: "POST", headers: { Origin: base } })).status, 200);
    assert.equal((await fetch(`${base}/x`, { method: "POST", headers: { Origin: "https://app.example.com" } })).status, 200);
    assert.equal((await fetch(`${base}/x`, { method: "POST", headers: { Origin: "https://app.example.com.evil.io" } })).status, 403);
    assert.equal((await fetch(`${base}/x`, { method: "POST", headers: { Origin: "null" } })).status, 403);
  });
});

test("regression guards: dangerous patterns removed from server and client code", () => {
  const server = read("server.ts");
  for (const pattern of [/x-user-email/, /\/api\/admin\/list-buckets/, /\/api\/admin\/fix-cors/, /makePublic\(/, /getSignedUrl\(/, /saveUninitialized:\s*true/, /process\.env\.ADMIN_SECRET_KEY/]) {
    assert.doesNotMatch(server, pattern, `server.ts still contains ${pattern}`);
  }
  assert.match(server, /app\.set\("trust proxy"/);

  const clientFiles = ["src/components/SecurityAdmin.tsx", "src/components/AdminDashboard.tsx"];
  for (const file of clientFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /x-user-email/, file);
    assert.match(source, /Authorization: `Bearer \$\{idToken\}`/, file);
  }
  for (const file of ["src/components/CalendarView.tsx", "src/components/DrivePickerModal.tsx"]) {
    assert.doesNotMatch(read(file), /\.run\.app/, file);
  }
  assert.doesNotMatch(read("src/firebase.ts"), /email: auth\.currentUser\?\.email|photoUrl: provider/);
});

test("storage CORS tool: proposes exact HTTPS origins only, never '*'", async () => {
  const { proposedCors, validateOrigins } = await import("../../scripts/ops/corsPolicy");
  assert.deepEqual(validateOrigins(["https://studysanctuary.net", "http://localhost:3000"]), []);
  assert.deepEqual(validateOrigins(["*", "http://evil.example", "https://a.example/path", "nope"]), ["*", "http://evil.example", "https://a.example/path", "nope"]);
  assert.deepEqual(proposedCors(["https://studysanctuary.net"])[0].origin, ["https://studysanctuary.net"]);
});

test("2-G: dangerous root diagnostic scripts are gone", () => {
  for (const file of ["dump-env.ts", "check-env.ts", "check-storage.ts", "find-bucket.ts", "fix-cors-script.ts", "check-bucket.ts", "check-buckets.ts", "test-buckets.ts"]) {
    assert.equal(fs.existsSync(path.join(repoRoot, file)), false, file);
  }
});

test("2-C: client never stores the Google token in localStorage and uses authenticated fetch", () => {
  const authContext = read("src/contexts/AuthContext.tsx");
  assert.doesNotMatch(authContext, /localStorage\.setItem\('google_drive_token'/);
  for (const file of ["src/components/DrivePickerModal.tsx", "src/components/CalendarView.tsx"]) {
    assert.doesNotMatch(read(file), /\bfetch\((['`])\/api\/(drive|calendar|auth)/, file);
  }
  assert.doesNotMatch(read("src/components/DrivePickerModal.tsx"), /window\.open\(`\/api\/drive/);
});
