/** Phase 6 (docs/PHASE6_COMMERCIAL_READINESS.md): real dashboard data, plan copy, personal data, demo safety. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { estimateStudyHours, activityStreak, buildNotifications, timeAgo } from "../../src/lib/studyStats";
import { demoText, demoLocation, DEMO_NOTE } from "../../server/ai/demoContent";
import { assertDemoEnvironment } from "../../scripts/demo/seed";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file: string) => fs.readFileSync(path.join(repoRoot, file), "utf8");
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 21, 15, 0).getTime();

test("P6-6: study hours come from each course's planned hours and progress (no fixed 24.5)", () => {
  assert.equal(estimateStudyHours([]), 0);
  assert.equal(estimateStudyHours([{ progress: 45, estimatedHours: 24 }, { progress: 70, estimatedHours: 40 }, { progress: 20, estimatedHours: 16 }]), 42);
  assert.equal(estimateStudyHours([{ progress: 50 }]), 5, "courses without an estimate count 10 h");
  assert.equal(estimateStudyHours([{ progress: 250, estimatedHours: 10 }, { progress: -5, estimatedHours: 10 }]), 10);
});

test("P6-6: the streak counts consecutive days with activity (no fixed 12)", () => {
  const at = (daysAgo: number, hour = 10) => ({ timestamp: new Date(2026, 9, 21 - daysAgo, hour).getTime() });
  assert.equal(activityStreak([], NOW), 0);
  assert.equal(activityStreak([at(0), at(1), at(2), at(4)], NOW), 3);
  assert.equal(activityStreak([at(1), at(2)], NOW), 2, "a streak is not lost until today ends");
  assert.equal(activityStreak([at(2), at(3)], NOW), 0);
  assert.equal(activityStreak([at(0, 9), at(0, 18), at(1)], NOW), 2, "several activities the same day count once");
});

test("P6-6: notifications come from real exams, plan dates and activity (no fixed messages)", () => {
  const exams = [
    { id: "e1", title: "Parcial de Biología", date: "2026-10-22", time: "10:00" },
    { id: "e2", title: "Final de Cálculo", date: "2026-11-15", time: "14:00" },
    { id: "e3", title: "Examen pasado", date: "2026-10-01" },
  ];
  const activities = [{ title: "Resumen generado", description: "Biología", timestamp: NOW - 30 * 60_000 }];
  const paidEndingSoon = { status: "active", planName: "Plan Mensual", subscriptionEndDate: { toMillis: () => NOW + 3 * DAY } };
  const list = buildNotifications({ exams, activities, subscription: paidEndingSoon, now: NOW });
  assert.deepEqual(list.map((n) => n.id), ["exam-e1", "plan-ending", `activity-${NOW - 30 * 60_000}`]);
  assert.equal(list[0].message, "Parcial de Biología mañana a las 10:00.");
  assert.match(list[1].message, /Plan Mensual termina en 3 días\. Es un pago único: no se renueva solo\./);
  assert.equal(list[2].time, "Hace 30 min");

  // A paid plan far from its end, or no data: no invented messages
  assert.deepEqual(buildNotifications({ exams: [], activities: [], subscription: { status: "active", subscriptionEndDate: { toMillis: () => NOW + 40 * DAY } }, now: NOW }), []);
  // Trial ending tomorrow
  const trial = buildNotifications({ exams: [], activities: [], subscription: { status: "trial", trialStartDate: { seconds: (NOW - 6 * DAY) / 1000 } }, now: NOW });
  assert.equal(trial[0].message, "Tu período de prueba termina mañana.");
  assert.equal(timeAgo(NOW - 3 * 3600_000, NOW), "Hace 3 h");
});

test("P6-6: the Cursos menu entry has a view, and the dashboard lists every course", () => {
  const app = read("src/App.tsx");
  assert.match(app, /currentView === 'dashboard' \|\| currentView === 'courses'/);
  const dashboard = read("src/components/Dashboard.tsx");
  assert.doesNotMatch(dashboard, /\.slice\(0, 1\) \/\/ Only show one placeholder/);
  assert.doesNotMatch(dashboard, /value: '24\.5'|value: '12'/);
  assert.match(dashboard, /\{course\.title\}/);
  const header = read("src/components/Header.tsx");
  assert.doesNotMatch(header, /Tu periodo de prueba termina en 2 días|examen de Bioquímica mañana/);
});

test("P6-1: plan copy says one-time payment and never suggests automatic renewal", () => {
  const view = read("src/components/SubscriptionView.tsx");
  assert.doesNotMatch(view, /period: '\/(mes|3 meses|año)'/);
  assert.doesNotMatch(view, /cancelar en cualquier momento|Al suscribirte|al mes'/i);
  for (const days of [30, 90, 365]) assert.match(view, new RegExp(`pago único · ${days} días`));
  assert.match(view, /no hay renovación automática ni débitos recurrentes/);
  assert.doesNotMatch(read("src/components/SubscriptionSuccess.tsx"), /créditos ilimitados/);
  // Prices and credits unchanged
  const constants = read("src/constants.ts");
  for (const value of ["price: 1200", "credits: 300", "price: 4200", "credits: 1000", "price: 12000", "credits: 5000"]) assert.ok(constants.includes(value), value);
});

test("P6-3/P6-5: plan badges use the stored plan type; no third-party personal data in the UI", () => {
  const header = read("src/components/Header.tsx");
  assert.match(header, /subscription\.type === 'trimestral' && <UserBadge type="silver" \/>/);
  assert.match(header, /subscription\.type === 'anual' && <UserBadge type="gold" \/>/);
  // No hard-coded people: no email literals and no "First Last" fallback names
  for (const file of ["src/components/Header.tsx", "src/components/Sidebar.tsx"]) {
    const source = read(file);
    assert.doesNotMatch(source, /['"`][^'"`\s]+@[^'"`\s]+\.[a-z]{2,}['"`]/i, file);
    const names = [...source.matchAll(/\|\|\s*['"]([A-ZÁÉÍÓÚ][a-záéíóúñ]+) [A-ZÁÉÍÓÚ][a-záéíóúñ]+['"]/g)]
      .filter((m) => !["Perfil", "Usuario", "Estudiante"].includes(m[1]));
    assert.deepEqual(names.map((m) => m[0]), [], file);
  }
});

test("P6-4: the voice assistant follows the app language and handles browsers without speech recognition", () => {
  const source = read("src/components/VoiceAssistant.tsx");
  assert.match(source, /recognition\.lang = SPEECH_LOCALES\[language\]/);
  assert.match(source, /if \(!recognitionRef\.current\) \{/);
  assert.doesNotMatch(source, /recognition\.lang = 'es-ES'/);
});

test("demo AI: presentable Spanish content with a visible 'simulated' note, and real map coordinates", () => {
  const summary = demoText("Resume de forma clara: Mitosis. Nivel: Universidad. Idioma: es.");
  assert.match(summary, /^## Resumen: Mitosis/);
  assert.ok(summary.endsWith(DEMO_NOTE));
  assert.match(demoText("Genera un diagrama Mermaid sobre: Revolución Francesa"), /Revolución Francesa\n├── Conceptos clave/);
  assert.match(demoText("¿Cómo derivo x^2?"), /Sobre "¿Cómo derivo x\^2\?"/);
  const schema = { properties: { name: {}, lat: {}, lon: {}, weather: {}, localTime: {}, funFact: {} } };
  const place = demoLocation(schema, "Busca información sobre: Buenos Aires. Idioma: es.")!;
  assert.equal(place.lat, -34.6037);
  assert.match(String(place.name), /Buenos Aires.*modo desarrollo/);
  assert.equal(demoLocation(schema, "Identifica la ubicación: Lat: 48.85, Lon: 2.35. Idioma: es.")!.lon, 2.35);
  assert.equal(demoLocation({ properties: { a: {} } }, "x"), null);
});

test("demo safety: seed data only goes to the emulators, and production builds refuse demo flags", () => {
  assert.throws(() => assertDemoEnvironment({}), /FIRESTORE_EMULATOR_HOST/);
  const emulators = { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199" };
  assert.throws(() => assertDemoEnvironment({ ...emulators, GCLOUD_PROJECT: "studysanctuary-prod" }), /demo-\*/);
  assert.equal(assertDemoEnvironment({ ...emulators, GCLOUD_PROJECT: "demo-studysanctuary" }), "demo-studysanctuary");
  assert.match(read("vite.config.ts"), /mode === 'production' && \(env\.VITE_DEMO_MODE === 'true' \|\| env\.VITE_USE_FIREBASE_EMULATORS === 'true'\)/);
  const banner = read("src/components/DemoBanner.tsx");
  assert.match(banner, /VITE_DEMO_MODE === 'true'/);
  const devScript = read("scripts/dev-with-emulators.ts");
  assert.match(devScript, /MERCADOPAGO_MODE: "fake"/);
  assert.match(devScript, /AI_PROVIDER: "fake"/);
  assert.match(devScript, /"--project", "demo-studysanctuary"/);
});
