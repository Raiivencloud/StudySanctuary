/**
 * Demo data for `npm run demo` (local Firebase emulators only).
 *
 * Creates two Google test accounts in the Auth emulator and sample study data so every
 * screen can be shown without real credentials, real AI or real payments:
 *   - "Valentina (demo)"  student with an active Plan Trimestral, courses, tasks, exams...
 *   - "Admin (demo)"      `admin` custom claim, to show the admin panel
 *
 * Refuses to run unless the three emulator variables are set and the project is demo-*.
 */
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { ARENA_BASE_CARDS } from "../../src/constants";

export const DEMO_PROJECT = "demo-studysanctuary";
export const DEMO_STUDENT = { uid: "demo-student", email: "valentina.demo@studysanctuary.test", displayName: "Valentina (demo)" };
export const DEMO_ADMIN = { uid: "demo-admin", email: "admin.demo@studysanctuary.test", displayName: "Admin (demo)" };
const OTHER_PLAYERS = [
  { uid: "demo-player-1", displayName: "Tomás (demo)", points: 1840 },
  { uid: "demo-player-2", displayName: "Lucía (demo)", points: 1325 },
  { uid: "demo-player-3", displayName: "Martín (demo)", points: 960 },
];

const DAY = 24 * 60 * 60 * 1000;
const isoDate = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().split("T")[0];
// Local initials avatar (data URI): the demo works offline and shows no third-party images
const AVATAR_COLORS = ["#0891b2", "#7c3aed", "#059669", "#d97706", "#db2777"];
const avatar = (seed: string, name = seed) => {
  const initials = name.replace(/\(.*\)/, "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "S";
  const color = AVATAR_COLORS[[...seed].reduce((sum, c) => sum + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${color}"/><text x="32" y="41" font-family="Arial,sans-serif" font-size="26" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};

export function assertDemoEnvironment(env: NodeJS.ProcessEnv = process.env) {
  for (const variable of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"]) {
    if (!env[variable]) throw new Error(`${variable} no está definida: la demo solo carga datos en los emuladores locales.`);
  }
  const project = env.GCLOUD_PROJECT || env.FIREBASE_PROJECT_ID || DEMO_PROJECT;
  if (!project.startsWith("demo-")) throw new Error(`La demo solo usa proyectos demo-* (recibido: ${project}).`);
  return project;
}

export async function seedDemo(projectId = assertDemoEnvironment()) {
  const app = initializeApp({ projectId }, `demo-seed-${Date.now()}`);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const now = Timestamp.now();

  // --- Accounts (Google provider, so they appear in the emulator's Google sign-in page) ---
  // Auth only accepts http(s) photo URLs: the local avatar lives in the Firestore profile
  const imported = await auth.importUsers([DEMO_STUDENT, DEMO_ADMIN].map((user) => ({
    uid: user.uid,
    email: user.email,
    emailVerified: true,
    displayName: user.displayName,
    providerData: [{ uid: `google-${user.uid}`, providerId: "google.com", email: user.email, displayName: user.displayName }],
  })));
  if (imported.failureCount > 0) {
    throw new Error(`No se pudieron crear las cuentas demo: ${imported.errors.map((e) => e.error.message).join("; ")}`);
  }
  await auth.setCustomUserClaims(DEMO_ADMIN.uid, { admin: true });

  const batch = db.batch();
  const profile = (user: typeof DEMO_STUDENT, extra: Record<string, unknown>) => ({
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: avatar(user.uid, user.displayName),
    bannerURL: "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=1200&q=80",
    role: "user",
    createdAt: Timestamp.fromMillis(Date.now() - 40 * DAY),
    lastLogin: now,
    preferences: { theme: "dark", language: "es", notifications: true },
    ...extra,
  });

  // Student with an active plan (granted like a verified payment would)
  batch.set(db.doc(`users/${DEMO_STUDENT.uid}`), profile(DEMO_STUDENT, {
    remainingCredits: 640,
    subscriptionType: "Plan Trimestral",
    hasUsedFreeTrial: true,
    lastCreditReset: isoDate(0),
    subscription: {
      status: "active", type: "trimestral", planName: "Plan Trimestral",
      subscriptionEndDate: Timestamp.fromMillis(Date.now() + 62 * DAY), lastPaymentId: "1000000001", updatedAt: now,
    },
  }));
  batch.set(db.doc(`users/${DEMO_STUDENT.uid}/creditLedger/payment_1000000001`), { type: "plan_purchase", planId: "trimestral", amount: 1000, balanceAfter: 1000, createdAt: now, demo: true });
  batch.set(db.doc(`users/${DEMO_ADMIN.uid}`), profile(DEMO_ADMIN, {
    remainingCredits: 5, subscriptionType: "Gratis", hasUsedFreeTrial: false, lastCreditReset: isoDate(0),
    subscription: { status: "trial", type: "free", trialStartDate: now, subscriptionEndDate: null },
  }));

  // --- Courses ---
  const courses = [
    {
      id: "demo-course-bio", title: "Biología Celular", subtitle: "Células, organelas y división celular", type: "Ciencias", icon: "BookOpen",
      color: "bg-emerald-500", studyLevel: "Universidad", progress: 45, estimatedHours: 24,
      summary: "## Biología Celular\n\nLa célula es la unidad básica de la vida. Este curso recorre su estructura, sus organelas y los procesos de división (mitosis y meiosis).\n\n- **Procariotas y eucariotas**\n- **Membrana plasmática y transporte**\n- **Ciclo celular**",
      completedSections: { theory: true, podcast: false, exam: false },
    },
    {
      id: "demo-course-hist", title: "Historia Argentina", subtitle: "De la Revolución de Mayo a 1853", type: "Historia", icon: "BookOpen",
      color: "bg-amber-500", studyLevel: "Secundario", progress: 20, estimatedHours: 16,
      completedSections: { theory: false, podcast: false, exam: false },
    },
    {
      id: "demo-course-calc", title: "Cálculo I", subtitle: "Límites, derivadas e integrales", type: "Matemática", icon: "BookOpen",
      color: "bg-indigo-500", studyLevel: "Universidad", progress: 70, estimatedHours: 40,
      completedSections: { theory: true, podcast: true, exam: false },
    },
  ];
  for (const { id, ...course } of courses) {
    batch.set(db.doc(`user_courses/${id}`), {
      ...course, userId: DEMO_STUDENT.uid, status: "en progreso", files: [], exams: [],
      createdAt: Timestamp.fromMillis(Date.now() - 20 * DAY),
    });
  }

  // --- Tasks, exams, recent activity ---
  const tasks = [
    { title: "Repasar mitosis y meiosis", description: "Biología Celular · unidad 3", duration: "45 min", completed: false },
    { title: "Resolver guía de derivadas", description: "Cálculo I · ejercicios 1 a 12", duration: "1 h 30 min", completed: false },
    { title: "Leer capítulo 2 de Historia", description: "Revolución de Mayo", duration: "30 min", completed: true },
    { title: "Armar resumen para el parcial", description: "Biología Celular", duration: "1 h", completed: false },
  ];
  tasks.forEach((task, i) => batch.set(db.doc(`tasks/demo-task-${i + 1}`), { ...task, userId: DEMO_STUDENT.uid, createdAt: now }));

  const exams = [
    { title: "Parcial de Biología Celular", date: isoDate(9), time: "10:00", location: "Aula 204", type: "Midterm", tags: ["Biología"], reminder: "1d", color: "bg-emerald-500" },
    { title: "Final de Cálculo I", date: isoDate(23), time: "14:00", location: "Aula Magna", type: "Finals", tags: ["Matemática"], reminder: "2d", color: "bg-indigo-500" },
    { title: "Quiz de Historia", date: isoDate(2), time: "08:30", location: "Virtual", type: "Quiz", tags: ["Historia"], reminder: "1h", color: "bg-amber-500" },
  ];
  exams.forEach((exam, i) => batch.set(db.doc(`exams/demo-exam-${i + 1}`), { ...exam, userId: DEMO_STUDENT.uid, createdAt: now }));

  const activities = [
    { title: "Resumen generado", description: "Biología Celular", type: "summary", minutesAgo: 35 },
    { title: "Flashcards creadas", description: "Cálculo I: derivadas", type: "flashcards", minutesAgo: 180 },
    { title: "Plan de estudio", description: "Historia Argentina", type: "plan", minutesAgo: 1440 },
  ];
  activities.forEach(({ minutesAgo, ...activity }, i) => batch.set(db.doc(`activities/demo-activity-${i + 1}`), {
    ...activity, userId: DEMO_STUDENT.uid, timestamp: Date.now() - minutesAgo * 60_000,
    time: minutesAgo < 60 ? `Hace ${minutesAgo} min` : minutesAgo < 1440 ? `Hace ${Math.round(minutesAgo / 60)} h` : "Ayer",
    createdAt: Timestamp.fromMillis(Date.now() - minutesAgo * 60_000),
  }));

  // --- Study group created by another student, the demo student is a member ---
  batch.set(db.doc("groups/demo-group-bio"), {
    name: "Biología · Parcial 2", courseId: "Biología Celular", description: "Repaso semanal antes del parcial. Compartimos resúmenes y dudas.",
    createdBy: OTHER_PLAYERS[1].uid, createdAt: Timestamp.fromMillis(Date.now() - 10 * DAY), memberCount: 2,
  });
  batch.set(db.doc(`groups/demo-group-bio/members/${OTHER_PLAYERS[1].uid}`), { userId: OTHER_PLAYERS[1].uid, role: "admin", joinedAt: now });
  batch.set(db.doc(`groups/demo-group-bio/members/${DEMO_STUDENT.uid}`), { userId: DEMO_STUDENT.uid, role: "member", joinedAt: now });

  // --- Arena: a populated ranking for the "Secundario" level ---
  for (const player of OTHER_PLAYERS) {
    batch.set(db.doc(`arena_rankings/Secundario_${player.uid}`), {
      userId: player.uid, displayName: player.displayName, photoURL: avatar(player.uid, player.displayName), points: player.points, level: "Secundario", updatedAt: now,
    });
  }

  // --- Global stats for the admin panel ---
  batch.set(db.doc("stats/global"), {
    totalUsers: 128, activeSubscriptions: 23, [`aiCalls_${isoDate(0)}`]: 312, [`credits_${isoDate(0)}`]: 287, totalCreditsConsumed: 9421,
    isAiSuspendedForFree: false, demo: true,
  }, { merge: true });

  await batch.commit();

  // Starter cards of the demo student's Arena album
  const cards = db.batch();
  const collectibleIds: string[] = [];
  for (const card of ARENA_BASE_CARDS) {
    const ref = db.collection("arena_collectibles").doc();
    collectibleIds.push(ref.id);
    cards.set(ref, { ...card, userId: DEMO_STUDENT.uid, imageUrl: `https://picsum.photos/seed/arena_${card.rarity}_${card.name}/400/600`, unlockedAt: FieldValue.serverTimestamp() });
  }
  cards.set(db.doc(`arena_stats/${DEMO_STUDENT.uid}`), {
    userId: DEMO_STUDENT.uid, lives: 3, maxLives: 3, streak: 2, maxStreak: 7, credits: 0, totalPoints: 412,
    levelPoints: { Inicial: 0, Secundario: 412, Universidad: 0, Master: 0 }, collectibles: collectibleIds,
  });
  cards.set(db.doc(`arena_rankings/Secundario_${DEMO_STUDENT.uid}`), {
    userId: DEMO_STUDENT.uid, displayName: DEMO_STUDENT.displayName, photoURL: avatar(DEMO_STUDENT.uid, DEMO_STUDENT.displayName), points: 412, level: "Secundario", updatedAt: now,
  });
  await cards.commit();

  await deleteApp(app);
  return { users: [DEMO_STUDENT, DEMO_ADMIN], courses: courses.length, tasks: tasks.length, exams: exams.length };
}

if (process.argv[1] && /seed\.ts$/.test(process.argv[1])) {
  seedDemo()
    .then((result) => {
      console.log(`[demo] Datos de ejemplo cargados en los emuladores: ${result.courses} cursos, ${result.tasks} tareas, ${result.exams} exámenes.`);
      console.log(`[demo] Cuentas: "${DEMO_STUDENT.displayName}" (estudiante) y "${DEMO_ADMIN.displayName}" (administrador). Usá los botones "Entrar como ..." de http://localhost:3000 (o la ventana "Continuar con Google" con internet).`);
    })
    .catch((error) => {
      console.error(`[demo] ${error.message}`);
      process.exit(1);
    });
}
