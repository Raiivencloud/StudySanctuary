/**
 * Paid plans: the single table used to create preferences, validate payments and grant plans.
 * Derived from SUBSCRIPTION_PLANS (src/constants.ts), which is what the pricing page shows.
 * Prices and credits must only change there, with the owner's approval.
 */
import { SUBSCRIPTION_PLANS } from "../../src/constants";

export const PAYMENT_CURRENCY = "ARS";

export interface PaidPlan {
  id: "mensual" | "trimestral" | "anual";
  name: string;
  /** Checkout item title. */
  title: string;
  price: number;
  credits: number;
  durationDays: number;
}

export const PAID_PLANS: Record<PaidPlan["id"], PaidPlan> = {
  mensual: { id: "mensual", name: SUBSCRIPTION_PLANS.MENSUAL.name, title: "Plan Mensual - Study Sanctuary", price: SUBSCRIPTION_PLANS.MENSUAL.price, credits: SUBSCRIPTION_PLANS.MENSUAL.credits, durationDays: 30 },
  trimestral: { id: "trimestral", name: SUBSCRIPTION_PLANS.TRIMESTRAL.name, title: "Plan Trimestral - Study Sanctuary", price: SUBSCRIPTION_PLANS.TRIMESTRAL.price, credits: SUBSCRIPTION_PLANS.TRIMESTRAL.credits, durationDays: 90 },
  anual: { id: "anual", name: SUBSCRIPTION_PLANS.ANUAL.name, title: "Plan Anual - Study Sanctuary", price: SUBSCRIPTION_PLANS.ANUAL.price, credits: SUBSCRIPTION_PLANS.ANUAL.credits, durationDays: 365 },
};

export function getPaidPlan(planId: unknown): PaidPlan | undefined {
  return typeof planId === "string" && Object.prototype.hasOwnProperty.call(PAID_PLANS, planId)
    ? PAID_PLANS[planId as PaidPlan["id"]]
    : undefined;
}
