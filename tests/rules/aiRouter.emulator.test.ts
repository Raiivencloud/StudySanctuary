/**
 * End-to-end server path on the emulator: HTTP → identity → real transactional credits
 * (Firestore emulator) → simulated Gemini → refund. No real Gemini, no cost.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { createAiRouter } from "../../server/ai/aiRouter";
import { createCreditService, utcDay } from "../../server/credits/creditService";
import { createCreditsRouter } from "../../server/routes/credits";
import type { GenAIClient } from "../../server/ai/generation";
import { withApp, fakeVerifyIdToken } from "../helpers/http";
import { assertEmulatorOnly } from "./env";

const PROJECT = "demo-studysanctuary-ai";
let app: App;
let db: Firestore;
let modelCalls = 0;

const slowModel: GenAIClient = {
  models: {
    generateContent: async (request) => {
      modelCalls++;
      const text = request.contents.flatMap((c: any) => c.parts).map((p: any) => p.text).join(" ");
      await new Promise((r) => setTimeout(r, 30));
      if (text.includes("[[fail]]")) throw Object.assign(new Error("upstream down"), { status: 503 });
      return { text: `ok: ${text}`, candidates: [{ content: { parts: [{ text: "ok" }] } }] };
    },
  },
};

function server() {
  const credits = createCreditService(db);
  const express_ = express();
  express_.use("/api/ai", createAiRouter({
    enabled: true,
    auth: { verifyIdToken: fakeVerifyIdToken },
    createClient: () => slowModel,
    credits,
    isAiSuspendedForFree: async () => false,
    limits: { perMinute: 1000, maxConcurrent: 100, includedDailyQuota: 100, maxAttempts: 2, timeoutMs: 5000, bodyLimit: "1mb" },
    sleep: async () => {},
  }));
  express_.use(express.json());
  express_.use("/api/credits", createCreditsRouter({ auth: { verifyIdToken: fakeVerifyIdToken }, credits }));
  return express_;
}

let n = 0;
const generate = (base: string, text: string, feature = "study", actionId = `act-${String(++n).padStart(8, "0")}`) =>
  fetch(`${base}/api/ai/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer token-user" },
    body: JSON.stringify({ model: "gemini-3-flash-preview", contents: [{ role: "user", parts: [{ text }] }], billing: { feature, actionId } }),
  });
const balance = async () => (await db.collection("users").doc("user-1").get()).data()?.remainingCredits;

before(() => {
  assertEmulatorOnly();
  app = initializeApp({ projectId: PROJECT }, "ai-router-emulator-test");
  db = getFirestore(app);
});

after(async () => {
  if (app) await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await db.collection("users").doc("user-1").set({ remainingCredits: 3, lastCreditReset: utcDay(new Date()), subscriptionType: "Gratis" });
  modelCalls = 0;
});

test("concurrency over HTTP: 12 simultaneous actions with 3 credits → 3 answered, 9 rejected with 402, model called 3 times", async () => {
  await withApp(server(), async (base) => {
    const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => generate(base, `pregunta ${i}`)));
    const statuses = responses.map((r) => r.status);
    assert.equal(statuses.filter((s) => s === 200).length, 3, statuses.join(","));
    assert.equal(statuses.filter((s) => s === 402).length, 9, statuses.join(","));
  });
  assert.equal(await balance(), 0);
  assert.equal(modelCalls, 3, "no model call without a successful charge");
});

test("AI error → credit returned (ledger shows the refund)", async () => {
  await withApp(server(), async (base) => {
    const res = await generate(base, "[[fail]] resumen");
    assert.equal(res.status, 502);
    assert.equal((await res.json()).refunded, true);
  });
  assert.equal(await balance(), 3);
  const ledger = (await db.collection("users").doc("user-1").collection("creditLedger").get()).docs.map((d) => d.data());
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].refunded, true);
});

test("user without balance: 402 on AI, daily refill on a new day, trial once, no paid plans via API", async () => {
  await db.collection("users").doc("user-1").set({ remainingCredits: 0, lastCreditReset: utcDay(new Date()), hasUsedFreeTrial: false });
  await withApp(server(), async (base) => {
    assert.equal((await generate(base, "hola")).status, 402);

    const auth = { Authorization: "Bearer token-user" };
    assert.equal((await (await fetch(`${base}/api/credits`, { headers: auth })).json()).credits, 0, "already refilled today");

    const trial = await fetch(`${base}/api/credits/trial`, { method: "POST", headers: auth });
    assert.equal((await trial.json()).credits, 15);
    assert.equal((await fetch(`${base}/api/credits/trial`, { method: "POST", headers: auth })).status, 409);

    assert.equal((await generate(base, "ahora sí")).status, 200);
    assert.equal(await balance(), 14);

    const spend = await fetch(`${base}/api/credits/spend`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ reason: "arena_cooldown", actionId: "arena-skip-0001" }) });
    assert.equal((await spend.json()).credits, 13);
    const badReason = await fetch(`${base}/api/credits/spend`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ reason: "plan_anual", actionId: "x-00000001" }) });
    assert.equal(badReason.status, 400);
  });
});

test("the balance endpoint applies the daily refill on the server", async () => {
  await db.collection("users").doc("user-1").set({ remainingCredits: 0, lastCreditReset: "2020-01-01" });
  await withApp(server(), async (base) => {
    const res = await fetch(`${base}/api/credits`, { headers: { Authorization: "Bearer token-user" } });
    assert.deepEqual(await res.json(), { credits: 5, subscriptionStatus: "Gratis", hasUsedFreeTrial: false, planActive: false });
    assert.equal((await fetch(`${base}/api/credits`)).status, 401);
  });
});
