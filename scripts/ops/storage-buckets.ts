/**
 * Storage bucket diagnostics (replaces the old check-bucket*, test-buckets, check-storage,
 * find-bucket and fix-cors scripts).
 *
 *   npx tsx scripts/ops/storage-buckets.ts --project <id> check [--bucket <name>]...
 *   npx tsx scripts/ops/storage-buckets.ts --project <id> cors --bucket <name> --origin <https://...> [--origin ...] [--apply]
 *
 * check: READ-ONLY (existence, location, storage class and current CORS policy).
 * cors:  shows the current and proposed CORS policy; only writes with --apply. The proposed
 *        policy is restricted to the given origins (never "*"), unlike the old fix-cors script.
 */
import { getStorage } from "firebase-admin/storage";
import { getArg, getArgs, hasFlag, requireArg, initAdmin, describeTarget, fail } from "./lib";
import { proposedCors, validateOrigins } from "./corsPolicy";

const USAGE = "npx tsx scripts/ops/storage-buckets.ts --project <id> <check [--bucket <name>] | cors --bucket <name> --origin <url> [--apply]>";

async function main() {
  const projectId = requireArg("--project", USAGE);
  const command = ["check", "cors"].find((c) => process.argv.includes(c));
  if (!command) {
    console.error(`Falta el comando.\nUso: ${USAGE}`);
    process.exit(2);
  }

  const app = initAdmin(projectId);
  const storage = getStorage(app);
  console.log(`Proyecto: ${describeTarget(projectId)}`);

  if (command === "check") {
    const names = getArgs("--bucket");
    const candidates = names.length ? names : [`${projectId}.firebasestorage.app`, `${projectId}.appspot.com`];
    for (const name of candidates) {
      const bucket = storage.bucket(name);
      const [exists] = await bucket.exists();
      if (!exists) {
        console.log(`${name}: no existe`);
        continue;
      }
      const [metadata] = await bucket.getMetadata();
      console.log(`${name}: existe (ubicación ${metadata.location}, clase ${metadata.storageClass})`);
      console.log(`  CORS actual: ${JSON.stringify(metadata.cors || [])}`);
    }
    await app.delete();
    return;
  }

  const bucketName = getArg("--bucket");
  const origins = getArgs("--origin");
  if (!bucketName || origins.length === 0) {
    console.error(`cors requiere --bucket y al menos un --origin.\nUso: ${USAGE}`);
    process.exit(2);
  }
  const invalid = validateOrigins(origins);
  if (invalid.length) {
    console.error(`Orígenes inválidos (se exige https://dominio exacto, sin "*"): ${invalid.join(", ")}`);
    process.exit(2);
  }

  const bucket = storage.bucket(bucketName);
  const [metadata] = await bucket.getMetadata();
  console.log(`CORS actual:    ${JSON.stringify(metadata.cors || [])}`);
  console.log(`CORS propuesto: ${JSON.stringify(proposedCors(origins))}`);

  if (!hasFlag("--apply")) {
    console.log("SIMULACIÓN: no se modificó nada. Agregar --apply para aplicar el cambio.");
  } else {
    await bucket.setCorsConfiguration(proposedCors(origins));
    console.log("CORS actualizado.");
  }
  await app.delete();
}

main().catch((error) => fail("storage-buckets", error));
