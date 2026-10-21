/**
 * OAuth tokens for Google (Drive/Calendar) and Outlook (Calendar), keyed by the Firebase uid
 * of the user who connected them (never by a browser cookie).
 *
 * InMemoryTokenStore: $0, same durability as the previous MemoryStore sessions (lost on
 * restart, single instance). The async interface allows a persistent, encrypted store
 * later without touching the routes (see docs/SESSIONS_LOW_COST.md).
 */
export type IntegrationProvider = "google" | "outlook";

export interface StoredTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  [field: string]: unknown;
}

export interface IntegrationTokenStore {
  get(uid: string, provider: IntegrationProvider): Promise<StoredTokens | null>;
  set(uid: string, provider: IntegrationProvider, tokens: StoredTokens): Promise<void>;
  deleteAll(uid: string): Promise<void>;
}

export class InMemoryTokenStore implements IntegrationTokenStore {
  private readonly entries = new Map<string, { tokens: StoredTokens; expiresAt: number }>();

  constructor(private readonly ttlMs: number, private readonly now: () => number = Date.now) {}

  private key(uid: string, provider: IntegrationProvider) {
    return `${uid}:${provider}`;
  }

  private sweep() {
    const current = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= current) this.entries.delete(key);
    }
  }

  async get(uid: string, provider: IntegrationProvider) {
    this.sweep();
    return this.entries.get(this.key(uid, provider))?.tokens ?? null;
  }

  async set(uid: string, provider: IntegrationProvider, tokens: StoredTokens) {
    this.sweep();
    this.entries.set(this.key(uid, provider), { tokens, expiresAt: this.now() + this.ttlMs });
  }

  async deleteAll(uid: string) {
    this.entries.delete(this.key(uid, "google"));
    this.entries.delete(this.key(uid, "outlook"));
  }
}
