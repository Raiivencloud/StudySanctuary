/** Phase 5 payments without Firestore: signature, plan table, HTTP router and configuration. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import express from "express";
import { verifyWebhookSignature, buildSignatureHeader, signatureManifest } from "../../server/payments/signature";
import { PAID_PLANS, PAYMENT_CURRENCY, getPaidPlan } from "../../server/payments/plans";
import { preferenceBody, createFakeGateway, toGatewayPayment } from "../../server/payments/gateway";
import { createPaymentsRouter } from "../../server/routes/payments";
import { PaymentError, type PaymentService, type ProcessResult } from "../../server/payments/paymentService";
import { loadServerConfig, ConfigError } from "../../server/config";
import { withApp, fakeVerifyIdToken } from "../helpers/http";

const SECRET = "test-webhook-secret-0123456789";

// --- Signature -----------------------------------------------------------------------

test("signature: the manifest follows Mercado Pago's format and lowercases alphanumeric ids", () => {
  assert.equal(signatureManifest("123456", "req-1", "1704908010"), "id:123456;request-id:req-1;ts:1704908010;");
  assert.equal(signatureManifest("ABC123", undefined, "1"), "id:abc123;ts:1;");
});

test("signature: valid header passes; wrong secret, tampered id, request id or missing parts fail", () => {
  const header = buildSignatureHeader("123456", "req-1", SECRET, "1704908010");
  assert.equal(verifyWebhookSignature({ xSignature: header, xRequestId: "req-1", dataId: "123456", secret: SECRET }), true);
  assert.equal(verifyWebhookSignature({ xSignature: header, xRequestId: "req-1", dataId: "123456", secret: "other-secret" }), false);
  assert.equal(verifyWebhookSignature({ xSignature: header, xRequestId: "req-1", dataId: "999999", secret: SECRET }), false);
  assert.equal(verifyWebhookSignature({ xSignature: header, xRequestId: "req-2", dataId: "123456", secret: SECRET }), false);
  assert.equal(verifyWebhookSignature({ xSignature: undefined, xRequestId: "req-1", dataId: "123456", secret: SECRET }), false);
  assert.equal(verifyWebhookSignature({ xSignature: "ts=1704908010", xRequestId: "req-1", dataId: "123456", secret: SECRET }), false);
  assert.equal(verifyWebhookSignature({ xSignature: "ts=1,v1=zz", xRequestId: "req-1", dataId: "123456", secret: SECRET }), false);
  assert.equal(verifyWebhookSignature({ xSignature: header, xRequestId: "req-1", dataId: "123456", secret: "" }), false);
});

// --- Plans (prices unchanged) --------------------------------------------------------

test("plans: one table with the current prices, credits and durations (no price change)", () => {
  assert.deepEqual(
    Object.values(PAID_PLANS).map((p) => [p.id, p.price, p.credits, p.durationDays, p.name]),
    [["mensual", 1200, 300, 30, "Plan Mensual"], ["trimestral", 4200, 1000, 90, "Plan Trimestral"], ["anual", 12000, 5000, 365, "Plan Anual"]],
  );
  assert.equal(PAYMENT_CURRENCY, "ARS");
  assert.equal(getPaidPlan("prueba"), undefined);
  assert.equal(getPaidPlan("__proto__"), undefined);
  assert.equal(getPaidPlan("constructor"), undefined);
});

test("plans: server.ts no longer hardcodes prices or credits", () => {
  const source = fs.readFileSync(new URL("../../server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /price:\s*1200|credits:\s*300|unit_price|external_reference/);
  assert.doesNotMatch(source, /api\.mercadopago\.com/);
});

test("preference: external_reference is the server order (not a uid), fixed price in ARS, return URLs from APP_URL", () => {
  const body = preferenceBody({
    orderId: "order123", plan: PAID_PLANS.trimestral, payerEmail: "a@example.com",
    successUrl: "https://app.test/success", pendingUrl: "https://app.test/success", failureUrl: "https://app.test/?view=subscription&payment=failure",
    notificationUrl: "https://app.test/api/mercadopago-webhook",
  });
  assert.equal(body.external_reference, "order123");
  assert.deepEqual(body.items, [{ id: "trimestral", title: "Plan Trimestral - Study Sanctuary", quantity: 1, unit_price: 4200, currency_id: "ARS" }]);
  assert.deepEqual(body.metadata, { order_id: "order123", plan_id: "trimestral" });
  assert.equal(body.notification_url, "https://app.test/api/mercadopago-webhook");
  assert.ok(!JSON.stringify(body).includes("studysanctuary.net"));
});

test("gateway: maps the Mercado Pago payment resource (snake_case API fields) to what the server validates", () => {
  const payment = toGatewayPayment({
    id: 1316793345, status: "approved", status_detail: "accredited", transaction_amount: 4200, transaction_amount_refunded: 0,
    currency_id: "ARS", external_reference: "AbC123order", live_mode: true, date_approved: "2026-10-21T12:00:00.000-03:00",
    metadata: { order_id: "AbC123order", plan_id: "trimestral" }, payer: { email: "buyer@example.com" },
  });
  assert.deepEqual(payment, {
    id: "1316793345", status: "approved", statusDetail: "accredited", amount: 4200, amountRefunded: 0, currency: "ARS",
    externalReference: "AbC123order", liveMode: true, dateApproved: "2026-10-21T12:00:00.000-03:00", metadata: { order_id: "AbC123order", plan_id: "trimestral" },
  });
  // Payer data is not kept
  assert.ok(!JSON.stringify(payment).includes("buyer@example.com"));
  assert.equal(toGatewayPayment({ id: 1, status: "pending", transaction_amount: "1200", currency_id: "ARS" }).liveMode, false);
});

// --- Router ---------------------------------------------------------------------------

function stubService(overrides: Partial<PaymentService> = {}) {
  const calls: { checkout: any[]; process: any[] } = { checkout: [], process: [] };
  const service: PaymentService = {
    async createCheckout(uid, email, planId) {
      calls.checkout.push({ uid, email, planId });
      if (!getPaidPlan(planId)) throw new PaymentError("UNKNOWN_PLAN");
      return { orderId: "order-1", preferenceId: "pref-1", initPoint: "https://checkout.test/pref-1" };
    },
    async processPayment(paymentId, expectedUid) {
      calls.process.push({ paymentId, expectedUid });
      return { outcome: "applied", status: "approved", uid: "user-1", planId: "mensual" } as ProcessResult;
    },
    ...overrides,
  };
  return { service, calls };
}

function appWith(service: PaymentService | undefined, webhookSecret: string | undefined = SECRET) {
  const app = express();
  app.use(express.json());
  app.use(createPaymentsRouter({ auth: { verifyIdToken: fakeVerifyIdToken }, payments: service, webhookSecret, appUrl: "http://127.0.0.1", log: () => {} }));
  return app;
}

const post = (base: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

test("router: creating a preference requires the ID token and ignores userId/email from the body", async () => {
  const { service, calls } = stubService();
  await withApp(appWith(service), async (base) => {
    assert.equal((await post(base, "/api/create-preference", { planId: "mensual", userId: "victim" })).status, 401);
    const res = await post(base, "/api/create-preference", { planId: "mensual", userId: "victim", userEmail: "x@evil.test" }, { Authorization: "Bearer token-user" });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { id: "pref-1", init_point: "https://checkout.test/pref-1" });
    assert.deepEqual(calls.checkout, [{ uid: "user-1", email: "student@example.com", planId: "mensual" }]);
    const bad = await post(base, "/api/create-preference", { planId: "prueba" }, { Authorization: "Bearer token-user" });
    assert.equal(bad.status, 400);
    assert.deepEqual(await bad.json(), { error: "UNKNOWN_PLAN" });
  });
});

test("router: webhook without a valid signature is rejected (401) and never processed", async () => {
  const { service, calls } = stubService();
  await withApp(appWith(service), async (base) => {
    assert.equal((await post(base, "/api/mercadopago-webhook?data.id=123&type=payment", { type: "payment", data: { id: "123" } })).status, 401);
    const forged = buildSignatureHeader("123", "r-1", "attacker-secret");
    assert.equal((await post(base, "/api/mercadopago-webhook?data.id=123&type=payment", {}, { "x-signature": forged, "x-request-id": "r-1" })).status, 401);
    // Signed for another payment id
    const other = buildSignatureHeader("999", "r-1", SECRET);
    assert.equal((await post(base, "/api/mercadopago-webhook?data.id=123&type=payment", {}, { "x-signature": other, "x-request-id": "r-1" })).status, 401);
    assert.equal(calls.process.length, 0);
  });
});

test("router: signed payment notifications are processed by id; other topics are acknowledged and ignored", async () => {
  const { service, calls } = stubService();
  await withApp(appWith(service), async (base) => {
    const sig = (id: string, rid: string) => ({ "x-signature": buildSignatureHeader(id, rid, SECRET), "x-request-id": rid });
    const ok = await post(base, "/api/mercadopago-webhook?data.id=123&type=payment", { action: "payment.updated", data: { id: "123" } }, sig("123", "r-1"));
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { outcome: "applied" });
    const order = await post(base, "/api/mercadopago-webhook?data.id=55&type=merchant_order", {}, sig("55", "r-2"));
    assert.equal(order.status, 200);
    // Legacy IPN format (?id=&topic=payment), id from the query
    assert.equal((await post(base, "/api/mercadopago-webhook?id=777&topic=payment", {}, sig("777", "r-3"))).status, 200);
    assert.deepEqual(calls.process, [{ paymentId: "123", expectedUid: undefined }, { paymentId: "777", expectedUid: undefined }]);
  });
});

test("router: transient errors answer 500 so Mercado Pago retries (the old webhook answered 200 and lost the payment)", async () => {
  const { service } = stubService({ processPayment: async () => { throw Object.assign(new Error("Firestore unavailable"), { code: 14 }); } });
  const errors: string[] = [];
  const original = console.error;
  console.error = (message: string) => errors.push(message);
  try {
    await withApp(appWith(service), async (base) => {
      const rid = "r-9";
      const res = await post(base, "/api/mercadopago-webhook?data.id=123&type=payment", {}, { "x-signature": buildSignatureHeader("123", rid, SECRET), "x-request-id": rid });
      assert.equal(res.status, 500);
    });
  } finally {
    console.error = original;
  }
  assert.equal(errors.length, 1);
});

test("router: sync requires the token and is limited to the user's own payments", async () => {
  const { service, calls } = stubService({
    processPayment: async (paymentId, expectedUid) => {
      calls.process.push({ paymentId, expectedUid });
      if (expectedUid !== "user-1") throw new PaymentError("FORBIDDEN");
      return { outcome: "recorded", status: "pending" };
    },
  });
  await withApp(appWith(service), async (base) => {
    assert.equal((await post(base, "/api/payments/sync", { paymentId: "123" })).status, 401);
    const mine = await post(base, "/api/payments/sync", { paymentId: "123" }, { Authorization: "Bearer token-user" });
    assert.equal(mine.status, 200);
    assert.equal((await mine.json()).status, "pending");
    assert.equal((await post(base, "/api/payments/sync", { paymentId: "123" }, { Authorization: "Bearer token-other" })).status, 403);
  });
});

test("router: without payments configured the endpoints answer 503 (no crash, no silent success)", async () => {
  await withApp(appWith(undefined, ""), async (base) => {
    assert.equal((await post(base, "/api/create-preference", { planId: "mensual" }, { Authorization: "Bearer token-user" })).status, 503);
    assert.equal((await post(base, "/api/mercadopago-webhook?data.id=1&type=payment", {})).status, 503);
  });
});

test("router: the simulated checkout routes exist only with the fake gateway", async () => {
  const { service } = stubService();
  await withApp(appWith(service), async (base) => {
    assert.equal((await fetch(`${base}/api/payments/dev/checkout/pref-1`)).status, 404);
  });
  const app = express();
  app.use(express.json());
  const fakeGateway = createFakeGateway();
  await fakeGateway.createPreference({ orderId: "o1", plan: PAID_PLANS.mensual, successUrl: "s", pendingUrl: "p", failureUrl: "f", notificationUrl: "n" });
  const [prefId] = [...fakeGateway.preferences.keys()];
  app.use(createPaymentsRouter({ auth: { verifyIdToken: fakeVerifyIdToken }, payments: service, webhookSecret: SECRET, fakeGateway, appUrl: "http://127.0.0.1", log: () => {} }));
  await withApp(app, async (base) => {
    const page = await fetch(`${base}/api/payments/dev/checkout/${prefId}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /no se cobra dinero real/);
  });
});

// --- Configuration ----------------------------------------------------------------------

const prodBase = {
  NODE_ENV: "production", FIREBASE_PROJECT_ID: "p", SESSION_SECRET: "x".repeat(40), APP_URL: "https://app.test",
};
const problemsOf = (env: Record<string, string>) => {
  try {
    loadServerConfig(env);
    return [];
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
};

test("config: production requires the webhook secret when Mercado Pago is configured", () => {
  assert.ok(problemsOf({ ...prodBase, MERCADOPAGO_ACCESS_TOKEN: "APP_USR-test" }).some((p) => p.includes("MERCADOPAGO_WEBHOOK_SECRET")));
  assert.deepEqual(problemsOf({ ...prodBase, MERCADOPAGO_ACCESS_TOKEN: "APP_USR-test", MERCADOPAGO_WEBHOOK_SECRET: "s" }), []);
});

test("config: the simulated Mercado Pago is refused in production", () => {
  assert.ok(problemsOf({ ...prodBase, MERCADOPAGO_MODE: "fake" }).some((p) => p.includes("MERCADOPAGO_MODE=fake")));
  assert.equal(loadServerConfig({ FIREBASE_PROJECT_ID: "p", MERCADOPAGO_MODE: "fake" }).payments.mode, "fake");
});

test("config: payments refuse a server database different from the app's", () => {
  const problems = problemsOf({ ...prodBase, MERCADOPAGO_ACCESS_TOKEN: "t", MERCADOPAGO_WEBHOOK_SECRET: "s", VITE_FIREBASE_FIRESTORE_DATABASE_ID: "app-db" });
  assert.ok(problems.some((p) => p.includes("pagos se acreditarían en una base distinta")));
  assert.deepEqual(problemsOf({ ...prodBase, MERCADOPAGO_ACCESS_TOKEN: "t", MERCADOPAGO_WEBHOOK_SECRET: "s", VITE_FIREBASE_FIRESTORE_DATABASE_ID: "app-db", FIREBASE_DATABASE_ID: "app-db" }), []);
});

test("config: test payments are rejected in production unless explicitly allowed", () => {
  const base = { ...prodBase, MERCADOPAGO_ACCESS_TOKEN: "t", MERCADOPAGO_WEBHOOK_SECRET: "s" };
  assert.equal(loadServerConfig(base).payments.allowTestPayments, false);
  assert.equal(loadServerConfig({ ...base, MERCADOPAGO_ALLOW_TEST_PAYMENTS: "true" }).payments.allowTestPayments, true);
  assert.equal(loadServerConfig({ FIREBASE_PROJECT_ID: "p" }).payments.mode, "disabled");
});
