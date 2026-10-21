import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import session from "express-session";
import { createOAuthRouter } from "../../server/routes/oauth";
import { createOAuthState, consumeOAuthState, OAUTH_STATE_TTL_MS } from "../../server/security/oauthState";
import { InMemoryTokenStore } from "../../server/integrations/tokenStore";
import { withApp, fakeVerifyIdToken } from "../helpers/http";

// No calls to Google/Microsoft: the code exchange is a fake.
function buildApp() {
  const exchanges: any[] = [];
  const tokens = new InMemoryTokenStore(60_000);
  const app = express();
  app.use(express.json());
  app.use(session({ name: "connect.sid", secret: "test-secret", resave: false, saveUninitialized: false, cookie: { httpOnly: true } }));
  app.use(createOAuthRouter({
    auth: { verifyIdToken: fakeVerifyIdToken },
    tokens,
    appUrl: "https://app.example.com",
    google: { clientId: "google-client" },
    outlook: { clientId: "outlook-client" },
    sessionCookie: { name: "connect.sid", secure: false, sameSite: "lax" },
    exchangeCode: async (provider, code, redirectUri) => {
      exchanges.push({ provider, code, redirectUri });
      return { access_token: `access-${provider}-${code}` };
    },
  }));
  return { app, exchanges, tokens };
}

const cookieFrom = (res: Response) => (res.headers.get("set-cookie") || "").split(";")[0];
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function startFlow(base: string, provider: "google" | "outlook", idToken = "token-user") {
  const res = await fetch(`${base}/api/auth/${provider}/url`, { headers: bearer(idToken) });
  assert.equal(res.status, 200);
  const { url } = await res.json();
  const state = new URL(url).searchParams.get("state");
  return { cookie: cookieFrom(res), state, url: url as string };
}

test("oauth state helpers: single use, expiring, exact match, bound to the uid", () => {
  const store = {};
  const state = createOAuthState(store, "google", "user-1", 1000);
  assert.equal(consumeOAuthState(store, "google", state, 1001), "user-1");
  assert.equal(consumeOAuthState(store, "google", state, 1002), null, "replay must fail");

  const expired = createOAuthState(store, "google", "user-1", 0);
  assert.equal(consumeOAuthState(store, "google", expired, OAUTH_STATE_TTL_MS + 1), null);

  const other = createOAuthState(store, "outlook", "user-1", 0);
  assert.equal(consumeOAuthState(store, "google", other, 1), null, "state is bound to the provider");
  assert.equal(consumeOAuthState(undefined, "google", "x"), null);
});

test("starting a connection requires a Firebase ID token", async () => {
  const { app } = buildApp();
  await withApp(app, async (base) => {
    assert.equal((await fetch(`${base}/api/auth/google/url`)).status, 401);
    assert.equal((await fetch(`${base}/api/auth/outlook/url`, { headers: bearer("forged") })).status, 401);
  });
});

test("authorization URL includes a random state and keeps the previous parameters", async () => {
  const { app } = buildApp();
  await withApp(app, async (base) => {
    const { url, state, cookie } = await startFlow(base, "google");
    const params = new URL(url).searchParams;
    assert.match(state || "", /^[0-9a-f]{64}$/);
    assert.ok(cookie.startsWith("connect.sid="), "the state must be kept in a session cookie");
    assert.equal(params.get("redirect_uri"), "https://app.example.com/auth/google/callback");
    assert.equal(params.get("access_type"), "offline");
    assert.equal(params.get("client_id"), "google-client");
  });
});

test("callback without a valid state is rejected before exchanging the code", async () => {
  const { app, exchanges } = buildApp();
  await withApp(app, async (base) => {
    const { cookie } = await startFlow(base, "google");
    assert.equal((await fetch(`${base}/auth/google/callback?code=abc`, { headers: { cookie } })).status, 400);

    const second = await startFlow(base, "google");
    const wrong = await fetch(`${base}/auth/google/callback?code=abc&state=${"0".repeat(64)}`, { headers: { cookie: second.cookie } });
    assert.equal(wrong.status, 400);

    const third = await startFlow(base, "outlook");
    const noCookie = await fetch(`${base}/auth/outlook/callback?code=abc&state=${third.state}`);
    assert.equal(noCookie.status, 400, "a state from another browser session must not work");

    assert.equal(exchanges.length, 0);
  });
});

test("valid callback stores tokens for the uid that started the flow; state cannot be replayed", async () => {
  const { app, exchanges, tokens } = buildApp();
  await withApp(app, async (base) => {
    const { cookie, state } = await startFlow(base, "outlook", "token-user");
    const res = await fetch(`${base}/auth/outlook/callback?code=the-code&state=${state}`, { headers: { cookie } });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /postMessage\(\{ type: 'OAUTH_AUTH_SUCCESS', provider: 'outlook' \}, window\.location\.origin\)/);
    assert.doesNotMatch(html, /'\*'/);
    assert.deepEqual(exchanges, [{ provider: "outlook", code: "the-code", redirectUri: "https://app.example.com/auth/outlook/callback" }]);

    assert.deepEqual(await tokens.get("user-1", "outlook"), { access_token: "access-outlook-the-code" });
    assert.equal(await tokens.get("user-2", "outlook"), null, "other users never receive these tokens");

    const replay = await fetch(`${base}/auth/outlook/callback?code=the-code&state=${state}`, { headers: { cookie } });
    assert.equal(replay.status, 400);
    assert.equal(exchanges.length, 1);
  });
});

test("token sync is bound to the signed-in uid and rejects cross-site requests", async () => {
  const { app, tokens } = buildApp();
  await withApp(app, async (base) => {
    const json = { "Content-Type": "application/json" };
    const body = JSON.stringify({ accessToken: "google-access" });

    assert.equal((await fetch(`${base}/api/auth/google/sync`, { method: "POST", headers: json, body })).status, 401);
    assert.equal((await fetch(`${base}/api/auth/google/sync`, {
      method: "POST", headers: { ...json, ...bearer("token-user"), Origin: "https://evil.example" }, body,
    })).status, 403);

    const ok = await fetch(`${base}/api/auth/google/sync`, {
      method: "POST", headers: { ...json, ...bearer("token-user"), Origin: "https://app.example.com" }, body,
    });
    assert.equal(ok.status, 200);
    assert.equal((await tokens.get("user-1", "google"))?.access_token, "google-access");
    assert.equal(await tokens.get("user-2", "google"), null);
  });
});

test("logout forgets the user's tokens (only that user's) and clears the session cookie", async () => {
  const { app, tokens } = buildApp();
  await tokens.set("user-1", "google", { access_token: "a" });
  await tokens.set("user-1", "outlook", { access_token: "b" });
  await tokens.set("user-2", "google", { access_token: "c" });

  await withApp(app, async (base) => {
    assert.equal((await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { Origin: "https://evil.example" } })).status, 403);
    assert.equal((await tokens.get("user-1", "google"))?.access_token, "a");

    const logout = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { ...bearer("token-user"), Origin: base } });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get("set-cookie") || "", /connect\.sid=;/);

    assert.equal(await tokens.get("user-1", "google"), null);
    assert.equal(await tokens.get("user-1", "outlook"), null);
    assert.equal((await tokens.get("user-2", "google"))?.access_token, "c");

    // Logout without a token still succeeds (it only clears the cookie).
    assert.equal((await fetch(`${base}/api/auth/logout`, { method: "POST" })).status, 204);
  });
});

test("InMemoryTokenStore expires entries after the TTL", async () => {
  let now = 0;
  const store = new InMemoryTokenStore(1000, () => now);
  await store.set("u", "google", { access_token: "t" });
  now = 999;
  assert.equal((await store.get("u", "google"))?.access_token, "t");
  now = 1000;
  assert.equal(await store.get("u", "google"), null);
});
