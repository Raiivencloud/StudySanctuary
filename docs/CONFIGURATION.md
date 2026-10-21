# Configuración

Toda la configuración se toma de **variables de entorno**. El archivo `firebase-applet-config.json` ya no es necesario: está en `.gitignore` y no debe volver a commitearse.

Plantilla: [`.env.example`](../.env.example). Copiala a `.env` (nunca se commitea) y completala.

## Públicas y privadas

| Tipo | Prefijo | Dónde terminan | Qué puede ir |
|---|---|---|---|
| **Públicas** | `VITE_` | En el bundle JavaScript que descarga cualquier visitante. Se fijan **al compilar**. | Solo valores públicos por diseño: configuración web de Firebase. |
| **Privadas** | sin `VITE_` | Solo en el proceso de `server.ts`. | Secretos: `SESSION_SECRET`, `GEMINI_API_KEY`, `MERCADOPAGO_ACCESS_TOKEN`, `ADMIN_SECRET_KEY`, OAuth client secrets. |

`vite.config.ts` solo expone variables `VITE_*`. Ya no tiene `define`, que antes copiaba `GEMINI_API_KEY` del servidor al bundle.

## Cliente (obligatorias para que la app arranque)

| Variable | Origen en la consola de Firebase |
|---|---|
| `VITE_FIREBASE_API_KEY` | Configuración del proyecto > Tus apps > `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_APP_ID` | `appId` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` (opcional) |
| `VITE_FIREBASE_MEASUREMENT_ID` | `measurementId` (opcional) |
| `VITE_FIREBASE_FIRESTORE_DATABASE_ID` | ID de la base de Firestore. Vacío = `(default)` |

Si falta alguna obligatoria, el build **compila igual**, para que CI pueda verificar sin credenciales. Al abrirla, la app muestra la pantalla "Configuración incompleta" con la lista de variables faltantes, en lugar de quedar en blanco.

> **Importante para el despliegue actual:** el `firebase-applet-config.json` original (de AI Studio) usaba una **base de Firestore con nombre**, no `(default)`. Si no se define `VITE_FIREBASE_FIRESTORE_DATABASE_ID` con ese mismo valor, la app leerá la base `(default)` y parecerá vacía.

### Migrar desde `firebase-applet-config.json`

Si todavía tenés el archivo localmente (fuera del repositorio):

```bash
npx tsx scripts/legacy-config-to-env.ts /ruta/a/firebase-applet-config.json >> .env
```

## Servidor

| Variable | Obligatoria | Descripción |
|---|---|---|
| `NODE_ENV` | — | `production` en Cloud Run. Activa las validaciones estrictas. |
| `FIREBASE_PROJECT_ID` | Sí* | *Si falta, se usa `GOOGLE_CLOUD_PROJECT` o `VITE_FIREBASE_PROJECT_ID`. |
| `FIREBASE_STORAGE_BUCKET` | No | Si falta, se usa `VITE_FIREBASE_STORAGE_BUCKET`. |
| `FIREBASE_DATABASE_ID` | No | Base de Firestore del Admin SDK. Vacío = `(default)`. Ver el aviso de abajo. |
| `SESSION_SECRET` | **En producción** | Mínimo 32 caracteres (`openssl rand -hex 32`). En desarrollo, si falta, se genera uno aleatorio por proceso. |
| `APP_URL` | Para OAuth y pagos | URL pública sin `/` final. |
| `ADMIN_EMAILS` | Para el panel de admin | Emails **verificados**, separados por coma, con acceso a `/api/admin/*`. Alternativa: *custom claim* `admin: true`. Vacío = nadie es admin. |
| `ADMIN_SECRET_KEY` | Para `/astra-core-admin` | Se pide **además** de iniciar sesión como admin. Si falta, `toggle-ai` se rechaza (falla cerrado). |
| `SESSION_COOKIE_SAMESITE` | No | `none` (por defecto en producción, solo necesario dentro de un iframe *cross-site*), `lax` (recomendado) o `strict`. En desarrollo siempre `lax`. |
| `SESSION_MAX_AGE_HOURS` | No | Duración de la cookie de sesión (24 por defecto). |
| `TRUST_PROXY` | No | Saltos de proxy de confianza. Por defecto 1 en producción (Cloud Run) y 0 en desarrollo. |
| `UPLOAD_MAX_BYTES` | No | Tamaño máximo por archivo en `/api/storage/upload` y `/api/drive/upload` (25 MB por defecto). |
| `RATE_LIMIT_API_PER_MINUTE` | No | Límite general por IP para `/api/*` (300 por defecto; el webhook de Mercado Pago queda excluido). |
| `STORAGE_CORS_ON_STARTUP` | No | `true` reescribe el CORS del bucket a `*` en cada arranque (comportamiento anterior). Desactivado por defecto. |
| `AI_PROXY_ENABLED` | No | `true` activa `/api/ai/generate`. **Desactivado por defecto.** |
| `GEMINI_API_KEY` | Si `AI_PROXY_ENABLED=true` | Clave de Gemini **del servidor**. |
| `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY` | Para pagos | — |
| `GOOGLE_CLIENT_ID/SECRET`, `OUTLOOK_CLIENT_ID/SECRET` | Para Calendar y Drive | — |

Credenciales de Firebase Admin: *Application Default Credentials* (la cuenta de servicio de Cloud Run o `gcloud auth application-default login` en local).

Si la configuración es inválida, el servidor termina con código 1 y un mensaje que lista **todos** los problemas, antes de inicializar Firebase.

> **Aviso: el servidor y el cliente usaban bases de Firestore distintas.** Antes de este cambio, el servidor (`admin.firestore()`) usaba siempre `(default)`, mientras el cliente usaba la base con nombre del config. Por lo tanto, el **webhook de Mercado Pago escribía las suscripciones en una base que la app no lee**. Para no cambiar el comportamiento de pagos sin aprobación, `FIREBASE_DATABASE_ID` queda vacío por defecto (igual que antes). Corregirlo requiere decidir y verificar en qué base están hoy los datos (pendiente, fase de pagos). `npm run verify:config` avisa si las dos bases no coinciden.

## Comandos de verificación

```bash
npm run verify:config               # valida cliente y servidor sin imprimir valores
npm run verify:config -- --production
npm run build && npm run scan:bundle  # el bundle no contiene secretos
npm run scan:source                 # los archivos versionados no contienen secretos
```

`scan:bundle` permite el valor de `VITE_FIREBASE_API_KEY` (público por diseño) y falla ante cualquier otra clave de Google, un token de Mercado Pago, una clave privada o el valor de cualquier variable privada presente en el entorno.

## Clave de Gemini en el navegador (temporal)

`VITE_GEMINI_API_KEY` sigue funcionando para no romper las funciones de IA, pero **queda pública en el bundle**. El build lo advierte y `scan:bundle` falla a propósito. La solución es la migración propuesta en [`PROPOSAL_AI_BACKEND.md`](./PROPOSAL_AI_BACKEND.md), pendiente de aprobación.
