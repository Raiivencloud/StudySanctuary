/**
 * Firestore security rules (firestore.rules) against the local emulator.
 * Three groups:
 *  - "conservar": current app behavior that must keep working after Phase 3.
 *  - "aislamiento": protections that already work.
 *  - "escalada": known privilege escalations (todo until Phase 3 fixes the rules).
 */
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { createTestEnv, knownVulnerability, knownBug } from "./env";

let env: RulesTestEnvironment;

const alice = () => env.authenticatedContext("alice", { email: "alice@example.com", email_verified: true }).firestore();
const bob = () => env.authenticatedContext("bob", { email: "bob@example.com", email_verified: true }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

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

before(async () => {
  env = await createTestEnv();
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/alice"), { ...newProfile("alice"), remainingCredits: 10, subscriptionType: "Gratis", hasUsedFreeTrial: false });
    await setDoc(doc(db, "users/bob"), { ...newProfile("bob"), remainingCredits: 10, subscriptionType: "Gratis", hasUsedFreeTrial: true });
    await setDoc(doc(db, "user_courses/bob-course"), course("bob"));
    await setDoc(doc(db, "chats/bob-chat"), { userId: "bob", title: "Privado", createdAt: Timestamp.now() });
    await setDoc(doc(db, "chats/bob-chat/messages/m1"), { role: "user", text: "mensaje privado de bob" });
    await setDoc(doc(db, "stats/global"), { isAiSuspendedForFree: false });
  });
});

// ---------------------------------------------------------------- conservar
test("conservar: el usuario crea su perfil inicial (como AuthContext) y lo lee", async () => {
  await env.clearFirestore();
  await assertSucceeds(setDoc(doc(alice(), "users/alice"), newProfile("alice")));
  await assertSucceeds(getDoc(doc(alice(), "users/alice")));
});

test("conservar: el usuario edita su nombre, foto y preferencias", async () => {
  await assertSucceeds(updateDoc(doc(alice(), "users/alice"), {
    displayName: "Alice B.",
    photoURL: "https://lh3.googleusercontent.com/a/x",
    preferences: { theme: "light", language: "en", notifications: false },
  }));
});

test("conservar: consumo de 1 crédito y recarga diaria a 5 (lógica actual del cliente, hasta la Fase 4)", async () => {
  await assertSucceeds(updateDoc(doc(alice(), "users/alice"), { remainingCredits: 9 }));
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), "users/alice"), { remainingCredits: 0 }));
  await assertSucceeds(updateDoc(doc(alice(), "users/alice"), { remainingCredits: 5, lastCreditReset: "2026-10-21" }));
});

test("conservar: CRUD de cursos, tareas, exámenes y actividades propios", async () => {
  const db = alice();
  await assertSucceeds(setDoc(doc(db, "user_courses/a1"), course("alice")));
  await assertSucceeds(updateDoc(doc(db, "user_courses/a1"), { progress: 50 }));
  await assertSucceeds(getDoc(doc(db, "user_courses/a1")));
  await assertSucceeds(addDoc(collection(db, "tasks"), { userId: "alice", title: "Leer", completed: false, createdAt: Timestamp.now() }));
  await assertSucceeds(addDoc(collection(db, "exams"), { userId: "alice", title: "Parcial", type: "Midterm", createdAt: Timestamp.now() }));
  await assertSucceeds(addDoc(collection(db, "activities"), { userId: "alice", title: "Resumen", type: "summary", timestamp: Date.now(), createdAt: Timestamp.now() }));
  await assertSucceeds(deleteDoc(doc(db, "user_courses/a1")));
});

test("conservar: el usuario envía feedback privado propio", async () => {
  await assertSucceeds(addDoc(collection(alice(), "feedback"), { userId: "alice", type: "bug", message: "x", isPublic: false }));
});

test("conservar: chat propio del asistente de voz con sus mensajes", async () => {
  const db = alice();
  await assertSucceeds(setDoc(doc(db, "chats/alice-chat"), { userId: "alice", title: "Repaso", createdAt: Timestamp.now() }));
  await assertSucceeds(setDoc(doc(db, "chats/alice-chat/messages/m1"), { role: "user", text: "hola" }));
  await assertSucceeds(getDoc(doc(db, "chats/alice-chat/messages/m1")));
});

test("conservar: estadísticas propias de Arena", async () => {
  await assertSucceeds(setDoc(doc(alice(), "arena_stats/alice"), {
    userId: "alice", lives: 3, maxLives: 3, streak: 0, maxStreak: 0, credits: 0, totalPoints: 0,
  }));
});

test("conservar: crear un grupo de estudio y unirse como miembro", async () => {
  const db = alice();
  await assertSucceeds(setDoc(doc(db, "groups/g1"), { name: "Grupo", courseId: "a1", createdBy: "alice", createdAt: Timestamp.now() }));
  await assertSucceeds(setDoc(doc(bob(), "groups/g1/members/bob"), { userId: "bob", role: "member" }));
});

test("conservar: el creador del grupo queda como admin (StudyGroupsView.tsx:148)", knownBug("A-03"), async () => {
  const db = alice();
  await setDoc(doc(db, "groups/g2"), { name: "Grupo", courseId: "a1", createdBy: "alice", createdAt: Timestamp.now() });
  await assertSucceeds(setDoc(doc(db, "groups/g2/members/alice"), { userId: "alice", role: "admin" }));
});

// -------------------------------------------------------------- aislamiento
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

test("aislamiento: no se crean documentos a nombre de otro usuario", async () => {
  const db = alice();
  await assertFails(setDoc(doc(db, "user_courses/fake"), course("bob")));
  await assertFails(addDoc(collection(db, "tasks"), { userId: "bob", title: "x", completed: false, createdAt: Timestamp.now() }));
  await assertFails(addDoc(collection(db, "feedback"), { userId: "bob", message: "x" }));
  await assertFails(setDoc(doc(db, "arena_stats/bob"), { userId: "bob", lives: 3, maxLives: 3, streak: 0, maxStreak: 0, credits: 0, totalPoints: 0 }));
});

test("aislamiento: un usuario común no escribe en la biblioteca pública", async () => {
  await assertFails(setDoc(doc(alice(), "publicLibrary/x"), { topic: "x", content: "y" }));
});

// ----------------------------------------------------------------- escalada
test("escalada: un usuario no puede asignarse role 'admin'", knownVulnerability("C-03"), async () => {
  await assertFails(updateDoc(doc(alice(), "users/alice"), { role: "admin" }));
});

test("escalada: con role 'admin' autoasignado no accede a datos de otros", knownVulnerability("C-03"), async () => {
  await updateDoc(doc(alice(), "users/alice"), { role: "admin" }).catch(() => undefined);
  await assertFails(getDoc(doc(alice(), "user_courses/bob-course")));
});

test("escalada: un usuario no puede aumentarse los créditos", knownVulnerability("C-03 / C-04 (requiere créditos en servidor, Fase 4)"), async () => {
  await assertFails(updateDoc(doc(alice(), "users/alice"), { remainingCredits: 5000 }));
});

test("escalada: un usuario no puede activarse un plan pago", knownVulnerability("C-04"), async () => {
  await assertFails(updateDoc(doc(alice(), "users/alice"), {
    subscriptionType: "Plan Anual",
    remainingCredits: 5000,
    "subscription.status": "active",
    "subscription.type": "anual",
  }));
});

test("escalada: la prueba gratis no se puede reiniciar", knownVulnerability("C-04"), async () => {
  await assertFails(updateDoc(doc(bob(), "users/bob"), { hasUsedFreeTrial: false }));
});

test("escalada: un usuario común no modifica stats/global (interruptor de IA)", knownVulnerability("A-03"), async () => {
  await assertFails(updateDoc(doc(alice(), "stats/global"), { isAiSuspendedForFree: true }));
});

test("escalada: los mensajes de chats ajenos no se leen ni se escriben", knownVulnerability("A-03"), async () => {
  await assertFails(getDoc(doc(alice(), "chats/bob-chat/messages/m1")));
  await assertFails(setDoc(doc(alice(), "chats/bob-chat/messages/m2"), { role: "user", text: "inyectado" }));
});

test("escalada: el feedback no se puede autopublicar en la landing", knownVulnerability("A-03"), async () => {
  await assertFails(addDoc(collection(alice(), "feedback"), { userId: "alice", message: "spam", isPublic: true }));
});
