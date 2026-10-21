/**
 * Payments API (Phase 5):
 *   POST /api/create-preference   ID token required; uid and email come from the token
 *   POST /api/payments/sync       ID token required; re-checks one of the user's payments (return page)
 *   POST /api/mercadopago-webhook Mercado Pago notifications, x-signature verified
 *   /api/payments/dev/*           simulated checkout, only with MERCADOPAGO_MODE=fake (never in production)
 */
import { Router, type Request, type Response } from "express";
import { requireUser, getUser, type AuthOptions } from "../security/auth";
import { createRateLimiter } from "../security/rateLimit";
import { logError } from "../security/http";
import { verifyWebhookSignature, buildSignatureHeader } from "../payments/signature";
import { PaymentError, type PaymentService } from "../payments/paymentService";
import type { FakeGateway } from "../payments/gateway";
import { getPaidPlan } from "../payments/plans";

export interface PaymentsRouterOptions {
  auth: AuthOptions;
  /** undefined when payments are not configured (endpoints answer 503). */
  payments?: PaymentService;
  /** Webhook secret. Without it (development only) notifications are accepted unsigned. */
  webhookSecret?: string;
  /** Simulated Mercado Pago (development): enables the /api/payments/dev routes. */
  fakeGateway?: FakeGateway;
  appUrl: string;
  /** Profile summary for the return page. */
  readProfile?: (uid: string) => Promise<{ credits: number; planName: string; planId?: string; status?: string } | null>;
  log?: (message: string) => void;
}

const ERRORS: Record<string, number> = { UNKNOWN_PLAN: 400, PROFILE_NOT_FOUND: 404, INVALID_PAYMENT_ID: 400, FORBIDDEN: 403 };

/** Notification id and topic: Webhooks (?data.id=&type=) or legacy IPN (?id=&topic=). */
export function readNotification(req: Request): { type?: string; dataId?: string } {
  const query = req.query as Record<string, unknown>;
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, any>;
  const type = String(query.type ?? body.type ?? query.topic ?? body.topic ?? "") || undefined;
  const raw = query["data.id"] ?? body.data?.id ?? (type === "payment" ? query.id : undefined);
  return { type, dataId: raw === undefined || raw === null ? undefined : String(raw) };
}

export function createPaymentsRouter(options: PaymentsRouterOptions): Router {
  const router = Router();
  const log = options.log || ((message: string) => console.warn(message));
  const auth = requireUser(options.auth);
  const perUser = createRateLimiter({ windowMs: 60_000, max: 10, key: (_req, res) => `payments:${getUser(res).uid}` });
  if (!options.webhookSecret) log("[Payments] MERCADOPAGO_WEBHOOK_SECRET no configurada: el webhook acepta notificaciones sin firma (solo desarrollo).");

  const unavailable = (res: Response) => res.status(503).json({ error: "PAYMENTS_DISABLED" });
  const fail = (res: Response, error: unknown, context: string) => {
    if (error instanceof PaymentError) return res.status(ERRORS[error.code] || 400).json({ error: error.code });
    logError(context, error);
    res.status(502).json({ error: "PAYMENT_PROVIDER_ERROR" });
  };

  router.post("/api/create-preference", auth, perUser, async (req, res) => {
    if (!options.payments) return unavailable(res);
    const { uid, email } = getUser(res);
    try {
      const checkout = await options.payments.createCheckout(uid, email, req.body?.planId);
      res.json({ id: checkout.preferenceId, init_point: checkout.initPoint });
    } catch (error) {
      fail(res, error, `Payments preference uid=${uid}`);
    }
  });

  router.post("/api/payments/sync", auth, perUser, async (req, res) => {
    if (!options.payments) return unavailable(res);
    const { uid } = getUser(res);
    try {
      const result = await options.payments.processPayment(String(req.body?.paymentId ?? ""), uid);
      const profile = options.readProfile ? await options.readProfile(uid) : null;
      res.json({ outcome: result.outcome, status: result.status ?? null, planId: result.planId ?? null, profile });
    } catch (error) {
      fail(res, error, `Payments sync uid=${uid}`);
    }
  });

  router.post("/api/mercadopago-webhook", async (req, res) => {
    const { type, dataId } = readNotification(req);
    if (options.webhookSecret) {
      const valid = verifyWebhookSignature({
        xSignature: req.get("x-signature"),
        xRequestId: req.get("x-request-id"),
        dataId,
        secret: options.webhookSecret,
      });
      if (!valid) {
        log(`[Payments] Webhook con firma inválida rechazado (type=${type || "?"})`);
        return res.status(401).json({ error: "INVALID_SIGNATURE" });
      }
    }
    if (!options.payments) return unavailable(res);
    if (type !== "payment" || !dataId) return res.status(200).json({ ignored: true });

    try {
      const result = await options.payments.processPayment(dataId);
      if (result.outcome === "invalid") log(`[Payments] Pago ${dataId} no acreditado: ${result.issues?.join(",")}`);
      res.status(200).json({ outcome: result.outcome });
    } catch (error) {
      if (error instanceof PaymentError) return res.status(200).json({ ignored: true });
      // Transient (Mercado Pago or Firestore): 500 makes Mercado Pago retry the notification.
      logError(`Payments webhook payment=${dataId}`, error);
      res.status(500).json({ error: "RETRY" });
    }
  });

  if (options.fakeGateway) mountDevCheckout(router, options as PaymentsRouterOptions & { fakeGateway: FakeGateway });
  return router;
}

/** Simulated Checkout Pro: approve/reject/pending, refunds and chargebacks, each followed by a signed webhook. */
function mountDevCheckout(router: Router, options: PaymentsRouterOptions & { fakeGateway: FakeGateway }) {
  const gateway = options.fakeGateway;
  const notify = async (paymentId: string) => {
    const requestId = `dev-${Date.now()}`;
    const headers: Record<string, string> = { "Content-Type": "application/json", "x-request-id": requestId };
    if (options.webhookSecret) headers["x-signature"] = buildSignatureHeader(paymentId, requestId, options.webhookSecret);
    const response = await fetch(`${options.appUrl}/api/mercadopago-webhook?data.id=${paymentId}&type=payment`, {
      method: "POST", headers, body: JSON.stringify({ type: "payment", action: "payment.updated", data: { id: paymentId } }),
    });
    return response.status;
  };
  const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  router.get("/api/payments/dev/checkout/:preferenceId", (req, res) => {
    const preference = gateway.preferences.get(req.params.preferenceId);
    if (!preference) return res.status(404).send("Preferencia desconocida");
    const item = preference.body.items[0];
    const plan = getPaidPlan(item.id);
    const id = escape(req.params.preferenceId);
    res.type("html").send(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Checkout simulado</title><body style="font-family:system-ui;max-width:480px;margin:40px auto;padding:0 16px">
<h1>Mercado Pago simulado</h1><p>Modo desarrollo: no se cobra dinero real.</p>
<p><strong>${escape(item.title)}</strong><br>${item.currency_id} ${item.unit_price} · ${plan ? plan.credits : "?"} créditos</p>
${["approved", "pending", "rejected"].map((status) => `<form method="post" action="/api/payments/dev/checkout/${id}/${status}"><button style="margin:4px 0;padding:10px 16px">Pagar: ${status}</button></form>`).join("")}
</body></html>`);
  });

  router.post("/api/payments/dev/checkout/:preferenceId/:status", async (req, res) => {
    const preference = gateway.preferences.get(req.params.preferenceId);
    if (!preference || !["approved", "pending", "rejected"].includes(req.params.status)) return res.status(404).send("No encontrado");
    const payment = gateway.pay(req.params.preferenceId, req.params.status);
    await notify(payment.id).catch((error) => logError("Dev checkout webhook", error));
    const back = req.params.status === "rejected" ? preference.body.back_urls.failure
      : req.params.status === "pending" ? preference.body.back_urls.pending : preference.body.back_urls.success;
    const params = new URLSearchParams({ payment_id: payment.id, collection_id: payment.id, status: payment.status, external_reference: preference.body.external_reference });
    res.redirect(`${back}${back.includes("?") ? "&" : "?"}${params}`);
  });

  // Simulates later changes made by Mercado Pago (refund, chargeback, approval of a pending payment).
  router.post("/api/payments/dev/payments/:paymentId/:status", async (req, res) => {
    if (!gateway.payments.has(req.params.paymentId)) return res.status(404).json({ error: "NOT_FOUND" });
    gateway.setStatus(req.params.paymentId, req.params.status);
    res.json({ webhookStatus: await notify(req.params.paymentId) });
  });
}
