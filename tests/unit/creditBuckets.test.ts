/**
 * Compatibility tests of the PROPOSED credit model (server/credits/creditBuckets.ts, not wired yet).
 * They show that existing balances are preserved and that the approved rules hold:
 * purchases keep existing credits, plan credits expire with their plan, purchased credits never
 * expire, and refunds revoke only unused credits without negative balances.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readState, consume, refundAllocation, dailyRefill, grantPromo, grantPlan, grantPurchased, expire, revokePayment, toStored, total,
  type CreditState,
} from "../../server/credits/creditBuckets";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 21, 12);
const balances = (state: CreditState) => Object.fromEntries(state.buckets.map((b) => [b.id, b.balance]));

test("migration: an existing balance is kept as a 'legacy' bucket that never expires (no one gains or loses)", () => {
  for (const credits of [0, 1, 5, 15, 120, 300, 5000]) {
    const { state, migrated } = readState({ remainingCredits: credits });
    assert.equal(migrated, true);
    assert.equal(total(state), credits);
    assert.equal(toStored(state).remainingCredits, credits);
    if (credits > 0) assert.deepEqual(state.buckets, [{ id: "legacy", kind: "legacy", balance: credits, granted: credits, expiresAt: null }]);
  }
  // Missing or corrupt values never create credits
  assert.equal(total(readState({}).state), 0);
  assert.equal(total(readState({ remainingCredits: -3 }).state), 0);
  assert.equal(total(readState({ remainingCredits: "999" }).state), 0);
  assert.equal(total(readState({ remainingCredits: 10, creditBuckets: [{ id: "x", kind: "hack", balance: 1e9, granted: 1e9, expiresAt: null }] }).state), 10);
});

test("migration: a user with an active plan keeps the whole balance after the plan ends (today's behavior)", () => {
  const { state } = readState({ remainingCredits: 180 });
  expire(state, NOW + 400 * DAY);
  assert.equal(total(state), 180);
});

test("parity: daily refill works exactly like today (5 credits, only at 0, once per day)", () => {
  const { state } = readState({ remainingCredits: 0 });
  assert.equal(dailyRefill(state, 5, false, NOW), true);
  assert.equal(total(state), 5);
  assert.equal(dailyRefill(state, 5, true, NOW), false);
  consume(state, 2, NOW);
  assert.equal(dailyRefill(state, 5, false, NOW), false, "no refill while there are credits");
  consume(state, 3, NOW);
  assert.equal(dailyRefill(state, 5, false, NOW + DAY), true);
  assert.equal(total(state), 5);
});

test("parity: consuming 1 credit per action lowers the total by 1, and fails without credits", () => {
  const { state } = readState({ remainingCredits: 3 });
  for (const expected of [2, 1, 0]) {
    assert.equal(consume(state, 1, NOW).ok, true);
    assert.equal(total(state), expected);
  }
  assert.deepEqual(consume(state, 1, NOW), { ok: false });
  assert.equal(total(state), 0);
});

test("decision 2: buying a plan keeps the credits the user already had", () => {
  const { state } = readState({ remainingCredits: 40 });
  assert.equal(grantPlan(state, "111", "mensual", 300, NOW + 30 * DAY), true);
  assert.equal(total(state), 340);
  assert.equal(grantPlan(state, "111", "mensual", 300, NOW + 30 * DAY), false, "idempotent per payment");
  assert.equal(total(state), 340);
  grantPromo(state, "trial", 15, null);
  assert.equal(total(state), 355);
});

test("consumption order: expiring credits first (free, promo, plan by expiry), then legacy, then purchased", () => {
  const { state } = readState({ remainingCredits: 10 });
  grantPurchased(state, "900", 50);
  grantPlan(state, "201", "anual", 5000, NOW + 365 * DAY);
  grantPlan(state, "200", "mensual", 300, NOW + 30 * DAY);
  grantPromo(state, "promo-oct", 5, NOW + 2 * DAY);
  const result = consume(state, 306, NOW);
  assert.ok(result.ok);
  assert.deepEqual(result.allocation, [{ bucketId: "promo-oct", amount: 5 }, { bucketId: "payment_200", amount: 300 }, { bucketId: "payment_201", amount: 1 }]);
  assert.equal(balances(state).legacy, 10);
  assert.equal(balances(state).payment_900, 50);
});

test("decision 3: plan credits expire with the plan; purchased and legacy credits do not", () => {
  const { state } = readState({ remainingCredits: 20 });
  grantPlan(state, "300", "mensual", 300, NOW + 30 * DAY);
  grantPurchased(state, "301", 100);
  consume(state, 50, NOW);
  const expired = expire(state, NOW + 30 * DAY);
  assert.deepEqual(expired, [{ bucketId: "payment_300", amount: 250 }]);
  assert.equal(total(state), 120);
  assert.deepEqual(balances(state), { legacy: 20, payment_300: 0, payment_301: 100 });
});

test("decision 4: a refund revokes only the unused credits of that payment and records what was consumed", () => {
  const { state } = readState({ remainingCredits: 30 });
  grantPlan(state, "400", "trimestral", 1000, NOW + 90 * DAY);
  consume(state, 120, NOW);
  const result = revokePayment(state, "400");
  assert.deepEqual(result, { found: true, revoked: 880, consumed: 120 });
  assert.equal(total(state), 30, "legacy credits untouched");
  assert.deepEqual(revokePayment(state, "400"), { found: true, revoked: 0, consumed: 1000 }, "a repeated refund revokes nothing more");
});

test("decision 4: no negative balance even if the user spent everything and more from other credits", () => {
  const { state } = readState({ remainingCredits: 0 });
  grantPlan(state, "500", "mensual", 300, NOW + 30 * DAY);
  grantPurchased(state, "501", 20);
  consume(state, 310, NOW);
  assert.deepEqual(revokePayment(state, "500"), { found: true, revoked: 0, consumed: 300 });
  assert.equal(total(state), 10);
  assert.ok(state.buckets.every((b) => b.balance >= 0));
});

test("decision 4: partial refunds revoke the refunded share, capped at the unused credits", () => {
  const { state } = readState({ remainingCredits: 0 });
  grantPlan(state, "600", "mensual", 300, NOW + 30 * DAY);
  consume(state, 100, NOW);
  assert.deepEqual(revokePayment(state, "600", 0.5), { found: true, revoked: 150, consumed: 100 });
  assert.equal(total(state), 50);
  const { state: other } = readState({ remainingCredits: 0 });
  grantPlan(other, "601", "mensual", 300, NOW + 30 * DAY);
  consume(other, 280, NOW);
  assert.deepEqual(revokePayment(other, "601", 0.5), { found: true, revoked: 20, consumed: 280 });
});

test("AI refunds return credits to the bucket they came from, unless it expired meanwhile", () => {
  const { state } = readState({ remainingCredits: 1 });
  grantPlan(state, "700", "mensual", 1, NOW + DAY);
  const charge = consume(state, 2, NOW);
  assert.ok(charge.ok);
  assert.equal(refundAllocation(state, charge.allocation, NOW + 2 * DAY), 1, "the plan credit expired: only the legacy one comes back");
  assert.deepEqual(balances(state), { legacy: 1, payment_700: 0 });
});

test("an AI refund never puts credits back into a refunded plan", () => {
  const { state } = readState({ remainingCredits: 0 });
  grantPlan(state, "750", "mensual", 300, NOW + 30 * DAY);
  const charge = consume(state, 1, NOW);
  assert.ok(charge.ok);
  revokePayment(state, "750");
  assert.equal(refundAllocation(state, charge.allocation, NOW), 0);
  assert.equal(total(state), 0);
});

test("rollback safety: if old code changed the total without the buckets, the next read reconciles to the visible total", () => {
  const { state } = readState({ remainingCredits: 50 });
  grantPlan(state, "800", "mensual", 300, NOW + 30 * DAY);
  const stored = toStored(state);
  // Old code spent 10 credits (total only)
  const lower = readState({ remainingCredits: stored.remainingCredits - 10, creditBuckets: stored.creditBuckets });
  assert.equal(total(lower.state), 340);
  assert.equal(lower.reconciled, -10);
  // Old code granted a daily refill (total only)
  const higher = readState({ remainingCredits: stored.remainingCredits + 5, creditBuckets: stored.creditBuckets });
  assert.equal(total(higher.state), 355);
  assert.equal(balances(higher.state).legacy, 55);
});

test("invariants under 2000 random operations: total = sum of buckets, never negative, integers", () => {
  let seed = 12345;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const { state } = readState({ remainingCredits: 25 });
  let now = NOW;
  let payment = 1000;
  const granted: string[] = [];
  for (let i = 0; i < 2000; i++) {
    const op = Math.floor(random() * 7);
    now += Math.floor(random() * 3 * DAY);
    if (op === 0) consume(state, 1 + Math.floor(random() * 20), now);
    if (op === 1) { const id = String(payment++); grantPlan(state, id, "mensual", 300, now + 30 * DAY); granted.push(id); }
    if (op === 2) { const id = String(payment++); grantPurchased(state, id, 50); granted.push(id); }
    if (op === 3 && granted.length) revokePayment(state, granted[Math.floor(random() * granted.length)], random() < 0.5 ? 1 : 0.5);
    if (op === 4) dailyRefill(state, 5, random() < 0.5, now);
    if (op === 5) expire(state, now);
    if (op === 6) {
      const stored = toStored(state);
      const reread = readState(stored).state;
      assert.equal(total(reread), stored.remainingCredits);
      state.buckets = reread.buckets;
    }
    const stored = toStored(state);
    assert.equal(stored.remainingCredits, stored.creditBuckets.reduce((s, b) => s + b.balance, 0));
    assert.ok(stored.creditBuckets.every((b) => Number.isInteger(b.balance) && b.balance >= 0 && b.balance <= b.granted || b.kind === "legacy"));
  }
});
