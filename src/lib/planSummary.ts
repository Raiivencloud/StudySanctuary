/** What the user's plan really is, for Settings and the header (they used to show fixed text). */
const DAY = 24 * 60 * 60 * 1000;

interface SubscriptionLike { status?: string; type?: string; planName?: string; subscriptionEndDate?: any; trialStartDate?: any }

export interface PlanSummary {
  label: string;      // short label ("Plan Anual", "Prueba gratuita", "Gratis")
  title: string;      // headline
  detail: string;     // one sentence, factual
  isPaid: boolean;
}

const toMillis = (value: any): number | null => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const formatDate = (ms: number) => new Date(ms).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

export function summarizePlan(subscription: SubscriptionLike | null | undefined, now = Date.now()): PlanSummary {
  const end = toMillis(subscription?.subscriptionEndDate);
  if (subscription?.status === 'active' && (!end || end > now)) {
    const name = subscription.planName || 'Plan activo';
    return { label: name, title: name, isPaid: true, detail: end ? `Activo hasta el ${formatDate(end)}. Es un pago único: no se renueva automáticamente.` : 'Plan activo.' };
  }
  if (subscription?.status === 'trial') {
    const start = toMillis(subscription.trialStartDate);
    const trialEnd = start ? start + 7 * DAY : null;
    const detail = trialEnd && trialEnd > now
      ? `Período de prueba hasta el ${formatDate(trialEnd)}. Podés activar una vez 15 créditos de prueba desde Planes.`
      : 'Cuenta gratuita: 5 créditos diarios cuando tu saldo llega a cero.';
    return { label: 'Gratis', title: 'Cuenta gratuita', isPaid: false, detail };
  }
  if (subscription?.status === 'revoked') {
    return { label: 'Gratis', title: 'Cuenta gratuita', isPaid: false, detail: 'Tu plan fue revocado por un reembolso o contracargo. Seguís recibiendo los créditos diarios gratuitos.' };
  }
  if (subscription?.status === 'active' || subscription?.status === 'expired') {
    return { label: 'Gratis', title: 'Cuenta gratuita', isPaid: false, detail: `Tu ${subscription.planName || 'plan'} terminó${end ? ` el ${formatDate(end)}` : ''}. Podés comprar otro cuando quieras.` };
  }
  return { label: 'Gratis', title: 'Cuenta gratuita', isPaid: false, detail: 'Cuenta gratuita: 5 créditos diarios cuando tu saldo llega a cero.' };
}
