import { test } from "node:test";
import assert from "node:assert/strict";
import { loadServerConfig, ConfigError } from "../../server/config";

const strongSecret = "x".repeat(64);

test("missing project id produces a clear ConfigError", () => {
  assert.throws(() => loadServerConfig({}), (error: unknown) => {
    assert.ok(error instanceof ConfigError);
    assert.match(error.message, /FIREBASE_PROJECT_ID/);
    assert.match(error.message, /\.env\.example/);
    return true;
  });
});

test("production requires SESSION_SECRET", () => {
  assert.throws(
    () => loadServerConfig({ NODE_ENV: "production", FIREBASE_PROJECT_ID: "demo" }),
    /SESSION_SECRET/
  );
});

test("production rejects a short SESSION_SECRET", () => {
  assert.throws(
    () => loadServerConfig({ NODE_ENV: "production", FIREBASE_PROJECT_ID: "demo", SESSION_SECRET: "short" }),
    /al menos 32 caracteres/
  );
});

test("all problems are reported together", () => {
  assert.throws(() => loadServerConfig({ NODE_ENV: "production", AI_PROXY_ENABLED: "true" }), (error: unknown) => {
    assert.ok(error instanceof ConfigError);
    assert.equal(error.problems.length, 3);
    return true;
  });
});

test("development generates an ephemeral random session secret", () => {
  const a = loadServerConfig({ FIREBASE_PROJECT_ID: "demo" });
  const b = loadServerConfig({ FIREBASE_PROJECT_ID: "demo" });
  assert.equal(a.session.ephemeral, true);
  assert.ok(a.session.secret.length >= 32);
  assert.notEqual(a.session.secret, b.session.secret);
});

test("project id and bucket fall back to the public VITE_* values", () => {
  const config = loadServerConfig({
    VITE_FIREBASE_PROJECT_ID: "demo",
    VITE_FIREBASE_STORAGE_BUCKET: "demo.appspot.com",
  });
  assert.equal(config.firebase.projectId, "demo");
  assert.equal(config.firebase.storageBucket, "demo.appspot.com");
});

test("server Firestore database stays (default) unless FIREBASE_DATABASE_ID is set", () => {
  const base = { FIREBASE_PROJECT_ID: "demo", VITE_FIREBASE_FIRESTORE_DATABASE_ID: "named-db" };
  assert.equal(loadServerConfig(base).firebase.databaseId, undefined);
  assert.equal(loadServerConfig({ ...base, FIREBASE_DATABASE_ID: "named-db" }).firebase.databaseId, "named-db");
});

test("AI proxy is disabled by default and requires a server key when enabled", () => {
  const disabled = loadServerConfig({ FIREBASE_PROJECT_ID: "demo", GEMINI_API_KEY: "server-key" });
  assert.equal(disabled.ai.proxyEnabled, false);

  assert.throws(() => loadServerConfig({ FIREBASE_PROJECT_ID: "demo", AI_PROXY_ENABLED: "true" }), /GEMINI_API_KEY/);

  const enabled = loadServerConfig({
    NODE_ENV: "production",
    FIREBASE_PROJECT_ID: "demo",
    SESSION_SECRET: strongSecret,
    AI_PROXY_ENABLED: "true",
    GEMINI_API_KEY: "server-key",
  });
  assert.equal(enabled.ai.proxyEnabled, true);
});

test("Phase 2 defaults: cookie, proxy, admin, uploads and rate limits", () => {
  const dev = loadServerConfig({ FIREBASE_PROJECT_ID: "demo" });
  assert.deepEqual(
    { secure: dev.session.cookieSecure, sameSite: dev.session.cookieSameSite, trustProxy: dev.trustProxy },
    { secure: false, sameSite: "lax", trustProxy: 0 }
  );
  assert.deepEqual(dev.admin.emails, []);
  assert.equal(dev.uploads.maxBytes, 25 * 1024 * 1024);
  assert.equal(dev.rateLimit.apiPerMinute, 300);
  assert.equal(dev.storage.corsOnStartup, false);
  assert.equal(dev.session.maxAgeMs, 24 * 60 * 60 * 1000);

  const prod = loadServerConfig({ NODE_ENV: "production", FIREBASE_PROJECT_ID: "demo", SESSION_SECRET: strongSecret });
  assert.deepEqual(
    { secure: prod.session.cookieSecure, sameSite: prod.session.cookieSameSite, trustProxy: prod.trustProxy },
    { secure: true, sameSite: "none", trustProxy: 1 }
  );
});

test("Phase 2 settings are parsed and validated", () => {
  const config = loadServerConfig({
    NODE_ENV: "production",
    FIREBASE_PROJECT_ID: "demo",
    SESSION_SECRET: strongSecret,
    ADMIN_EMAILS: " Owner@Example.com, second@example.com ,",
    SESSION_COOKIE_SAMESITE: "LAX",
    TRUST_PROXY: "2",
    UPLOAD_MAX_BYTES: "1048576",
    APP_URL: "https://app.example.com/",
  });
  assert.deepEqual(config.admin.emails, ["owner@example.com", "second@example.com"]);
  assert.equal(config.session.cookieSameSite, "lax");
  assert.equal(config.trustProxy, 2);
  assert.equal(config.uploads.maxBytes, 1048576);
  assert.equal(config.appUrl, "https://app.example.com");

  assert.throws(() => loadServerConfig({ FIREBASE_PROJECT_ID: "demo", SESSION_COOKIE_SAMESITE: "sometimes" }), /SESSION_COOKIE_SAMESITE/);
  assert.throws(() => loadServerConfig({ FIREBASE_PROJECT_ID: "demo", UPLOAD_MAX_BYTES: "-5" }), /UPLOAD_MAX_BYTES/);
  assert.throws(() => loadServerConfig({ FIREBASE_PROJECT_ID: "demo", TRUST_PROXY: "yes" }), /TRUST_PROXY/);
});

test("SameSite=None is never used without HTTPS (development)", () => {
  const config = loadServerConfig({ FIREBASE_PROJECT_ID: "demo", SESSION_COOKIE_SAMESITE: "none" });
  assert.equal(config.session.cookieSameSite, "lax");
  assert.equal(config.session.cookieSecure, false);
});
