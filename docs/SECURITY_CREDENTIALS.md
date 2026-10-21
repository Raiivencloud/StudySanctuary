# Credenciales a revocar o rotar (acción manual del propietario)

Estas acciones **no se pueden resolver con cambios de código**: el repositorio es público y el historial Git conserva los valores. Este documento **no contiene ningún valor**: solo indica dónde estaban y qué hacer.

> Recomendación: completar los puntos 1 a 3 **antes** de publicar esta rama, y evaluar hacer privado el repositorio.

| # | Credencial | Dónde quedó expuesta | Severidad | Acción |
|---|---|---|---|---|
| 1 | **Clave de API de Google Gemini** (prefijo `AIzaSyAR…`) | `src/services/geminiService.ts` en `main` (commits `d1eace3`, `ce11cc2` y `5506591`; el último la quitó de una sola línea) y en el bundle JavaScript de cualquier despliegue hecho con ese código | **Crítica** | Google Cloud Console > APIs y servicios > Credenciales: **eliminar** la clave (no basta con restringirla). Crear una nueva y guardarla solo como secreto de servidor. Revisar facturación y métricas de uso de la API de Gemini desde abril de 2026. Configurar alertas de presupuesto. |
| 2 | **Clave web de Firebase** (prefijo `AIzaSyCs…`), más `projectId`, `appId`, bucket y base de datos | `firebase-applet-config.json` en el historial (antes del commit `807d9b8`) | Media (es pública por diseño, pero ahora la conoce cualquiera) | No requiere rotación obligatoria. **Restringirla** en Google Cloud Console a los dominios propios (referrers HTTP) y a las APIs de Firebase necesarias. Activar **Firebase App Check**. La protección real son las reglas de Firestore y Storage (fase 3). |
| 3 | **Secreto de sesión de Express** | Escrito en `server.ts` en `main` | Alta | Ya no está en el código: ahora es `SESSION_SECRET`. Generar uno nuevo (`openssl rand -hex 32`) y definirlo en Cloud Run (Secret Manager). Las sesiones existentes se invalidan, así que los usuarios deberán reconectar Google Calendar y Drive. |
| 4 | `ADMIN_SECRET_KEY` | No se encontró en el repositorio | Preventiva | Rotarla al transferir el proyecto. Confirmar que está **definida** en producción: sin ella, `/api/admin/toggle-ai` queda abierto (C-05, fase 2). |
| 5 | `MERCADOPAGO_ACCESS_TOKEN` | No se encontró en el repositorio | Preventiva | Rotarlo al transferir el proyecto (panel de desarrolladores de Mercado Pago). |
| 6 | `GOOGLE_CLIENT_SECRET`, `OUTLOOK_CLIENT_SECRET` | No se encontraron en el repositorio | Preventiva | Rotarlos al transferir el proyecto. |

## Historial Git

Las claves 1 y 2 siguen en el historial público. Reescribirlo (`git filter-repo` o BFG, seguido de un *force push*) **no se hizo** porque requiere tu autorización explícita, y **no reemplaza la revocación**: cualquier clon o caché previo conserva los valores. El orden correcto es: 1) revocar, 2) opcionalmente reescribir el historial, 3) pedir a GitHub que purgue las cachés si corresponde.

## Cómo verificar que no vuelvan a filtrarse

```bash
npm run scan:source               # archivos versionados
npm run build && npm run scan:bundle  # bundle del navegador
npm run test:build                # compila con valores centinela y exige que no aparezcan en el bundle
```
