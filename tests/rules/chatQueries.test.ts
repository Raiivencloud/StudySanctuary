/** The chat views read messages with live queries (list), not single gets. */
import { test, before, after } from "node:test";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, addDoc, collection, query, orderBy, where, getDocs, serverTimestamp } from "firebase/firestore";
import { createTestEnv } from "./env";

let env: RulesTestEnvironment;
before(async () => { env = await createTestEnv({ projectId: "demo-studysanctuary-chats" }); });
after(async () => { await env?.cleanup(); });

test("conservar: VirtualTutor/VoiceAssistant — crear chat, escribir y consultar mensajes en orden", async () => {
  const db = env.authenticatedContext("alice", { email: "alice@example.com", email_verified: true }).firestore();
  const chat = await assertSucceeds(addDoc(collection(db, "chats"), { userId: "alice", title: "x", type: "tutor", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertSucceeds(addDoc(collection(db, "chats", chat.id, "messages"), { userId: "alice", chatId: chat.id, role: "user", content: "hola", timestamp: Date.now(), createdAt: serverTimestamp() }));
  await assertSucceeds(getDocs(query(collection(db, "chats", chat.id, "messages"), orderBy("timestamp", "asc"))));
  await assertSucceeds(getDocs(query(collection(db, "chats"), where("userId", "==", "alice"))));
});

test("aislamiento: la consulta de mensajes de un chat ajeno se rechaza", async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "chats/bob-chat"), { userId: "bob" }));
  const db = env.authenticatedContext("alice", { email: "alice@example.com", email_verified: true }).firestore();
  await assertFails(getDocs(query(collection(db, "chats", "bob-chat", "messages"), orderBy("timestamp", "asc"))));
});
