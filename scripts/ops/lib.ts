/**
 * Shared helpers for owner-run operations scripts (scripts/ops/*).
 *
 * Safety conventions for every script in this folder:
 * - The target project must be passed explicitly with --project (no implicit defaults).
 * - Credentials come from Application Default Credentials (gcloud auth application-default login).
 *   No key files, no secrets on the command line, nothing secret is printed.
 * - Scripts that can change something run as a DRY RUN unless --apply is passed.
 * - FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST / FIREBASE_STORAGE_EMULATOR_HOST
 *   redirect the Admin SDK to the local emulators (used by the automated tests).
 */
import { initializeApp, deleteApp, type App } from "firebase-admin/app";

export function getArg(name: string, argv = process.argv): string | undefined {
  const index = argv.indexOf(name);
  return index > -1 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : undefined;
}

export function getArgs(name: string, argv = process.argv): string[] {
  return argv.flatMap((value, index) => (value === name && argv[index + 1] ? [argv[index + 1]] : []));
}

export const hasFlag = (name: string, argv = process.argv) => argv.includes(name);

export function requireArg(name: string, usage: string): string {
  const value = getArg(name);
  if (!value) {
    console.error(`Falta ${name}.\nUso: ${usage}`);
    process.exit(2);
  }
  return value;
}

export function describeTarget(projectId: string): string {
  const emulators = [
    process.env.FIRESTORE_EMULATOR_HOST && "Firestore",
    process.env.FIREBASE_AUTH_EMULATOR_HOST && "Auth",
    process.env.FIREBASE_STORAGE_EMULATOR_HOST && "Storage",
  ].filter(Boolean);
  return emulators.length ? `${projectId} (EMULADOR: ${emulators.join(", ")})` : `${projectId} (PRODUCCIÓN / proyecto real)`;
}

export function initAdmin(projectId: string, storageBucket?: string): App {
  return initializeApp({ projectId, ...(storageBucket ? { storageBucket } : {}) }, `ops-${Date.now()}`);
}

export function fail(context: string, error: unknown): never {
  const e = error as any;
  console.error(`[${context}] ${e?.code ? `${e.code}: ` : ""}${String(e?.message || error).split("\n")[0]}`);
  process.exit(1);
}

/** Closes the Admin SDK app (not a data operation). */
export const closeAdmin = (app: App) => deleteApp(app);
