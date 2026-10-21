/**
 * Phase 5 payments against the Firestore emulator with a simulated Mercado Pago:
 * real transactions, duplicated and concurrent notifications, validation, refunds,
 * chargebacks and the signed webhook over HTTP. No real payments, no credentials.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import admin from "firebase-admin";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { assertFails, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { createPaymentService, PaymentError, type PaymentService } from "../../server/payments/paymentService";
import { createFakeGateway, type FakeGateway } from "../../server/payments/gateway";
import { createPaymentsRouter } from "../../server/routes/payments";
import { buildSignatureHeader } from "../../server/payments/signature";
import { createCreditService, utcDay } from "../../server/credits/creditService";
import { withApp, fakeVerifyIdToken } from "../helpers/http";
import { assertEmulatorOnly, createTestEnv } from "./env";

const PROJECT = "demo-studysanctuary-payments";
const SECRET = "emulator-webhook-secret";
const DAY = 24 * 60 * 60 * 1000;
let app: admin.app.App;
let db: Firestore;
let gateway: FakeGateway;
let payments: PaymentService;
let logs: string[];

const user = (uid: string) => db.collection("users").doc(uid);
const profile = async (uid: string) => (await user(uid).get()).data() || {};
const ledger = async (uid: string) => (await user(uid).collection("creditLedger").get()).docs.map((d) => ({ id: d.id, ...d.data() }) as any);
const record = async (paymentId: string) => (await db.collection("payments").doc(paymentId).get()).data() || {};

function newService(options: { requireLiveMode?: boolean } = {}) {
  return createPaymentService(db, { gateway, appUrl: "https://app.test", requireLiveMode: options.requireLiveMode ?? false, log: (m) => logs.push(m) });
}

/** Buyer flow: the user creates a checkout and Mercado Pago creates the payment with `status`. */
async function checkoutAndPay(uid: string, planId: string, status: string, overrides = {}) {
  const checkout = await payments.createCheckout(uid, `${uid}@example.com`, planId);
  return { checkout, payment: gateway.pay(checkout.preferenceId, status, overrides) };
}

before(() => {
  assertEmulatorOnly();
  app = admin.initializeApp({ projectId: PROJECT }, "payments-test");
  db = getFirestore(app);
});

after(async () => {
  await app?.delete();
});

beforeEach(async () => {
  const res = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  assert.ok(res.ok);
  gateway = createFakeGateway();
  logs = [];
  payments = newService();
  await user("alice").set({ remainingCredits: 2, subscriptionType: "Gratis", lastCreditReset: utcDay(new Date()) });
  await user("bob").set({ remainingCredits: 5, subscriptionType: "Gratis" });
});

test("checkout: the order is stored with the uid, plan, amount and currency; external_reference is the order", async () => {
  const { orderId, preferenceId } = await payments.createCheckout("alice", "alice@example.com", "trimestral");
  const order = (await db.collection("paymentOrders").doc(orderId).get()).data()!;
  assert.equal(order.uid, "alice");
  assert.equal(order.planId, "trimestral");
  assert.equal(order.amount, 4200);
  assert.equal(order.currency, "ARS");
  assert.equal(order.preferenceId, preferenceId);
  const body = gateway.preferences.get(preferenceId)!.body;
  assert.equal(body.external_reference, orderId);
  assert.equal(body.items[0].unit_price, 4200);
  await assert.rejects(payments.createCheckout("alice", undefined, "prueba"), (e) => e instanceof PaymentError && e.code === "UNKNOWN_PLAN");
  await assert.rejects(payments.createCheckout("ghost", undefined, "mensual"), (e) => e instanceof PaymentError && e.code === "PROFILE_NOT_FOUND");
});

test("approved: grants the plan once (credits, subscription, 30-day end date, ledger, payment record)", async () => {
  const { checkout, payment } = await checkoutAndPay("alice", "mensual", "approved");
  const before = Date.now();
  assert.equal((await payments.processPayment(payment.id)).outcome, "applied");

  const data = await profile("alice");
  assert.equal(data.remainingCredits, 300);
  assert.equal(data.subscriptionType, "Plan Mensual");
  assert.equal(data.subscription.status, "active");
  assert.equal(data.subscription.type, "mensual");
  assert.equal(data.subscription.lastPaymentId, payment.id);
  const end = (data.subscription.subscriptionEndDate as Timestamp).toMillis();
  assert.ok(end >= before + 30 * DAY - 5000 && end <= Date.now() + 30 * DAY + 5000);
  assert.ok((await ledger("alice")).some((e) => e.id === `payment_${payment.id}` && e.type === "plan_purchase" && e.amount === 300));
  const rec = await record(payment.id);
  assert.equal(rec.uid, "alice");
  assert.equal(rec.applied, true);
  assert.equal(rec.amount, 1200);
  assert.equal((await db.collection("paymentOrders").doc(checkout.orderId).get()).data()!.status, "paid");
});

test("duplicates: repeated notifications never re-grant (credits spent after the purchase are not restored, end date not extended)", async () => {
  const { payment } = await checkoutAndPay("alice", "mensual", "approved");
  await payments.processPayment(payment.id);
  const firstEnd = (await profile("alice")).subscription.subscriptionEndDate.toMillis();
  await createCreditService(db).consume("alice", "spend-after-purchase-1", 1);

  for (let i = 0; i < 5; i++) assert.equal((await payments.processPayment(payment.id)).outcome, "already_applied");
  const data = await profile("alice");
  assert.equal(data.remainingCredits, 299);
  assert.equal(data.subscription.subscriptionEndDate.toMillis(), firstEnd);
  assert.equal((await ledger("alice")).filter((e) => e.type === "plan_purchase").length, 1);
});

test("concurrency: 15 simultaneous notifications for the same payment grant the plan exactly once", async () => {
  const { payment } = await checkoutAndPay("alice", "anual", "approved");
  const results = await Promise.all(Array.from({ length: 15 }, () => payments.processPayment(payment.id)));
  assert.equal(results.filter((r) => r.outcome === "applied").length, 1);
  assert.equal(results.filter((r) => r.outcome === "already_applied").length, 14);
  assert.equal((await profile("alice")).remainingCredits, 5000);
  assert.equal((await ledger("alice")).filter((e) => e.type === "plan_purchase").length, 1);
});

test("validation: wrong amount, currency, plan or a test payment in production are never granted", async () => {
  const cases: [string, object, string][] = [
    ["amount", { amount: 1 }, "amount_mismatch"],
    ["currency", { currency: "USD" }, "currency_mismatch"],
    ["plan", { metadata: { plan_id: "anual" } }, "plan_mismatch"],
  ];
  for (const [, overrides, issue] of cases) {
    const { checkout, payment } = await checkoutAndPay("alice", "mensual", "approved", overrides);
    const result = await payments.processPayment(payment.id);
    assert.equal(result.outcome, "invalid");
    assert.ok(result.issues!.includes(issue), `${issue}: ${result.issues}`);
    assert.equal((await record(payment.id)).needsReview, true);
    assert.equal((await db.collection("paymentOrders").doc(checkout.orderId).get()).data()!.status, "rejected_validation");
  }
  payments = newService({ requireLiveMode: true });
  const { payment: test } = await checkoutAndPay("alice", "mensual", "approved", { liveMode: false });
  assert.deepEqual((await payments.processPayment(test.id)).issues, ["test_payment"]);
  const { payment: live } = await checkoutAndPay("alice", "mensual", "approved", { liveMode: true });
  assert.equal((await payments.processPayment(live.id)).outcome, "applied");

  assert.equal((await ledger("alice")).filter((e) => e.type === "plan_purchase").length, 1);
});

test("states: pending is recorded and granted only when approved; rejected and cancelled never grant", async () => {
  const { checkout, payment } = await checkoutAndPay("alice", "mensual", "pending");
  assert.deepEqual(await payments.processPayment(payment.id), { outcome: "recorded", status: "pending", uid: "alice", planId: "mensual" });
  assert.equal((await profile("alice")).remainingCredits, 2);
  assert.equal((await db.collection("paymentOrders").doc(checkout.orderId).get()).data()!.status, "pending");

  gateway.setStatus(payment.id, "approved");
  assert.equal((await payments.processPayment(payment.id)).outcome, "applied");
  assert.deepEqual((await record(payment.id)).history, ["pending", "approved"]);

  for (const status of ["rejected", "cancelled", "in_process"]) {
    const { payment: other } = await checkoutAndPay("bob", "anual", status);
    assert.equal((await payments.processPayment(other.id)).outcome, "recorded");
  }
  assert.equal((await profile("bob")).remainingCredits, 5);
  assert.equal((await profile("bob")).subscription, undefined);
});

test("refund: revokes the current plan once (credits 0, status revoked, ledger entry); repeated or late notifications change nothing", async () => {
  const { payment } = await checkoutAndPay("alice", "trimestral", "approved");
  await payments.processPayment(payment.id);
  gateway.setStatus(payment.id, "refunded");

  assert.equal((await payments.processPayment(payment.id)).outcome, "revoked");
  const data = await profile("alice");
  assert.equal(data.remainingCredits, 0);
  assert.equal(data.subscriptionType, "Gratis");
  assert.equal(data.subscription.status, "revoked");
  assert.equal(data.subscription.revokedReason, "refunded");
  const revoke = (await ledger("alice")).find((e) => e.id === `revoke_${payment.id}`);
  assert.equal(revoke.creditsRemoved, 1000);
  assert.equal(revoke.planWasCurrent, true);

  // Repeated refund notifications and a late "approved" replay change nothing
  assert.equal((await payments.processPayment(payment.id)).outcome, "revoked");
  gateway.setStatus(payment.id, "approved");
  assert.equal((await payments.processPayment(payment.id)).outcome, "already_applied");
  assert.equal((await profile("alice")).remainingCredits, 0);
  assert.equal((await ledger("alice")).filter((e) => e.type === "plan_revoked").length, 1);
  // Not an active plan any more: the AI kill switch treats the user as free
  assert.equal((await createCreditService(db).getBalance("alice")).planActive, false);
});

test("chargeback of an older payment keeps the newer plan and flags it for review", async () => {
  const { payment: first } = await checkoutAndPay("alice", "mensual", "approved");
  await payments.processPayment(first.id);
  const { payment: second } = await checkoutAndPay("alice", "anual", "approved");
  await payments.processPayment(second.id);

  gateway.setStatus(first.id, "charged_back");
  assert.equal((await payments.processPayment(first.id)).outcome, "revoked");
  const data = await profile("alice");
  assert.equal(data.subscription.type, "anual");
  assert.equal(data.subscription.status, "active");
  assert.equal(data.remainingCredits, 5000);
  assert.equal((await record(first.id)).needsReview, true);
  assert.equal((await ledger("alice")).find((e) => e.id === `revoke_${first.id}`).planWasCurrent, false);
});

test("refund before the approval was processed: recorded, nothing granted", async () => {
  const { payment } = await checkoutAndPay("alice", "mensual", "refunded");
  assert.equal((await payments.processPayment(payment.id)).outcome, "recorded");
  assert.equal((await profile("alice")).remainingCredits, 2);
});

test("dispute (in_mediation) and partial refunds keep the plan and are flagged for review", async () => {
  const { payment } = await checkoutAndPay("alice", "mensual", "approved");
  await payments.processPayment(payment.id);
  gateway.setStatus(payment.id, "approved", { amountRefunded: 200 });
  assert.equal((await payments.processPayment(payment.id)).outcome, "already_applied");
  assert.equal((await record(payment.id)).reviewReason, "partial_refund");
  gateway.setStatus(payment.id, "in_mediation");
  assert.equal((await payments.processPayment(payment.id)).outcome, "recorded");
  assert.equal((await record(payment.id)).reviewReason, "dispute_open");
  assert.equal((await profile("alice")).subscription.status, "active");
});

test("ownership: the return-page sync only accepts the user's own payments", async () => {
  const { payment } = await checkoutAndPay("alice", "mensual", "approved");
  await assert.rejects(payments.processPayment(payment.id, "bob"), (e) => e instanceof PaymentError && e.code === "FORBIDDEN");
  assert.equal((await profile("alice")).remainingCredits, 2);
  assert.equal((await payments.processPayment(payment.id, "alice")).outcome, "applied");
  await assert.rejects(payments.processPayment("abc", "alice"), (e) => e instanceof PaymentError && e.code === "INVALID_PAYMENT_ID");
});

test("legacy preferences (external_reference = uid, before this phase) are still granted after validation", async () => {
  const legacy = gateway.pay((await gateway.createPreference({
    orderId: "alice", plan: (await import("../../server/payments/plans")).PAID_PLANS.mensual,
    successUrl: "s", pendingUrl: "p", failureUrl: "f", notificationUrl: "n",
  })).id, "approved", { metadata: { plan_id: "mensual", user_id: "alice" } });
  assert.equal((await payments.processPayment(legacy.id)).outcome, "applied");
  assert.equal((await profile("alice")).remainingCredits, 300);

  const cheap = gateway.pay([...gateway.preferences.keys()][0], "approved", { amount: 10, metadata: { plan_id: "anual" } });
  assert.equal((await payments.processPayment(cheap.id)).outcome, "invalid");
});

test("transition: a payment already granted by the old webhook is not granted again, and a later refund still revokes it", async () => {
  const pref = await gateway.createPreference({
    orderId: "alice", plan: (await import("../../server/payments/plans")).PAID_PLANS.mensual,
    successUrl: "s", pendingUrl: "p", failureUrl: "f", notificationUrl: "n",
  });
  const old = gateway.pay(pref.id, "approved", { metadata: { plan_id: "mensual", user_id: "alice" }, dateApproved: new Date(Date.now() - 20 * DAY).toISOString() });
  // What the pre-Phase 5 webhook left: plan written, no ledger entry; the user then spent credits
  await user("alice").set({ remainingCredits: 120, subscriptionType: "Plan Mensual", subscription: { status: "active", type: "mensual", lastPaymentId: old.id, subscriptionEndDate: Timestamp.fromMillis(Date.now() + 10 * DAY) } }, { merge: true });

  assert.equal((await payments.processPayment(old.id)).outcome, "already_applied");
  assert.equal((await profile("alice")).remainingCredits, 120);
  assert.equal((await ledger("alice")).find((e) => e.id === `payment_${old.id}`).backfilled, true);

  gateway.setStatus(old.id, "charged_back");
  assert.equal((await payments.processPayment(old.id)).outcome, "revoked");
  assert.equal((await profile("alice")).subscription.status, "revoked");
  assert.equal((await ledger("alice")).find((e) => e.id === `revoke_${old.id}`).creditsRemoved, 120);
});

test("transition: an old legacy payment not recorded as the user's plan is flagged, not re-granted", async () => {
  const pref = await gateway.createPreference({
    orderId: "bob", plan: (await import("../../server/payments/plans")).PAID_PLANS.anual,
    successUrl: "s", pendingUrl: "p", failureUrl: "f", notificationUrl: "n",
  });
  const old = gateway.pay(pref.id, "approved", { metadata: { plan_id: "anual" }, dateApproved: new Date(Date.now() - 40 * DAY).toISOString() });
  const result = await payments.processPayment(old.id);
  assert.equal(result.outcome, "invalid");
  assert.deepEqual(result.issues, ["legacy_old_payment"]);
  assert.equal((await profile("bob")).remainingCredits, 5);
  assert.equal((await record(old.id)).needsReview, true);
});

test("unknown payments or orders are ignored without writing to any user", async () => {
  assert.equal((await payments.processPayment("424242")).outcome, "ignored");
  const stray = gateway.pay((await gateway.createPreference({
    orderId: "not-an-order", plan: (await import("../../server/payments/plans")).PAID_PLANS.anual,
    successUrl: "s", pendingUrl: "p", failureUrl: "f", notificationUrl: "n",
  })).id, "approved");
  assert.equal((await payments.processPayment(stray.id)).outcome, "ignored");
  assert.equal((await db.collection("payments").get()).size, 0);
});

test("webhook over HTTP: signed notifications grant once; unsigned or forged ones are rejected; outages answer 500 and the retry works", async () => {
  const server = express();
  server.use(express.json());
  server.use(createPaymentsRouter({ auth: { verifyIdToken: fakeVerifyIdToken }, payments, webhookSecret: SECRET, appUrl: "http://127.0.0.1", log: () => {} }));
  const { payment } = await checkoutAndPay("alice", "mensual", "approved");
  const send = (base: string, headers: Record<string, string>) =>
    fetch(`${base}/api/mercadopago-webhook?data.id=${payment.id}&type=payment`, {
      method: "POST", headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ type: "payment", action: "payment.updated", data: { id: payment.id } }),
    });
  const signed = (rid: string) => ({ "x-request-id": rid, "x-signature": buildSignatureHeader(payment.id, rid, SECRET) });

  const originalError = console.error;
  console.error = () => {};
  try {
    await withApp(server, async (base) => {
      assert.equal((await send(base, {})).status, 401);
      assert.equal((await send(base, { "x-request-id": "r", "x-signature": buildSignatureHeader(payment.id, "r", "wrong") })).status, 401);
      assert.equal((await profile("alice")).remainingCredits, 2);

      gateway.failNext(1);
      assert.equal((await send(base, signed("r-1"))).status, 500);
      assert.equal((await profile("alice")).remainingCredits, 2);

      const results = await Promise.all([1, 2, 3, 4].map((i) => send(base, signed(`r-retry-${i}`)).then((r) => r.json())));
      assert.equal(results.filter((r: any) => r.outcome === "applied").length, 1);
      assert.equal((await profile("alice")).remainingCredits, 300);
    });
  } finally {
    console.error = originalError;
  }
});

test("rules: clients can neither read nor write orders and payment records, nor activate a plan themselves", async () => {
  const { checkout, payment } = await checkoutAndPay("alice", "mensual", "approved");
  await payments.processPayment(payment.id);
  // Rules apply to client SDKs; copy the server's data into the rules test project
  const env: RulesTestEnvironment = await createTestEnv({ projectId: `${PROJECT}-rules` });
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      await setDoc(doc(adminDb, `paymentOrders/${checkout.orderId}`), { uid: "alice", planId: "mensual", amount: 1200, currency: "ARS" });
      await setDoc(doc(adminDb, `payments/${payment.id}`), { uid: "alice", status: "approved" });
      await setDoc(doc(adminDb, "users/alice"), { uid: "alice", email: "alice@example.com", role: "user", remainingCredits: 0, subscriptionType: "Gratis", subscription: { status: "revoked", type: "mensual" } });
    });
    const alice = env.authenticatedContext("alice", { email: "alice@example.com", email_verified: true }).firestore();
    await assertFails(getDoc(doc(alice, `paymentOrders/${checkout.orderId}`)));
    await assertFails(getDoc(doc(alice, `payments/${payment.id}`)));
    await assertFails(setDoc(doc(alice, "payments/123"), { uid: "alice", status: "approved" }));
    await assertFails(setDoc(doc(alice, "paymentOrders/x"), { uid: "alice", planId: "anual", amount: 1 }));
    // Undo a revocation or self-activate a plan
    await assertFails(updateDoc(doc(alice, "users/alice"), { "subscription.status": "active" }));
    await assertFails(updateDoc(doc(alice, "users/alice"), { remainingCredits: 5000, subscriptionType: "Plan Anual" }));
  } finally {
    await env.cleanup();
  }
});
