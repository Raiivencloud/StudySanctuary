import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import session from "express-session";
import { createOAuthRouter } from "../../server/routes/oauth";
import { createOAuthState, consumeOAuthState, OAUTH_STATE_TTL_MS } from "../../server/security/oauthState";
import { withApp } from "../helpers/http";

// No calls to Google/Microsoft: the code exchange is a fake.
function buildApp() {
  const exchanges: any[] = [];
  const app = express();
  app.use(express.json());
  app.use(session({ name: "connect.sid", secret: "test-secret", resave: false, saveUninitialized: false, cookie: { httpOnly: true } }));
  app.use(createOAuthRouter({
    appUrl: "https://app.example.com",
    google: { clientId: "google-client" },
    outlook: { clientId: "outlook-client" },
    sessionCookie: { name: "connect.sid", secure: false, sameSite: "lax" },
    exchangeCode: async (provider, code, redirectUri) => {
      exchanges.push({ provider, code, redirectUri });
      return { access_token: `access-${provider}` };
    },
  }));
  app.get("/test/session", (req, res) => res.json({ google: Boolean(req.session.googleTokens), outlook: Boolean(req.session.outlookTokens) }));
  return { app, exchanges };
}

const cookieFrom = (res: Response) => (res.headers.get("set-cookie") || "").split(";")[0];

async function startFlow(base: string, provider: "google" | "outlook") {
  const res = await fetch(`${base}/api/auth/${provider}/url`);
  assert.equal(res.status, 200);
  const { url } = await res.json();
  const state = new URL(url).searchParams.get("state");
  return { cookie: cookieFrom(res), state, url: url as string };
}

test("oauth state helpers: single use, expiring, exact match", () => {
  const store = {};
  const state = createOAuthState(store, "google", 1000);
  assert.equal(consumeOAuthState(store, "google", state, 1001), true);
  assert.equal(consumeOAuthState(store, "google", state, 1002), false, "replay must fail");

  const expired = createOAuthState(store, "google", 0);
  assert.equal(consumeOAuthState(store, "google", expired, OAUTH_STATE_TTL_MS + 1), false);

  const other = createOAuthState(store, "outlook", 0);
  assert.equal(consumeOAuthState(store, "google", other, 1), false, "state is bound to the provider");
  assert.equal(consumeOAuthState(undefined, "google", "x"), false);
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

test("valid callback stores tokens, posts only to its own origin and the state cannot be replayed", async () => {
  const { app, exchanges } = buildApp();
  await withApp(app, async (base) => {
    const { cookie, state } = await startFlow(base, "outlook");
    const res = await fetch(`${base}/auth/outlook/callback?code=the-code&state=${state}`, { headers: { cookie } });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /postMessage\(\{ type: 'OAUTH_AUTH_SUCCESS', provider: 'outlook' \}, window\.location\.origin\)/);
    assert.doesNotMatch(html, /'\*'/);
    assert.deepEqual(exchanges, [{ provider: "outlook", code: "the-code", redirectUri: "https://app.example.com/auth/outlook/callback" }]);

    const sessionState = await (await fetch(`${base}/test/session`, { headers: { cookie } })).json();
    assert.deepEqual(sessionState, { google: false, outlook: true });

    const replay = await fetch(`${base}/auth/outlook/callback?code=the-code&state=${state}`, { headers: { cookie } });
    assert.equal(replay.status, 400);
    assert.equal(exchanges.length, 1);
  });
});

test("session endpoints reject cross-site requests (CSRF)", async () => {
  const { app } = buildApp();
  await withApp(app, async (base) => {
    const headers = { "Content-Type": "application/json", Origin: "https://evil.example" };
    assert.equal((await fetch(`${base}/api/auth/google/sync`, { method: "POST", headers, body: JSON.stringify({ accessToken: "t" }) })).status, 403);
    assert.equal((await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { Origin: "https://evil.example" } })).status, 403);

    // The configured APP_URL origin and same-origin requests are accepted.
    const ok = await fetch(`${base}/api/auth/google/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://app.example.com" },
      body: JSON.stringify({ accessToken: "t" }),
    });
    assert.equal(ok.status, 200);
  });
});

test("logout destroys the server session (Drive/Calendar tokens)", async () => {
  const { app } = buildApp();
  await withApp(app, async (base) => {
    const sync = await fetch(`${base}/api/auth/google/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: "t" }),
    });
    const cookie = cookieFrom(sync);
    assert.deepEqual(await (await fetch(`${base}/test/session`, { headers: { cookie } })).json(), { google: true, outlook: false });

    const logout = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { cookie, Origin: base } });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get("set-cookie") || "", /connect\.sid=;/);

    // Even if the old cookie is replayed, the session no longer exists.
    assert.deepEqual(await (await fetch(`${base}/test/session`, { headers: { cookie } })).json(), { google: false, outlook: false });
  });
});
