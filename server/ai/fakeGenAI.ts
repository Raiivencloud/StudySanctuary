/**
 * DEVELOPMENT-ONLY fake Gemini (AI_PROVIDER=fake). Returns deterministic, well-formed
 * responses so every AI feature can be exercised locally without a key or any cost.
 * The server refuses AI_PROVIDER=fake in production (server/config.ts).
 *
 * Put "[[fake-error]]" in a prompt to simulate an upstream failure (tests the refund path).
 */
import type { GenAIClient } from "./generation";
import { demoText, demoLocation } from "./demoContent";

// 0.2 s of silence, 16-bit PCM mono 24 kHz (the format Gemini TTS returns).
const SILENT_PCM_BASE64 = Buffer.alloc(9600).toString("base64");

type Schema = { type?: string; properties?: Record<string, Schema>; items?: Schema };

function fromSchema(schema: Schema | undefined, key = "valor", index = 1): unknown {
  switch ((schema?.type || "").toUpperCase()) {
    case "ARRAY":
      return [1, 2, 3].map((i) => fromSchema(schema!.items, key, i));
    case "OBJECT":
      return Object.fromEntries(Object.entries(schema!.properties || {}).map(([k, s]) => [k, fromSchema(s, k, index)]));
    case "NUMBER":
    case "INTEGER":
      return index;
    case "BOOLEAN":
      return true;
    default:
      return key === "id" ? `item_${index}` : `${key} de ejemplo ${index} (modo desarrollo)`;
  }
}

function jsonFor(prompt: string): unknown {
  const p = prompt.toLowerCase();
  if (p.includes("flashcards")) {
    return [1, 2, 3].map((i) => ({ id: `card_${i}`, front: `Pregunta de ejemplo ${i}`, back: `Respuesta de ejemplo ${i}` }));
  }
  if (p.includes("trivia") || p.includes("opción múltiple") || p.includes("examen")) {
    return [1, 2, 3].map((i) => ({
      id: `question_${i}`, question: `Pregunta de ejemplo ${i}`, options: ["Opción A", "Opción B", "Opción C", "Opción D"],
      correctAnswer: 1, explanation: "Explicación de ejemplo (modo desarrollo).",
    }));
  }
  if (p.includes("plan de estudio")) {
    return {
      title: "Plan de estudio de ejemplo", description: "Generado en modo desarrollo", estimatedTotalHours: 6,
      steps: [1, 2, 3].map((i) => ({ title: `Paso ${i}`, description: `Descripción del paso ${i}`, duration: "2h" })),
      weakPoints: ["Tema de ejemplo"], recommendations: ["Repasar con flashcards"],
    };
  }
  return { result: "Respuesta JSON de ejemplo (modo desarrollo)" };
}

export function createFakeGenAI(): GenAIClient {
  return {
    models: {
      async generateContent(request: any) {
        const prompt = (request?.contents || [])
          .flatMap((c: any) => c?.parts || [])
          .map((part: any) => part?.text || "")
          .join("\n");
        if (prompt.includes("[[fake-error]]")) {
          throw Object.assign(new Error("simulated upstream failure"), { status: 503 });
        }

        const config = request?.config || {};
        if (Array.isArray(config.responseModalities) && config.responseModalities.includes("AUDIO")) {
          return { text: undefined, candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: SILENT_PCM_BASE64 } }] } }] };
        }

        const text = config.responseMimeType === "application/json"
          ? JSON.stringify(config.responseSchema ? (demoLocation(config.responseSchema, prompt) ?? fromSchema(config.responseSchema)) : jsonFor(prompt))
          : demoText(prompt);

        return {
          text,
          candidates: [{ content: { parts: [{ text }] } }],
          usageMetadata: { promptTokenCount: Math.ceil(prompt.length / 4), candidatesTokenCount: Math.ceil(text.length / 4), totalTokenCount: Math.ceil((prompt.length + text.length) / 4) },
        };
      },
    },
  };
}
