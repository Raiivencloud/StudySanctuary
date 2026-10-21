/**
 * Firebase ID token authentication for Express routes.
 * Identity always comes from a verified token, never from request headers like x-user-email.
 */
import type { Request, Response, NextFunction, RequestHandler } from "express";

export interface DecodedIdToken {
  uid: string;
  email?: string;
  email_verified?: boolean;
  admin?: unknown;
  [claim: string]: unknown;
}

export type VerifyIdToken = (token: string) => Promise<DecodedIdToken>;

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  isAdmin: boolean;
}

export function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/** Admin = custom claim `admin: true`, or a verified email listed in ADMIN_EMAILS. */
export function isAdminToken(decoded: DecodedIdToken, adminEmails: readonly string[]): boolean {
  if (decoded.admin === true) return true;
  const email = typeof decoded.email === "string" ? decoded.email.toLowerCase() : "";
  return Boolean(email) && decoded.email_verified === true && adminEmails.includes(email);
}

export interface AuthOptions {
  verifyIdToken: VerifyIdToken;
  adminEmails?: readonly string[];
}

export function getUser(res: Response): AuthenticatedUser {
  return res.locals.user as AuthenticatedUser;
}

export function requireUser(options: AuthOptions): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }
    try {
      const decoded = await options.verifyIdToken(token);
      const user: AuthenticatedUser = {
        uid: decoded.uid,
        email: decoded.email,
        isAdmin: isAdminToken(decoded, options.adminEmails || []),
      };
      res.locals.user = user;
      next();
    } catch {
      res.status(401).json({ error: "UNAUTHENTICATED" });
    }
  };
}

export function requireAdmin(options: AuthOptions): RequestHandler {
  const authenticate = requireUser(options);
  return (req, res, next) => {
    authenticate(req, res, () => {
      if (!getUser(res).isAdmin) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }
      next();
    });
  };
}
