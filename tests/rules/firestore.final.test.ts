/**
 * firestore.rules in FINAL credit mode (clientCreditTransitionsEnabled() == false), the
 * configuration to deploy together with server-side credits (Phase 3B/4). The client can no
 * longer write any economic field; profile editing keeps working.
 */
import { test, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { createTestEnv, finalModeRules } from "./env";

let env: RulesTestEnvironment;
const alice = () => env.authenticatedContext("alice", { email: "alice@example.com", email_verified: true }).firestore();
const todayUtc = () => new Date().toISOString().split("T")[0];

const profile = {
  uid: "alice", displayName: "alice", email: "alice@example.com", role: "user", createdAt: serverTimestamp(),
  preferences: { theme: "dark", language: "es", notifications: true },
  subscription: { status: "trial", type: "free", trialStartDate: serverTimestamp(), subscriptionEndDate: null },
};

before(async () => {
  env = await createTestEnv({ projectId: "demo-studysanctuary-final", firestoreRules: finalModeRules() });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), "users/alice"), { ...profile, remainingCredits: 3, subscriptionType: "Gratis", hasUsedFreeTrial: false, lastCreditReset: "2026-01-01" }));
});

test("final: el perfil se sigue creando (sin campos económicos) y editando", async () => {
  await env.clearFirestore();
  await assertSucceeds(setDoc(doc(alice(), "users/alice"), profile));
  await assertSucceeds(updateDoc(doc(alice(), "users/alice"), { displayName: "Alice", "preferences.theme": "light" }));
  await assertSucceeds(getDoc(doc(alice(), "users/alice")));
});

test("final: la prueba vencida puede marcarse como 'expired' (solo baja de nivel)", async () => {
  const sub = (await getDoc(doc(alice(), "users/alice"))).data()!.subscription;
  await assertSucceeds(setDoc(doc(alice(), "users/alice"), { subscription: { ...sub, status: "expired" } }, { merge: true }));
});

test("final: el cliente ya no descuenta, recarga ni activa la prueba", async () => {
  const db = alice();
  await assertFails(updateDoc(doc(db, "users/alice"), { remainingCredits: 2 }));
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), "users/alice"), { remainingCredits: 0 }));
  await assertFails(updateDoc(doc(db, "users/alice"), { remainingCredits: 5, lastCreditReset: todayUtc() }));
  await assertFails(updateDoc(doc(db, "users/alice"), { subscriptionType: "7 DÍAS GRATIS", remainingCredits: 15, hasUsedFreeTrial: true }));
});

test("final: el perfil inicial no puede traer créditos ni plan", async () => {
  await env.clearFirestore();
  await assertFails(setDoc(doc(alice(), "users/alice"), { ...profile, remainingCredits: 15 }));
  await assertFails(setDoc(doc(alice(), "users/alice"), { ...profile, subscriptionType: "Gratis" }));
});
