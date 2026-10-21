/**
 * /api/ai/generate with an in-memory credit service (fast checks). The real transactional
 * service is exercised over HTTP in tests/rules/aiRouter.emulator.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createAiRouter, type AiRouterOptions } from "../../server/ai/aiRouter";
import { CreditError } from "../../server/credits/creditService";
import { apiErrorHandler } from "../../server/security/http";
import type { GenAIClient } from "../../server/ai/generation";
import { withApp, fakeVerifyIdToken } from "../helpers/http";

function memoryCredits(initial: Record<string, number>, planActive: Record<string, boolean> = {}) {
  const balances = { ...initial };
  const actions = new Map<string, { calls: number; refunded: boolean }>();
  const usage = new Map<string, number>();
  const log: string[] = [];
  return {
    balances, log,
    async consume(uid: string, actionId: string, amount = 1, _reason = "ai", limits: { maxCalls?: number } = {}) {
      const key = `${uid}:${actionId}`;
      const existing = actions.get(key);
      if (existing) {
        if (existing.refunded) throw new CreditError("ACTION_CLOSED");
        if (existing.calls >= (limits.maxCalls ?? 1)) throw new CreditError("ACTION_LIMIT");
        existing.calls++;
        return { credits: balances[uid], duplicate: true };
      }
      if ((balances[uid] ?? 0) < amount) throw new CreditError("INSUFFICIENT_CREDITS");
      balances[uid] -= amount;
      actions.set(key, { calls: 1, refunded: false });
      log.push(`consume ${actionId}`);
      return { credits: balances[uid], duplicate: false };
    },
    async refund(uid: string, actionId: string) {
      const entry = actions.get(`${uid}:${actionId}`);
      if (!entry || entry.refunded) return { credits: balances[uid], refunded: false };
      entry.refunded = true;
      balances[uid] += 1;
      log.push(`refund ${actionId}`);
      return { credits: balances[uid], refunded: true };
    },
    async recordIncludedUsage(uid: string, _feature: string, limit: number) {
      const used = usage.get(uid) || 0;
      if (used >= limit) throw new CreditError("DAILY_QUOTA_EXCEEDED");
      usage.set(uid, used + 1);
      return { used: used + 1 };
    },
    async getBalance(uid: string) {
      return { credits: balances[uid] ?? 0, subscriptionType: "Gratis", hasUsedFreeTrial: false, refilledToday: false, planActive: planActive[uid] === true };
    },
  };
}

function buildApp(overrides: Partial<AiRouterOptions> = {}, client?: GenAIClient) {
  const credits = memoryCredits({ "user-1": 3, "user-2": 0 });
  const calls: any[] = [];
  const defaultClient: GenAIClient = {
    models: {
      generateContent: async (request) => {
        calls.push(request);
        const text = request.contents.flatMap((c: any) => c.parts).map((p: any) => p.text).join(" ");
        if (text.includes("fail")) throw Object.assign(new Error("boom"), { status: 503 });
        if (text.includes("slow")) await new Promise((r) => setTimeout(r, 150));
        return { text: "ok", candidates: [{ content: { parts: [{ text: "ok" }] } }] };
      },
    },
  };
  const app = express();
  app.use("/api/ai", createAiRouter({
    enabled: true,
    auth: { verifyIdToken: fakeVerifyIdToken },
    createClient: () => client || defaultClient,
    credits: credits as any,
    isAiSuspendedForFree: async () => false,
    limits: { perMinute: 100, maxConcurrent: 3, includedDailyQuota: 2, maxAttempts: 2, timeoutMs: 1000, bodyLimit: "1mb" },
    sleep: async () => {},
    ...overrides,
  }));
  app.use("/api", apiErrorHandler);
  return { app, credits, calls };
}

let counter = 0;
const action = (feature = "study") => ({ feature, actionId: `action-${String(++counter).padStart(6, "0")}` });
const body = (text: string, billing: any = action(), extra: Record<string, unknown> = {}) =>
  JSON.stringify({ model: "gemini-3-flash-preview", contents: [{ role: "user", parts: [{ text }] }], config: {}, billing, ...extra });
const post = (url: string, payload: string, token = "token-user") => fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: payload,
});

test("requires identity before anything else (no charge, no model call)", async () => {
  const { app, credits, calls } = buildApp();
  await withApp(app, async (base) => {
    assert.equal((await post(`${base}/api/ai/generate`, body("hola"), "")).status, 401);
    assert.equal((await post(`${base}/api/ai/generate`, body("hola"), "forged")).status, 401);
  });
  assert.equal(calls.length, 0);
  assert.equal(credits.balances["user-1"], 3);
});

test("disabled proxy answers 503 without touching credits", async () => {
  const { app, credits } = buildApp({ enabled: false });
  await withApp(app, async (base) => {
    assert.deepEqual(await (await post(`${base}/api/ai/generate`, body("hola"))).json(), { error: "AI_PROXY_DISABLED" });
  });
  assert.equal(credits.balances["user-1"], 3);
});

test("charges 1 credit per billable action before calling the model and returns the balance", async () => {
  const { app, credits, calls } = buildApp();
  await withApp(app, async (base) => {
    const res = await post(`${base}/api/ai/generate`, body("Resume la fotosíntesis"));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.text, "ok");
    assert.equal(json.credits, 2);
  });
  assert.equal(credits.balances["user-1"], 2);
  assert.equal(calls.length, 1);
});

test("users without credits get 402 and the model is never called", async () => {
  const { app, calls } = buildApp();
  await withApp(app, async (base) => {
    const res = await post(`${base}/api/ai/generate`, body("hola"), "token-other");
    assert.equal(res.status, 402);
    assert.deepEqual(await res.json(), { error: "INSUFFICIENT_CREDITS" });
  });
  assert.equal(calls.length, 0);
});

test("AI failure refunds the whole action", async () => {
  const { app, credits } = buildApp();
  await withApp(app, async (base) => {
    const res = await post(`${base}/api/ai/generate`, body("please fail"));
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: "AI_UPSTREAM_ERROR", refunded: true });
  });
  assert.equal(credits.balances["user-1"], 3);
  assert.deepEqual(credits.log.slice(-2).map((l) => l.split(" ")[0]), ["consume", "refund"]);
});

test("multi-call action (podcast): charged once; failing audio refunds it", async () => {
  const { app, credits } = buildApp();
  const podcast = action("podcast");
  await withApp(app, async (base) => {
    assert.equal((await post(`${base}/api/ai/generate`, body("guion", podcast))).status, 200);
    assert.equal(credits.balances["user-1"], 2);
    assert.equal((await post(`${base}/api/ai/generate`, body("audio fail", podcast))).status, 502);
    assert.equal(credits.balances["user-1"], 3, "audio failed: like before, no charge");
    assert.equal((await post(`${base}/api/ai/generate`, body("otra vez", podcast))).status, 409, "a refunded action cannot be reused");
  });
});

test("an action cannot be reused for more calls than its feature allows", async () => {
  const { app } = buildApp();
  const single = action("study");
  await withApp(app, async (base) => {
    assert.equal((await post(`${base}/api/ai/generate`, body("uno", single))).status, 200);
    const reuse = await post(`${base}/api/ai/generate`, body("dos", single));
    assert.equal(reuse.status, 429);
    assert.deepEqual(await reuse.json(), { error: "ACTION_LIMIT" });
  });
});

test("included features (free before) do not cost credits but have a daily quota", async () => {
  const { app, credits } = buildApp();
  await withApp(app, async (base) => {
    assert.equal((await post(`${base}/api/ai/generate`, body("curso 1", action("course_tools")))).status, 200);
    assert.equal((await post(`${base}/api/ai/generate`, body("curso 2", action("course_tools")))).status, 200);
    const over = await post(`${base}/api/ai/generate`, body("curso 3", action("arena_questions")));
    assert.equal(over.status, 429);
    assert.deepEqual(await over.json(), { error: "DAILY_QUOTA_EXCEEDED" });
  });
  assert.equal(credits.balances["user-1"], 3);
});

test("duplicate identical requests in flight are rejected (double click)", async () => {
  const { app, credits } = buildApp();
  const same = body("slow summary", action());
  await withApp(app, async (base) => {
    const [a, b] = await Promise.all([post(`${base}/api/ai/generate`, same), post(`${base}/api/ai/generate`, same)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  });
  assert.equal(credits.balances["user-1"], 2, "charged once");
});

test("per-user concurrency limit", async () => {
  const { app } = buildApp({ limits: { perMinute: 100, maxConcurrent: 2, includedDailyQuota: 50, maxAttempts: 2, timeoutMs: 1000, bodyLimit: "1mb" } });
  await withApp(app, async (base) => {
    const statuses = await Promise.all([1, 2, 3].map((i) => post(`${base}/api/ai/generate`, body(`slow ${i}`, action("course_tools"))).then((r) => r.status)));
    assert.deepEqual(statuses.sort(), [200, 200, 429]);
  });
});

test("per-user rate limit per minute", async () => {
  const { app } = buildApp({ limits: { perMinute: 2, maxConcurrent: 5, includedDailyQuota: 50, maxAttempts: 2, timeoutMs: 1000, bodyLimit: "1mb" } });
  await withApp(app, async (base) => {
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await post(`${base}/api/ai/generate`, body(`r${i}`, action("course_tools")))).status);
    assert.deepEqual(statuses, [200, 200, 429]);
  });
});

test("kill switch blocks free users only", async () => {
  const credits = memoryCredits({ "user-1": 3, "admin-1": 3 }, { "admin-1": true });
  const { app } = buildApp({ isAiSuspendedForFree: async () => true, credits: credits as any });
  await withApp(app, async (base) => {
    const free = await post(`${base}/api/ai/generate`, body("hola"));
    assert.equal(free.status, 503);
    assert.deepEqual(await free.json(), { error: "AI_SUSPENDED_FREE" });
    assert.equal((await post(`${base}/api/ai/generate`, body("hola"), "token-admin-claim")).status, 200, "paid plan still works");
  });
  assert.equal(credits.balances["user-1"], 3);
});

test("rejects unknown features, bad action ids, disallowed models and malformed contents", async () => {
  const { app, calls } = buildApp();
  await withApp(app, async (base) => {
    assert.equal((await post(`${base}/api/ai/generate`, body("x", { feature: "free_everything", actionId: "action-abcdefgh" }))).status, 400);
    assert.equal((await post(`${base}/api/ai/generate`, body("x", { feature: "study", actionId: "../x" }))).status, 400);
    assert.equal((await post(`${base}/api/ai/generate`, body("x", action(), { model: "gemini-ultra-unlisted" }))).status, 400);
    assert.equal((await post(`${base}/api/ai/generate`, JSON.stringify({ contents: "x", billing: action() }))).status, 400);
    assert.equal((await post(`${base}/api/ai/generate`, JSON.stringify({ contents: [{ parts: [{ text: "x" }] }] }))).status, 400, "billing is mandatory");
  });
  assert.equal(calls.length, 0);
});

test("only allowed generation options reach the model; history is forwarded", async () => {
  const { app, calls } = buildApp();
  const payload = JSON.stringify({
    model: "gemini-3-flash-preview",
    contents: [{ role: "user", parts: [{ text: "antes" }] }, { role: "model", parts: [{ text: "resp" }] }, { role: "user", parts: [{ text: "ahora" }] }],
    config: { systemInstruction: "tutor", apiKey: "evil", tools: [{ googleSearch: {} }] },
    billing: action("virtual_tutor"),
  });
  await withApp(app, async (base) => {
    assert.equal((await post(`${base}/api/ai/generate`, payload)).status, 200);
  });
  assert.deepEqual(calls[0].config, { systemInstruction: "tutor" });
  assert.equal(calls[0].contents.length, 3);
});
