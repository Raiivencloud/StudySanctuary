/** Arena first visit: arenaService.getArenaUserStats writes the 20 base cards and the stats in ONE batch. */
import { test, before, after } from "node:test";
import { assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, collection, writeBatch, serverTimestamp } from "firebase/firestore";
import { createTestEnv } from "./env";
import { ARENA_BASE_CARDS } from "../../src/constants";

let env: RulesTestEnvironment;
before(async () => { env = await createTestEnv({ projectId: "demo-studysanctuary-arena" }); });
after(async () => { await env?.cleanup(); });

test("conservar: primera visita a la Arena (lote de 20 cartas base + estadísticas)", async () => {
  const db = env.authenticatedContext("alice", { email: "alice@example.com", email_verified: true }).firestore();
  const batch = writeBatch(db);
  const ids: string[] = [];
  for (const card of ARENA_BASE_CARDS) {
    const ref = doc(collection(db, "arena_collectibles"));
    batch.set(ref, { ...card, userId: "alice", imageUrl: `https://picsum.photos/seed/arena_${card.rarity}_${card.name}/400/600`, unlockedAt: serverTimestamp() });
    ids.push(ref.id);
  }
  batch.set(doc(db, "arena_stats/alice"), {
    userId: "alice", lives: 3, maxLives: 3, streak: 0, maxStreak: 0, credits: 0, totalPoints: 0,
    levelPoints: { Inicial: 0, Secundario: 0, Universidad: 0, Master: 0 }, collectibles: ids,
  });
  await assertSucceeds(batch.commit());
});
