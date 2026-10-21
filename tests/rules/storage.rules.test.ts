/** Storage security rules (storage.rules) against the local emulator. */
import { test, before, after } from "node:test";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { ref, uploadString, getBytes, deleteObject } from "firebase/storage";
import { createTestEnv } from "./env";

let env: RulesTestEnvironment;

const storageOf = (uid?: string) =>
  (uid ? env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true }) : env.unauthenticatedContext()).storage();

before(async () => {
  env = await createTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadString(ref(ctx.storage(), "users/bob/files/privado.txt"), "contenido de bob");
  });
});

after(async () => {
  await env?.cleanup();
});

test("conservar: el usuario sube, lee y borra en su carpeta (rutas que usa la app)", async () => {
  const storage = storageOf("alice");
  for (const path of ["users/alice/courses/c1/f1_apunte.txt", "users/alice/files/f2_notas.txt"]) {
    await assertSucceeds(uploadString(ref(storage, path), "hola"));
    await assertSucceeds(getBytes(ref(storage, path)));
    await assertSucceeds(deleteObject(ref(storage, path)));
  }
});

test("aislamiento: no se escribe, lee ni borra en la carpeta de otro usuario", async () => {
  const storage = storageOf("alice");
  await assertFails(uploadString(ref(storage, "users/bob/files/inyectado.txt"), "x"));
  await assertFails(getBytes(ref(storage, "users/bob/files/privado.txt")));
  await assertFails(deleteObject(ref(storage, "users/bob/files/privado.txt")));
});

test("aislamiento: sin sesión no se lee ni se escribe nada", async () => {
  const storage = storageOf();
  await assertFails(getBytes(ref(storage, "users/bob/files/privado.txt")));
  await assertFails(uploadString(ref(storage, "users/bob/files/x.txt"), "x"));
});

test("aislamiento: fuera de users/{uid}/ no se puede escribir", async () => {
  await assertFails(uploadString(ref(storageOf("alice"), "public/x.txt"), "x"));
});
