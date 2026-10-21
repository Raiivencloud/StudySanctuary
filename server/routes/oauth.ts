/**
 * OAuth for Google (Calendar/Drive) and Outlook (Calendar), plus session sync/logout.
 * Tokens are kept in the server session. Every authorization request carries a
 * single-use `state` stored in the session (protects against login CSRF).
 */
import { Router, type RequestHandler } from "express";
import axios from "axios";
import { createOAuthState, consumeOAuthState, type OAuthProvider } from "../security/oauthState";
import { requireSameOrigin, logError } from "../security/http";
import { createRateLimiter, ipKey } from "../security/rateLimit";

export interface OAuthClientConfig {
  clientId?: string;
  clientSecret?: string;
}

export type ExchangeCode = (provider: OAuthProvider, code: string, redirectUri: string) => Promise<any>;

export interface OAuthRouterOptions {
  appUrl: string;
  google: OAuthClientConfig;
  outlook: OAuthClientConfig;
  /** Session cookie options, needed to clear the cookie on logout. */
  sessionCookie: { name: string; secure: boolean; sameSite: "none" | "lax" | "strict" };
  exchangeCode?: ExchangeCode;
}

const PROVIDERS: Record<OAuthProvider, { authorizeUrl: string; scope: string; extraParams: Record<string, string> }> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scope: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.readonly",
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
    const state = createOAuthState(req.session.oauthState, provider);

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

  router.get("/api/auth/google/url", oauthLimiter, authUrlHandler("google"));
  router.get("/api/auth/outlook/url", oauthLimiter, authUrlHandler("outlook"));

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

    if (!consumeOAuthState(req.session.oauthState, provider, state)) {
      return res.status(400).send("Invalid or expired authorization request. Close this window and try again.");
    }
    if (!code || typeof code !== "string") return res.status(400).send("No code provided");

    try {
      const tokens = await exchangeCode(provider, code, redirectUriFor(provider));
      if (provider === "google") {
        req.session.googleTokens = tokens;
      } else {
        req.session.outlookTokens = tokens;
      }
      console.log(`[OAuth] ${provider} tokens received and stored in session`);
      res.send(successPage(provider));
    } catch (error) {
      logError(`OAuth ${provider} callback`, error);
      res.status(500).send("Authentication failed");
    }
  };

  router.get("/auth/google/callback", oauthLimiter, callbackHandler("google"));
  router.get("/auth/outlook/callback", oauthLimiter, callbackHandler("outlook"));

  // Sync Firebase Google token to session
  router.post("/api/auth/google/sync", sameOrigin, (req, res) => {
    const { accessToken } = req.body || {};
    if (!accessToken || typeof accessToken !== "string") return res.status(400).json({ error: "No access token provided" });

    req.session.googleTokens = {
      access_token: accessToken,
      expiry_date: Date.now() + 3600 * 1000 // Assume 1 hour for Firebase tokens
    };

    res.json({ status: "ok" });
  });

  // Destroys the server session (Google/Outlook tokens) when the user logs out.
  router.post("/api/auth/logout", sameOrigin, (req, res) => {
    const { name, secure, sameSite } = options.sessionCookie;
    req.session.destroy((error) => {
      if (error) logError("Session destroy", error);
      res.clearCookie(name, { httpOnly: true, secure, sameSite });
      res.status(204).end();
    });
  });

  return router;
}
