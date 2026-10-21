/**
 * Payments (Phase 5): checkout orders and the processing of Mercado Pago payments.
 *
 * - createCheckout(): stores paymentOrders/{orderId} (uid, plan, amount, currency) BEFORE the
 *   preference exists; external_reference is the orderId, never a client-supplied uid.
 * - processPayment(): fetches the payment from Mercado Pago (source of truth), validates it
 *   against its order and applies the outcome in ONE Firestore transaction. Idempotent per
 *   payment id: the ledger entry users/{uid}/creditLedger/payment_<id> is written once.
 *
 * Server-only collections (firestore.rules denies clients): paymentOrders, payments.
 * Design and decisions: docs/PHASE5_PAYMENTS.md
 */
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { planPurchaseWrites, FREE_PLAN_NAME } from "../credits/creditService";
import { getPaidPlan, PAYMENT_CURRENCY, type PaidPlan } from "./plans";
import type { GatewayPayment, PaymentGateway } from "./gateway";

export type PaymentOutcome =
  | "applied"          // approved and the plan was granted now
  | "already_applied"  // approved, granted before (repeated notification)
  | "recorded"         // pending, rejected, cancelled, in mediation...: state saved, no change to the plan
  | "revoked"          // refunded or charged back after being granted
  | "invalid"          // does not match its order (amount, currency, plan, test payment): not granted
  | "ignored";         // unknown payment or not one of our orders

export interface ProcessResult {
  outcome: PaymentOutcome;
  status?: string;
  uid?: string;
  planId?: string;
  issues?: string[];
}

export class PaymentError extends Error {
  constructor(readonly code: "UNKNOWN_PLAN" | "PROFILE_NOT_FOUND" | "INVALID_PAYMENT_ID" | "FORBIDDEN") {
    super(code);
    this.name = "PaymentError";
  }
}

export interface PaymentServiceOptions {
  gateway: PaymentGateway;
  appUrl: string;
  /** Reject test payments (live_mode false). True in production unless explicitly allowed. */
  requireLiveMode: boolean;
  now?: () => Date;
  log?: (message: string) => void;
}

const PAYMENT_ID = /^[0-9]{1,24}$/;
/** Preferences from before Phase 5 (uid as external_reference) are granted only for recent approvals. */
const LEGACY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PENDING_STATUSES = new Set(["pending", "in_process", "authorized"]);
const REVOKING_STATUSES = new Set(["refunded", "charged_back"]);

interface Order {
  uid: string;
  planId: string;
  amount: number;
  currency: string;
  legacy?: boolean;
}

export function createPaymentService(db: Firestore, options: PaymentServiceOptions) {
  const now = options.now || (() => new Date());
  const log = options.log || ((message: string) => console.warn(message));
  const orders = db.collection("paymentOrders");
  const payments = db.collection("payments");
  const userRef = (uid: string) => db.collection("users").doc(uid);
  const ledgerRef = (uid: string, entryId: string) => userRef(uid).collection("creditLedger").doc(entryId);

  /** The order a payment belongs to. Preferences created before Phase 5 used the uid as external_reference. */
  async function findOrder(payment: GatewayPayment): Promise<{ id: string; order: Order } | null> {
    const reference = payment.externalReference;
    if (!reference || !/^[A-Za-z0-9_-]{1,128}$/.test(reference)) return null;
    const snap = await orders.doc(reference).get();
    if (snap.exists) {
      const data = snap.data()!;
      return { id: snap.id, order: { uid: data.uid, planId: data.planId, amount: data.amount, currency: data.currency } };
    }
    const legacyPlan = getPaidPlan(payment.metadata.plan_id);
    if (legacyPlan && (await userRef(reference).get()).exists) {
      return { id: `legacy_${payment.id}`, order: { uid: reference, planId: legacyPlan.id, amount: legacyPlan.price, currency: PAYMENT_CURRENCY, legacy: true } };
    }
    return null;
  }

  function validate(payment: GatewayPayment, order: Order, orderId: string): string[] {
    const issues: string[] = [];
    const plan = getPaidPlan(order.planId);
    if (!plan) issues.push("unknown_plan");
    if (!Number.isFinite(payment.amount) || Math.abs(payment.amount - order.amount) > 0.001) issues.push("amount_mismatch");
    if (payment.currency !== order.currency || order.currency !== PAYMENT_CURRENCY) issues.push("currency_mismatch");
    if (payment.metadata.plan_id !== undefined && payment.metadata.plan_id !== order.planId) issues.push("plan_mismatch");
    if (!order.legacy && payment.metadata.order_id !== undefined && payment.metadata.order_id !== orderId) issues.push("order_mismatch");
    if (options.requireLiveMode && !payment.liveMode) issues.push("test_payment");
    if (order.legacy && payment.status === "approved") {
      const approvedAt = payment.dateApproved ? Date.parse(payment.dateApproved) : NaN;
      if (!Number.isFinite(approvedAt) || now().getTime() - approvedAt > LEGACY_MAX_AGE_MS) issues.push("legacy_old_payment");
    }
    return issues;
  }

  return {
    async createCheckout(uid: string, email: string | undefined, planId: unknown): Promise<{ orderId: string; preferenceId: string; initPoint: string }> {
      const plan = getPaidPlan(planId);
      if (!plan) throw new PaymentError("UNKNOWN_PLAN");
      if (!(await userRef(uid).get()).exists) throw new PaymentError("PROFILE_NOT_FOUND");

      const order = orders.doc();
      await order.set({
        uid, planId: plan.id, amount: plan.price, currency: PAYMENT_CURRENCY,
        status: "created", createdAt: FieldValue.serverTimestamp(),
      });
      const preference = await options.gateway.createPreference({
        orderId: order.id,
        plan,
        payerEmail: email,
        successUrl: `${options.appUrl}/success`,
        pendingUrl: `${options.appUrl}/success`,
        failureUrl: `${options.appUrl}/?view=subscription&payment=failure`,
        notificationUrl: `${options.appUrl}/api/mercadopago-webhook`,
      });
      await order.update({ preferenceId: preference.id });
      return { orderId: order.id, preferenceId: preference.id, initPoint: preference.initPoint };
    },

    /**
     * Applies the CURRENT state of a payment. Safe to call any number of times, concurrently,
     * from the webhook and from the return page. `expectedUid` restricts it to the user's own orders.
     * Throws on transient errors (Mercado Pago or Firestore unavailable) so the webhook answers 500.
     */
    async processPayment(paymentId: string, expectedUid?: string): Promise<ProcessResult> {
      if (!PAYMENT_ID.test(paymentId)) throw new PaymentError("INVALID_PAYMENT_ID");
      const payment = await options.gateway.getPayment(paymentId);
      if (!payment) return { outcome: "ignored" };

      const found = await findOrder(payment);
      if (!found) {
        log(`[Payments] Pago ${paymentId} sin orden conocida (status=${payment.status}): ignorado`);
        return { outcome: "ignored", status: payment.status };
      }
      const { id: orderId, order } = found;
      if (expectedUid && order.uid !== expectedUid) throw new PaymentError("FORBIDDEN");

      const issues = validate(payment, order, orderId);
      const plan = getPaidPlan(order.planId) as PaidPlan;

      return db.runTransaction(async (tx) => {
        const user = userRef(order.uid);
        const purchase = ledgerRef(order.uid, `payment_${paymentId}`);
        const revocation = ledgerRef(order.uid, `revoke_${paymentId}`);
        const record = payments.doc(paymentId);
        const [userSnap, purchaseSnap, revocationSnap] = await Promise.all([tx.get(user), tx.get(purchase), tx.get(revocation)]);
        const start = now();
        // Granted by the pre-Phase 5 webhook: no ledger entry, but recorded as the user's lastPaymentId
        const grantedByOldWebhook = !purchaseSnap.exists && userSnap.data()?.subscription?.lastPaymentId === paymentId;
        const applied = purchaseSnap.exists || grantedByOldWebhook;
        const backfill = () => {
          if (grantedByOldWebhook) {
            tx.set(purchase, { type: "plan_purchase", planId: order.planId, amount: plan?.credits ?? 0, backfilled: true, createdAt: FieldValue.serverTimestamp() });
          }
        };

        const base = {
          uid: order.uid, orderId, planId: order.planId, amount: payment.amount, amountRefunded: payment.amountRefunded,
          currency: payment.currency, status: payment.status, statusDetail: payment.statusDetail || null,
          liveMode: payment.liveMode, history: FieldValue.arrayUnion(payment.status), updatedAt: Timestamp.fromDate(start),
        };
        const writeRecord = (extra: Record<string, unknown>) => tx.set(record, { ...base, ...extra }, { merge: true });
        const writeOrder = (status: string) => {
          if (!order.legacy) tx.set(orders.doc(orderId), { status, paymentId, updatedAt: Timestamp.fromDate(start) }, { merge: true });
        };

        if (payment.status === "approved") {
          if (issues.length > 0 && !applied) {
            writeRecord({ applied, validation: "failed", issues, needsReview: true });
            writeOrder("rejected_validation");
            return { outcome: "invalid" as const, status: payment.status, uid: order.uid, planId: order.planId, issues };
          }
          const partialRefund = payment.amountRefunded > 0;
          if (applied || revocationSnap.exists) {
            backfill();
            writeRecord({ applied: true, ...(partialRefund ? { needsReview: true, reviewReason: "partial_refund" } : {}) });
            return { outcome: "already_applied" as const, status: payment.status, uid: order.uid, planId: order.planId };
          }
          if (!userSnap.exists) {
            writeRecord({ applied: false, needsReview: true, reviewReason: "profile_not_found" });
            return { outcome: "invalid" as const, status: payment.status, uid: order.uid, planId: order.planId, issues: ["profile_not_found"] };
          }
          planPurchaseWrites(tx, user, purchase, plan, paymentId, start);
          writeRecord({ applied: true, appliedAt: Timestamp.fromDate(start), ...(partialRefund ? { needsReview: true, reviewReason: "partial_refund" } : {}) });
          writeOrder("paid");
          return { outcome: "applied" as const, status: payment.status, uid: order.uid, planId: order.planId };
        }

        if (REVOKING_STATUSES.has(payment.status)) {
          if (!applied || revocationSnap.exists) {
            writeRecord({ applied });
            writeOrder(payment.status);
            return { outcome: applied ? "revoked" as const : "recorded" as const, status: payment.status, uid: order.uid, planId: order.planId };
          }
          backfill();
          const current = userSnap.data();
          const planIsCurrent = current?.subscription?.lastPaymentId === paymentId && current?.subscription?.status === "active";
          const creditsRemoved = planIsCurrent && typeof current?.remainingCredits === "number" ? current.remainingCredits : 0;
          if (planIsCurrent) {
            tx.set(user, {
              remainingCredits: 0,
              subscriptionType: FREE_PLAN_NAME,
              subscription: { status: "revoked", revokedReason: payment.status, updatedAt: Timestamp.fromDate(start) },
            }, { merge: true });
          }
          tx.set(revocation, {
            type: "plan_revoked", reason: payment.status, planId: order.planId, creditsRemoved, planWasCurrent: planIsCurrent,
            createdAt: FieldValue.serverTimestamp(),
          });
          writeRecord({ applied: true, revokedAt: Timestamp.fromDate(start), ...(planIsCurrent ? {} : { needsReview: true, reviewReason: "revoked_not_current_plan" }) });
          writeOrder(payment.status);
          return { outcome: "revoked" as const, status: payment.status, uid: order.uid, planId: order.planId };
        }

        // pending / in_process / authorized / rejected / cancelled / in_mediation / unknown states
        backfill();
        writeRecord({ applied, ...(payment.status === "in_mediation" ? { needsReview: true, reviewReason: "dispute_open" } : {}) });
        if (!applied) writeOrder(PENDING_STATUSES.has(payment.status) ? "pending" : payment.status);
        return { outcome: "recorded" as const, status: payment.status, uid: order.uid, planId: order.planId };
      });
    },
  };
}

export type PaymentService = ReturnType<typeof createPaymentService>;
