/**
 * Access to Mercado Pago. The server only trusts what this gateway returns for a payment id
 * (fetched with the server's access token), never the notification body.
 */
import crypto from "crypto";
import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import type { PaidPlan } from "./plans";
import { PAYMENT_CURRENCY } from "./plans";

/** The payment fields the server reads (subset of the Mercado Pago payment resource). */
export interface GatewayPayment {
  id: string;
  status: string;
  statusDetail?: string;
  amount: number;
  amountRefunded: number;
  currency: string;
  externalReference?: string;
  liveMode: boolean;
  /** ISO date of the approval, when approved. */
  dateApproved?: string;
  metadata: Record<string, unknown>;
}

export interface PreferenceInput {
  orderId: string;
  plan: PaidPlan;
  payerEmail?: string;
  successUrl: string;
  failureUrl: string;
  pendingUrl: string;
  notificationUrl: string;
}

export interface PaymentGateway {
  createPreference(input: PreferenceInput): Promise<{ id: string; initPoint: string }>;
  /** null when Mercado Pago does not know the payment (404). Throws on transient errors. */
  getPayment(paymentId: string): Promise<GatewayPayment | null>;
}

export function toGatewayPayment(raw: any): GatewayPayment {
  return {
    id: String(raw.id),
    status: String(raw.status || ""),
    statusDetail: raw.status_detail || undefined,
    amount: Number(raw.transaction_amount),
    amountRefunded: Number(raw.transaction_amount_refunded || 0),
    currency: String(raw.currency_id || ""),
    externalReference: raw.external_reference || undefined,
    liveMode: raw.live_mode === true,
    dateApproved: raw.date_approved || undefined,
    metadata: raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {},
  };
}

export function preferenceBody(input: PreferenceInput) {
  return {
    items: [{ id: input.plan.id, title: input.plan.title, quantity: 1, unit_price: input.plan.price, currency_id: PAYMENT_CURRENCY }],
    ...(input.payerEmail ? { payer: { email: input.payerEmail } } : {}),
    back_urls: { success: input.successUrl, failure: input.failureUrl, pending: input.pendingUrl },
    auto_return: "approved",
    notification_url: input.notificationUrl,
    external_reference: input.orderId,
    metadata: { order_id: input.orderId, plan_id: input.plan.id },
  };
}

export function createMercadoPagoGateway(accessToken: string, timeoutMs = 10_000): PaymentGateway {
  const config = new MercadoPagoConfig({ accessToken, options: { timeout: timeoutMs } });
  return {
    async createPreference(input) {
      const result = await new Preference(config).create({
        body: preferenceBody(input) as any,
        requestOptions: { idempotencyKey: input.orderId },
      });
      if (!result.id || !result.init_point) throw new Error("Mercado Pago no devolvió init_point");
      return { id: result.id, initPoint: result.init_point };
    },
    async getPayment(paymentId) {
      try {
        return toGatewayPayment(await new Payment(config).get({ id: paymentId }));
      } catch (error: any) {
        if (error?.status === 404 || error?.cause?.status === 404) return null;
        throw error;
      }
    },
  };
}

/**
 * Simulated Mercado Pago for development and tests (MERCADOPAGO_MODE=fake, refused in production).
 * Payments live in memory; `pay()` and `setStatus()` play the part of the buyer and of Mercado Pago.
 */
export interface FakeGateway extends PaymentGateway {
  preferences: Map<string, { body: ReturnType<typeof preferenceBody> }>;
  payments: Map<string, GatewayPayment>;
  pay(preferenceId: string, status: string, overrides?: Partial<GatewayPayment>): GatewayPayment;
  setStatus(paymentId: string, status: string, changes?: Partial<GatewayPayment>): GatewayPayment;
  /** Next getPayment() calls throw (simulated outage). */
  failNext(times?: number): void;
}

export function createFakeGateway(options: { checkoutUrl?: (preferenceId: string) => string; liveMode?: boolean } = {}): FakeGateway {
  const preferences = new Map<string, { body: ReturnType<typeof preferenceBody> }>();
  const payments = new Map<string, GatewayPayment>();
  let failures = 0;
  let nextPaymentId = 1000 + Math.floor(Math.random() * 1000);

  return {
    preferences,
    payments,
    async createPreference(input) {
      const id = `pref-${crypto.randomBytes(6).toString("hex")}`;
      preferences.set(id, { body: preferenceBody(input) });
      return { id, initPoint: options.checkoutUrl ? options.checkoutUrl(id) : `https://fake.mercadopago.test/checkout/${id}` };
    },
    async getPayment(paymentId) {
      if (failures > 0) {
        failures--;
        throw Object.assign(new Error("simulated Mercado Pago outage"), { status: 503 });
      }
      const payment = payments.get(paymentId);
      return payment ? { ...payment, metadata: { ...payment.metadata } } : null;
    },
    pay(preferenceId, status, overrides = {}) {
      const preference = preferences.get(preferenceId);
      if (!preference) throw new Error(`unknown preference ${preferenceId}`);
      const item = preference.body.items[0];
      const payment: GatewayPayment = {
        id: String(nextPaymentId++),
        status,
        amount: item.unit_price,
        amountRefunded: 0,
        currency: item.currency_id,
        externalReference: preference.body.external_reference,
        liveMode: options.liveMode ?? false,
        dateApproved: status === "approved" ? new Date().toISOString() : undefined,
        metadata: { ...preference.body.metadata },
        ...overrides,
      };
      payments.set(payment.id, payment);
      return payment;
    },
    setStatus(paymentId, status, changes = {}) {
      const payment = payments.get(paymentId);
      if (!payment) throw new Error(`unknown payment ${paymentId}`);
      const updated = { ...payment, ...changes, status };
      if (status === "approved" && !updated.dateApproved) updated.dateApproved = new Date().toISOString();
      if (status === "refunded" && !("amountRefunded" in changes)) updated.amountRefunded = updated.amount;
      payments.set(paymentId, updated);
      return updated;
    },
    failNext(times = 1) {
      failures = times;
    },
  };
}
