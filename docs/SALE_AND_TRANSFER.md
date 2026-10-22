# StudySanctuary: venta, instalación y transferencia

Guía para quien compra StudySanctuary y para el traspaso desde el propietario actual. La lista de comprobación final está en [`FINAL_CHECKLIST.md`](./FINAL_CHECKLIST.md).

## 1. Qué incluye

| Incluido | Detalle |
|---|---|
| Código fuente | App React 19 + Vite 6 (`src/`) y servidor Express (`server.ts`, `server/`) para Cloud Run |
| Seguridad | Reglas de Firestore y Storage con pruebas en el emulador (`firestore.rules`, `storage.rules`, `tests/rules/`) |
| IA | Proxy de Gemini en el servidor, créditos transaccionales, límites y reintentos (`server/ai/`, `server/credits/`) |
| Pagos | Mercado Pago Checkout Pro con webhook firmado e idempotente (`server/payments/`) |
| Pruebas | 146 unitarias, 82 en el emulador y un build verificado sin secretos (`npm run verify`, `npm run test:rules`) |
| Demo | `npm run demo`: todo simulado, sin credenciales ni costos ([`DEMO.md`](./DEMO.md)) |
| Operación | Scripts de solo lectura y de claims (`scripts/ops/`), y guías de despliegue (`docs/`) |

| No incluido (acordar en el contrato) | Por qué |
|---|---|
| Cuentas de terceros (Google Cloud o Firebase, Mercado Pago, Google Tag Manager, Discord, dominio) | Son del propietario. Se **transfieren** (Google Cloud, dominio) o se **reemplazan** (Mercado Pago es personal o de la empresa) |
| Datos de usuarios | Su transferencia depende de la ley de datos personales (en Argentina, Ley 25.326) y de la política de privacidad aceptada por los usuarios. **Requiere asesoramiento legal.** |
| Textos legales aprobados | Hay **borradores** de privacidad y términos, que la app muestra como preliminares. Deben revisarlos y completarlos un abogado (sección 7). |

## 2. Arquitectura

```
Navegador (React, Firebase Web SDK)
  ├── Firebase Auth (Google / Apple)
  ├── Firestore (datos del usuario; reglas = autorización)
  ├── Firebase Storage (archivos de cursos)
  └── Servidor Express en Cloud Run (mismo dominio)
        ├── /api/ai/generate     → Gemini (clave del servidor), cobra créditos en Firestore
        ├── /api/credits         → saldo, prueba gratis, gasto de Arena
        ├── /api/create-preference, /api/mercadopago-webhook, /api/payments/sync → Mercado Pago
        ├── /api/drive, /api/calendar, /auth/* → Google Drive y Calendar, Outlook
        └── /api/admin/*         → panel de administración (claim `admin`)
```

La IA y el saldo los controla **solo el servidor**. El cliente no tiene claves privadas: el build lo verifica (`tests/bundle`).

## 3. Servicios externos, licencias y costos

> Precios de referencia consultados el **21/10/2026** en las páginas públicas y en agregadores. **Cambian seguido: verificalos antes de presupuestar.**

| Servicio | Uso | ¿Obligatorio? | Modelo de costo | Cuenta |
|---|---|---|---|---|
| **Google Cloud / Firebase** (Auth, Firestore, Storage, Cloud Run) | Todo el backend | Sí | Nivel gratuito y después pago por uso (ver abajo) | Transferir el proyecto o crear uno nuevo |
| **Gemini API** | Toda la IA | Sí, para la IA | Por tokens. Es **el costo principal** | Clave del servidor en Secret Manager |
| **Mercado Pago** | Cobro de planes | Para vender planes | Comisión por cobro (según medio y plazo de acreditación) | **Cuenta propia del comprador** |
| Google OAuth (Drive y Calendar) | Integraciones opcionales | No | Gratis. Permiso mínimo `drive.file`: sin evaluación CASA (sección 3.3) | Cliente OAuth propio |
| Microsoft Entra (Outlook Calendar) | Integración opcional | No | Gratis | App propia |
| Google Tag Manager | Analítica | No | Gratis | Contenedor propio (`VITE_GTM_ID`) o `off` |
| Discord | Enlace de comunidad | No | Gratis | `VITE_COMMUNITY_URL` |
| Unsplash, Picsum, DiceBear, Transparent Textures, Esri (mapas), SoundHelix (música) | Imágenes, avatares, mapas y música, **cargados desde sus sitios** | No | Gratis con condiciones de uso | Revisar licencias y conviene **alojarlos en el propio servidor** (sección 6) |

### 3.1 Infraestructura (nivel gratuito, Tier 1)
- **Cloud Run** (CPU solo durante las solicitudes): 180.000 vCPU-segundos, 360.000 GiB-segundos y 2 millones de solicitudes gratis por mes. Después, unos US$ 0,000024 por vCPU-segundo y US$ 0,40 por millón de solicitudes. `cloud-run.yaml` limita a **1 instancia**, de 1 vCPU y 512 MiB, que baja a cero sin tráfico.
- **Firestore:** 50.000 lecturas, 20.000 escrituras y 20.000 borrados por día, más 1 GiB, **en una sola base por proyecto**. Después, unos US$ 0,03 por cada 100.000 lecturas y US$ 0,09 por cada 100.000 escrituras (us-central1). Hay fuentes que indican que las bases **con nombre** no tienen nivel gratuito: verificarlo, porque la app usa una base con nombre (`FIRESTORE_DATABASES.md`).
- **Estimación:** con menos de unos cientos de usuarios activos, la infraestructura suele quedar en **US$ 0–10 por mes**. La IA es lo que escala.

### 3.2 IA: costo por acción (estimado)

Con **Gemini 2.5 Flash** como referencia (unos US$ 0,30 por millón de tokens de entrada y US$ 2,50 por millón de salida). La app usa Gemini 3 Flash con modelos de respaldo, que tienen otros precios: hay que revisarlos.

| Acción (1 crédito) | Supuesto | Costo aproximado |
|---|---|---|
| Resumen, tutor, ejercicios, matemática, libros, mapa | Unos 1.500 tokens de entrada y 1.000 de salida | **US$ 0,003** |
| La misma acción con un PDF de unas 10 páginas | Más unos 2.500 tokens de entrada | US$ 0,004 |
| **Podcast** (guion + audio de unos 3 minutos) | El precio de la voz (TTS) **no se pudo verificar**; las fuentes dan entre US$ 10 y 20 por millón de tokens de audio | **US$ 0,05–0,10** |
| Herramientas del curso (sin crédito) | Hasta 60 llamadas por día y por usuario (`AI_INCLUDED_DAILY_QUOTA`) | Hasta unos **US$ 0,18 por día** por usuario muy activo |

**Riesgos de precio para revisar (sin cambios hechos):**
- Un podcast cuesta 1 crédito, igual que un resumen, pero cuesta **entre 15 y 30 veces más**.
- La cuota gratuita de herramientas del curso (60 por día) puede costar más que la recarga gratuita diaria de 5 créditos.

Controles disponibles:
- `AI_INCLUDED_DAILY_QUOTA`;
- el interruptor de IA para usuarios gratuitos (`stats/global.isAiSuspendedForFree`);
- los límites por usuario.

Configurar además **alertas de presupuesto** en Google Cloud.

### 3.3 Google Drive: permiso mínimo
Desde la Fase 7, la app pide solo `drive.file`, un permiso no sensible: ve **únicamente los archivos que el usuario sube o abre desde StudySanctuary**.
- **No necesita la evaluación de seguridad CASA** de Google. Esa evaluación sí haría falta con `drive.readonly`, un permiso restringido que se eliminó: el evaluador cobra entre US$ 500 y 4.500 por año, según Google.
- Calendar (`calendar.readonly`) es un permiso sensible: requiere la verificación de Google, pero no CASA.
- Si el comprador quisiera abrir archivos que ya existen en el Drive del usuario, la vía compatible con `drive.file` es **Google Picker** (no implementado).

### 3.4 Mercado Pago
Las comisiones dependen del medio de pago y del plazo de acreditación. No se pudo confirmar la tabla oficial vigente de Checkout Pro para Argentina; las fuentes de terceros mencionan alrededor de **6,29% + IVA** con tarjeta de crédito y acreditación inmediata. Verificarlo en la cuenta del comprador.

## 4. Instalación desde cero (cuenta nueva)

1. **Requisitos:** Node 22+, Java 21 (solo para emuladores y pruebas), `gcloud` y `firebase-tools` (incluido como dependencia de desarrollo).
2. **Código:** `npm ci`, y después `npm run verify` y `npm run test:rules`. Todo debe pasar antes de tocar nada.
3. **Proyecto de Google Cloud con Firebase:**
   - Crear el proyecto y activar **Authentication** (proveedores Google y, si se usa, Apple), **Firestore** (una base; anotar su ID si no es `(default)`) y **Storage**.
   - Agregar el dominio en *Authentication → Authorized domains*.
   - Crear una **app web** y copiar su configuración a las variables `VITE_FIREBASE_*`.
4. **Reglas:** publicar `firestore.rules` y `storage.rules` **en la base correcta** siguiendo [`FIRESTORE_RULES_DEPLOYMENT.md`](./FIRESTORE_RULES_DEPLOYMENT.md), con las reglas **finales** (`return false; // CLIENT_CREDIT_TRANSITIONS`), porque es una instalación nueva con IA en el servidor.
5. **Secretos** (Secret Manager → variables de Cloud Run):
   - `SESSION_SECRET` (`openssl rand -hex 32`);
   - `GEMINI_API_KEY` (clave **restringida** a la API de Gemini, con alertas de presupuesto);
   - `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET`;
   - `GOOGLE_CLIENT_SECRET` y `OUTLOOK_CLIENT_SECRET` si se usan;
   - `ADMIN_SECRET_KEY`.
6. **Variables:** `APP_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_ID` (la **misma** base que `VITE_FIREBASE_FIRESTORE_DATABASE_ID`), `AI_PROXY_ENABLED=true`, `ADMIN_EMAILS`, `GOOGLE_CLIENT_ID`, `OUTLOOK_CLIENT_ID`, `VITE_GTM_ID` y `VITE_COMMUNITY_URL`. Ver [`CONFIGURATION.md`](./CONFIGURATION.md) y `.env.example`, y verificar con `npm run verify:config -- --production`.
7. **Despliegue:** `gcloud run deploy study-sanctuary --source . --region <región>` (buildpacks con Node 22; usa `npm run build` y `npm start`), o con una imagen y `cloud-run.yaml`. Mantener **1 instancia** máxima mientras las sesiones y los tokens de integración estén en memoria (`SESSIONS_LOW_COST.md`).
8. **Administrador:** `npx tsx scripts/ops/admin-claims.ts --project <id> --grant <email>` (guía en `docs/ops/README.md`).
9. **Mercado Pago:**
   - Crear la aplicación en el panel de desarrolladores.
   - En *Webhooks*, configurar `https://<dominio>/api/mercadopago-webhook` con el evento **Pagos** y copiar la clave secreta.
   - Probar primero en el **sandbox**, con credenciales de prueba y `MERCADOPAGO_ALLOW_TEST_PAYMENTS=true` **solo en ese entorno** (`PHASE5_PAYMENTS.md`, sección 6).
10. **OAuth (opcional):** crear el cliente OAuth de Google con la URI de redirección `https://<dominio>/auth/google/callback`, y la app de Microsoft con `https://<dominio>/auth/outlook/callback`.
11. **Prueba de humo:** iniciar sesión, hacer una acción de IA (−1 crédito), hacer un pago de prueba en el sandbox y revisar los logs `[AI]` y `[Payments]`.

## 5. Transferencia desde el propietario actual

**Opción A: transferir el proyecto de Google Cloud** (conserva usuarios, datos y dominio de Auth)
1. Contrato firmado, que defina datos personales, IP y soporte.
2. Agregar al comprador como **propietario** del proyecto de Google Cloud y de Firebase, y migrar la **cuenta de facturación** a la suya.
3. **Rotar todos los secretos** ([`SECURITY_CREDENTIALS.md`](./SECURITY_CREDENTIALS.md)): `SESSION_SECRET`, `ADMIN_SECRET_KEY`, la clave de Gemini y los clientes OAuth.
4. **Mercado Pago:** el comprador configura **su** cuenta (token y webhook). Los pagos anteriores quedan en la cuenta del vendedor; acordar cómo se tratan los reembolsos de planes vendidos antes del traspaso.
5. Asignar el claim `admin` al comprador y **quitarlo** al vendedor. Reemplazar el email del propietario en `firestore.rules` (respaldo de administrador) y en `src/config/admin.ts` (sección 6).
6. Transferir el **dominio** y la verificación de Search Console (`googledf62f517e836fc32.html` es del propietario actual).
7. Quitar los accesos del vendedor (IAM, Firebase y GitHub).

**Opción B: proyecto nuevo** (sin datos de usuarios)
- Seguir la sección 4. Los usuarios actuales **no** se migran, salvo un acuerdo legal específico; en ese caso:
  - exportar con `gcloud firestore export`;
  - exportar Auth con `firebase auth:export`;
  - importar en el proyecto nuevo.

**Repositorio:** transferir el repositorio de GitHub o entregar una copia. Las ramas de trabajo (`security-and-build-hardening`... `phase6-commercial-readiness`) **todavía no están fusionadas en `main`**: el orden de fusión y despliegue está en `PHASE4_REPORT.md` y `PHASE5_PAYMENTS.md`.

## 6. Elementos que hay que reemplazar al vender

| Elemento | Dónde | Acción |
|---|---|---|
| Email del propietario (respaldo de administrador e insignia "Fundador") | `src/config/admin.ts`, `firestore.rules` (función `isAdmin`) | Reemplazar o vaciar, y usar el claim `admin` |
| Email de soporte `soportestudysanctuary@outlook.com` | `src/components/HelpCenterView.tsx` | Email del comprador |
| Google Tag Manager `GTM-TSHX7NTR` | `src/config/brand.ts` (predeterminado) | `VITE_GTM_ID` propio u `off` |
| Discord `discord.gg/Y5yFKEYD9r` | `src/config/brand.ts` | `VITE_COMMUNITY_URL` |
| Verificación de Search Console | `googledf62f517e836fc32.html` | Borrar y generar la propia |
| Marca: nombre, logo, colores, `manifest.json`, `metadata.json` (de AI Studio) | `public/`, `index.html`, `metadata.json` | Según la marca del comprador |
| Presentación de funcionalidades de la landing (reemplazó a testimonios inventados en la Fase 7) | `src/components/LandingView.tsx` (`testimonials`) | Opcional: sumar **reseñas reales** moderadas (`FeaturedFeedback` ya existe) |
| Textos legales (borradores) | `src/legal/privacy.md`, `src/legal/terms.md` y las variables `VITE_LEGAL_*` | **Revisión profesional** y `VITE_LEGAL_TEXTS_APPROVED=true` (sección 7) |
| Capturas de la landing | `public/assets/screens/*.jpg` (capturas reales de la demo) | Actualizarlas si cambia la marca |
| Recursos externos (imágenes de Unsplash y Picsum, música de SoundHelix, texturas) | `App`, `LandingView`, `ArenaView`, `BooksView`, `MultimediaGenerator`, `SettingsView`, `AuthContext`, `MusicContext`, `arenaService`, `constants/arenaCards` | Verificar licencias y **alojarlos** en el propio dominio |
| Cuentas y credenciales de servicios | Variables y secretos | Ver la sección 4 |

## 7. Aspectos legales que el comprador debe resolver (no técnicos)

- **Política de privacidad y términos:** hay **borradores** escritos según el funcionamiento real ([`legal/README.md`](./legal/README.md)), con los puntos que debe definir un abogado marcados como pendientes: responsable, reembolsos y arrepentimiento, menores, conservación, jurisdicción, analítica y cookies. La app los muestra con el aviso "versión preliminar" hasta su aprobación. Las afirmaciones falsas anteriores (cifrado "end-to-end", "erradicación total") se eliminaron.
- **Brechas que afectan a los textos** ([`legal/DATA_INVENTORY.md`](./legal/DATA_INVENTORY.md)): no hay borrado ni exportación de la cuenta desde la app, ni verificación de edad, ni banner de cookies.
- **Datos personales:** la base tiene emails, nombres, apuntes y archivos de estudiantes, posiblemente **menores** (nivel "Inicial" y "Secundario"). Consentimiento, derechos de acceso y borrado, y registro de la base según la normativa aplicable.
- **Contenido generado por IA** y uso de documentos de los usuarios: revisar las condiciones de Gemini API.
- **Origen del código:** el proyecto se inició con Google AI Studio (`metadata.json`, `firebase-blueprint.json`). Confirmar los derechos sobre el código según los términos aplicables.
- **Licencias de terceros:** `react-leaflet` usa **Hippocratic-2.1** (ver [`DEPENDENCIES.md`](./DEPENDENCIES.md)).
- **Pagos:** facturación fiscal de los planes vendidos (no implementada en la app).
