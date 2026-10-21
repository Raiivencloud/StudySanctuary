/**
 * Converts a legacy firebase-applet-config.json (AI Studio) into VITE_FIREBASE_* lines.
 *
 *   tsx scripts/legacy-config-to-env.ts path/to/firebase-applet-config.json >> .env
 *
 * The web config is public by design, but the output is meant for your local .env only.
 */
import fs from "fs";

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error("Uso: tsx scripts/legacy-config-to-env.ts <ruta a firebase-applet-config.json>");
  process.exit(2);
}

const legacy = JSON.parse(fs.readFileSync(file, "utf8"));
const mapping: Record<string, string> = {
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  storageBucket: "VITE_FIREBASE_STORAGE_BUCKET",
  appId: "VITE_FIREBASE_APP_ID",
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
  measurementId: "VITE_FIREBASE_MEASUREMENT_ID",
  firestoreDatabaseId: "VITE_FIREBASE_FIRESTORE_DATABASE_ID",
};

const lines = Object.entries(mapping)
  .filter(([key]) => typeof legacy[key] === "string" && legacy[key])
  .map(([key, envName]) => `${envName}=${legacy[key]}`);

// The server previously ignored firestoreDatabaseId (it used "(default)"). Not set here on
// purpose: see docs/CONFIGURATION.md before setting FIREBASE_DATABASE_ID.
console.log(lines.join("\n"));
