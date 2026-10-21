/**
 * Firestore security rules (firestore.rules, TRANSITIONAL credit mode) against the local emulator.
 *  - "conservar": current app behavior that must keep working.
 *  - "aislamiento": users cannot reach other users' private data.
 *  - "escalada": privilege escalations fixed in Phase 3A (audit C-03, C-04, A-03).
 * The final credit mode (no client economic writes) is covered by firestore.final.test.ts.
 */
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, serverTimestamp, Timestamp, arrayUnion } from "firebase/firestore";
import { createTestEnv } from "./env";

let env: RulesTestEnvironment;

const alice = () => env.authenticatedContext("alice", { email: "alice@example.com", email_verified: true }).firestore();
const bob = () => env.authenticatedContext("bob", { email: "bob@example.com", email_verified: true }).firestore();
const carol = () => env.authenticatedContext("carol", { email: "carol@example.com", email_verified: true }).firestore();
const claimAdmin = () => env.authenticatedContext("ops", { email: "ops@example.com", email_verified: true, admin: true }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();
const seed = (fn: (db: any) => Promise<unknown>) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()) as Promise<void>);

const todayUtc = () => new Date().toISOString().split("T")[0];

// Same shape AuthContext writes on first sign-in.
const newProfile = (uid: string) => ({
  uid,
  displayName: uid,
  email: `${uid}@example.com`,
  photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
  role: "user",
  createdAt: serverTimestamp(),
  preferences: { theme: "dark", language: "es", notifications: true },
  subscription: { status: "trial", type: "free", trialStartDate: serverTimestamp(), subscriptionEndDate: null },
});

const course = (userId: string) => ({ userId, title: "Biología", createdAt: Timestamp.now(), progress: 10 });

const arenaStats = (userId: string, extra: Record<string, unknown> = {}) => ({
  userId, lives: 3, maxLives: 3, streak: 0, maxStreak: 0, credits: 0, totalPoints: 0,
  levelPoints: { Inicial: 0, Secundario: 0, Universidad: 0, Master: 0 }, collectibles: [], ...extra,
});

before(async () => {
  env = await createTestEnv();
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, "users/alice"), { ...newProfile("alice"), remainingCredits: 10, subscriptionType: "Gratis", hasUsedFreeTrial: false });
    await setDoc(doc(db, "users/bob"), { ...newProfile("bob"), remainingCredits: 10, subscriptionType: "Gratis", hasUsedFreeTrial: true });
    await setDoc(doc(db, "user_courses/bob-course"), course("bob"));
    await setDoc(doc(db, "chats/bob-chat"), { userId: "bob", title: "Privado", createdAt: Timestamp.now() });
    await setDoc(doc(db, "chats/bob-chat/messages/m1"), { sender: "user", userId: "bob", text: "mensaje privado de bob" });
    await setDoc(doc(db, "stats/global"), { isAiSuspendedForFree: false });
    await setDoc(doc(db, "arena_stats/alice"), arenaStats("alice"));
  });
});

// ================================================================ conservar
test("conservar: el usuario crea su perfil inicial (como AuthContext) y lo lee", async () => {
  await env.clearFirestore();
  await assertSucceeds(setDoc(doc(alice(), "users/alice"), newProfile("alice")));
  await assertSucceeds(getDoc(doc(alice(), "users/alice")));
});

test("conservar: el usuario edita su nombre, foto, banner, fondo y preferencias", async () => {
  const db = alice();
  await assertSucceeds(updateDoc(doc(db, "users/alice"), {
    displayName: "Alice B.",
    photoURL: "data:image/jpeg;base64,AAAA",
    bannerURL: "data:image/jpeg;base64,BBBB",
    preferences: { theme: "light", language: "en", notifications: false },
  }));
  await assertSucceeds(updateDoc(doc(db, "users/alice"), { "preferences.wallpaperUrl": "https://images.unsplash.com/x", "preferences.wallpaperType": "image" }));
  await assertSucceeds(setDoc(doc(db, "users/alice"), { lastLogin: serverTimestamp() }, { merge: true }));
});

test("conservar: la prueba de 7 días vencida pasa a 'expired' (AuthContext)", async () => {
  const snap = await getDoc(doc(alice(), "users/alice"));
  const sub = snap.data()!.subscription;
  await assertSucceeds(setDoc(doc(alice(), "users/alice"), { subscription: { ...sub, status: "expired" } }, { merge: true }));
});

test("conservar (transición): consumo de exactamente 1 crédito", async () => {
  await assertSucceeds(updateDoc(doc(alice(), "users/alice"), { remainingCredits: 9 }));
});

test("conservar (transición): recarga diaria a 5 cuando el saldo es 0, una vez por día UTC", async () => {
  await seed((db) => updateDoc(doc(db, "users/alice"), { remainingCredits: 0, lastCreditReset: "2026-01-01" }));
  await assertSucceeds(updateDoc(doc(alice(), "users/alice"), { remainingCredits: 5, lastCreditReset: todayUtc() }));
});

test("conservar (transición): activar la prueba gratis una sola vez", async () => {
  await assertSucceeds(updateDoc(doc(alice(), "users/alice"), { subscriptionType: "7 DÍAS GRATIS", remainingCredits: 15, hasUsedFreeTrial: true }));
});

test("conservar: CRUD de cursos, tareas, exámenes y actividades propios", async () => {
  const db = alice();
  await assertSucceeds(setDoc(doc(db, "user_courses/a1"), course("alice")));
  await assertSucceeds(updateDoc(doc(db, "user_courses/a1"), { progress: 50 }));
  await assertSucceeds(getDoc(doc(db, "user_courses/a1")));
  const task = await addDoc(collection(db, "tasks"), { userId: "alice", title: "Leer", completed: false, createdAt: Timestamp.now() });
  await assertSucceeds(updateDoc(task, { completed: true }));
  await assertSucceeds(addDoc(collection(db, "exams"), { userId: "alice", title: "Parcial", type: "Midterm", createdAt: Timestamp.now() }));
  await assertSucceeds(addDoc(collection(db, "activities"), { userId: "alice", title: "Resumen", type: "summary", timestamp: Date.now(), createdAt: Timestamp.now() }));
  await assertSucceeds(deleteDoc(doc(db, "user_courses/a1")));
});

test("conservar: el usuario envía feedback (privado, con sugerencia de publicación) y lo ve", async () => {
  const ref = await assertSucceeds(addDoc(collection(alice(), "feedback"), {
    userId: "alice", userName: "Alice", userPhoto: null, type: "opinion", message: "Excelente", rating: 5,
    createdAt: serverTimestamp(), isPublic: false, publicCandidate: true,
  }));
  await assertSucceeds(getDoc(ref));
});

test("conservar: un admin (claim) modera y publica feedback; la landing lo lee", async () => {
  await seed((db) => setDoc(doc(db, "feedback/f1"), { userId: "bob", message: "Muy útil", isPublic: false }));
  await assertFails(getDoc(doc(alice(), "feedback/f1")));
  await assertSucceeds(updateDoc(doc(claimAdmin(), "feedback/f1"), { isPublic: true }));
  await assertSucceeds(getDoc(doc(alice(), "feedback/f1")));
});

test("conservar: chat del asistente de voz con mensajes y borrado (mensajes primero)", async () => {
  const db = alice();
  await assertSucceeds(setDoc(doc(db, "chats/alice-chat"), { userId: "alice", type: "voice", title: "Repaso", createdAt: Timestamp.now() }));
  await assertSucceeds(setDoc(doc(db, "chats/alice-chat/messages/m1"), { text: "hola", sender: "user", userId: "alice", timestamp: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, "chats/alice-chat/messages/m2"), { text: "respuesta", sender: "ai", userId: "alice", timestamp: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(db, "chats/alice-chat/messages/m1")));
  await assertSucceeds(updateDoc(doc(db, "chats/alice-chat"), { updatedAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(doc(db, "chats/alice-chat/messages/m1")));
  await assertSucceeds(deleteDoc(doc(db, "chats/alice-chat/messages/m2")));
  await assertSucceeds(deleteDoc(doc(db, "chats/alice-chat")));
});

test("conservar: grupo de estudio — el creador queda como admin, actualiza Zoom y otros se unen", async () => {
  const db = alice();
  await assertSucceeds(setDoc(doc(db, "groups/g1"), { name: "Grupo", courseId: "a1", description: "", createdBy: "alice", createdAt: serverTimestamp(), memberCount: 1 }));
  await assertSucceeds(setDoc(doc(db, "groups/g1/members/alice"), { userId: "alice", role: "admin", joinedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db, "groups/g1"), { zoomUrl: "https://zoom.us/j/1" }));
  await assertSucceeds(setDoc(doc(bob(), "groups/g1/members/bob"), { userId: "bob", role: "member", joinedAt: serverTimestamp() }));
  await assertSucceeds(addDoc(collection(bob(), "groups/g1/notes"), { groupId: "g1", title: "Resumen", content: "x", authorId: "bob", createdAt: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(db, "groups/g1/members/bob")));
});

test("conservar: el creador de un grupo antiguo (sin membresía) sigue administrándolo", async () => {
  await seed((db) => setDoc(doc(db, "groups/old"), { name: "Viejo", courseId: "c", createdBy: "alice", createdAt: Timestamp.now() }));
  await assertSucceeds(updateDoc(doc(alice(), "groups/old"), { zoomUrl: "https://zoom.us/j/2" }));
  await assertSucceeds(addDoc(collection(alice(), "groups/old/notes"), { groupId: "old", title: "N", content: "x", authorId: "alice", createdAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(alice(), "groups/old/members/alice"), { userId: "alice", role: "admin" }));
});

test("conservar: Arena — alta inicial, respuesta correcta, incorrecta, cooldown, carta y ranking", async () => {
  await seed((db) => deleteDoc(doc(db, "arena_stats/alice")));
  const db = alice();
  await assertSucceeds(setDoc(doc(db, "arena_stats/alice"), arenaStats("alice")));
  await assertSucceeds(setDoc(doc(db, "arena_collectibles/c0"), { userId: "alice", name: "El Arquitecto", rarity: "Fuego", description: "x", imageUrl: "https://picsum.photos/seed/a/400/600", unlockedAt: serverTimestamp() }));

  // Correct answer (ArenaView.handleAnswer): streak 1 -> 10 + 2 points
  await assertSucceeds(updateDoc(doc(db, "arena_stats/alice"), {
    streak: 1, maxStreak: 1, totalPoints: 12, levelPoints: { Inicial: 12, Secundario: 0, Universidad: 0, Master: 0 }, lastAnsweredAt: serverTimestamp(),
  }));
  await assertSucceeds(setDoc(doc(db, "arena_rankings/Inicial_alice"), { userId: "alice", displayName: "Alice", photoURL: "", points: 12, level: "Inicial", updatedAt: serverTimestamp() }, { merge: true }));

  await assertSucceeds(updateDoc(doc(db, "arena_stats/alice"), { collectibles: arrayUnion("c1") }));

  // Wrong answers until 0 lives, then cooldown restore
  await assertSucceeds(updateDoc(doc(db, "arena_stats/alice"), { lives: 2, streak: 0, lastLifeLostAt: new Date().toISOString() }));
  await assertSucceeds(updateDoc(doc(db, "arena_stats/alice"), { lives: 1, streak: 0, lastLifeLostAt: new Date().toISOString() }));
  await assertSucceeds(updateDoc(doc(db, "arena_stats/alice"), { lives: 0, streak: 0, lastLifeLostAt: new Date().toISOString(), cooldownUntil: new Date(Date.now() + 3 * 3600_000).toISOString() }));
  await assertSucceeds(updateDoc(doc(db, "arena_stats/alice"), { lives: 3, cooldownUntil: null }));
});

test("conservar: preguntas de Arena generadas por IA", async () => {
  await assertSucceeds(addDoc(collection(alice(), "arena_questions"), {
    question: "¿2+2?", options: ["3", "4", "5", "6"], correctAnswer: 1, explanation: "Suma", category: "Matemática", level: "Inicial", createdAt: serverTimestamp(),
  }));
});

// ============================================================== aislamiento
test("aislamiento: sin sesión no se lee ningún perfil", async () => {
  await assertFails(getDoc(doc(anonymous(), "users/alice")));
});

test("aislamiento: un usuario no lee ni modifica el perfil de otro", async () => {
  await assertFails(getDoc(doc(alice(), "users/bob")));
  await assertFails(updateDoc(doc(alice(), "users/bob"), { remainingCredits: 0 }));
});

test("aislamiento: cursos ajenos no se leen, editan ni borran", async () => {
  const db = alice();
  await assertFails(getDoc(doc(db, "user_courses/bob-course")));
  await assertFails(updateDoc(doc(db, "user_courses/bob-course"), { title: "x" }));
  await assertFails(deleteDoc(doc(db, "user_courses/bob-course")));
});

test("aislamiento: no se crean documentos a nombre de otro usuario ni se transfieren", async () => {
  const db = alice();
  await assertFails(setDoc(doc(db, "user_courses/fake"), course("bob")));
  await assertFails(addDoc(collection(db, "tasks"), { userId: "bob", title: "x", completed: false, createdAt: Timestamp.now() }));
  await assertFails(addDoc(collection(db, "feedback"), { userId: "bob", message: "x" }));
  await assertFails(setDoc(doc(db, "arena_stats/bob"), arenaStats("bob")));
  const task = await addDoc(collection(db, "tasks"), { userId: "alice", title: "Leer", completed: false, createdAt: Timestamp.now() });
  await assertFails(updateDoc(task, { userId: "bob" }));
});

test("aislamiento: un usuario común no escribe en la biblioteca pública", async () => {
  await assertFails(setDoc(doc(alice(), "publicLibrary/x"), { topic: "x", content: "y" }));
});

test("aislamiento: los mensajes de chats ajenos no se leen, escriben ni borran", async () => {
  const db = alice();
  await assertFails(getDoc(doc(db, "chats/bob-chat/messages/m1")));
  await assertFails(setDoc(doc(db, "chats/bob-chat/messages/m2"), { sender: "user", userId: "alice", text: "inyectado" }));
  await assertFails(deleteDoc(doc(db, "chats/bob-chat/messages/m1")));
  // Messages of a chat that does not exist are not accessible either.
  await assertFails(setDoc(doc(db, "chats/missing/messages/m1"), { sender: "user", userId: "alice", text: "x" }));
});

test("aislamiento: en grupos ajenos no se leen notas ni miembros sin unirse", async () => {
  await seed(async (db) => {
    await setDoc(doc(db, "groups/g2"), { name: "Privado", courseId: "c", createdBy: "bob", createdAt: Timestamp.now() });
    await setDoc(doc(db, "groups/g2/notes/n1"), { groupId: "g2", title: "N", content: "x", authorId: "bob", createdAt: Timestamp.now() });
  });
  await assertFails(getDoc(doc(alice(), "groups/g2/notes/n1")));
  await assertFails(getDoc(doc(alice(), "groups/g2/members/bob")));
});

// ================================================================= escalada
test("escalada: un usuario no puede asignarse role 'admin' ni crear su perfil como admin", async () => {
  await assertFails(updateDoc(doc(alice(), "users/alice"), { role: "admin" }));
  await env.clearFirestore();
  await assertFails(setDoc(doc(alice(), "users/alice"), { ...newProfile("alice"), role: "admin" }));
});

test("escalada: un role 'admin' preexistente ya no da acceso; el claim admin sí", async () => {
  await seed((db) => updateDoc(doc(db, "users/alice"), { role: "admin" }));
  await assertFails(getDoc(doc(alice(), "user_courses/bob-course")));
  await assertSucceeds(getDoc(doc(claimAdmin(), "user_courses/bob-course")));
});

test("escalada: un usuario no puede aumentarse los créditos", async () => {
  const db = alice();
  await assertFails(updateDoc(doc(db, "users/alice"), { remainingCredits: 5000 }));
  await assertFails(updateDoc(doc(db, "users/alice"), { remainingCredits: 8 })); // only -1 per write
});

test("escalada: la recarga diaria no se repite ni se aplica con saldo", async () => {
  const db = alice();
  await assertFails(updateDoc(doc(db, "users/alice"), { remainingCredits: 5, lastCreditReset: todayUtc() })); // balance > 0
  await seed((d) => updateDoc(doc(d, "users/alice"), { remainingCredits: 0, lastCreditReset: todayUtc() }));
  await assertFails(updateDoc(doc(db, "users/alice"), { remainingCredits: 5, lastCreditReset: todayUtc() })); // already refilled today
  await seed((d) => updateDoc(doc(d, "users/alice"), { remainingCredits: 0, lastCreditReset: "2026-01-01" }));
  await assertFails(updateDoc(doc(db, "users/alice"), { remainingCredits: 5, lastCreditReset: "2099-12-31" })); // date must be today (UTC)
  await assertFails(updateDoc(doc(db, "users/alice"), { remainingCredits: 50, lastCreditReset: todayUtc() }));
});

test("escalada: un usuario no puede activarse un plan pago", async () => {
  await assertFails(updateDoc(doc(alice(), "users/alice"), {
    subscriptionType: "Plan Anual",
    remainingCredits: 5000,
    "subscription.status": "active",
    "subscription.type": "anual",
  }));
  await assertFails(updateDoc(doc(alice(), "users/alice"), { "subscription.status": "active" }));
  await assertFails(updateDoc(doc(alice(), "users/alice"), { "subscription.subscriptionEndDate": Timestamp.fromMillis(Date.now() + 365 * 86400_000) }));
});

test("escalada: la prueba gratis no se reinicia ni se repite", async () => {
  await assertFails(updateDoc(doc(bob(), "users/bob"), { hasUsedFreeTrial: false }));
  await assertFails(updateDoc(doc(bob(), "users/bob"), { subscriptionType: "7 DÍAS GRATIS", remainingCredits: 15, hasUsedFreeTrial: true }));
});

test("escalada: el usuario no puede borrar su perfil para recrearlo con créditos nuevos", async () => {
  await assertFails(deleteDoc(doc(alice(), "users/alice")));
  await env.clearFirestore();
  await assertFails(setDoc(doc(alice(), "users/alice"), { remainingCredits: 5000, subscriptionType: "Gratis", hasUsedFreeTrial: false }));
});

test("escalada: el historial de créditos (creditLedger) solo lo escribe el servidor", async () => {
  await assertFails(setDoc(doc(alice(), "users/alice/creditLedger/x"), { amount: 1000 }));
  await assertSucceeds(setDoc(doc(alice(), "users/alice/notes/x"), { text: "otras subcolecciones siguen disponibles" }));
});

test("escalada: un usuario común no modifica stats/global (interruptor de IA); un admin sí", async () => {
  await assertFails(updateDoc(doc(alice(), "stats/global"), { isAiSuspendedForFree: true }));
  await assertFails(setDoc(doc(alice(), "stats/global"), { totalCreditsConsumed: 1 }, { merge: true }));
  await assertSucceeds(getDoc(doc(alice(), "stats/global")));
  await assertSucceeds(updateDoc(doc(claimAdmin(), "stats/global"), { isAiSuspendedForFree: true }));
});

test("escalada: el feedback no se puede autopublicar en la landing", async () => {
  await assertFails(addDoc(collection(alice(), "feedback"), { userId: "alice", message: "spam", isPublic: true }));
  await seed((db) => setDoc(doc(db, "feedback/mine"), { userId: "alice", message: "x", isPublic: false }));
  await assertFails(updateDoc(doc(alice(), "feedback/mine"), { isPublic: true }));
});

test("escalada: miembros comunes no se promueven a admin ni cambian el creador del grupo", async () => {
  await seed(async (db) => {
    await setDoc(doc(db, "groups/g3"), { name: "G", courseId: "c", createdBy: "bob", createdAt: Timestamp.now() });
    await setDoc(doc(db, "groups/g3/members/alice"), { userId: "alice", role: "member" });
  });
  await assertFails(setDoc(doc(carol(), "groups/g3/members/carol"), { userId: "carol", role: "admin" }));
  await assertFails(updateDoc(doc(alice(), "groups/g3/members/alice"), { role: "admin" }));
  await assertFails(updateDoc(doc(alice(), "groups/g3"), { name: "Mío" }));
  await assertFails(updateDoc(doc(bob(), "groups/g3"), { createdBy: "alice" }));
});

test("escalada: Arena — puntos arbitrarios, saltos de racha, créditos y vidas extra", async () => {
  const db = alice();
  await assertFails(updateDoc(doc(db, "arena_stats/alice"), { totalPoints: 1_000_000 }));
  await assertFails(updateDoc(doc(db, "arena_stats/alice"), {
    streak: 1, maxStreak: 1, totalPoints: 500, levelPoints: { Inicial: 500, Secundario: 0, Universidad: 0, Master: 0 }, lastAnsweredAt: serverTimestamp(),
  })); // wrong points for streak 1
  await assertFails(updateDoc(doc(db, "arena_stats/alice"), {
    streak: 40, maxStreak: 40, totalPoints: 90, levelPoints: { Inicial: 90, Secundario: 0, Universidad: 0, Master: 0 }, lastAnsweredAt: serverTimestamp(),
  })); // streak jump
  await assertFails(updateDoc(doc(db, "arena_stats/alice"), { credits: 100 }));
  await assertFails(updateDoc(doc(db, "arena_stats/alice"), { lives: 10, maxLives: 10 }));
  await assertFails(updateDoc(doc(db, "arena_stats/alice"), { lives: 3, cooldownUntil: null, streak: 5 }));
});

test("escalada: Arena — no más de una respuesta correcta por segundo", async () => {
  const db = alice();
  const answer = (streak: number, total: number) => updateDoc(doc(db, "arena_stats/alice"), {
    streak, maxStreak: streak, totalPoints: total, levelPoints: { Inicial: total, Secundario: 0, Universidad: 0, Master: 0 }, lastAnsweredAt: serverTimestamp(),
  });
  await assertSucceeds(answer(1, 12));
  await assertFails(answer(2, 26)); // too fast
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await assertSucceeds(answer(2, 26));
});

test("escalada: el ranking debe coincidir con los puntos registrados del propio usuario", async () => {
  const ranking = (uid: string, points: number) => ({ userId: uid, displayName: uid, photoURL: "", points, level: "Inicial", updatedAt: serverTimestamp() });
  await assertFails(setDoc(doc(alice(), "arena_rankings/Inicial_alice"), ranking("alice", 999_999)));
  await assertFails(setDoc(doc(alice(), "arena_rankings/Inicial_bob"), ranking("bob", 0)));
  await assertSucceeds(setDoc(doc(alice(), "arena_rankings/Inicial_alice"), ranking("alice", 0)));
});

test("escalada: cartas coleccionables y preguntas con contenido inválido", async () => {
  await assertFails(addDoc(collection(alice(), "arena_collectibles"), { userId: "alice", name: "X", rarity: "Legendaria", unlockedAt: serverTimestamp() }));
  await assertFails(addDoc(collection(alice(), "arena_collectibles"), { userId: "bob", name: "X", rarity: "Oro" }));
  await assertFails(addDoc(collection(alice(), "arena_questions"), { question: "x".repeat(5000), options: ["a", "b"], correctAnswer: 0, category: "c", level: "Inicial" }));
  await assertFails(addDoc(collection(alice(), "arena_questions"), { question: "q", options: ["a", "b"], correctAnswer: 7, category: "c", level: "Inicial" }));
});
