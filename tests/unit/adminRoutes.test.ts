import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createAdminRouter, secretsMatch, type AdminDb } from "../../server/routes/admin";
import { isAdminToken } from "../../server/security/auth";
import { apiErrorHandler } from "../../server/security/http";
import { withApp, fakeVerifyIdToken, ADMIN_EMAILS } from "../helpers/http";

function fakeDb() {
  const writes: any[] = [];
  const users = [
    { subscription: { status: "active", type: "mensual" } },
    { subscription: { status: "trial", type: "free" } },
  ];
  const db: AdminDb = {
    collection: (name: string) => ({
      get: async () => ({ size: users.length, forEach: (cb: any) => users.forEach((u) => cb({ data: () => u })) }),
      doc: (_id: string) => ({
        get: async () => ({ data: () => ({ isAiSuspendedForFree: false }) }),
        set: async (data: any, options: any) => { writes.push({ name, data, options }); },
      }),
    }),
  };
  return { db, writes };
}

function buildApp(adminSecretKey?: string) {
  const { db, writes } = fakeDb();
  const app = express();
  app.use(express.json());
  app.use("/api/admin", createAdminRouter({
    auth: { verifyIdToken: fakeVerifyIdToken, adminEmails: ADMIN_EMAILS },
    adminSecretKey,
    db,
    getRuntimeStats: () => ({ activeUsers: 3, requestHistory: [], totalRequestsToday: 10, historyWindowMs: 3600_000 }),
  }));
  app.use("/api", apiErrorHandler);
  return { app, writes };
}

const get = (url: string, headers: Record<string, string> = {}) => fetch(url, { headers });
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

test("isAdminToken: claim or verified email in ADMIN_EMAILS (case-insensitive)", () => {
  assert.equal(isAdminToken({ uid: "a", admin: true }, []), true);
  assert.equal(isAdminToken({ uid: "a", email: "OWNER@example.com", email_verified: true }, ADMIN_EMAILS), true);
  assert.equal(isAdminToken({ uid: "a", email: "owner@example.com", email_verified: false }, ADMIN_EMAILS), false);
  assert.equal(isAdminToken({ uid: "a", email: "owner@example.com" }, ADMIN_EMAILS), false);
  assert.equal(isAdminToken({ uid: "a", admin: "true" }, []), false);
  assert.equal(isAdminToken({ uid: "a", email: "student@example.com", email_verified: true }, ADMIN_EMAILS), false);
});

test("stats: spoofed x-user-email header is ignored (401 without token)", async () => {
  const { app } = buildApp("k");
  await withApp(app, async (base) => {
    const res = await get(`${base}/api/admin/stats`, { "x-user-email": "owner@example.com" });
    assert.equal(res.status, 401);
  });
});

test("stats: invalid token 401, regular user 403, unverified admin email 403", async () => {
  const { app } = buildApp("k");
  await withApp(app, async (base) => {
    assert.equal((await get(`${base}/api/admin/stats`, bearer("forged"))).status, 401);
    assert.equal((await get(`${base}/api/admin/stats`, bearer("token-user"))).status, 403);
    assert.equal((await get(`${base}/api/admin/stats`, bearer("token-admin-email-unverified"))).status, 403);
  });
});

test("stats: admin by claim and by verified email get the same response shape as before", async () => {
  const { app } = buildApp("k");
  await withApp(app, async (base) => {
    for (const token of ["token-admin-claim", "token-admin-email"]) {
      const res = await get(`${base}/api/admin/stats`, bearer(token));
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(Object.keys(body).sort(), [
        "activeUsers", "creditsConsumed24h", "estimatedCost", "isAiSuspendedForFree",
        "requestGraphData", "serverTime", "subscriptionStats", "totalRequestsToday",
      ]);
      assert.equal(body.subscriptionStats.activeSubscribers, 1);
      assert.equal(body.requestGraphData.length, 60);
    }
  });
});

test("verify-key: requires admin, compares the key and rate-limits attempts", async () => {
  const { app } = buildApp("correct-key");
  await withApp(app, async (base) => {
    const url = `${base}/api/admin/verify-key`;
    assert.equal((await post(url, { key: "correct-key" })).status, 401);
    assert.equal((await post(url, { key: "correct-key" }, bearer("token-user"))).status, 403);
    assert.equal((await post(url, { key: "correct-key" }, bearer("token-admin-claim"))).status, 200);
    for (let i = 0; i < 4; i++) {
      assert.equal((await post(url, { key: "wrong" }, bearer("token-admin-claim"))).status, 401);
    }
    const limited = await post(url, { key: "correct-key" }, bearer("token-admin-claim"));
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get("retry-after"));
  });
});

test("verify-key: reports a missing ADMIN_SECRET_KEY without leaking details", async () => {
  const { app } = buildApp(undefined);
  await withApp(app, async (base) => {
    const res = await post(`${base}/api/admin/verify-key`, { key: "x" }, bearer("token-admin-claim"));
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "ADMIN_KEY_NOT_CONFIGURED" });
  });
});

test("toggle-ai: fails closed when ADMIN_SECRET_KEY is not configured (previous bypass)", async () => {
  const { app, writes } = buildApp(undefined);
  await withApp(app, async (base) => {
    const res = await post(`${base}/api/admin/toggle-ai`, { suspend: true }, bearer("token-admin-claim"));
    assert.equal(res.status, 401);
    assert.equal(writes.length, 0);
  });
});

test("toggle-ai: needs admin + key + boolean, then writes the flag", async () => {
  const { app, writes } = buildApp("correct-key");
  await withApp(app, async (base) => {
    const url = `${base}/api/admin/toggle-ai`;
    assert.equal((await post(url, { key: "correct-key", suspend: true }, bearer("token-user"))).status, 403);
    assert.equal((await post(url, { key: "wrong", suspend: true }, bearer("token-admin-claim"))).status, 401);
    assert.equal((await post(url, { key: "correct-key", suspend: "yes" }, bearer("token-admin-claim"))).status, 400);
    assert.equal(writes.length, 0);

    const ok = await post(url, { key: "correct-key", suspend: true }, bearer("token-admin-claim"));
    assert.equal(ok.status, 200);
    assert.deepEqual(writes, [{ name: "stats", data: { isAiSuspendedForFree: true }, options: { merge: true } }]);
  });
});

test("secretsMatch handles missing and different-length values", () => {
  assert.equal(secretsMatch("a", undefined), false);
  assert.equal(secretsMatch(undefined, "a"), false);
  assert.equal(secretsMatch("", ""), false);
  assert.equal(secretsMatch("short", "much-longer-secret"), false);
  assert.equal(secretsMatch("same-secret", "same-secret"), true);
});
