/**
 * Writes docs/THIRD_PARTY_LICENSES.md: the licenses of every production dependency
 * (direct and transitive) as installed (npm ls --omit=dev). Read-only; no network.
 *   npm run licenses
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

interface Row { name: string; version: string; license: string; repo: string }
interface Node { version?: string; path?: string; dependencies?: Record<string, Node> }

const root = process.cwd();
const tree = JSON.parse(execSync("npm ls --omit=dev --all --json --long", { cwd: root, maxBuffer: 1 << 28 }).toString());
const rows = new Map<string, Row>();

function licenseOf(pkg: any): string {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l: any) => l.type || l).join(" OR ");
  return "UNKNOWN";
}

function walk(deps: Record<string, Node> | undefined) {
  for (const [name, info] of Object.entries(deps || {})) {
    const key = `${name}@${info.version}`;
    if (info.version && info.path && !rows.has(key)) {
      const pkg = JSON.parse(fs.readFileSync(path.join(info.path, "package.json"), "utf8"));
      let license = licenseOf(pkg);
      // Packages that ship a LICENSE file without declaring it in package.json
      if (license === "UNKNOWN") {
        const file = fs.readdirSync(info.path).find((f) => /^licen[cs]e/i.test(f));
        const text = file ? fs.readFileSync(path.join(info.path, file), "utf8") : "";
        if (/^MIT License|Permission is hereby granted, free of charge/m.test(text)) license = "MIT (LICENSE file)";
      }
      const repo = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url || pkg.homepage || "";
      rows.set(key, { name, version: info.version, license, repo: repo.replace(/^git\+/, "").replace(/\.git$/, "") });
    }
    walk(info.dependencies);
  }
}
walk(tree.dependencies);

const direct = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).dependencies || {}));
const sorted = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const counts = new Map<string, number>();
for (const row of sorted) counts.set(row.license, (counts.get(row.license) || 0) + 1);
const PERMISSIVE = /^(MIT|MIT \(LICENSE file\)|ISC|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|BSD|0BSD|BlueOak-1\.0\.0|CC0-1\.0|MIT-0|\(MIT AND Zlib\)|MIT AND ISC)$/;

const lines = [
  "# Licencias de terceros (dependencias de producción)",
  "",
  `Generado con \`npm run licenses\` a partir de \`node_modules\` (${sorted.length} paquetes, directos y transitivos). No incluye las herramientas de desarrollo (\`devDependencies\`). El análisis está en [\`LICENSING_AND_IP.md\`](./LICENSING_AND_IP.md).`,
  "",
  "## Resumen por licencia",
  "",
  "| Licencia | Paquetes |",
  "|---|---|",
  ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([license, n]) => `| ${license} | ${n} |`),
  "",
  "## Licencias que requieren atención",
  "",
  "| Paquete | Versión | Licencia | Directa |",
  "|---|---|---|---|",
  ...sorted.filter((r) => !PERMISSIVE.test(r.license)).map((r) => `| \`${r.name}\` | ${r.version} | ${r.license} | ${direct.has(r.name) ? "sí" : "no"} |`),
  "",
  "## Inventario completo",
  "",
  "| Paquete | Versión | Licencia | Directa | Repositorio |",
  "|---|---|---|---|---|",
  ...sorted.map((r) => `| \`${r.name}\` | ${r.version} | ${r.license} | ${direct.has(r.name) ? "sí" : ""} | ${r.repo} |`),
  "",
];
fs.writeFileSync(path.join(root, "docs/THIRD_PARTY_LICENSES.md"), lines.join("\n"));
console.log(`[licenses] ${sorted.length} paquetes → docs/THIRD_PARTY_LICENSES.md`);
