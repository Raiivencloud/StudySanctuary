/**
 * Server-side credit service (server/credits/creditService.ts) against the Firestore emulator:
 * real transactions, concurrency, idempotency and the daily refill rule.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import admin from "firebase-admin";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { createCreditService, CreditError, utcDay } from "../../server/credits/creditService";
import { assertEmulatorOnly } from "./env";

const PROJECT = "demo-studysanctuary-credits";
let app: admin.app.App;
let db: Firestore;

const user = (uid: string) => db.collection("users").doc(uid);
const ledger = async (uid: string) => (await user(uid).collection("creditLedger").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const credits = async (uid: string) => (await user(uid).get()).data()?.remainingCredits;
const rid = (n: number | string) => `req-${String(n).padStart(6, "0")}`;
const codeOf = (error: unknown) => (error instanceof CreditError ? error.code : String((error as any)?.message || error));

before(() => {
  assertEmulatorOnly();
  app = admin.initializeApp({ projectId: PROJECT }, "credit-service-test");
  db = getFirestore(app);
});

after(async () => {
  await app?.delete();
});

beforeEach(async () => {
  const res = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  assert.ok(res.ok);
});

test("concurrency: 20 simultaneous requests with 3 credits charge exactly 3", async () => {
  await user("alice").set({ remainingCredits: 3, lastCreditReset: utcDay(new Date()) });
  const service = createCreditService(db);

  const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => service.consume("alice", rid(i))));
  const ok = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

  assert.equal(ok.length, 3);
  assert.equal(rejected.length, 17);
  assert.ok(rejected.every((r) => codeOf(r.reason) === "INSUFFICIENT_CREDITS"), rejected.map((r) => codeOf(r.reason)).join(","));
  assert.equal(await credits("alice"), 0);
  assert.equal((await ledger("alice")).filter((e: any) => e.type === "consume").length, 3);
});

test("idempotency: the same action id is charged once; extra calls are limited per action", async () => {
  await user("alice").set({ remainingCredits: 5, lastCreditReset: utcDay(new Date()) });
  const service = createCreditService(db);

  // Single-call action: a duplicate request is rejected, never charged twice.
  const results = await Promise.allSettled([service.consume("alice", rid("x")), service.consume("alice", rid("x"))]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected")!;
  assert.equal(codeOf(rejected.reason), "ACTION_LIMIT");
  assert.equal(await credits("alice"), 4);

  // Two-call action (podcast: script + audio): one charge, the third call is refused.
  assert.equal((await service.consume("alice", rid("p"), 1, "podcast", { maxCalls: 2 })).duplicate, false);
  assert.equal((await service.consume("alice", rid("p"), 1, "podcast", { maxCalls: 2 })).duplicate, true);
  await assert.rejects(service.consume("alice", rid("p"), 1, "podcast", { maxCalls: 2 }), (e) => codeOf(e) === "ACTION_LIMIT");
  assert.equal(await credits("alice"), 3);

  // A refunded action cannot be reused for free.
  await service.refund("alice", rid("p"));
  await assert.rejects(service.consume("alice", rid("p"), 1, "podcast", { maxCalls: 2 }), (e) => codeOf(e) === "ACTION_CLOSED");
  assert.equal(await credits("alice"), 4);
});

test("included features: daily quota per user, counted on the server", async () => {
  const service = createCreditService(db);
  for (let i = 0; i < 3; i++) await service.recordIncludedUsage("alice", "course_tools", 3);
  await assert.rejects(service.recordIncludedUsage("alice", "arena_questions", 3), (e) => codeOf(e) === "DAILY_QUOTA_EXCEEDED");
  const usage = (await ledger("alice")).find((e: any) => e.type === "included_usage") as any;
  assert.equal(usage.count, 3);
  assert.deepEqual(usage.byFeature, { course_tools: 3 });
});

test("balance reports whether a paid plan is active (AI kill switch)", async () => {
  const service = createCreditService(db);
  await user("free").set({ remainingCredits: 2, lastCreditReset: utcDay(new Date()) });
  assert.equal((await service.getBalance("free")).planActive, false);
  await user("paid").set({ remainingCredits: 2 });
  await service.applyPlanPurchase("paid", "anual", "pay-active");
  assert.equal((await service.getBalance("paid")).planActive, true);
});

test("refund returns the credit once (failed AI call)", async () => {
  await user("alice").set({ remainingCredits: 2, lastCreditReset: utcDay(new Date()) });
  const service = createCreditService(db);
  await service.consume("alice", rid(1));
  assert.equal(await credits("alice"), 1);
  assert.deepEqual(await service.refund("alice", rid(1)), { credits: 2, refunded: true });
  assert.deepEqual(await service.refund("alice", rid(1)), { credits: 2, refunded: false });
  assert.deepEqual(await service.refund("alice", rid("never-charged")), { credits: 2, refunded: false });
});

test("daily refill is decided by the server: once per UTC day, only at 0", async () => {
  let clock = new Date("2026-10-21T10:00:00Z");
  const service = createCreditService(db, { now: () => clock });
  await user("alice").set({ remainingCredits: 0, lastCreditReset: "2026-10-20" });

  assert.equal((await service.getBalance("alice")).credits, 5);
  for (let i = 0; i < 5; i++) await service.consume("alice", rid(`d1-${i}`));
  await assert.rejects(service.consume("alice", rid("d1-extra")), (e) => codeOf(e) === "INSUFFICIENT_CREDITS");
  assert.equal((await service.getBalance("alice")).credits, 0, "no second refill the same day");

  clock = new Date("2026-10-22T00:00:01Z");
  const next = await service.consume("alice", rid("d2-0"));
  assert.equal(next.credits, 4, "new day: refill to 5, then charge 1");
});

test("free trial only once; paid plans cannot be started by the user", async () => {
  await user("alice").set({ remainingCredits: 0, hasUsedFreeTrial: false, lastCreditReset: utcDay(new Date()) });
  const service = createCreditService(db);
  const trial = await service.startFreeTrial("alice");
  assert.equal(trial.credits, 15);
  await assert.rejects(service.startFreeTrial("alice"), (e) => codeOf(e) === "TRIAL_ALREADY_USED");
  assert.equal((await user("alice").get()).data()?.subscriptionType, "7 DÍAS GRATIS");
});

test("plan purchase (verified payment) is idempotent per payment id and sets the end date", async () => {
  const clock = new Date("2026-10-21T12:00:00Z");
  const service = createCreditService(db, { now: () => clock });
  await user("alice").set({ remainingCredits: 2 });

  assert.deepEqual(await service.applyPlanPurchase("alice", "mensual", "pay123"), { applied: true });
  assert.deepEqual(await service.applyPlanPurchase("alice", "mensual", "pay123"), { applied: false });
  const data = (await user("alice").get()).data()!;
  assert.equal(data.remainingCredits, 300);
  assert.equal(data.subscription.status, "active");
  assert.equal((data.subscription.subscriptionEndDate as Timestamp).toMillis(), clock.getTime() + 30 * 86400_000);
  await assert.rejects(service.applyPlanPurchase("alice", "gratis-infinito", "pay124"), (e) => codeOf(e) === "UNKNOWN_PLAN");
});

test("expiration: an active plan past its end date becomes expired", async () => {
  let clock = new Date("2026-10-21T12:00:00Z");
  const service = createCreditService(db, { now: () => clock });
  await user("alice").set({ remainingCredits: 0 });
  await service.applyPlanPurchase("alice", "mensual", "pay200");
  assert.deepEqual(await service.expireIfDue("alice"), { expired: false });
  clock = new Date("2026-11-21T12:00:01Z");
  assert.deepEqual(await service.expireIfDue("alice"), { expired: true });
  const data = (await user("alice").get()).data()!;
  assert.equal(data.subscription.status, "expired");
  assert.equal(data.subscriptionType, "Gratis");
});

test("input validation: amounts, request ids and unknown users", async () => {
  const service = createCreditService(db);
  await assert.rejects(service.consume("alice", rid(1), 0), (e) => codeOf(e) === "INVALID_AMOUNT");
  await assert.rejects(service.consume("alice", "../../x"), (e) => codeOf(e) === "INVALID_REQUEST_ID");
  await assert.rejects(service.consume("ghost", rid(1)), (e) => codeOf(e) === "USER_NOT_FOUND");
});
