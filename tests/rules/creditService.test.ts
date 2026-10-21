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

test("idempotency: retrying the same request id never charges twice", async () => {
  await user("alice").set({ remainingCredits: 5, lastCreditReset: utcDay(new Date()) });
  const service = createCreditService(db);
  const [a, b] = await Promise.all([service.consume("alice", rid("x")), service.consume("alice", rid("x"))]);
  assert.deepEqual([a.duplicate, b.duplicate].sort(), [false, true]);
  assert.equal(await credits("alice"), 4);
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
