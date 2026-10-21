/**
 * Manage the `admin` custom claim used by the server (server/security/auth.ts).
 *
 *   npx tsx scripts/ops/admin-claims.ts --project <id> list
 *   npx tsx scripts/ops/admin-claims.ts --project <id> grant  --email <email> [--apply]
 *   npx tsx scripts/ops/admin-claims.ts --project <id> revoke --email <email> [--apply]
 *
 * grant/revoke are a DRY RUN unless --apply is passed. Other custom claims are preserved.
 * After a change the user must sign out and in again (or wait up to 1 h) to get a new token;
 * revoke --apply also revokes refresh tokens so the change applies at the next token refresh.
 */
import { getAuth } from "firebase-admin/auth";
import { getArg, hasFlag, requireArg, initAdmin, describeTarget, fail, closeAdmin } from "./lib";

const USAGE = "npx tsx scripts/ops/admin-claims.ts --project <id> <list | grant --email <email> | revoke --email <email>> [--apply]";

async function main() {
  const projectId = requireArg("--project", USAGE);
  const command = ["list", "grant", "revoke"].find((c) => process.argv.includes(c));
  if (!command) {
    console.error(`Falta el comando.\nUso: ${USAGE}`);
    process.exit(2);
  }

  const app = initAdmin(projectId);
  const auth = getAuth(app);
  console.log(`Proyecto: ${describeTarget(projectId)}`);

  if (command === "list") {
    let pageToken: string | undefined;
    let admins = 0;
    do {
      const page = await auth.listUsers(1000, pageToken);
      for (const user of page.users) {
        if (user.customClaims?.admin === true) {
          admins++;
          console.log(`admin: ${user.email || "(sin email)"} uid=${user.uid}`);
        }
      }
      pageToken = page.pageToken;
    } while (pageToken);
    console.log(`Total de cuentas con claim admin: ${admins}`);
    await closeAdmin(app);
    return;
  }

  const email = getArg("--email");
  if (!email) {
    console.error(`Falta --email.\nUso: ${USAGE}`);
    process.exit(2);
  }
  const apply = hasFlag("--apply");
  const user = await auth.getUserByEmail(email);
  const current = user.customClaims || {};

  if (command === "grant" && !user.emailVerified && !hasFlag("--allow-unverified")) {
    console.error("La cuenta no tiene el email verificado. No se otorga admin (usar --allow-unverified solo si es intencional).");
    process.exit(1);
  }

  const next = { ...current };
  if (command === "grant") next.admin = true;
  else delete next.admin;

  const changes = current.admin === next.admin ? "sin cambios" : `admin: ${current.admin === true} -> ${next.admin === true}`;
  console.log(`Cuenta: ${user.email} uid=${user.uid} (${changes})`);

  if (!apply) {
    console.log("SIMULACIÓN: no se modificó nada. Agregar --apply para aplicar el cambio.");
  } else if (changes !== "sin cambios") {
    await auth.setCustomUserClaims(user.uid, next);
    if (command === "revoke") await auth.revokeRefreshTokens(user.uid);
    console.log("Aplicado. El usuario debe cerrar sesión y volver a entrar para que el cambio tenga efecto.");
  }
  await closeAdmin(app);
}

main().catch((error) => fail("admin-claims", error));
