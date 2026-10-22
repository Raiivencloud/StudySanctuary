/**
 * Approved credit model (credits by origin, docs/CREDITS_BUCKETS_PROPOSAL.md §8) against the
 * Firestore emulator: compatibility with existing profiles, expiry rules and concurrency
 * (no double crediting, no lost credits, the stored total always equals the sum of the buckets).
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { createCreditService, CreditError, utcDay } from "../../server/credits/creditService";
import { assertEmulatorOnly } from "./env";

const PROJECT = "demo-studysanctuary-credit-model";
const DAY = 24 * 60 * 60 * 1000;
let app: App;
let db: Firestore;

const user = (uid: string) => db.collection("users").doc(uid);
const ledger = async (uid: string) => (await user(uid).collection("creditLedger").get()).docs.map((d) => ({ id: d.id, ...d.data() } as any));
const stored = async (uid: string) => (await user(uid).get()).data()!;
const rid = (n: number | string) => `req-${String(n).padStart(6, "0")}`;
const codeOf = (error: unknown) => (error instanceof CreditError ? error.code : String((error as any)?.message || error));

/** The invariant every write must keep. */
async function assertConsistent(uid: string) {
  const data = await stored(uid);
  const buckets: any[] = data.creditBuckets || [];
  const sum = buckets.reduce((acc, b) => acc + b.balance, 0);
  assert.equal(data.remainingCredits, sum, "remainingCredits equals the sum of the buckets");
  for (const b of buckets) {
    assert.ok(Number.isInteger(b.balance) && b.balance >= 0, `bucket ${b.id} is a non-negative integer`);
    assert.ok(b.balance <= b.granted || b.kind === "legacy" || b.kind === "free", `bucket ${b.id} never exceeds what was granted`);
  }
  return data;
}

before(() => {
  assertEmulatorOnly();
  app = initializeApp({ projectId: PROJECT }, "credit-model-test");
  db = getFirestore(app);
});

after(async () => {
  if (app) await deleteApp(app);
});

beforeEach(async () => {
  const res = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  assert.ok(res.ok);
});

test("compatibility: an existing balance migrates exactly into a legacy bucket that never expires", async () => {
  let clock = new Date("2026-10-22T12:00:00Z");
  const service = createCreditService(db, { now: () => clock });
  await user("alice").set({ remainingCredits: 640, subscriptionType: "Plan Trimestral", lastCreditReset: "2026-10-01" });

  assert.equal((await service.getBalance("alice")).credits, 640);
  const data = await assertConsistent("alice");
  assert.deepEqual(data.creditBuckets, [{ id: "legacy", kind: "legacy", balance: 640, granted: 640, expiresAt: null }]);
  assert.equal((await ledger("alice")).find((e) => e.id === "migration_legacy").amount, 640);

  clock = new Date("2031-01-01T00:00:00Z");
  const later = await service.getBalance("alice");
  assert.equal(later.credits, 640, "historical credits never expire");
  assert.equal(later.expiring, null);
  assert.equal((await ledger("alice")).filter((e) => e.type === "credits_expired").length, 0);
});

test("compatibility: profiles at 0 or without credits migrate without inventing credits", async () => {
  const service = createCreditService(db);
  await user("zero").set({ remainingCredits: 0, lastCreditReset: utcDay(new Date()) });
  await user("none").set({ email: "x@example.com", lastCreditReset: utcDay(new Date()) });
  assert.equal((await service.getBalance("zero")).credits, 0);
  assert.equal((await service.getBalance("none")).credits, 0);
  await assertConsistent("zero");
  await assertConsistent("none");
});

test("rollback safety: if older code changes only remainingCredits, the server keeps the total the user saw", async () => {
  const service = createCreditService(db);
  await user("alice").set({ remainingCredits: 20, lastCreditReset: utcDay(new Date()) });
  await service.startFreeTrial("alice"); // legacy 20 + trial 15
  assert.equal((await stored("alice")).remainingCredits, 35);

  // Old code spends 5 without touching the buckets
  await user("alice").update({ remainingCredits: 30 });
  assert.equal((await service.getBalance("alice")).credits, 30);
  await assertConsistent("alice");

  // Old code grants 300 (old plan rule) without buckets: kept as legacy
  await user("alice").update({ remainingCredits: 330 });
  assert.equal((await service.getBalance("alice")).credits, 330);
  const data = await assertConsistent("alice");
  assert.equal(data.creditBuckets.find((b: any) => b.id === "legacy").balance, 320);
});

test("trial (decision 1): 15 credits added to the balance, spent first, and only the unused ones expire after 7 days", async () => {
  let clock = new Date("2026-10-22T12:00:00Z");
  const service = createCreditService(db, { now: () => clock });
  await user("alice").set({ remainingCredits: 4, hasUsedFreeTrial: false, lastCreditReset: utcDay(clock) });

  const trial = await service.startFreeTrial("alice");
  assert.equal(trial.credits, 19, "the 4 credits the user had are kept");
  assert.deepEqual(trial.expiring, { amount: 15, expiresAt: new Date(clock.getTime() + 7 * DAY).toISOString() });
  for (let i = 0; i < 3; i++) await service.consume("alice", rid(`t-${i}`));
  assert.equal((await stored("alice")).creditBuckets.find((b: any) => b.id === "trial").balance, 12, "trial credits are spent before historical ones");

  clock = new Date(clock.getTime() + 7 * DAY - 1000);
  assert.equal((await service.getBalance("alice")).credits, 16);
  clock = new Date(clock.getTime() + 2000);
  assert.equal((await service.getBalance("alice")).credits, 4, "after 7 days only the historical 4 remain");
  assert.equal((await ledger("alice")).find((e) => e.id === "expired_trial").amount, 12);
  await assertConsistent("alice");
  // The expiry is recorded once, however many reads follow
  await service.getBalance("alice");
  assert.equal((await ledger("alice")).filter((e) => e.type === "credits_expired").length, 1);
});

test("plan (decision 3): credits added, notice of the next expiry, unused plan credits expire with the plan; historical ones stay", async () => {
  let clock = new Date("2026-10-22T12:00:00Z");
  const service = createCreditService(db, { now: () => clock });
  await user("alice").set({ remainingCredits: 50, lastCreditReset: utcDay(clock) });

  await service.applyPlanPurchase("alice", "mensual", "pay-1");
  const balance = await service.getBalance("alice");
  assert.equal(balance.credits, 350);
  assert.equal(balance.planActive, true);
  assert.deepEqual(balance.expiring, { amount: 300, expiresAt: new Date(clock.getTime() + 30 * DAY).toISOString() });
  await service.consume("alice", rid("p-1"), 10);
  assert.equal((await stored("alice")).creditBuckets.find((b: any) => b.id === "payment_pay-1").balance, 290, "plan credits are spent before historical ones");

  clock = new Date(clock.getTime() + 30 * DAY + 1000);
  assert.deepEqual(await service.expireIfDue("alice"), { expired: true });
  const data = await assertConsistent("alice");
  assert.equal(data.remainingCredits, 50);
  assert.equal(data.subscription.status, "expired");
  assert.equal((await ledger("alice")).find((e) => e.id === "expired_payment_pay-1").amount, 290);
});

test("a second plan adds its credits; each plan's credits expire on their own date", async () => {
  let clock = new Date("2026-10-22T12:00:00Z");
  const service = createCreditService(db, { now: () => clock });
  await user("alice").set({ remainingCredits: 0, lastCreditReset: utcDay(clock) });
  await service.applyPlanPurchase("alice", "mensual", "pay-a");
  clock = new Date(clock.getTime() + 20 * DAY);
  await service.applyPlanPurchase("alice", "trimestral", "pay-b");
  assert.equal((await service.getBalance("alice")).credits, 1300);
  const end = (await stored("alice")).subscription.subscriptionEndDate.toMillis();
  assert.equal(end, clock.getTime() + 90 * DAY, "the subscription shows the furthest end date");

  clock = new Date(clock.getTime() + 11 * DAY); // the monthly plan ended, the quarterly is still active
  const balance = await service.getBalance("alice");
  assert.equal(balance.credits, 1000);
  assert.equal(balance.planActive, true);
  await assertConsistent("alice");
});

test("refund of a failed AI action returns credits to their origin; credits of an expired origin are not revived", async () => {
  let clock = new Date("2026-10-22T12:00:00Z");
  const service = createCreditService(db, { now: () => clock });
  await user("alice").set({ remainingCredits: 1, hasUsedFreeTrial: false, lastCreditReset: utcDay(clock) });
  await service.startFreeTrial("alice"); // legacy 1 + trial 15

  await service.consume("alice", rid("r-1"), 3);
  assert.deepEqual((await ledger("alice")).find((e) => e.id === `consume_${rid("r-1")}`).allocation, [{ bucketId: "trial", amount: 3 }]);
  assert.equal((await service.refund("alice", rid("r-1"))).credits, 16);

  await service.consume("alice", rid("r-2"), 2);
  clock = new Date(clock.getTime() + 8 * DAY);
  assert.deepEqual(await service.refund("alice", rid("r-2")), { credits: 1, refunded: true });
  assert.equal((await ledger("alice")).find((e) => e.id === `consume_${rid("r-2")}`).refundedAmount, 0);
  await assertConsistent("alice");
});

test("compatibility: an action charged by the previous code (no allocation) is refunded to the historical balance", async () => {
  const service = createCreditService(db);
  await user("alice").set({ remainingCredits: 9, lastCreditReset: utcDay(new Date()) });
  await user("alice").collection("creditLedger").doc(`consume_${rid("old")}`).set({ type: "consume", amount: 1, reason: "ai", balanceAfter: 9, calls: 1, refunded: false });

  assert.deepEqual(await service.refund("alice", rid("old")), { credits: 10, refunded: true });
  const data = await assertConsistent("alice");
  assert.equal(data.creditBuckets.find((b: any) => b.id === "legacy").balance, 10);
});

test("daily refill still works on top of the buckets and never stacks", async () => {
  let clock = new Date("2026-10-22T12:00:00Z");
  const service = createCreditService(db, { now: () => clock });
  await user("alice").set({ remainingCredits: 1, lastCreditReset: "2026-10-21" });
  assert.equal((await service.getBalance("alice")).credits, 1, "no refill while there are credits");
  await service.consume("alice", rid("f-1"));
  assert.equal((await service.consume("alice", rid("f-2"))).credits, 4, "at 0: refill 5 and charge 1");
  clock = new Date("2026-10-23T12:00:00Z");
  assert.equal((await service.getBalance("alice")).credits, 4, "the next day there are still credits: no refill");
  await assertConsistent("alice");
});

test("concurrency: consumes, duplicate plan grants, trials and reads at the same time never double-credit or lose credits", async () => {
  const service = createCreditService(db, { maxAttempts: 100 });
  await user("alice").set({ remainingCredits: 10, hasUsedFreeTrial: false, lastCreditReset: utcDay(new Date()) });

  const ops: Promise<unknown>[] = [];
  for (let i = 0; i < 6; i++) ops.push(service.applyPlanPurchase("alice", "mensual", "pay-dup"));
  for (let i = 0; i < 5; i++) ops.push(service.startFreeTrial("alice"));
  for (let i = 0; i < 30; i++) ops.push(service.consume("alice", rid(`c-${i}`)));
  for (let i = 0; i < 5; i++) ops.push(service.getBalance("alice"));
  const results = await Promise.allSettled(ops);

  const plans = results.slice(0, 6).map((r: any) => r.value?.applied);
  assert.equal(plans.filter((a) => a === true).length, 1, "the plan is granted exactly once");
  const trials = results.slice(6, 11);
  assert.equal(trials.filter((r) => r.status === "fulfilled").length, 1, "the trial is granted exactly once");
  assert.ok(trials.filter((r) => r.status === "rejected").every((r: any) => codeOf(r.reason) === "TRIAL_ALREADY_USED"));
  const consumes = results.slice(11, 41);
  const charged = consumes.filter((r) => r.status === "fulfilled").length;
  assert.ok(consumes.filter((r) => r.status === "rejected").every((r: any) => codeOf(r.reason) === "INSUFFICIENT_CREDITS"));

  const data = await assertConsistent("alice");
  assert.equal(data.remainingCredits, 10 + 15 + 300 - charged, "every credit is accounted for");
  const entries = await ledger("alice");
  assert.equal(entries.filter((e) => e.type === "plan_purchase").length, 1);
  assert.equal(entries.filter((e) => e.type === "free_trial").length, 1);
  const consumeEntries = entries.filter((e) => e.type === "consume");
  assert.equal(consumeEntries.length, charged);
  for (const entry of consumeEntries) {
    assert.equal(entry.allocation.reduce((acc: number, part: any) => acc + part.amount, 0), entry.amount, "each charge is fully allocated");
  }
});

test("concurrency: simultaneous refunds of the same action return the credit once", async () => {
  const service = createCreditService(db, { maxAttempts: 100 });
  await user("alice").set({ remainingCredits: 5, lastCreditReset: utcDay(new Date()) });
  await service.consume("alice", rid("once"), 2);
  const results = await Promise.all(Array.from({ length: 8 }, () => service.refund("alice", rid("once"))));
  assert.equal(results.filter((r) => r.refunded).length, 1);
  assert.equal((await assertConsistent("alice")).remainingCredits, 5);
});
