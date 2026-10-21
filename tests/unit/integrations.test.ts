import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createIntegrationsRouter, attachmentHeader, type HttpClient } from "../../server/routes/integrations";
import { InMemoryTokenStore } from "../../server/integrations/tokenStore";
import { apiErrorHandler } from "../../server/security/http";
import { withApp, fakeVerifyIdToken } from "../helpers/http";

// Fake Google/Microsoft APIs: records which provider token each call used. No real accounts.
function buildApp() {
  const calls: { url: string; token: string }[] = [];
  const tokenOf = (config: any) => String(config?.headers?.Authorization || "").replace("Bearer ", "");
  const http: HttpClient = {
    get: async (url, config) => {
      calls.push({ url, token: tokenOf(config) });
      if (url.endsWith("/drive/v3/files")) return { data: { files: [{ id: "f1", name: "Apunte.pdf" }] } };
      if (url.includes("/calendar/v3/")) return { data: { items: [{ id: "e1", summary: "Final", start: { dateTime: "2026-12-01T10:00:00Z" }, reminders: { useDefault: true } }] } };
      if (url.includes("graph.microsoft.com")) return { data: { value: [] } };
      if (url.includes("/export")) return { data: Buffer.from("xlsx") };
      if (config?.params && (config.params as any).alt === "media") return { data: Buffer.from("pdf-bytes") };
      if (url.includes("/files/sheet1")) return { data: { name: "Notas \"finales\"\r\nX", mimeType: "application/vnd.google-apps.spreadsheet" } };
      return { data: { name: "Apunte.pdf", mimeType: "application/pdf" } };
    },
    post: async (url, _body, config) => {
      calls.push({ url, token: tokenOf(config) });
      return { data: { id: "uploaded-1" } };
    },
  };
  const tokens = new InMemoryTokenStore(60_000);
  const app = express();
  app.use(createIntegrationsRouter({ auth: { verifyIdToken: fakeVerifyIdToken }, tokens, appUrl: "https://app.example.com", maxUploadBytes: 1024, http }));
  app.use("/api", apiErrorHandler);
  return { app, calls, tokens };
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

test("every integration endpoint requires a Firebase ID token", async () => {
  const { app, calls } = buildApp();
  await withApp(app, async (base) => {
    for (const path of ["/api/calendar/sync", "/api/drive/files", "/api/drive/download/f1"]) {
      assert.equal((await fetch(`${base}${path}`)).status, 401, path);
    }
    const form = new FormData();
    form.append("file", new Blob(["x"]), "a.txt");
    assert.equal((await fetch(`${base}/api/drive/upload`, { method: "POST", body: form })).status, 401);
    assert.equal(calls.length, 0);
  });
});

test("a user without connected accounts gets 401 even if another user is connected", async () => {
  const { app, calls, tokens } = buildApp();
  await tokens.set("user-1", "google", { access_token: "google-token-of-user-1" });
  await withApp(app, async (base) => {
    assert.equal((await fetch(`${base}/api/drive/files`, { headers: bearer("token-other") })).status, 401);
    assert.equal((await fetch(`${base}/api/calendar/sync`, { headers: bearer("token-other") })).status, 401);
    assert.equal((await fetch(`${base}/api/drive/download/f1`, { headers: bearer("token-other") })).status, 401);
    assert.equal(calls.length, 0, "user-1's Google token must never be used for user-2");
  });
});

test("each user's requests use only their own provider tokens", async () => {
  const { app, calls, tokens } = buildApp();
  await tokens.set("user-1", "google", { access_token: "g1" });
  await tokens.set("user-2", "google", { access_token: "g2" });
  await withApp(app, async (base) => {
    const files = await fetch(`${base}/api/drive/files`, { headers: bearer("token-user") });
    assert.equal(files.status, 200);
    assert.deepEqual(await files.json(), { files: [{ id: "f1", name: "Apunte.pdf" }] });

    const sync = await fetch(`${base}/api/calendar/sync`, { headers: bearer("token-other") });
    assert.equal(sync.status, 200);
    const { exams } = await sync.json();
    assert.equal(exams[0].id, "google-e1");
    assert.equal(exams[0].reminder, "1d");

    assert.deepEqual(calls.map((c) => c.token), ["g1", "g2"]);
  });
});

test("download validates the file id and sanitizes Content-Disposition", async () => {
  const { app, tokens } = buildApp();
  await tokens.set("user-1", "google", { access_token: "g1" });
  await withApp(app, async (base) => {
    assert.equal((await fetch(`${base}/api/drive/download/..%2F..%2Fabout`, { headers: bearer("token-user") })).status, 400);

    const pdf = await fetch(`${base}/api/drive/download/f1`, { headers: bearer("token-user") });
    assert.equal(pdf.status, 200);
    assert.equal(await pdf.text(), "pdf-bytes");

    const sheet = await fetch(`${base}/api/drive/download/sheet1`, { headers: bearer("token-user") });
    assert.equal(sheet.status, 200);
    const disposition = sheet.headers.get("content-disposition") || "";
    assert.doesNotMatch(disposition, /[\r\n]/);
    assert.match(disposition, /filename="Notas _finales___X\.xlsx"/);
  });
  assert.equal(attachmentHeader("a\"b.pdf").startsWith('attachment; filename="a_b.pdf"'), true);
});

test("drive upload: size limit, cross-site check and own token", async () => {
  const { app, calls, tokens } = buildApp();
  await tokens.set("user-1", "google", { access_token: "g1" });
  await withApp(app, async (base) => {
    const make = (size: number) => {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(size)]), "a.bin");
      return form;
    };
    assert.equal((await fetch(`${base}/api/drive/upload`, { method: "POST", headers: { ...bearer("token-other") }, body: make(10) })).status, 401);
    assert.equal((await fetch(`${base}/api/drive/upload`, { method: "POST", headers: { ...bearer("token-user"), Origin: "https://evil.example" }, body: make(10) })).status, 403);
    assert.equal((await fetch(`${base}/api/drive/upload`, { method: "POST", headers: bearer("token-user"), body: make(2048) })).status, 413);

    const ok = await fetch(`${base}/api/drive/upload`, { method: "POST", headers: bearer("token-user"), body: make(10) });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { status: "ok", fileId: "uploaded-1" });
    assert.deepEqual(calls.map((c) => c.token), ["g1"]);
  });
});
