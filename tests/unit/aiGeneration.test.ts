import { test } from "node:test";
import assert from "node:assert/strict";
import { generateWithFallback, GenerationError, containsJson, type GenAIClient } from "../../server/ai/generation";
import { createFakeGenAI } from "../../server/ai/fakeGenAI";
import { DEFAULT_ALLOWED_MODELS } from "../../server/ai/aiRouter";

const allowedModels = new Set(DEFAULT_ALLOWED_MODELS);
const noSleep = async () => {};
const opts = { allowedModels, maxAttempts: 4, timeoutMs: 1000, sleep: noSleep };
const req = (config: Record<string, unknown> = {}) => ({ model: "gemini-3-flash-preview", contents: [{ role: "user", parts: [{ text: "hola" }] }], config });

/** Scripted client: each call takes the next behavior. */
function scripted(behaviors: Array<(model: string) => any>) {
  const calls: string[] = [];
  const client: GenAIClient = {
    models: {
      generateContent: async ({ model }) => {
        calls.push(model);
        const behavior = behaviors[calls.length - 1] || behaviors[behaviors.length - 1];
        return behavior(model);
      },
    },
  };
  return { client, calls };
}

const ok = (text = "respuesta") => () => ({ text, candidates: [{ content: { parts: [{ text }] } }] });
const fail = (status: number, message = "error") => () => { throw Object.assign(new Error(message), { status }); };

test("retries transient errors (503/429) with backoff and then succeeds", async () => {
  const { client, calls } = scripted([fail(503, "overloaded"), ok()]);
  const result = await generateWithFallback(client, req(), opts);
  assert.equal(result.attempts, 2);
  assert.deepEqual(calls, ["gemini-3-flash-preview", "gemini-3-flash-preview"]);
});

test("falls back to the next model when one is unavailable (404)", async () => {
  const { client, calls } = scripted([fail(404, "model not found"), ok()]);
  const result = await generateWithFallback(client, req(), opts);
  assert.equal(result.model, "gemini-3-flash-preview-search");
  assert.equal(calls.length, 2);
});

test("never exceeds the attempt budget (no retry storms)", async () => {
  const { client, calls } = scripted([fail(503)]);
  await assert.rejects(generateWithFallback(client, req(), opts), (e: any) => e instanceof GenerationError && e.code === "AI_UPSTREAM_ERROR");
  assert.equal(calls.length, 4);
});

test("rate limits upstream are reported as AI_RATE_LIMITED", async () => {
  const { client } = scripted([fail(429, "resource_exhausted")]);
  await assert.rejects(generateWithFallback(client, req(), opts), (e: any) => e.code === "AI_RATE_LIMITED");
});

test("non-transient errors (400) stop immediately", async () => {
  const { client, calls } = scripted([fail(400, "bad request: invalid argument")]);
  await assert.rejects(generateWithFallback(client, req(), opts), (e: any) => e.code === "AI_UPSTREAM_ERROR");
  assert.equal(calls.length, 1);
});

test("empty text and invalid JSON count as failures (the caller refunds)", async () => {
  const empty = scripted([ok("   ")]);
  await assert.rejects(generateWithFallback(empty.client, req(), opts), (e: any) => e.code === "AI_INVALID_OUTPUT");

  const badJson = scripted([ok("esto no es json"), ok('```json\n[{"id":1}]\n```')]);
  const result = await generateWithFallback(badJson.client, req({ responseMimeType: "application/json" }), opts);
  assert.equal(result.attempts, 2, "retried once and accepted fenced JSON");
});

test("speech requests require audio data and use the TTS fallbacks", async () => {
  const noAudio = scripted([ok("texto en lugar de audio")]);
  await assert.rejects(generateWithFallback(noAudio.client, { ...req({ responseModalities: ["AUDIO"] }), model: "gemini-3-flash-preview-tts" }, opts), (e: any) => e.code === "AI_INVALID_OUTPUT");

  const tts = scripted([fail(404, "not found"), () => ({ candidates: [{ content: { parts: [{ inlineData: { data: "AAAA" } }] } }] })]);
  const result = await generateWithFallback(tts.client, { ...req({ responseModalities: ["AUDIO"] }), model: "gemini-3-flash-preview-tts" }, opts);
  assert.equal(result.model, "gemini-2.5-flash-preview-tts");
});

test("timeouts are enforced per attempt", async () => {
  const { client } = scripted([() => new Promise(() => {})]);
  await assert.rejects(generateWithFallback(client, req(), { ...opts, timeoutMs: 20, maxAttempts: 2 }), (e: any) => e.code === "AI_TIMEOUT");
});

test("containsJson mirrors the client's tolerant extraction", () => {
  assert.equal(containsJson('[{"a":1}]'), true);
  assert.equal(containsJson('Aquí tienes:\n```json\n{"a":1}\n```'), true);
  assert.equal(containsJson('texto {"a": 1} más texto'), true);
  assert.equal(containsJson("sin json"), false);
});

test("fake provider (development) returns well-formed data for every response type", async () => {
  const fake = createFakeGenAI();
  const text = await fake.models.generateContent(req());
  assert.match(text.text, /modo desarrollo/);

  const flashcards = await fake.models.generateContent({ ...req({ responseMimeType: "application/json" }), contents: [{ parts: [{ text: "Crea flashcards sobre X" }] }] });
  assert.deepEqual(Object.keys(JSON.parse(flashcards.text)[0]), ["id", "front", "back"]);

  const schema = { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, steps: { type: "ARRAY", items: { type: "STRING" } } } } };
  const math = await fake.models.generateContent(req({ responseMimeType: "application/json", responseSchema: schema }));
  assert.equal(JSON.parse(math.text)[0].steps.length, 3);

  const audio = await fake.models.generateContent(req({ responseModalities: ["AUDIO"] }));
  assert.ok(audio.candidates[0].content.parts[0].inlineData.data.length > 100);

  await assert.rejects(fake.models.generateContent({ ...req(), contents: [{ parts: [{ text: "[[fake-error]]" }] }] }), /simulated/);
});
