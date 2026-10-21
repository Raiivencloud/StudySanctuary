import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// "demo-*" projects only exist in the emulators: nothing here can reach a real Firebase project.
export const PROJECT_ID = "demo-studysanctuary";

export function assertEmulatorOnly() {
  for (const variable of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
    if (!process.env[variable]) {
      throw new Error(`${variable} no está definida: ejecutar con "npm run test:rules" (Firebase Emulator).`);
    }
  }
  const project = process.env.GCLOUD_PROJECT || PROJECT_ID;
  if (!project.startsWith("demo-")) {
    throw new Error(`Las pruebas solo corren contra proyectos demo-* (recibido: ${project}).`);
  }
}

const hostPort = (value: string) => {
  const [host, port] = value.split(":");
  return { host, port: Number(port) };
};

export const TRANSITIONAL_TOGGLE = "return true; // CLIENT_CREDIT_TRANSITIONS";

/** Rules as they will be once server-side credits are live (Phase 3B/4): no client economic writes. */
export function finalModeRules(): string {
  const rules = fs.readFileSync(path.join(repoRoot, "firestore.rules"), "utf8");
  if (!rules.includes(TRANSITIONAL_TOGGLE)) throw new Error("firestore.rules no contiene el interruptor CLIENT_CREDIT_TRANSITIONS");
  return rules.replace(TRANSITIONAL_TOGGLE, "return false; // CLIENT_CREDIT_TRANSITIONS");
}

export async function createTestEnv(options: { projectId?: string; firestoreRules?: string } = {}): Promise<RulesTestEnvironment> {
  assertEmulatorOnly();
  const projectId = options.projectId || PROJECT_ID;
  if (!projectId.startsWith("demo-")) throw new Error("Solo proyectos demo-*");
  return initializeTestEnvironment({
    projectId,
    // FIRESTORE_RULES_PATH lets the suite run against another rules file (e.g. the previous version) for comparison.
    firestore: { rules: options.firestoreRules ?? fs.readFileSync(process.env.FIRESTORE_RULES_PATH || path.join(repoRoot, "firestore.rules"), "utf8"), ...hostPort(process.env.FIRESTORE_EMULATOR_HOST!) },
    storage: { rules: fs.readFileSync(path.join(repoRoot, "storage.rules"), "utf8"), ...hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST!) },
  });
}

/** Marks a known vulnerability from AUDIT C-03/A-03: reported, but does not fail the run until Phase 3 fixes the rules. */
export const knownVulnerability = (id: string) => ({ todo: `${id}: vulnerable con las reglas actuales; se corrige en la Fase 3` });

/** Marks a known functional bug in the rules (reported, does not fail the run until Phase 3). */
export const knownBug = (id: string) => ({ todo: `${id}: bug funcional con las reglas actuales; se corrige en la Fase 3` });
