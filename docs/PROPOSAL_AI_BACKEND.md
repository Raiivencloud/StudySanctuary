# Propuesta: migrar las llamadas a Gemini al backend (PENDIENTE DE APROBACIÓN)

## Estado actual (después de la Fase 1)

- Ya **no hay** claves escritas en el código, y `vite.config.ts` no inyecta variables de servidor en el bundle.
- **El servidor está preparado:** `server/ai/geminiProxy.ts` implementa `POST /api/ai/generate` con:
  - verificación del Firebase ID Token;
  - lista de modelos permitidos;
  - filtro de opciones de generación;
  - errores sin detalles internos;
  - la clave solo en el servidor.

  El endpoint está **desactivado** (`AI_PROXY_ENABLED=false`) y no lo usa ningún componente. Sus pruebas usan un cliente falso: no hay llamadas reales a Gemini.
- **El cliente sigue llamando a Gemini directamente** con `VITE_GEMINI_API_KEY` (pública en el bundle). Se mantiene para no romper funcionalidades hasta que apruebes este cambio.

## Por qué requiere aprobación

Cambia el contrato de **todas** las funciones de IA:

| Punto de uso | Llamadas |
|---|---|
| `src/services/geminiService.ts` | 22 funciones exportadas que pasan por `callGemini`, más `generatePodcastAudio` (TTS) |
| `src/components/CourseDetail.tsx` | 3 |
| `src/components/BooksView.tsx` | 2 |
| `src/components/PodcastView.tsx` | 2 |
| `src/components/MathView.tsx` | 1 |
| `src/components/VirtualTutor.tsx` | 1 |
| `src/components/VoiceAssistant.tsx` | 1 |
| `src/components/AIStudyView.tsx` | Usa funciones del servicio |

El plan es que los componentes **no cambien**: solo se reemplazaría el transporte interno de `callGemini`, `generatePodcastAudio` y `getAI`, manteniendo las mismas firmas.

## Cambio propuesto (Fase 4a: transporte)

1. En `callGemini` y `generatePodcastAudio`, reemplazar `new GoogleGenAI({ apiKey })` por un `fetch('/api/ai/generate')` con `Authorization: Bearer ${await auth.currentUser.getIdToken()}`. La respuesta del endpoint (`{ text, candidates, usageMetadata }`) mantiene la forma que hoy consumen los componentes, incluido el audio TTS en `candidates[0].content.parts[0].inlineData`.
2. Mantener en el cliente la cascada de modelos de respaldo y los reintentos, interpretando los códigos 400, 429 y 502 del proxy. A futuro, conviene moverlos al servidor.
3. Eliminar `getClientGeminiApiKey()` y `VITE_GEMINI_API_KEY` del cliente y de `.env.example`.
4. Activar `AI_PROXY_ENABLED=true` y definir `GEMINI_API_KEY` en el servidor (Secret Manager).

## Requisitos antes de activarlo en producción (Fase 4b: control de costos)

Sin estos puntos, el proxy permitiría a cualquier usuario autenticado consumir Gemini sin límite:

- **Créditos en el servidor:** descuento en una transacción de Firestore *antes* de llamar al modelo y devolución si falla. Hoy `consumeCredit` corre en el cliente.
- **Rate limit** por uid y por IP, y **tamaño máximo** de prompt y archivo (hoy, 15 MB de JSON).
- **Interruptor de suspensión** de IA aplicado en el servidor.
- Registro de `usageMetadata` (tokens) para calcular costos reales.
- Revisar la lista de modelos (algunos `gemini-1.5-*` y *preview* podrían no estar disponibles; hay que verificarlo con la lista vigente de Google).

## Riesgos de regresión

| Riesgo | Mitigación |
|---|---|
| Los archivos grandes en base64 superan el límite del body | El límite es configurable (`bodyLimit`). Medir los tamaños reales de los PDF que se suben hoy. |
| Latencia extra por pasar por el servidor (una sola instancia de 512 MiB en Cloud Run) | Revisar `maxScale` y la memoria. Hacer streaming más adelante. |
| TTS y asistente de voz (respuestas de audio) | Pruebas manuales específicas de `PodcastView` y `VoiceAssistant`. |
| Usuarios sin sesión válida (token vencido) | `getIdToken()` lo renueva solo. Manejar el 401 con un mensaje claro. |
| Diferencias en `systemInstruction` y `responseSchema` | Las pruebas del proxy ya verifican que se reenvíen sin cambios. |

## Decisión solicitada

- [ ] Aprobar la Fase 4a (transporte por el proxy, sin cambios en los componentes).
- [ ] Aprobar la Fase 4b (créditos, cuotas y rate limit en el servidor), necesaria antes de activarlo en producción.
