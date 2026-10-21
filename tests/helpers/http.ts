import type { Express } from "express";
import type { AddressInfo } from "net";

/** Starts an Express app on a random local port for the duration of `run`. */
export async function withApp(app: Express, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** Fake Firebase ID token verifier: tokens are looked up in a fixed table. */
export const fakeTokens: Record<string, { uid: string; email?: string; email_verified?: boolean; admin?: boolean }> = {
  "token-user": { uid: "user-1", email: "student@example.com", email_verified: true },
  "token-other": { uid: "user-2", email: "other@example.com", email_verified: true },
  "token-admin-claim": { uid: "admin-1", email: "ops@example.com", email_verified: true, admin: true },
  "token-admin-email": { uid: "admin-2", email: "Owner@Example.com", email_verified: true },
  "token-admin-email-unverified": { uid: "admin-3", email: "owner@example.com", email_verified: false },
};

export const fakeVerifyIdToken = async (token: string) => {
  const decoded = fakeTokens[token];
  if (!decoded) throw new Error("invalid token");
  return decoded;
};

export const ADMIN_EMAILS = ["owner@example.com"];
