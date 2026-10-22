/**
 * OAuth for Google (Calendar/Drive) and Outlook (Calendar), plus token sync/logout.
 * Starting a flow requires a Firebase ID token; the single-use `state` (kept in the session
 * cookie for up to 10 minutes) is bound to that uid, and the resulting provider tokens are
 * stored for that uid only (IntegrationTokenStore). The session holds nothing else.
 */
import { Router, type RequestHandler } from "express";
import axios from "axios";
import { createOAuthState, consumeOAuthState, type OAuthProvider } from "../security/oauthState";
import { requireSameOrigin, logError } from "../security/http";
import { createRateLimiter, ipKey } from "../security/rateLimit";
import { requireUser, getUser, getBearerToken, type AuthOptions } from "../security/auth";
import type { IntegrationTokenStore, StoredTokens } from "../integrations/tokenStore";

export interface OAuthClientConfig {
  clientId?: string;
  clientSecret?: string;
}

export type ExchangeCode = (provider: OAuthProvider, code: string, redirectUri: string) => Promise<any>;

export interface OAuthRouterOptions {
  auth: AuthOptions;
  tokens: IntegrationTokenStore;
  appUrl: string;
  google: OAuthClientConfig;
  outlook: OAuthClientConfig;
  /** Session cookie options, needed to clear the cookie on logout. */
  sessionCookie: { name: string; secure: boolean; sameSite: "none" | "lax" | "strict" };
  exchangeCode?: ExchangeCode;
}

/**
 * Google scopes, minimal by design: Calendar read-only and drive.file (only the files the user
 * uploads or opens through StudySanctuary). The restricted drive.readonly scope is not used: it
 * would require Google's annual CASA security assessment (docs/SALE_AND_TRANSFER.md).
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

/** Tokens from the authorization-code flow: absolute expiry and their origin (never replaced by a sign-in token). */
export function normalizeOAuthTokens(raw: any, now = Date.now()): StoredTokens {
  const expiresIn = Number(raw?.expires_in);
  return {
    ...raw,
    ...(Number.isFinite(expiresIn) && expiresIn > 0 ? { expiry_date: now + expiresIn * 1000 } : {}),
    source: "oauth",
  };
}

const PROVIDERS: Record<OAuthProvider, { authorizeUrl: string; scope: string; extraParams: Record<string, string> }> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scope: GOOGLE_SCOPES,
    extraParams: { access_type: "offline", prompt: "consent" },
  },
  outlook: {
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    scope: "offline_access Calendars.Read",
    extraParams: { response_mode: "query" },
  },
};

export function createOAuthRouter(options: OAuthRouterOptions): Router {
  const router = Router();
  const sameOrigin = requireSameOrigin(options.appUrl);
  const oauthLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 30, key: ipKey });
  const authenticate = requireUser(options.auth);

  const clientFor = (provider: OAuthProvider) => (provider === "google" ? options.google : options.outlook);
  const redirectUriFor = (provider: OAuthProvider) => `${options.appUrl}/auth/${provider}/callback`;

  const defaultExchangeCode: ExchangeCode = async (provider, code, redirectUri) => {
    const client = clientFor(provider);
    if (provider === "google") {
      const response = await axios.post("https://oauth2.googleapis.com/token", {
        code,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      });
      return response.data;
    }
    const response = await axios.post("https://login.microsoftonline.com/common/oauth2/v2.0/token", new URLSearchParams({
      code,
      client_id: client.clientId || "",
      client_secret: client.clientSecret || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    }).toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    return response.data;
  };
  const exchangeCode = options.exchangeCode || defaultExchangeCode;

  // OAuth URL construction
  const authUrlHandler = (provider: OAuthProvider): RequestHandler => (req, res) => {
    const config = PROVIDERS[provider];
    req.session.oauthState = req.session.oauthState || {};
    const state = createOAuthState(req.session.oauthState, provider, getUser(res).uid);

    const params = new URLSearchParams({
      client_id: clientFor(provider).clientId || "",
      redirect_uri: redirectUriFor(provider),
      response_type: "code",
      scope: config.scope,
      state,
      ...config.extraParams,
    });

    res.json({ url: `${config.authorizeUrl}?${params}` });
  };

  router.get("/api/auth/google/url", oauthLimiter, authenticate, authUrlHandler("google"));
  router.get("/api/auth/outlook/url", oauthLimiter, authenticate, authUrlHandler("outlook"));

  // The popup and the app share the origin, so the message is restricted to it.
  const successPage = (provider: OAuthProvider) => `
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: '${provider}' }, window.location.origin);
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `;

  const callbackHandler = (provider: OAuthProvider): RequestHandler => async (req, res) => {
    const { code, state } = req.query;

    const uid = consumeOAuthState(req.session.oauthState, provider, state);
    if (!uid) {
      return res.status(400).send("Invalid or expired authorization request. Close this window and try again.");
    }
    if (!code || typeof code !== "string") return res.status(400).send("No code provided");

    try {
      const tokens = await exchangeCode(provider, code, redirectUriFor(provider));
      await options.tokens.set(uid, provider, normalizeOAuthTokens(tokens));
      console.log(`[OAuth] ${provider} tokens received and stored for uid=${uid}`);
      res.send(successPage(provider));
    } catch (error) {
      logError(`OAuth ${provider} callback`, error);
      res.status(500).send("Authentication failed");
    }
  };

  router.get("/auth/google/callback", oauthLimiter, callbackHandler("google"));
  router.get("/auth/outlook/callback", oauthLimiter, callbackHandler("outlook"));

  // Sync the Google token obtained at Firebase sign-in, for the signed-in uid
  router.post("/api/auth/google/sync", sameOrigin, authenticate, async (req, res) => {
    const { accessToken } = req.body || {};
    if (!accessToken || typeof accessToken !== "string") return res.status(400).json({ error: "No access token provided" });

    // The sign-in token has no Drive/Calendar scopes: it must never replace a connected account's token
    const { uid } = getUser(res);
    const current = await options.tokens.get(uid, "google");
    if (current?.source === "oauth") return res.json({ status: "kept" });

    await options.tokens.set(uid, "google", {
      access_token: accessToken,
      expiry_date: Date.now() + 3600 * 1000, // Assume 1 hour for Firebase tokens
      source: "sign-in",
    });

    res.json({ status: "ok" });
  });

  // On logout: forget the user's Google/Outlook tokens and destroy the session cookie.
  router.post("/api/auth/logout", sameOrigin, async (req, res) => {
    const token = getBearerToken(req);
    if (token) {
      try {
        const { uid } = await options.auth.verifyIdToken(token);
        await options.tokens.deleteAll(uid);
      } catch {
        // Invalid/expired token: nothing to forget for an unknown user.
      }
    }

    const { name, secure, sameSite } = options.sessionCookie;
    req.session.destroy((error) => {
      if (error) logError("Session destroy", error);
      res.clearCookie(name, { httpOnly: true, secure, sameSite });
      res.status(204).end();
    });
  });

  return router;
}
