/** Regressions found while validating Phase 4 in the browser (docs/PHASE4_VALIDATION.md). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createFakeGenAI } from "../../server/ai/fakeGenAI";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file: string) => fs.readFileSync(path.join(repoRoot, file), "utf8");
const LOCATION_FIELDS = ["name", "lat", "lon", "weather", "localTime", "funFact"];

test("V-1: map search and identification ask for JSON with the fields the map view reads", () => {
  const source = read("src/services/geminiService.ts");
  for (const fn of ["identifyLocation", "searchLocation"]) {
    const body = source.slice(source.indexOf(`export const ${fn}`)).split("\nexport const")[0];
    assert.match(body, /responseMimeType:\s*"application\/json"/, `${fn} must request JSON`);
    assert.match(body, /responseSchema:\s*LOCATION_SCHEMA/, `${fn} must send the location schema`);
    assert.match(body, /extractJSON\(result\)/, `${fn} must return the parsed object`);
  }
  const schema = source.slice(source.indexOf("const LOCATION_SCHEMA"), source.indexOf("export const identifyLocation"));
  for (const field of LOCATION_FIELDS) assert.match(schema, new RegExp(`\\b${field}:`), `schema lacks ${field}`);
});

test("V-1: the development AI answers the map schema with every field MultimediaGenerator uses", async () => {
  const ai = createFakeGenAI();
  const res = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [{ text: "Busca este lugar: Buenos Aires." }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: { name: { type: "STRING" }, lat: { type: "NUMBER" }, lon: { type: "NUMBER" }, weather: { type: "STRING" }, localTime: { type: "STRING" }, funFact: { type: "STRING" } },
        required: LOCATION_FIELDS,
      },
    },
  });
  const place = JSON.parse(res.text!);
  for (const field of LOCATION_FIELDS) assert.ok(field in place, `missing ${field}`);
  assert.equal(typeof place.lat, "number");
  assert.equal(typeof place.name, "string");
});

test("V-2: overlapping Arena first visits share one load (no duplicated starter cards)", () => {
  const source = read("src/services/arenaService.ts");
  assert.match(source, /const pendingStatsLoads = new Map<string, Promise<ArenaUserStats>>\(\)/);
  const getter = source.slice(source.indexOf("export const getArenaUserStats"), source.indexOf("const loadArenaUserStats"));
  assert.match(getter, /pendingStatsLoads\.get\(userId\)/);
  assert.match(getter, /\.finally\(\(\) => pendingStatsLoads\.delete\(userId\)\)/);
});
