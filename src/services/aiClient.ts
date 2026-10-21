/**
 * Browser side of the AI proxy (Phase 4). The browser never talks to Gemini and holds no
 * API key: every request goes to /api/ai/generate with the user's Firebase ID token, and the
 * server checks identity, limits and credits before calling the model.
 */
import { authFetch } from '../lib/authFetch';
import { DEFAULT_AI_FEATURE, type AiBilling, type AiFeature } from '../shared/aiFeatures';

export type { AiBilling, AiFeature } from '../shared/aiFeatures';

const randomId = () =>
  (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`).replace(/[^A-Za-z0-9_-]/g, '');

/** One id per user action: all model calls of that action are charged once. */
export const newAiAction = (feature: AiFeature): AiBilling => ({ feature, actionId: randomId() });

export interface AiResponse {
  text: string | null;
  candidates: any[];
  usageMetadata: unknown;
  model?: string;
  credits?: number | null;
}

// Messages match what handleAIError and the views already recognize.
const ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  AI_SUSPENDED_FREE: 'AI_SUSPENDED_FREE',
  RATE_LIMITED: 'El servicio de IA está bajo alta demanda (high demand). Esperá unos segundos.',
  TOO_MANY_CONCURRENT: 'Hay otras solicitudes de IA en curso (temporary). Esperá a que terminen.',
  AI_RATE_LIMITED: 'El servicio de IA está bajo alta demanda (high demand). No se descontaron créditos.',
  AI_UPSTREAM_ERROR: 'El servicio de IA no está disponible (temporary). No se descontaron créditos.',
  AI_TIMEOUT: 'La IA tardó demasiado en responder (temporary). No se descontaron créditos.',
  AI_INVALID_OUTPUT: 'La IA devolvió una respuesta con formato inválido (format). No se descontaron créditos.',
  DAILY_QUOTA_EXCEEDED: 'Alcanzaste el límite diario de uso de IA incluido. Probá de nuevo mañana.',
  ACTION_LIMIT: 'Esta acción ya se procesó. Volvé a intentarlo.',
  ACTION_CLOSED: 'Esta acción ya se procesó. Volvé a intentarlo.',
  DUPLICATE_REQUEST: 'La solicitud ya se está procesando.',
  PROFILE_NOT_FOUND: 'Tu perfil todavía se está creando. Intentá de nuevo en unos segundos.',
  UNAUTHENTICATED: 'Tu sesión expiró. Volvé a iniciar sesión.',
  AI_PROXY_DISABLED: 'La IA no está habilitada en este servidor.',
};

export class AiRequestError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(ERROR_MESSAGES[code] || `Error de IA (${code})`);
    this.name = 'AiRequestError';
  }
}

export interface GenerationRequest {
  model?: string;
  contents: unknown[];
  config?: Record<string, unknown>;
  billing?: AiBilling;
}

export async function requestGeneration(request: GenerationRequest): Promise<AiResponse> {
  const billing = request.billing || newAiAction(DEFAULT_AI_FEATURE);
  const response = await authFetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: request.model, contents: request.contents, config: request.config || {}, billing }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new AiRequestError(String(body?.error || `HTTP_${response.status}`), response.status);
  }

  const data = (await response.json()) as AiResponse;
  if (typeof data.credits === 'number') {
    window.dispatchEvent(new CustomEvent('creditsUpdated', { detail: { credits: data.credits } }));
  }
  return data;
}
