/** Preliminary legal texts (src/legal): accurate claims, visible pending markers, no invented guarantees. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fillLegalText, legalValuesFromEnv, isLegalTextFinal } from "../../src/legal/legalTexts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file: string) => fs.readFileSync(path.join(repoRoot, file), "utf8");
const privacy = read("src/legal/privacy.md");
const terms = read("src/legal/terms.md");

test("placeholders are filled from the build variables, and anything missing stays visibly pending", () => {
  const values = legalValuesFromEnv({ VITE_LEGAL_ENTITY_NAME: "Empresa S.A.", VITE_LEGAL_CONTACT_EMAIL: "privacidad@empresa.test" });
  const filled = fillLegalText(privacy, values);
  assert.match(filled, /tratamos \*\*Empresa S\.A\.\*\*|trata \*\*Empresa S\.A\.\*\*/);
  assert.match(filled, /privacidad@empresa\.test/);
  assert.match(filled, /\[Pendiente de revisión legal: fecha de vigencia\]/);
  assert.doesNotMatch(filled, /\{\{[A-Z_]+\}\}/);
  assert.equal(isLegalTextFinal(filled, "true"), false, "never final while something is pending");
  assert.equal(isLegalTextFinal("Texto completo", "true"), true);
  assert.equal(isLegalTextFinal("Texto completo", undefined), false, "needs the explicit approval flag");
});

test("the privacy policy describes the real implementation (no end-to-end encryption, AI provider, visibility)", () => {
  assert.match(privacy, /No usamos cifrado de extremo a extremo/);
  assert.match(privacy, /Google Gemini API/);
  assert.match(privacy, /No recibimos ni guardamos datos de tarjetas/);
  assert.match(privacy, /grupos de estudio[\s\S]*visibles para los usuarios registrados/);
  assert.match(privacy, /ranking de la Arena/);
  assert.match(privacy, /solo accedemos a los archivos que subís o abrís desde StudySanctuary/);
  assert.match(privacy, /la app todavía no tiene una opción para hacerlo/);
});

test("the terms describe one-time plans and do not promise unimplemented guarantees", () => {
  assert.match(terms, /\*\*pagos únicos\*\*/);
  assert.match(terms, /No se renuevan automáticamente ni generan débitos recurrentes/);
  assert.match(terms, /no garantizamos que esté disponible sin interrupciones/);
  for (const text of [privacy, terms]) {
    assert.doesNotMatch(text, /end-to-end(?! )|encriptaci[oó]n de extremo a extremo garantiza|100% segur|nunca (se )?pierd|ilimitad|soporte prioritario|sin anuncios/i);
  }
});

test("the landing no longer shows the old privacy claims, and both legal links open the texts", () => {
  const landing = read("src/components/LandingView.tsx");
  assert.doesNotMatch(landing, /encriptación end-to-end|Inmunidad de Datos|Soberanía del Usuario|Seguridad Encriptada|ACEPTO TERMINOS|DESCARGAR LEGALES/);
  assert.match(landing, /setLegalDocument\('privacy'\)/);
  assert.match(landing, /setLegalDocument\('terms'\)/);
});

test("the experimental voice assistant stays disabled: no view imports or renders it", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry.name) && !rel.endsWith("VoiceAssistant.tsx")) files.push(rel);
    }
  };
  walk("src");
  for (const file of files) assert.doesNotMatch(read(file), /import[^;]*VoiceAssistant|<VoiceAssistant|lazy\([^)]*VoiceAssistant/, `${file} must not use the experimental voice assistant`);
  assert.match(read("src/components/VoiceAssistant.tsx"), /^\/\*\*\n \* EXPERIMENTAL, NOT ENABLED/);
});
