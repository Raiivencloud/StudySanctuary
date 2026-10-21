import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";
import { createAiProxyRouter, type AiProxyOptions } from "../../server/ai/geminiProxy";

// No real Gemini calls: the client factory is always a fake.
async function withServer(options: Partial<AiProxyOptions>, run: (url: string, calls: any[]) => Promise<void>) {
  const calls: any[] = [];
  const app = express();
  app.use("/api/ai", createAiProxyRouter({
    enabled: true,
    apiKey: "server-only-key",
    verifyIdToken: async (token) => {
      if (token !== "valid-token") throw new Error("invalid");
      return { uid: "user-1" };
    },
    createClient: (apiKey) => ({
      models: {
        generateContent: async (request: any) => {
          calls.push({ apiKey, request });
          if (request.model === "gemini-2.0-flash") throw Object.assign(new Error("quota"), { status: 429 });
          return { text: "respuesta", candidates: [{ content: { parts: [{ text: "respuesta" }] } }], usageMetadata: { totalTokenCount: 7 } };
        },
      },
    }),
    ...options,
  }));
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}/api/ai/generate`, calls);
  } finally {
    server.close();
  }
}

const body = (extra: Record<string, unknown> = {}) => JSON.stringify({
  model: "gemini-3-flash-preview",
  contents: [{ role: "user", parts: [{ text: "hola" }] }],
  ...extra,
});

const post = (url: string, payload: string, token?: string) => fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: payload,
});

test("returns 503 when the proxy is disabled", async () => {
  await withServer({ enabled: false }, async (url, calls) => {
    const res = await post(url, body(), "valid-token");
    assert.equal(res.status, 503);
    assert.equal(calls.length, 0);
  });
});

test("returns 503 when enabled without a server key", async () => {
  await withServer({ apiKey: undefined }, async (url) => {
    assert.equal((await post(url, body(), "valid-token")).status, 503);
  });
});

test("requires a valid Firebase ID token", async () => {
  await withServer({}, async (url, calls) => {
    assert.equal((await post(url, body())).status, 401);
    assert.equal((await post(url, body(), "forged")).status, 401);
    assert.equal(calls.length, 0);
  });
});

test("rejects models outside the allowlist and invalid contents", async () => {
  await withServer({}, async (url, calls) => {
    assert.equal((await post(url, body({ model: "gemini-ultra-unlisted" }), "valid-token")).status, 400);
    assert.equal((await post(url, body({ contents: [] }), "valid-token")).status, 400);
    assert.equal(calls.length, 0);
  });
});

test("forwards allowed config only, uses the server key and never returns it", async () => {
  await withServer({}, async (url, calls) => {
    const res = await post(url, body({ config: { responseMimeType: "application/json", apiKey: "evil", tools: [{}] } }), "valid-token");
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes("server-only-key"));
    assert.deepEqual(JSON.parse(text).text, "respuesta");
    assert.equal(calls[0].apiKey, "server-only-key");
    assert.deepEqual(calls[0].request.config, { responseMimeType: "application/json" });
  });
});

test("maps upstream errors without leaking details", async () => {
  await withServer({}, async (url) => {
    const res = await post(url, body({ model: "gemini-2.0-flash" }), "valid-token");
    assert.equal(res.status, 429);
    assert.deepEqual(await res.json(), { error: "AI_RATE_LIMITED" });
  });
});
