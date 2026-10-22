/**
 * Server-side authority for credits, the free trial and paid plans.
 *
 * Credits are kept by origin (docs/CREDITS_BUCKETS_PROPOSAL.md, approved decisions):
 *   - legacy:  balances that existed before this model. NEVER expire, never removed.
 *   - free:    daily refill (5 when the total is 0, once per UTC day). Do not expire.
 *   - promo "trial": the 15-credit free trial, expires 7 days after activation (new trials only).
 *   - plan:    credits of a purchased plan; ADDED to the balance and expire with that plan.
 *   - purchased: separately bought credits (no product sells them today); never expire.
 * Refunds and chargebacks remove only the UNUSED credits of that payment (never a negative balance);
 * partial refunds are flagged for manual review by the payment service.
 *
 * Storage: users/{uid}.creditBuckets plus users/{uid}.remainingCredits (the total the app reads).
 * Profiles are migrated lazily inside the first transaction that touches them. Every change runs in a
 * Firestore transaction on the user document and leaves an entry in users/{uid}/creditLedger/{entryId}
 * (readable by the user, writable only by the server).
 */
import { FieldValue, Timestamp, type Firestore, type Transaction, type DocumentReference, type DocumentData } from "firebase-admin/firestore";
import { SUBSCRIPTION_PLANS } from "../../src/constants";
import { getPaidPlan, type PaidPlan } from "../payments/plans";
import {
  readState, consume as spendFromBuckets, refundAllocation, dailyRefill, grantPromo, grantPlan, expire, revokePayment, toStored, total,
  type CreditState,
} from "./creditBuckets";

export const DAILY_REFILL_CREDITS = 5;
export const FREE_PLAN_NAME = "Gratis";
export const TRIAL_DURATION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CreditErrorCode =
  | "INSUFFICIENT_CREDITS" | "TRIAL_ALREADY_USED" | "USER_NOT_FOUND" | "INVALID_AMOUNT" | "UNKNOWN_PLAN" | "INVALID_REQUEST_ID"
  | "ACTION_LIMIT" | "ACTION_CLOSED" | "DAILY_QUOTA_EXCEEDED";

export class CreditError extends Error {
  constructor(readonly code: CreditErrorCode) {
    super(code);
    this.name = "CreditError";
  }
}

export interface Balance {
  credits: number;
  subscriptionType: string;
  hasUsedFreeTrial: boolean;
  refilledToday: boolean;
  /** Paid plan currently active (used by the AI kill switch for free users). */
  planActive: boolean;
  /** The next credits that will expire (trial or plan), for the advance notice. */
  expiring: { amount: number; expiresAt: string } | null;
}

export interface ConsumeResult {
  credits: number;
  /** True when this requestId was already charged (retries never charge twice). */
  duplicate: boolean;
}

export interface CreditServiceOptions {
  now?: () => Date;
  /** Transaction attempts under contention (Firestore default is 5). */
  maxAttempts?: number;
}

// Same UTC day format the app already uses (new Date().toISOString().split('T')[0]).
export const utcDay = (date: Date) => date.toISOString().split("T")[0];

const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

type LedgerRef = (entryId: string) => DocumentReference;

function isPlanActive(data: DocumentData | undefined, now: Date): boolean {
  const sub = data?.subscription;
  if (sub?.status !== "active") return false;
  const end = sub.subscriptionEndDate;
  return !end || typeof end.toMillis !== "function" || end.toMillis() > now.getTime();
}

/**
 * Credit state of a profile read in the current transaction: lazy migration of the old single
 * balance, reconciliation with the stored total, and expiry of due buckets (each recorded once).
 * `changed` tells the caller that the state must be written even if nothing else changes.
 */
export function loadCreditState(tx: Transaction, data: DocumentData | undefined, ledger: LedgerRef, now: Date): { state: CreditState; changed: boolean } {
  const { state, migrated, reconciled } = readState({ remainingCredits: data?.remainingCredits, creditBuckets: data?.creditBuckets });
  const expired = expire(state, now.getTime());
  for (const item of expired) {
    tx.set(ledger(`expired_${item.bucketId}`), { type: "credits_expired", bucketId: item.bucketId, amount: item.amount, createdAt: FieldValue.serverTimestamp() });
  }
  if (migrated && total(state) > 0) {
    tx.set(ledger("migration_legacy"), { type: "legacy_balance", amount: total(state), note: "Saldo existente al activar el modelo por origen: no vence", createdAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return { state, changed: migrated || reconciled !== 0 || expired.length > 0 };
}

export function saveCreditState(tx: Transaction, user: DocumentReference, state: CreditState, extra: Record<string, unknown> = {}) {
  tx.set(user, { ...toStored(state), ...extra }, { merge: true });
}

function nextExpiration(state: CreditState): Balance["expiring"] {
  const upcoming = state.buckets
    .filter((b) => b.balance > 0 && b.expiresAt !== null && !b.closed)
    .sort((a, b) => (a.expiresAt as number) - (b.expiresAt as number))[0];
  return upcoming ? { amount: upcoming.balance, expiresAt: new Date(upcoming.expiresAt as number).toISOString() } : null;
}

/**
 * Grants a paid plan inside the caller's transaction (verified payment). Decision 2: the plan's
 * credits are ADDED (nothing the user had is removed). The plan bucket expires with the plan.
 * The caller guarantees idempotency (ledger entry payment_<id>).
 */
export function grantPlanInTransaction(
  tx: Transaction, user: DocumentReference, data: DocumentData | undefined, entry: DocumentReference, ledger: LedgerRef,
  plan: PaidPlan, paymentId: string, start: Date,
) {
  const { state } = loadCreditState(tx, data, ledger, start);
  const planEnd = start.getTime() + plan.durationDays * DAY_MS;
  grantPlan(state, paymentId, plan.id, plan.credits, planEnd);

  // With several plans, the subscription shows the latest purchase and the furthest end date
  const currentEnd = isPlanActive(data, start) && typeof data?.subscription?.subscriptionEndDate?.toMillis === "function"
    ? data.subscription.subscriptionEndDate.toMillis() : 0;
  saveCreditState(tx, user, state, {
    subscriptionType: plan.name,
    subscription: {
      status: "active", type: plan.id, planName: plan.name, subscriptionEndDate: Timestamp.fromMillis(Math.max(currentEnd, planEnd)),
      lastPaymentId: paymentId, updatedAt: Timestamp.fromDate(start), revokedReason: FieldValue.delete(),
    },
  });
  tx.set(entry, {
    type: "plan_purchase", planId: plan.id, amount: plan.credits, balanceAfter: total(state),
    expiresAt: Timestamp.fromMillis(planEnd), createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Full refund or chargeback, inside the caller's transaction (decision 4): removes the UNUSED
 * credits of that payment only, records what had been consumed, and revokes the plan if it is the
 * current one. Credits granted before this model (legacy) are never removed.
 */
export function revokePlanInTransaction(
  tx: Transaction, user: DocumentReference, data: DocumentData | undefined, ledger: LedgerRef,
  paymentId: string, reason: string, planId: string, start: Date,
): { revoked: number; consumed: number | null; planWasCurrent: boolean; otherPlanActive: boolean } {
  const { state } = loadCreditState(tx, data, ledger, start);
  const result = revokePayment(state, paymentId);
  const planWasCurrent = data?.subscription?.lastPaymentId === paymentId && data?.subscription?.status === "active";
  const otherPlanActive = state.buckets.some((b) => b.kind === "plan" && b.paymentId !== paymentId && !b.closed && (b.expiresAt ?? 0) > start.getTime());

  saveCreditState(tx, user, state, planWasCurrent && !otherPlanActive
    ? { subscriptionType: FREE_PLAN_NAME, subscription: { status: "revoked", revokedReason: reason, updatedAt: Timestamp.fromDate(start) } }
    : {});
  tx.set(ledger(`revoke_${paymentId}`), {
    type: "plan_revoked", reason, planId, creditsRemoved: result.revoked,
    creditsConsumed: result.found ? result.consumed : null,
    // Plans granted before this model have no bucket: their credits are part of the legacy balance and are kept
    creditsBucketFound: result.found, planWasCurrent, createdAt: FieldValue.serverTimestamp(),
  });
  return { revoked: result.revoked, consumed: result.found ? result.consumed : null, planWasCurrent, otherPlanActive };
}

export function createCreditService(db: Firestore, options: CreditServiceOptions = {}) {
  const now = options.now || (() => new Date());
  const maxAttempts = options.maxAttempts ?? 25;

  const userRef = (uid: string) => db.collection("users").doc(uid);
  const ledgerRef = (uid: string, entryId: string) => userRef(uid).collection("creditLedger").doc(entryId);
  const ledgerOf = (uid: string): LedgerRef => (entryId) => ledgerRef(uid, entryId);

  /** Daily refill rule (validated on the server): total 0 and not yet refilled today (UTC). */
  function refillIfEligible(tx: Transaction, uid: string, data: DocumentData | undefined, state: CreditState) {
    const today = utcDay(now());
    const refilled = dailyRefill(state, DAILY_REFILL_CREDITS, data?.lastCreditReset === today, now().getTime());
    if (refilled) {
      tx.set(ledgerRef(uid, `refill_${today}`), {
        type: "daily_refill", amount: DAILY_REFILL_CREDITS, balanceAfter: total(state), createdAt: FieldValue.serverTimestamp(),
      });
    }
    return { refilled, extra: refilled ? { lastCreditReset: today } : {} };
  }

  return {
    /** Current balance, applying expiry, migration and the daily refill when eligible. */
    async getBalance(uid: string): Promise<Balance> {
      return db.runTransaction(async (tx) => {
        const ref = userRef(uid);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new CreditError("USER_NOT_FOUND");
        const data = snap.data();
        const { state, changed } = loadCreditState(tx, data, ledgerOf(uid), now());
        const { refilled, extra } = refillIfEligible(tx, uid, data, state);
        if (changed || refilled) saveCreditState(tx, ref, state, extra);
        return {
          credits: total(state),
          subscriptionType: data?.subscriptionType || FREE_PLAN_NAME,
          hasUsedFreeTrial: data?.hasUsedFreeTrial === true,
          refilledToday: refilled || data?.lastCreditReset === utcDay(now()),
          planActive: isPlanActive(data, now()),
          expiring: nextExpiration(state),
        };
      }, { maxAttempts });
    },

    /**
     * Charges `amount` credits for one user action, BEFORE calling the model.
     * Atomic: concurrent requests can never spend more than the balance. Credits that expire first
     * are spent first; the allocation is recorded so a refund returns them to the same buckets.
     * Idempotent per requestId (an action is charged once). Later calls of the same action
     * are allowed up to `maxCalls` in total; a refunded action cannot be reused.
     */
    async consume(uid: string, requestId: string, amount = 1, reason = "ai", limits: { maxCalls?: number } = {}): Promise<ConsumeResult> {
      if (!Number.isInteger(amount) || amount <= 0 || amount > 100) throw new CreditError("INVALID_AMOUNT");
      if (!REQUEST_ID.test(requestId)) throw new CreditError("INVALID_REQUEST_ID");

      return db.runTransaction(async (tx) => {
        const ref = userRef(uid);
        const entry = ledgerRef(uid, `consume_${requestId}`);
        const [snap, existing] = await Promise.all([tx.get(ref), tx.get(entry)]);
        if (!snap.exists) throw new CreditError("USER_NOT_FOUND");
        const data = snap.data();
        const { state, changed } = loadCreditState(tx, data, ledgerOf(uid), now());

        if (existing.exists) {
          const entryData = existing.data() || {};
          if (entryData.refunded === true) throw new CreditError("ACTION_CLOSED");
          const calls = typeof entryData.calls === "number" ? entryData.calls : 1;
          if (calls >= (limits.maxCalls ?? 1)) throw new CreditError("ACTION_LIMIT");
          tx.update(entry, { calls: calls + 1 });
          if (changed) saveCreditState(tx, ref, state);
          return { credits: total(state), duplicate: true };
        }

        const { refilled, extra } = refillIfEligible(tx, uid, data, state);
        const charge = spendFromBuckets(state, amount, now().getTime());
        if (!charge.ok) {
          if (changed || refilled) saveCreditState(tx, ref, state, extra);
          throw new CreditError("INSUFFICIENT_CREDITS");
        }
        saveCreditState(tx, ref, state, extra);
        tx.set(entry, {
          type: "consume", amount, reason, balanceAfter: total(state), calls: 1, refunded: false,
          allocation: charge.allocation, createdAt: FieldValue.serverTimestamp(),
        });
        return { credits: total(state), duplicate: false };
      }, { maxAttempts });
    },

    /** Returns the credits of a charged request whose AI call failed. Safe to call twice. */
    async refund(uid: string, requestId: string): Promise<{ credits: number; refunded: boolean }> {
      return db.runTransaction(async (tx) => {
        const ref = userRef(uid);
        const entry = ledgerRef(uid, `consume_${requestId}`);
        const [snap, charge] = await Promise.all([tx.get(ref), tx.get(entry)]);
        if (!snap.exists) throw new CreditError("USER_NOT_FOUND");
        const { state, changed } = loadCreditState(tx, snap.data(), ledgerOf(uid), now());
        if (!charge.exists || charge.data()?.refunded === true) {
          if (changed) saveCreditState(tx, ref, state);
          return { credits: total(state), refunded: false };
        }

        const chargeData = charge.data() || {};
        const allocation = Array.isArray(chargeData.allocation)
          ? chargeData.allocation
          // Charged before this model: the credit goes back to the legacy balance
          : [{ bucketId: "legacy", amount: Number(chargeData.amount || 0) }];
        if (!Array.isArray(chargeData.allocation) && !state.buckets.some((b) => b.id === "legacy")) {
          state.buckets.push({ id: "legacy", kind: "legacy", balance: 0, granted: 0, expiresAt: null });
        }
        const returned = refundAllocation(state, allocation, now().getTime());
        saveCreditState(tx, ref, state);
        tx.update(entry, { refunded: true, refundedAmount: returned, refundedAt: FieldValue.serverTimestamp() });
        return { credits: total(state), refunded: true };
      }, { maxAttempts });
    },

    /** The free trial: 15 credits ADDED to the balance, once per account, expiring after 7 days. */
    async startFreeTrial(uid: string): Promise<Balance> {
      return db.runTransaction(async (tx) => {
        const ref = userRef(uid);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new CreditError("USER_NOT_FOUND");
        const data = snap.data();
        if (data?.hasUsedFreeTrial === true) throw new CreditError("TRIAL_ALREADY_USED");

        const plan = SUBSCRIPTION_PLANS.PRUEBA;
        const { state } = loadCreditState(tx, data, ledgerOf(uid), now());
        const expiresAt = now().getTime() + TRIAL_DURATION_DAYS * DAY_MS;
        grantPromo(state, "trial", plan.credits, expiresAt);
        saveCreditState(tx, ref, state, { subscriptionType: plan.name, hasUsedFreeTrial: true });
        tx.set(ledgerRef(uid, "free_trial"), {
          type: "free_trial", amount: plan.credits, balanceAfter: total(state), expiresAt: Timestamp.fromMillis(expiresAt), createdAt: FieldValue.serverTimestamp(),
        });
        return {
          credits: total(state), subscriptionType: plan.name, hasUsedFreeTrial: true, refilledToday: false,
          planActive: isPlanActive(data, now()), expiring: nextExpiration(state),
        };
      }, { maxAttempts });
    },

    /**
     * Activates a paid plan for a VERIFIED payment (also used by tests and operations).
     * Idempotent per paymentId. The payment webhook uses grantPlanInTransaction directly.
     */
    async applyPlanPurchase(uid: string, planId: string, paymentId: string): Promise<{ applied: boolean }> {
      const plan = getPaidPlan(planId);
      if (!plan) throw new CreditError("UNKNOWN_PLAN");
      if (!/^[0-9A-Za-z_-]{1,64}$/.test(paymentId)) throw new CreditError("INVALID_REQUEST_ID");

      return db.runTransaction(async (tx) => {
        const ref = userRef(uid);
        const entry = ledgerRef(uid, `payment_${paymentId}`);
        const [snap, existing] = await Promise.all([tx.get(ref), tx.get(entry)]);
        if (!snap.exists) throw new CreditError("USER_NOT_FOUND");
        if (existing.exists) return { applied: false };

        grantPlanInTransaction(tx, ref, snap.data(), entry, ledgerOf(uid), plan, paymentId, now());
        return { applied: true };
      }, { maxAttempts });
    },

    /**
     * Daily quota for features that do not cost credits (they were free before Phase 4).
     * Counted per user and UTC day; the counter lives in the server-only creditLedger.
     */
    async recordIncludedUsage(uid: string, feature: string, dailyLimit: number): Promise<{ used: number }> {
      return db.runTransaction(async (tx) => {
        const entry = ledgerRef(uid, `usage_${utcDay(now())}`);
        const snap = await tx.get(entry);
        const used = typeof snap.data()?.count === "number" ? snap.data()!.count : 0;
        if (used >= dailyLimit) throw new CreditError("DAILY_QUOTA_EXCEEDED");
        tx.set(entry, { type: "included_usage", count: used + 1, byFeature: { [feature]: FieldValue.increment(1) }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { used: used + 1 };
      }, { maxAttempts });
    },

    /**
     * Marks an active plan as expired once its end date has passed, and expires the credits of plan
     * buckets that are due (decision 3). Legacy and separately purchased credits are never touched.
     */
    async expireIfDue(uid: string): Promise<{ expired: boolean }> {
      return db.runTransaction(async (tx) => {
        const ref = userRef(uid);
        const snap = await tx.get(ref);
        if (!snap.exists) return { expired: false };
        const data = snap.data();
        const { state, changed } = loadCreditState(tx, data, ledgerOf(uid), now());
        const sub = data?.subscription;
        const end: Timestamp | undefined = sub?.subscriptionEndDate;
        const due = sub?.status === "active" && !!end && typeof end.toMillis === "function" && end.toMillis() <= now().getTime();

        if (due) {
          saveCreditState(tx, ref, state, { subscriptionType: FREE_PLAN_NAME, subscription: { status: "expired" } });
          tx.set(ledgerRef(uid, `expire_${utcDay(now())}`), { type: "plan_expired", planId: sub.type, createdAt: FieldValue.serverTimestamp() });
        } else if (changed) {
          saveCreditState(tx, ref, state);
        }
        return { expired: due };
      }, { maxAttempts });
    },
  };
}

export type CreditService = ReturnType<typeof createCreditService>;
