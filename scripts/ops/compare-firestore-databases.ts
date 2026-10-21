/**
 * READ-ONLY comparison of the "(default)" Firestore database and the named database
 * used by the app. It only runs count() aggregations and single-document existence
 * checks: it never writes, deletes or prints document contents or personal data.
 * (Enforced by tests/rules/opsScripts.test.ts, which runs it against the emulator
 * and checks that no document changed.)
 *
 *   npx tsx scripts/ops/compare-firestore-databases.ts --project <project-id> --named-db <database-id>
 *
 * Cost: one read per 1,000 counted documents (aggregation queries) plus one read per
 * existence check. Instructions: docs/ops/FIRESTORE_COMPARISON.md
 */
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { requireArg, initAdmin, describeTarget, fail } from "./lib";

const USAGE = "npx tsx scripts/ops/compare-firestore-databases.ts --project <project-id> --named-db <database-id>";

const COLLECTIONS = [
  "users", "user_courses", "tasks", "activities", "exams", "chats", "userFiles", "bookProgress",
  "groups", "feedback", "stats", "publicLibrary", "arena_questions", "arena_stats", "arena_collectibles", "arena_rankings",
];

async function countOrError(run: () => Promise<number>): Promise<string> {
  try {
    return String(await run());
  } catch (error: any) {
    // Only the error code and first line: no document data can appear here.
    return `error: ${error?.code ?? ""} ${String(error?.message || error).split("\n")[0].slice(0, 80)}`;
  }
}

async function describe(db: Firestore) {
  const rows: Record<string, string> = {};
  for (const name of COLLECTIONS) {
    rows[name] = await countOrError(async () => (await db.collection(name).count().get()).data().count);
  }
  rows["users con subscription.status == active"] = await countOrError(async () =>
    (await db.collection("users").where("subscription.status", "==", "active").count().get()).data().count);
  rows["users con subscription.lastPaymentId (escritos por el webhook)"] = await countOrError(async () =>
    (await db.collection("users").where("subscription.lastPaymentId", "!=", null).count().get()).data().count);
  rows["stats/global existe"] = await countOrError(async () => ((await db.collection("stats").doc("global").get()).exists ? 1 : 0));
  return rows;
}

async function main() {
  const projectId = requireArg("--project", USAGE);
  const namedDb = requireArg("--named-db", USAGE);

  console.log(`Proyecto: ${describeTarget(projectId)}`);
  console.log("Comparación SOLO LECTURA (no se escriben ni se muestran datos de documentos).\n");

  const app = initAdmin(projectId);
  const databases: [string, Firestore][] = [
    ["(default)", getFirestore(app)],
    [namedDb, getFirestore(app, namedDb)],
  ];

  const results = await Promise.all(databases.map(async ([id, db]) => [id, await describe(db)] as const));
  const keys = Object.keys(results[0][1]);
  console.table(Object.fromEntries(keys.map((key) => [key, Object.fromEntries(results.map(([id, rows]) => [id, rows[key]]))])));
  await app.delete();
}

main().catch((error) => fail("compare-firestore", error));
