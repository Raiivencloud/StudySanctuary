/** Phase 7: no invented testimonials, numbers or promises in the UI (docs/PHASE7_COMMERCIAL_BLOCKERS.md). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { summarizePlan } from "../../src/lib/planSummary";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file: string) => fs.readFileSync(path.join(repoRoot, file), "utf8");
const DAY = 24 * 60 * 60 * 1000;

const FORBIDDEN: [string, RegExp][] = [
  ["src/components/LandingView.tsx", /Mateo G\.|Sofía R\.|Lucas P\.|Elena M\.|Ingeniería UBA|Derecho UNLP|UBA • UTN|ejercicios reales de exámenes|Simulador de reacciones|laboratorios virtuales|cuerpo libre|simulaciones de vectores|Maximiza tu IQ|correcciones|corrección automatizada|estudios 2x|cuántico|v4\.0\.2|StudySanctuary v4|SANCTUARY LABS|Estado del Sistema|perfil cognitivo|redes neuronales|diseño curricular|más inmersiva del planeta|<Twitter|<Github/],
  ["src/components/SubscriptionView.tsx", /Grupos de estudio ilimitados|Sin anuncios|Soporte prioritario|Velocidad Turbo|Acceso Prioritario|Soporte Preferencial|EL MÁS ELEGIDO|Ahorrás|oldPrice: '|Study Sanctuary Pro|Acceso completo por 7 días/],
  ["src/constants.ts", /oldPrice|de ahorro|toda tu cursada/],
  ["src/components/SettingsView.tsx", />12<|>85%<|IA Ilimitada|Sincronización Drive|Cuenta Verificada|Contraseña actualizada|showPasswordModal|>Premium<|aida-public|'\/subscription'|Português/],
  ["src/components/HelpCenterView.tsx", /Chat en Vivo|24\/7|En línea ahora|Un agente se conectará|WhatsApp/],
  ["src/components/Header.tsx", /PLAN PREMIUM|VER HISTORIAL COMPLETO/],
  ["src/components/SubscriptionSuccess.tsx", /Soporte Preferencial|créditos ilimitados/],
  ["src/components/UsageLimitModal.tsx", /planes premium|no tiene límites/],
  ["src/components/CourseDetail.tsx", /Formalismo|Crítica Contextual|Examen de Unidad|Prioridad Alta|estimatedHours \|\| 4\.5|basadas en tu progreso/],
  ["src/components/Dashboard.tsx", /Gemelo Digital 3D|modelo 3D interactivo|>\s*Datos\s*</],
  ["src/components/PodcastView.tsx", /<span>5:00<\/span>|duration: 300|<SkipBack|<SkipForward/],
  ["src/components/BooksView.tsx", /texto ÍNTEGRO|transcriptor de libros|book\.rating|selectedBook\.rating/],
  ["src/components/Sidebar.tsx", /Raiiven Games/],
  ["src/components/ArenaView.tsx", /'Agustín'/],
  ["src/components/FeedbackView.tsx", /Raiivencloud/],
  ["src/components/CalendarView.tsx", /Simulate setting a reminder/],
];

test("fictitious testimonials, invented numbers and unimplemented promises are gone", () => {
  for (const [file, pattern] of FORBIDDEN) {
    const match = pattern.exec(read(file));
    assert.equal(match, null, `${file} still contains "${match?.[0]}"`);
  }
});

test("buttons that used to do nothing now navigate or were removed", () => {
  assert.match(read("src/components/UsageLimitModal.tsx"), /onClick=\{\(\) => window\.location\.assign\('\/\?view=subscription'\)\}/);
  assert.match(read("src/components/UserCreditStats.tsx"), /window\.location\.assign\('\/\?view=subscription'\)/);
  assert.match(read("src/components/CourseDetail.tsx"), /onClick=\{\(\) => window\.location\.assign\('\/\?view=dashboard'\)\}[^>]*>Inicio/);
  assert.match(read("src/components/StudyGroupsView.tsx"), /value=\{groupSearch\}/);
  assert.match(read("src/App.tsx"), /<DrivePickerModal isOpen=\{isDrivePickerOpen\}/);
  assert.match(read("src/App.tsx"), /onDriveClick=\{\(\) => setIsDrivePickerOpen\(true\)\}/);
});

test("the plan shown in Settings and the header comes from the user's real subscription", () => {
  const now = Date.UTC(2026, 9, 22, 12);
  const paid = summarizePlan({ status: "active", type: "anual", planName: "Plan Anual", subscriptionEndDate: { toMillis: () => now + 100 * DAY } }, now);
  assert.equal(paid.isPaid, true);
  assert.equal(paid.label, "Plan Anual");
  assert.match(paid.detail, /no se renueva automáticamente/);
  assert.equal(summarizePlan({ status: "active", planName: "Plan Mensual", subscriptionEndDate: { toMillis: () => now - DAY } }, now).isPaid, false, "expired by date");
  assert.match(summarizePlan({ status: "revoked" }, now).detail, /reembolso o contracargo/);
  assert.match(summarizePlan({ status: "trial", trialStartDate: { seconds: (now - DAY) / 1000 } }, now).detail, /Período de prueba hasta/);
  assert.equal(summarizePlan(undefined, now).title, "Cuenta gratuita");
});

test("the price facts that motivated removing the 'savings' claims (prices unchanged)", () => {
  const constants = read("src/constants.ts");
  const price = (id: string) => Number(new RegExp(`id: '${id}',[\\s\\S]*?price: (\\d+)`).exec(constants)![1]);
  const credits = (id: string) => Number(new RegExp(`id: '${id}',[\\s\\S]*?credits: (\\d+)`).exec(constants)![1]);
  assert.deepEqual([price("mensual"), price("trimestral"), price("anual")], [1200, 4200, 12000]);
  assert.ok(price("trimestral") / credits("trimestral") > price("mensual") / credits("mensual"), "the 90-day plan costs more per credit than the monthly one");
});
