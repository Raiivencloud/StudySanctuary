/** Google Drive fixes (docs/PHASE6_COMMERCIAL_READINESS.md, P6-2). Fake Google APIs only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import session from "express-session";
import { createIntegrationsRouter, DRIVE_LIST_QUERY, type HttpClient } from "../../server/routes/integrations";
import { createOAuthRouter, GOOGLE_SCOPES, normalizeOAuthTokens } from "../../server/routes/oauth";
import { InMemoryTokenStore } from "../../server/integrations/tokenStore";
import { loadServerConfig } from "../../server/config";
import { withApp, fakeVerifyIdToken } from "../helpers/http";

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const DOC = "application/vnd.google-apps.document";

function driveApp(options: { now?: () => number; googleFails?: number; files?: Record<string, { name: string; mimeType: string }> } = {}) {
  const calls: { method: string; url: string; token?: string; params?: any; body?: any }[] = [];
  const files = options.files || {};
  const http: HttpClient = {
    get: async (url, config: any = {}) => {
      const token = String(config.headers?.Authorization || "").replace("Bearer ", "");
      calls.push({ method: "GET", url, token, params: config.params });
      if (options.googleFails) throw Object.assign(new Error("Request failed"), { response: { status: options.googleFails } });
      if (url.endsWith("/drive/v3/files")) return { data: { files: [{ id: "doc1", name: "Resumen", mimeType: DOC }] } };
      if (url.includes("/export")) return { data: Buffer.from("%PDF-export") };
      const id = url.split("/files/")[1];
      if (config.params?.alt === "media") return { data: Buffer.from("raw-bytes") };
      return { data: files[id] || { name: "Apunte.pdf", mimeType: "application/pdf" } };
    },
    post: async (url, body: any, config: any = {}) => {
      calls.push({ method: "POST", url, token: String(config.headers?.Authorization || "").replace("Bearer ", ""), body, params: config.headers });
      if (url === "https://oauth2.googleapis.com/token") return { data: { access_token: "fresh-token", expires_in: 3599 } };
      return { data: { id: "uploaded-1" } };
    },
  };
  const tokens = new InMemoryTokenStore(24 * 60 * 60 * 1000);
  const app = express();
  app.use(createIntegrationsRouter({
    auth: { verifyIdToken: fakeVerifyIdToken }, tokens, appUrl: "https://app.example.com", maxUploadBytes: 1024 * 1024, http,
    google: { clientId: "client", clientSecret: "secret" }, now: options.now,
  }));
  return { app, calls, tokens };
}

test("D-1/D-7: minimal scopes only: drive.file (upload and app files) and Calendar read-only, never drive.readonly", async () => {
  assert.equal(GOOGLE_SCOPES, "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.file");
  assert.doesNotMatch(GOOGLE_SCOPES, /drive\.readonly|auth\/drive( |$)/);
  // The old full-read option is refused instead of silently ignored
  assert.throws(() => loadServerConfig({ FIREBASE_PROJECT_ID: "p", GOOGLE_DRIVE_ACCESS: "all" }), /ya no se admite/);
  assert.doesNotThrow(() => loadServerConfig({ FIREBASE_PROJECT_ID: "p" }));

  const app = express();
  app.use(express.json());
  app.use(session({ secret: "s", resave: false, saveUninitialized: false }));
  app.use(createOAuthRouter({
    auth: { verifyIdToken: fakeVerifyIdToken }, tokens: new InMemoryTokenStore(60_000), appUrl: "https://app.example.com",
    google: { clientId: "g" }, outlook: {}, sessionCookie: { name: "connect.sid", secure: false, sameSite: "lax" },
  }));
  await withApp(app, async (base) => {
    const { url } = await (await fetch(`${base}/api/auth/google/url`, { headers: bearer("token-user") })).json();
    assert.equal(new URL(url).searchParams.get("scope"), GOOGLE_SCOPES);
    assert.equal(new URL(url).searchParams.get("access_type"), "offline");
  });
});

test("D-2: the sign-in token never replaces the token of a connected Drive account", async () => {
  const tokens = new InMemoryTokenStore(60_000);
  const app = express();
  app.use(express.json());
  app.use(createOAuthRouter({
    auth: { verifyIdToken: fakeVerifyIdToken }, tokens, appUrl: "https://app.example.com",
    google: {}, outlook: {}, sessionCookie: { name: "connect.sid", secure: false, sameSite: "lax" },
  }));
  const sync = (base: string, accessToken: string) => fetch(`${base}/api/auth/google/sync`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://app.example.com", ...bearer("token-user") }, body: JSON.stringify({ accessToken }),
  });
  await withApp(app, async (base) => {
    await tokens.set("user-1", "google", normalizeOAuthTokens({ access_token: "drive-token", refresh_token: "r", expires_in: 3600 }));
    assert.deepEqual(await (await sync(base, "sign-in-token")).json(), { status: "kept" });
    assert.equal((await tokens.get("user-1", "google"))?.access_token, "drive-token");
    // Without a connected account the sign-in token is still stored (previous behavior)
    await tokens.deleteAll("user-1");
    assert.deepEqual(await (await sync(base, "sign-in-token")).json(), { status: "ok" });
    assert.equal((await tokens.get("user-1", "google"))?.source, "sign-in");
  });
});

test("D-3: expired tokens are renewed with the refresh token; Google rejections ask to reconnect (401)", async () => {
  let clock = 1_000_000;
  const { app, calls, tokens } = driveApp({ now: () => clock });
  await tokens.set("user-1", "google", { access_token: "old-token", refresh_token: "refresh-1", expiry_date: clock + 30_000, source: "oauth" });
  await withApp(app, async (base) => {
    assert.equal((await fetch(`${base}/api/drive/files`, { headers: bearer("token-user") })).status, 200);
    const refresh = calls.find((c) => c.url === "https://oauth2.googleapis.com/token")!;
    assert.deepEqual(refresh.body, { client_id: "client", client_secret: "secret", refresh_token: "refresh-1", grant_type: "refresh_token" });
    assert.equal(calls.find((c) => c.url.endsWith("/drive/v3/files"))!.token, "fresh-token");
    const stored = await tokens.get("user-1", "google");
    assert.equal(stored?.refresh_token, "refresh-1");
    assert.equal(stored?.expiry_date, clock + 3599 * 1000);
    // Still valid: no new refresh
    clock += 1000;
    await fetch(`${base}/api/drive/files`, { headers: bearer("token-user") });
    assert.equal(calls.filter((c) => c.url === "https://oauth2.googleapis.com/token").length, 1);
  });
  // Expired without a refresh token → reconnect
  const noRefresh = driveApp({ now: () => clock });
  await noRefresh.tokens.set("user-1", "google", { access_token: "t", expiry_date: clock - 1 });
  await withApp(noRefresh.app, async (base) => {
    assert.equal((await fetch(`${base}/api/drive/files`, { headers: bearer("token-user") })).status, 401);
  });
  // Google answers 401/403 (revoked, missing scope) → 401 instead of a generic 500
  for (const status of [401, 403]) {
    const rejected = driveApp({ googleFails: status });
    await rejected.tokens.set("user-1", "google", { access_token: "t" });
    const original = console.error;
    console.error = () => {};
    try {
      await withApp(rejected.app, async (base) => {
        assert.equal((await fetch(`${base}/api/drive/files`, { headers: bearer("token-user") })).status, 401);
      });
    } finally {
      console.error = original;
    }
  }
});

test("D-4: the list excludes folders and Google types that cannot be imported, newest first", async () => {
  const { app, calls, tokens } = driveApp();
  await tokens.set("user-1", "google", { access_token: "t" });
  await withApp(app, async (base) => {
    await fetch(`${base}/api/drive/files`, { headers: bearer("token-user") });
  });
  const params = calls.find((c) => c.url.endsWith("/drive/v3/files"))!.params;
  assert.equal(params.q, DRIVE_LIST_QUERY);
  assert.equal(params.orderBy, "modifiedTime desc");
  assert.match(DRIVE_LIST_QUERY, /^trashed = false and \(not mimeType contains 'application\/vnd\.google-apps\.' or /);
  for (const type of ["document", "spreadsheet", "presentation", "drawing"]) assert.ok(DRIVE_LIST_QUERY.includes(`mimeType = 'application/vnd.google-apps.${type}'`));
  assert.ok(!DRIVE_LIST_QUERY.includes("folder"));
});

test("D-5: Google files are exported with their real type; unsupported Google types answer 415", async () => {
  const { app, tokens } = driveApp({
    files: {
      doc1: { name: "Resumen", mimeType: DOC },
      slides1: { name: "Clase 3", mimeType: "application/vnd.google-apps.presentation" },
      sheet1: { name: "Notas", mimeType: "application/vnd.google-apps.spreadsheet" },
      form1: { name: "Encuesta", mimeType: "application/vnd.google-apps.form" },
      folder1: { name: "Materias", mimeType: "application/vnd.google-apps.folder" },
    },
  });
  await tokens.set("user-1", "google", { access_token: "t" });
  await withApp(app, async (base) => {
    const get = (id: string) => fetch(`${base}/api/drive/download/${id}`, { headers: bearer("token-user") });
    const doc = await get("doc1");
    assert.equal(doc.headers.get("content-type"), "application/pdf");
    assert.match(doc.headers.get("content-disposition") || "", /Resumen\.pdf/);
    assert.equal((await get("slides1")).headers.get("content-type"), "application/pdf");
    assert.equal((await get("sheet1")).headers.get("content-type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.equal((await get("form1")).status, 415);
    assert.equal((await get("folder1")).status, 415);
    assert.match((await get("pdf1")).headers.get("content-type") || "", /^application\/pdf/);
  });
});

test("D-6: upload keeps accented names and uses a random multipart boundary", async () => {
  const { app, calls, tokens } = driveApp();
  await tokens.set("user-1", "google", { access_token: "t" });
  await withApp(app, async (base) => {
    for (let i = 0; i < 2; i++) {
      const form = new FormData();
      form.append("file", new Blob([new TextEncoder().encode("contenido")], { type: "application/pdf" }), "Biología celular — año 2.pdf");
      const res = await fetch(`${base}/api/drive/upload`, { method: "POST", headers: { ...bearer("token-user"), Origin: "https://app.example.com" }, body: form });
      assert.equal(res.status, 200);
    }
  });
  const uploads = calls.filter((c) => c.url.includes("/upload/drive/v3/files"));
  assert.equal(uploads.length, 2);
  const boundaries = uploads.map((u) => /boundary=(\S+)/.exec(u.params["Content-Type"])![1]);
  assert.notEqual(boundaries[0], boundaries[1]);
  assert.match(boundaries[0], /^studysanctuary-[0-9a-f]{32}$/);
  const metadata = JSON.parse((uploads[0].body as Buffer).toString("utf8").split("\r\n\r\n")[1].split("\r\n")[0]);
  assert.equal(metadata.name, "Biología celular — año 2.pdf");
});

test("client: the Drive picker no longer sends the sign-in token and passes the real file type to the AI", async () => {
  const fs = await import("fs");
  const source = fs.readFileSync(new URL("../../src/components/DrivePickerModal.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /google\/sync/);
  assert.match(source, /mimeType: realMimeType/);
  assert.match(source, /response\.status === 415/);
});
