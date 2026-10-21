/**
 * Content Security Policy in REPORT-ONLY mode: nothing is blocked; the browser reports what
 * a future enforced policy would block. The policy lists the origins the app uses today
 * (Firebase, GTM, images, music, map tiles). `frame-ancestors 'self'` also reveals whether
 * the app is being embedded in third-party iframes (needed to decide audit item 2-E).
 */
import express, { Router, type RequestHandler } from "express";
import { createRateLimiter, ipKey } from "./rateLimit";

export interface CspOptions {
  /** Extra origins for Firebase Auth's iframe (e.g. a custom authDomain). */
  firebaseAuthDomain?: string;
  reportPath?: string;
}

export function buildCspPolicy(options: CspOptions = {}): string {
  const authDomain = options.firebaseAuthDomain ? `https://${options.firebaseAuthDomain}` : "";
  const reportPath = options.reportPath || "/api/csp-report";
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // GTM uses an inline bootstrap snippet; Firebase Auth loads Google scripts for sign-in.
    "script-src": ["'self'", "'unsafe-inline'", "https://www.googletagmanager.com", "https://*.googletagmanager.com", "https://apis.google.com", "https://www.gstatic.com", "https://www.google-analytics.com"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "font-src": ["'self'", "data:"],
    "img-src": [
      "'self'", "data:", "blob:",
      "https://images.unsplash.com", "https://picsum.photos", "https://fastly.picsum.photos",
      "https://lh3.googleusercontent.com", "https://api.dicebear.com", "https://www.transparenttextures.com",
      "https://cdnjs.cloudflare.com", "https://www.google.com", "https://www.gstatic.com",
      "https://firebasestorage.googleapis.com", "https://storage.googleapis.com",
      "https://server.arcgisonline.com", "https://map1.vis.earthdata.nasa.gov",
      "https://www.googletagmanager.com", "https://*.google-analytics.com",
    ],
    "media-src": ["'self'", "data:", "blob:", "https://www.soundhelix.com", "https://firebasestorage.googleapis.com", "https://storage.googleapis.com"],
    "connect-src": [
      "'self'", "https://*.googleapis.com", "https://*.firebaseio.com", "wss://*.firebaseio.com",
      "https://www.googletagmanager.com", "https://*.google-analytics.com", "https://*.analytics.google.com",
    ],
    "frame-src": ["'self'", "https://*.firebaseapp.com", "https://*.web.app", "https://accounts.google.com", "https://www.googletagmanager.com", ...(authDomain ? [authDomain] : [])],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'self'"],
    "report-uri": [reportPath],
    "report-to": ["csp"],
  };
  return Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

export function cspReportOnly(options: CspOptions = {}): RequestHandler {
  const policy = buildCspPolicy(options);
  const reportPath = options.reportPath || "/api/csp-report";
  return (_req, res, next) => {
    res.setHeader("Content-Security-Policy-Report-Only", policy);
    res.setHeader("Reporting-Endpoints", `csp="${reportPath}"`);
    next();
  };
}

/** Origin only (never path or query: URLs can carry download tokens or personal data). */
export function originOf(value: unknown): string {
  if (typeof value !== "string" || !value) return "unknown";
  if (/^(inline|eval|data|blob|self|wasm-eval|trusted-types-sink)$/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.origin === "null" ? url.protocol.replace(":", "") : url.origin;
  } catch {
    return value.replace(/[^a-z0-9:-]/gi, "").slice(0, 40) || "unknown";
  }
}

export interface CspViolation {
  directive: string;
  blocked: string;
}

/** Accepts both the legacy `report-uri` format and the Reporting API format. */
export function parseCspReports(body: unknown): CspViolation[] {
  const items = Array.isArray(body) ? body : [body];
  return items.flatMap((item: any) => {
    const report = item?.["csp-report"] || (item?.type === "csp-violation" ? item.body : null);
    if (!report) return [];
    const directive = String(report["effective-directive"] || report.effectiveDirective || report["violated-directive"] || "unknown").split(" ")[0].slice(0, 40);
    return [{ directive, blocked: originOf(report["blocked-uri"] ?? report.blockedURL) }];
  });
}

/** Logs each distinct (directive, blocked origin) at most once per window to keep logging cheap. */
export function createCspReportRouter(log: (line: string) => void = console.warn, dedupeWindowMs = 60 * 60 * 1000): Router {
  const router = Router();
  const seen = new Map<string, number>();
  const limiter = createRateLimiter({ windowMs: 60 * 1000, max: 60, key: ipKey });

  router.post(
    "/",
    limiter,
    express.json({ limit: "16kb", type: ["application/csp-report", "application/reports+json", "application/json"] }),
    (req, res) => {
      const now = Date.now();
      for (const violation of parseCspReports(req.body)) {
        const key = `${violation.directive} ${violation.blocked}`;
        const last = seen.get(key);
        if (last !== undefined && now - last < dedupeWindowMs) continue;
        if (seen.size > 500) seen.clear();
        seen.set(key, now);
        log(`[CSP report-only] ${violation.directive} bloquearía ${violation.blocked}`);
      }
      res.status(204).end();
    }
  );
  return router;
}
