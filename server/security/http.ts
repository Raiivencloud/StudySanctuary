/**
 * HTTP hardening helpers: origin checks (CSRF), security headers, safe error logging
 * and the JSON error handler for /api routes.
 */
import type { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from "express";
import multer from "multer";

/**
 * Rejects cross-site requests to endpoints that rely on the session cookie.
 * Requests without an Origin header (same-origin navigations, non-browser clients) pass:
 * browsers always send Origin on cross-site POSTs.
 */
export function requireSameOrigin(appUrl: string): RequestHandler {
  const configured = appUrl ? safeOrigin(appUrl) : null;
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) return next();
    const own = `${req.protocol}://${req.get("host")}`;
    if (origin === own || (configured && origin === configured)) return next();
    res.status(403).json({ error: "FORBIDDEN_ORIGIN" });
  };
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function securityHeaders(isProduction: boolean): RequestHandler {
  return (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (isProduction) {
      res.setHeader("Strict-Transport-Security", "max-age=15552000");
    }
    next();
  };
}

/** Logs only message/code/status: full error objects (axios, SDKs) can carry Authorization headers. */
export function logError(context: string, error: unknown): void {
  const e = error as any;
  const details = [
    e?.code !== undefined ? `code=${e.code}` : "",
    e?.status !== undefined ? `status=${e.status}` : "",
    e?.response?.status !== undefined ? `httpStatus=${e.response.status}` : "",
  ].filter(Boolean).join(" ");
  console.error(`[${context}] ${e?.message || String(error)}${details ? ` (${details})` : ""}`);
}

export const apiErrorHandler: ErrorRequestHandler = (err, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);

  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({ error: status === 413 ? "FILE_TOO_LARGE" : "INVALID_UPLOAD" });
  }
  if ((err as any)?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "INVALID_JSON" });
  }
  if ((err as any)?.type === "entity.too.large") {
    return res.status(413).json({ error: "PAYLOAD_TOO_LARGE" });
  }

  logError(`HTTP ${req.method} ${req.path}`, err);
  res.status(500).json({ error: "INTERNAL_ERROR" });
};
