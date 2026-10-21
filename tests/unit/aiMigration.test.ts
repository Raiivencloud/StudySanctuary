/** Static guarantees of the Phase 4 migration (AI and credits on the server). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AI_FEATURES } from "../../src/shared/aiFeatures";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file: string) => fs.readFileSync(path.join(repoRoot, file), "utf8");
const srcFiles = (dir = "src"): string[] =>
  fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    return entry.isDirectory() ? srcFiles(rel) : /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
  });

test("the browser code never imports the Gemini SDK nor calls Google AI endpoints", () => {
  for (const file of srcFiles()) {
    const source = read(file);
    assert.doesNotMatch(source, /from ["']@google\/genai["']/, `${file} imports @google/genai`);
    assert.doesNotMatch(source, /generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com/, file);
    assert.doesNotMatch(source, /VITE_GEMINI_API_KEY|VITE_GOOGLE_API_KEY|new GoogleGenAI/, file);
  }
});

test("the client never writes credits, plans or the free trial", () => {
  for (const file of srcFiles()) {
    const source = read(file);
    assert.doesNotMatch(source, /\bconsumeCredit\s*\(/, `${file} still charges on the client`);
    assert.doesNotMatch(source, /(updateDoc|setDoc)\([^)]*users[^)]*\)[\s\S]{0,200}remainingCredits\s*:/, `${file} writes remainingCredits`);
  }
  assert.doesNotMatch(read("src/services/userService.ts"), /remainingCredits\s*:/);
});

test("every view that charged a credit before labels its AI actions (prices unchanged)", () => {
  const billable: Record<string, string[]> = {
    "src/components/AIStudyView.tsx": ["study"],
    "src/components/PodcastView.tsx": ["podcast"],
    "src/components/VoiceAssistant.tsx": ["voice_assistant"],
    "src/components/VirtualTutor.tsx": ["virtual_tutor"],
    "src/components/MathView.tsx": ["math"],
    "src/components/BooksView.tsx": ["books"],
    "src/components/MultimediaGenerator.tsx": ["maps"],
  };
  for (const [file, features] of Object.entries(billable)) {
    for (const feature of features) {
      assert.match(read(file), new RegExp(`newAiAction\\('${feature}'\\)`), `${file} must bill '${feature}'`);
      assert.equal((AI_FEATURES as any)[feature].billing, "credit");
    }
  }
  // Tools that were free stay free (daily quota instead of credits).
  assert.equal(AI_FEATURES.course_tools.billing, "included");
  assert.equal(AI_FEATURES.arena_questions.billing, "included");
  assert.doesNotMatch(read("src/components/CourseDetail.tsx"), /newAiAction\(/);
  // Multi-call actions are charged once.
  assert.equal(AI_FEATURES.podcast.maxCalls, 2);
  assert.equal(AI_FEATURES.voice_assistant.maxCalls, 2);
});

test("Arena's paid cooldown skip is charged by the server", () => {
  assert.match(read("src/components/ArenaView.tsx"), /spendCredit\(user\.uid, 'arena_cooldown'\)/);
});

test("final credit rules are ready to switch on (single marker line)", () => {
  const rules = read("firestore.rules");
  assert.equal(rules.split("return true; // CLIENT_CREDIT_TRANSITIONS").length - 1, 1);
});
