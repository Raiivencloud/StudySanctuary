/**
 * OAuth `state` parameter stored in the session: random, single-use, expiring and bound
 * to the Firebase uid that started the flow (tokens are stored for that uid only).
 */
import crypto from "crypto";

export type OAuthProvider = "google" | "outlook";

export interface OAuthStateEntry {
  value: string;
  uid: string;
  expiresAt: number;
}

export type OAuthStateStore = Partial<Record<OAuthProvider, OAuthStateEntry>>;

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function createOAuthState(store: OAuthStateStore, provider: OAuthProvider, uid: string, now = Date.now()): string {
  const value = crypto.randomBytes(32).toString("hex");
  store[provider] = { value, uid, expiresAt: now + OAUTH_STATE_TTL_MS };
  return value;
}

/** Validates and consumes the stored state (single use). Returns the uid that started the flow, or null. */
export function consumeOAuthState(
  store: OAuthStateStore | undefined,
  provider: OAuthProvider,
  received: unknown,
  now = Date.now()
): string | null {
  const entry = store?.[provider];
  if (store) delete store[provider];
  if (!entry || typeof received !== "string" || entry.expiresAt < now) return null;

  const a = Buffer.from(entry.value);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? entry.uid : null;
}
