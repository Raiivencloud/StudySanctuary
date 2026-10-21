/**
 * Validates client (VITE_*) and server configuration without printing secret values.
 *
 *   tsx scripts/verify-config.ts               # uses NODE_ENV as defined
 *   tsx scripts/verify-config.ts --production  # applies production rules
 */
import "dotenv/config";
import { getMissingFirebaseWebEnv, DEFAULT_FIRESTORE_DATABASE_ID } from "../src/config/firebaseWebConfig";
import { loadServerConfig, ConfigError } from "../server/config";

const forceProduction = process.argv.includes("--production");
const env: Record<string, string | undefined> = { ...process.env, ...(forceProduction ? { NODE_ENV: "production" } : {}) };
let ok = true;

const missingClient = getMissingFirebaseWebEnv(env);
if (missingClient.length > 0) {
  ok = false;
  console.error(`[cliente] Faltan: ${missingClient.join(", ")}`);
} else {
  console.log("[cliente] Configuración de Firebase completa.");
}

try {
  const config = loadServerConfig(env);
  console.log(`[servidor] OK (proyecto: ${config.firebase.projectId}, proxy IA: ${config.ai.proxyEnabled ? "activado" : "desactivado"}).`);
  if (config.admin.emails.length === 0) {
    console.warn("[aviso] ADMIN_EMAILS está vacío: solo las cuentas con custom claim `admin` podrán usar el panel de administración.");
  }
  if (!config.admin.secretKey) {
    console.warn("[aviso] ADMIN_SECRET_KEY no está definida: /astra-core-admin no podrá usarse.");
  }
  if (!config.appUrl) {
    console.warn("[aviso] APP_URL no está definida: los redirects de OAuth y el webhook de Mercado Pago no funcionarán.");
  }

  const clientDb = (env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || "").trim() || DEFAULT_FIRESTORE_DATABASE_ID;
  const serverDb = config.firebase.databaseId || DEFAULT_FIRESTORE_DATABASE_ID;
  if (clientDb !== serverDb) {
    console.warn(
      `[aviso] El cliente usa la base de Firestore "${clientDb}" y el servidor "${serverDb}". ` +
      "El webhook de pagos escribiría en una base distinta de la que lee la app (ver docs/CONFIGURATION.md)."
    );
  }
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  ok = false;
  console.error(`[servidor] ${error.message}`);
}

if ((env.VITE_GEMINI_API_KEY || env.VITE_GOOGLE_API_KEY || "").trim()) {
  console.warn("[aviso] VITE_GEMINI_API_KEY está definida: la clave quedará pública en el bundle (uso temporal).");
}

process.exit(ok ? 0 : 1);
