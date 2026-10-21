/**
 * Owner-run operations scripts (scripts/ops/*) executed against the local emulators.
 * Verifies that the Firestore comparison is strictly read-only and that the admin-claims
 * tool only changes anything with --apply.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import admin from "firebase-admin";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { assertEmulatorOnly, PROJECT_ID, repoRoot } from "./env";

const NAMED_DB = "named-db";
const tsxBin = path.join(repoRoot, "node_modules", ".bin", "tsx");
let app: admin.app.App;

function runScript(script: string, args: string[]) {
  return spawnSync(tsxBin, [path.join(repoRoot, "scripts", "ops", script), "--project", PROJECT_ID, ...args], {
    cwd: repoRoot,
    env: process.env, // includes the *_EMULATOR_HOST variables set by `firebase emulators:exec`
    encoding: "utf8",
    timeout: 120_000,
  });
}

/** Full dump (paths + data) of every document, to prove nothing changed. */
async function snapshot(db: Firestore): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  const walk = async (collections: FirebaseFirestore.CollectionReference[]) => {
    for (const collection of collections) {
      for (const docRef of await collection.listDocuments()) {
        const snap = await docRef.get();
        if (snap.exists) result[docRef.path] = JSON.parse(JSON.stringify(snap.data()));
        await walk(await docRef.listCollections());
      }
    }
  };
  await walk(await db.listCollections());
  return result;
}

/** Emulator-only REST endpoint that wipes a database (other test files share the emulator). */
async function clearEmulatorDatabase(databaseId: string) {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/${databaseId}/documents`;
  const res = await fetch(url, { method: "DELETE" });
  assert.ok(res.ok, `no se pudo limpiar ${databaseId} en el emulador`);
}

before(async () => {
  assertEmulatorOnly();
  await clearEmulatorDatabase("(default)");
  await clearEmulatorDatabase(NAMED_DB);
  app = admin.initializeApp({ projectId: PROJECT_ID }, "ops-scripts-test");
  const defaultDb = getFirestore(app);
  const namedDb = getFirestore(app, NAMED_DB);

  // Simulates the situation described in docs/FIRESTORE_DATABASES.md.
  await defaultDb.doc("users/paid-user").set({ remainingCredits: 300, subscription: { status: "active", type: "mensual", lastPaymentId: "p1" } });
  await defaultDb.doc("stats/global").set({ isAiSuspendedForFree: true });
  await namedDb.doc("users/paid-user").set({ remainingCredits: 3, subscription: { status: "trial", type: "free" } });
  await namedDb.doc("users/other").set({ remainingCredits: 10 });
  await namedDb.doc("user_courses/c1").set({ userId: "other", title: "Física" });
  await namedDb.doc("chats/ch1/messages/m1").set({ text: "privado" });
  await namedDb.doc("stats/global").set({ credits_2026_10_21: 4 });
});

after(async () => {
  await app?.delete();
});

test("compare-firestore-databases: source contains no write operations", () => {
  const source = fs.readFileSync(path.join(repoRoot, "scripts/ops/compare-firestore-databases.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
    .replace("await app.delete();", ""); // closes the Admin SDK app, not a data operation
  for (const forbidden of [".set(", ".update(", ".delete(", ".add(", ".create(", "batch(", "runTransaction", "bulkWriter", "recursiveDelete", "writeBatch"]) {
    assert.ok(!source.includes(forbidden), `the script must not call ${forbidden}`);
  }
});

test("compare-firestore-databases: reports counts and leaves both databases unchanged", async () => {
  const defaultDb = getFirestore(app);
  const namedDb = getFirestore(app, NAMED_DB);
  const before = { default: await snapshot(defaultDb), named: await snapshot(namedDb) };

  const result = runScript("compare-firestore-databases.ts", ["--named-db", NAMED_DB]);
  assert.equal(result.status, 0, result.stderr);
  const output = result.stdout;

  assert.match(output, /SOLO LECTURA/);
  assert.match(output, /EMULADOR/);
  const row = (label: string) => output.split("\n").find((line) => line.includes(label)) || "";
  assert.match(row("│ users  "), /│\s*'?1'?\s*│\s*'?2'?\s*│/, `users row: ${row("│ users  ")}`);
  assert.match(row("subscription.status == active"), /│\s*'?1'?\s*│\s*'?0'?\s*│/);
  assert.match(row("lastPaymentId"), /│\s*'?1'?\s*│\s*'?0'?\s*│/);

  // No document data or personal information in the output.
  assert.doesNotMatch(output, /privado|Física|paid-user|mensual/);

  const after = { default: await snapshot(defaultDb), named: await snapshot(namedDb) };
  assert.deepEqual(after, before, "the comparison must not modify any document");
});

test("compare-firestore-databases: refuses to run without explicit --project/--named-db", () => {
  const result = spawnSync(tsxBin, [path.join(repoRoot, "scripts/ops/compare-firestore-databases.ts")], { cwd: repoRoot, env: process.env, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Falta --project/);
});

test("admin-claims: dry run by default, --apply grants/revokes and preserves other claims", async () => {
  const auth = getAuth(app);
  const owner = await auth.createUser({ email: "owner@example.com", emailVerified: true });
  await auth.setCustomUserClaims(owner.uid, { plan: "pro" });
  await auth.createUser({ email: "unverified@example.com", emailVerified: false });

  let result = runScript("admin-claims.ts", ["list"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Total de cuentas con claim admin: 0/);

  result = runScript("admin-claims.ts", ["grant", "--email", "owner@example.com"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SIMULACIÓN/);
  assert.deepEqual((await auth.getUser(owner.uid)).customClaims, { plan: "pro" });

  result = runScript("admin-claims.ts", ["grant", "--email", "owner@example.com", "--apply"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await auth.getUser(owner.uid)).customClaims, { plan: "pro", admin: true });

  result = runScript("admin-claims.ts", ["list"]);
  assert.match(result.stdout, /admin: owner@example.com/);
  assert.match(result.stdout, /Total de cuentas con claim admin: 1/);

  result = runScript("admin-claims.ts", ["grant", "--email", "unverified@example.com", "--apply"]);
  assert.equal(result.status, 1);
  assert.equal((await auth.getUserByEmail("unverified@example.com")).customClaims?.admin, undefined);

  result = runScript("admin-claims.ts", ["revoke", "--email", "owner@example.com", "--apply"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await auth.getUser(owner.uid)).customClaims, { plan: "pro" });
});
