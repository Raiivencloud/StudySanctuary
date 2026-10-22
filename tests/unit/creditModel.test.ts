/** Approved credit model, client side: the advance notice of expiring credits and the terms that describe the rules. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildNotifications } from "../../src/lib/studyStats";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 21, 15, 0).getTime();
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("expiring trial or plan credits are announced within 7 days, and only then", () => {
  const soon = buildNotifications({ exams: [], activities: [], creditExpiry: { amount: 12, expiresAt: new Date(NOW + 2 * DAY).toISOString() }, now: NOW });
  assert.equal(soon.length, 1);
  assert.equal(soon[0].title, "Créditos por vencer");
  assert.equal(soon[0].message, "12 créditos vencen en 2 días. Usalos antes de esa fecha.");

  const one = buildNotifications({ exams: [], activities: [], creditExpiry: { amount: 1, expiresAt: new Date(NOW + DAY).toISOString() }, now: NOW });
  assert.equal(one[0].message, "1 crédito vence mañana. Usalos antes de esa fecha.");

  for (const creditExpiry of [null, { amount: 300, expiresAt: new Date(NOW + 20 * DAY).toISOString() }, { amount: 0, expiresAt: new Date(NOW + DAY).toISOString() }, { amount: 5, expiresAt: new Date(NOW - DAY).toISOString() }]) {
    assert.deepEqual(buildNotifications({ exams: [], activities: [], creditExpiry, now: NOW }), []);
  }
});

test("a plan ending soon gives one notice that mentions its credits, not two", () => {
  const end = NOW + 3 * DAY;
  const list = buildNotifications({
    exams: [], activities: [], now: NOW,
    subscription: { status: "active", planName: "Plan Mensual", subscriptionEndDate: { toMillis: () => end } },
    creditExpiry: { amount: 120, expiresAt: new Date(end).toISOString() },
  });
  assert.deepEqual(list.map((n) => n.id), ["plan-ending"]);
  assert.match(list[0].message, /Los créditos del plan que no uses vencen ese día\./);
});

test("the draft terms describe the approved credit rules", () => {
  const terms = fs.readFileSync(path.join(repoRoot, "src/legal/terms.md"), "utf8");
  assert.doesNotMatch(terms, /REGLAS_CREDITOS_VENCIMIENTO/);
  assert.match(terms, /prueba gratuita\*\*, cuyos créditos vencen \*\*7 días\*\*/);
  assert.match(terms, /Comprar un plan \*\*suma\*\* sus créditos/);
  assert.match(terms, /vencen al terminar ese plan; la app avisa antes/);
  assert.match(terms, /antes de este sistema de vencimientos[\s\S]*\*\*no vencen\*\*/);
  assert.match(terms, /se quitan los créditos de ese pago que todavía no se usaron\. Los reembolsos parciales se revisan manualmente/);
});

test("credit packs are not sold: the only paid products are the three plans", () => {
  const plans = fs.readFileSync(path.join(repoRoot, "server/payments/plans.ts"), "utf8");
  assert.match(plans, /export const PAID_PLANS: Record<PaidPlan\["id"\], PaidPlan> = \{\n  mensual:[^\n]+\n  trimestral:[^\n]+\n  anual:[^\n]+\n\};/);
  assert.doesNotMatch(fs.readFileSync(path.join(repoRoot, "server/payments/paymentService.ts"), "utf8"), /grantPurchased/);
});
