/**
 * Server-side authority for credits, the free trial and paid plans (Phase 3B).
 *
 * NOT WIRED YET: Phase 4 calls consume()/refund() from the AI proxy and exposes
 * getBalance()/startFreeTrial() through authenticated endpoints; Phase 5 calls
 * applyPlanPurchase() from the verified Mercado Pago webhook. After that,
 * firestore.rules switches clientCreditTransitionsEnabled() to false.
 * Design: docs/CREDITS_SERVER_MODEL.md
 *
 * Data stays where the app already reads it (users/{uid}: remainingCredits,
 * subscriptionType, hasUsedFreeTrial, lastCreditReset, subscription), so no migration is
 * needed. Every change is a Firestore transaction and leaves an entry in
 * users/{uid}/creditLedger/{entryId} (readable by the user, writable only by the server).
 */
import { FieldValue, Timestamp, type Firestore, type Transaction, type DocumentReference } from "firebase-admin/firestore";
import { SUBSCRIPTION_PLANS } from "../../src/constants";

export const DAILY_REFILL_CREDITS = 5;
export const FREE_PLAN_NAME = "Gratis";

export type CreditErrorCode = "INSUFFICIENT_CREDITS" | "TRIAL_ALREADY_USED" | "USER_NOT_FOUND" | "INVALID_AMOUNT" | "UNKNOWN_PLAN" | "INVALID_REQUEST_ID";

export class CreditError extends Error {
  constructor(readonly code: CreditErrorCode) {
    super(code);
    this.name = "CreditError";
  }
}

const PAID_PLANS: Record<string, { name: string; credits: number; durationDays: number }> = {
  mensual: { name: SUBSCRIPTION_PLANS.MENSUAL.name, credits: SUBSCRIPTION_PLANS.MENSUAL.credits, durationDays: 30 },
  trimestral: { name: SUBSCRIPTION_PLANS.TRIMESTRAL.name, credits: SUBSCRIPTION_PLANS.TRIMESTRAL.credits, durationDays: 90 },
  anual: { name: SUBSCRIPTION_PLANS.ANUAL.name, credits: SUBSCRIPTION_PLANS.ANUAL.credits, durationDays: 365 },
};

export interface Balance {
  credits: number;
  subscriptionType: string;
  hasUsedFreeTrial: boolean;
  refilledToday: boolean;
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

export function createCreditService(db: Firestore, options: CreditServiceOptions = {}) {
  const now = options.now || (() => new Date());
  const maxAttempts = options.maxAttempts ?? 25;

  const userRef = (uid: string) => db.collection("users").doc(uid);
  const ledgerRef = (uid: string, entryId: string) => userRef(uid).collection("creditLedger").doc(entryId);

  const readCredits = (data: FirebaseFirestore.DocumentData | undefined) =>
    typeof data?.remainingCredits === "number" ? data.remainingCredits : 0;

  /** Daily refill rule (validated on the server): balance <= 0 and not yet refilled today (UTC). */
  function refillIfEligible(tx: Transaction, ref: DocumentReference, data: FirebaseFirestore.DocumentData | undefined, uid: string) {
    const today = utcDay(now());
    const credits = readCredits(data);
    if (credits > 0 || data?.lastCreditReset === today) return { credits, refilled: false };

    tx.set(ref, { remainingCredits: DAILY_REFILL_CREDITS, lastCreditReset: today }, { merge: true });
    tx.set(ledgerRef(uid, `refill_${today}`), {
      type: "daily_refill", amount: DAILY_REFILL_CREDITS, balanceAfter: DAILY_REFILL_CREDITS, createdAt: FieldValue.serverTimestamp(),
    });
    return { credits: DAILY_REFILL_CREDITS, refilled: true };
  }

  return {
    /** Current balance, applying the daily refill when eligible. */
    async getBalance(uid: string): Promise<Balance> {
      return db.runTransaction(async (tx) => {
        const ref = userRef(uid);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new CreditError("USER_NOT_FOUND");
        const data = snap.data();
        const { credits, refilled } = refillIfEligible(tx, ref, data, uid);
        return {
          credits,
          subscriptionType: data?.subscriptionType || FREE_PLAN_NAME,
          hasUsedFreeTrial: data?.hasUsedFreeTrial === true,
          refilledToday: refilled || data?.lastCreditReset === utcDay(now()),
        };
      }, { maxAttempts });
    },

    /**
     * Charges `amount` credits for one AI request, BEFORE calling the model.
     * Atomic: concurrent requests can never spend more than the balance.
     * Idempotent per requestId (a retried request is not charged twice).
     */
    async consume(uid: string, requestId: string, amount = 1, reason = "ai"): Promise<ConsumeResult> {
      if (!Number.isInteger(amount) || amount <= 0 || amount > 100) throw new CreditError("INVALID_AMOUNT");
      if (!REQUEST_ID.test(requestId)) throw new CreditError("INVALID_REQUEST_ID");

      return db.runTransaction(async (tx) => {
        const ref = userRef(uid);
        const entry = ledgerRef(uid, `consume_${requestId}`);
        const [snap, existing] = await Promise.all([tx.get(ref), tx.get(entry)]);
        if (!snap.exists) throw new CreditError("USER_NOT_FOUND");
        if (existing.exists) return { credits: readCredits(snap.data()), duplicate: true };

        const { credits } = refillIfEligible(tx, ref, snap.data(), uid);
        if (credits < amount) throw new CreditError("INSUFFICIENT_CREDITS");

        const balanceAfter = credits - amount;
        tx.set(ref, { remainingCredits: balanceAfter }, { merge: true });
        tx.set(entry, { type: "consume", amount, reason, balanceAfter, refunded: false, createdAt: FieldValue.serverTimestamp() });
        return { credits: balanceAfter, duplicate: false };
      }, { maxAttempts });
    },

    /** Returns the credits of a charged request whose AI call failed. Safe to call twice. */
    async refund(uid: string, requestId: string): Promise<{ credits: number; refunded: boolean }> {
      return db.runTransaction(async (tx) => {
        const ref = userRef(uid);
        const entry = ledgerRef(uid, `consume_${requestId}`);
        const [snap, charge] = await Promise.all([tx.get(ref), tx.get(entry)]);
        if (!snap.exists) throw new CreditError("USER_NOT_FOUND");
        const credits = readCredits(snap.data());
        if (!charge.exists || charge.data()?.refunded === true) return { credits, refunded: false };

        const balanceAfter = credits + Number(charge.data()?.amount || 0);
        tx.set(ref, { remainingCredits: balanceAfter }, { merge: true });
        tx.update(entry, { refunded: true, refundedAt: FieldValue.serverTimestamp() });
        return { credits: balanceAfter, refunded: true };
      }, { maxAttempts });
    },

    /** The 7-day free trial (15 credits), once per account. */
    async startFreeTrial(uid: string): Promise<Balance> {
      return db.runTransaction(async (tx) => {
        const ref = userRef(uid);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new CreditError("USER_NOT_FOUND");
        if (snap.data()?.hasUsedFreeTrial === true) throw new CreditError("TRIAL_ALREADY_USED");

        const plan = SUBSCRIPTION_PLANS.PRUEBA;
        tx.set(ref, { remainingCredits: plan.credits, subscriptionType: plan.name, hasUsedFreeTrial: true }, { merge: true });
        tx.set(ledgerRef(uid, "free_trial"), { type: "free_trial", amount: plan.credits, balanceAfter: plan.credits, createdAt: FieldValue.serverTimestamp() });
        return { credits: plan.credits, subscriptionType: plan.name, hasUsedFreeTrial: true, refilledToday: false };
      }, { maxAttempts });
    },

    /**
     * Activates a paid plan for a VERIFIED payment (Phase 5 webhook). Idempotent per
     * paymentId. Keeps the current business rule: the plan's credits replace the balance.
     */
    async applyPlanPurchase(uid: string, planId: string, paymentId: string): Promise<{ applied: boolean }> {
      const plan = PAID_PLANS[planId];
      if (!plan) throw new CreditError("UNKNOWN_PLAN");
      if (!/^[0-9A-Za-z_-]{1,64}$/.test(paymentId)) throw new CreditError("INVALID_REQUEST_ID");

      return db.runTransaction(async (tx) => {
        const ref = userRef(uid);
        const entry = ledgerRef(uid, `payment_${paymentId}`);
        const [snap, existing] = await Promise.all([tx.get(ref), tx.get(entry)]);
        if (!snap.exists) throw new CreditError("USER_NOT_FOUND");
        if (existing.exists) return { applied: false };

        const start = now();
        const endDate = Timestamp.fromMillis(start.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
        tx.set(ref, {
          remainingCredits: plan.credits,
          subscriptionType: plan.name,
          subscription: {
            status: "active", type: planId, planName: plan.name, subscriptionEndDate: endDate,
            lastPaymentId: paymentId, updatedAt: Timestamp.fromDate(start),
          },
        }, { merge: true });
        tx.set(entry, { type: "plan_purchase", planId, amount: plan.credits, balanceAfter: plan.credits, createdAt: FieldValue.serverTimestamp() });
        return { applied: true };
      }, { maxAttempts });
    },

    /** Marks an active plan as expired once its end date has passed. Credits are left untouched (business decision pending). */
    async expireIfDue(uid: string): Promise<{ expired: boolean }> {
      return db.runTransaction(async (tx) => {
        const ref = userRef(uid);
        const snap = await tx.get(ref);
        const sub = snap.data()?.subscription;
        const end: Timestamp | undefined = sub?.subscriptionEndDate;
        if (!snap.exists || sub?.status !== "active" || !end || end.toMillis() > now().getTime()) return { expired: false };

        tx.set(ref, { subscriptionType: FREE_PLAN_NAME, subscription: { status: "expired" } }, { merge: true });
        tx.set(ledgerRef(uid, `expire_${utcDay(now())}`), { type: "plan_expired", planId: sub.type, createdAt: FieldValue.serverTimestamp() });
        return { expired: true };
      }, { maxAttempts });
    },
  };
}

export type CreditService = ReturnType<typeof createCreditService>;
