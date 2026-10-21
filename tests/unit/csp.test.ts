import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { buildCspPolicy, cspReportOnly, createCspReportRouter, parseCspReports, originOf } from "../../server/security/csp";
import { loadServerConfig } from "../../server/config";
import { withApp } from "../helpers/http";

test("policy is report-only, keeps the origins the app uses and forbids plugins/foreign framing", async () => {
  const app = express();
  app.use(cspReportOnly({ firebaseAuthDomain: "studysanctuary.net" }));
  app.get("/", (_req, res) => res.send("ok"));
  await withApp(app, async (base) => {
    const res = await fetch(base);
    assert.equal(res.headers.get("content-security-policy"), null, "must never enforce yet");
    const policy = res.headers.get("content-security-policy-report-only") || "";
    for (const expected of [
      "default-src 'self'", "object-src 'none'", "frame-ancestors 'self'", "report-uri /api/csp-report",
      "https://www.googletagmanager.com", "https://images.unsplash.com", "https://www.soundhelix.com",
      "https://*.googleapis.com", "https://firebasestorage.googleapis.com", "https://studysanctuary.net",
    ]) {
      assert.ok(policy.includes(expected), `missing ${expected}`);
    }
    assert.equal(res.headers.get("reporting-endpoints"), 'csp="/api/csp-report"');
  });
  assert.doesNotMatch(buildCspPolicy(), /https:\/\/undefined/);
});

test("CSP_MODE defaults to report-only and only accepts report-only/off", () => {
  assert.equal(loadServerConfig({ FIREBASE_PROJECT_ID: "d" }).csp.mode, "report-only");
  assert.equal(loadServerConfig({ FIREBASE_PROJECT_ID: "d", CSP_MODE: "off" }).csp.mode, "off");
  assert.throws(() => loadServerConfig({ FIREBASE_PROJECT_ID: "d", CSP_MODE: "enforce" }), /CSP_MODE/);
});

test("reports are parsed in both formats and only origins are kept (no paths, queries or tokens)", () => {
  assert.equal(originOf("https://firebasestorage.googleapis.com/v0/b/x/o/users%2Fu1%2Fa.pdf?alt=media&token=secret"), "https://firebasestorage.googleapis.com");
  assert.equal(originOf("inline"), "inline");
  assert.equal(originOf(undefined), "unknown");

  const legacy = { "csp-report": { "effective-directive": "img-src", "blocked-uri": "https://evil.example/pixel.gif?user=u1" } };
  const modern = [{ type: "csp-violation", body: { effectiveDirective: "script-src-elem", blockedURL: "https://cdn.example/x.js" } }];
  assert.deepEqual(parseCspReports(legacy), [{ directive: "img-src", blocked: "https://evil.example" }]);
  assert.deepEqual(parseCspReports(modern), [{ directive: "script-src-elem", blocked: "https://cdn.example" }]);
  assert.deepEqual(parseCspReports({ unrelated: true }), []);
});

test("report endpoint returns 204, de-duplicates log lines and never logs paths", async () => {
  const lines: string[] = [];
  const app = express();
  app.use("/api/csp-report", createCspReportRouter((line) => lines.push(line)));
  const report = JSON.stringify({ "csp-report": { "effective-directive": "img-src", "blocked-uri": "https://evil.example/p.gif?token=abc" } });
  await withApp(app, async (base) => {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${base}/api/csp-report`, { method: "POST", headers: { "Content-Type": "application/csp-report" }, body: report });
      assert.equal(res.status, 204);
    }
    const tooBig = await fetch(`${base}/api/csp-report`, { method: "POST", headers: { "Content-Type": "application/csp-report" }, body: "x".repeat(20_000) });
    assert.notEqual(tooBig.status, 204);
  });
  assert.deepEqual(lines, ["[CSP report-only] img-src bloquearía https://evil.example"]);
});
