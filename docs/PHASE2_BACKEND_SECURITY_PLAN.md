# Fase 2: Plan técnico de seguridad del backend

Rama: `backend-security-hardening`, creada desde `security-and-build-hardening` porque depende de `server/config.ts`, que agregó la Fase 1.

**Criterio:** se implementa en esta rama solo lo que **no cambia el comportamiento de un usuario legítimo**, o lo que lo cambia únicamente a través de configuración de despliegue documentada. Lo que modifica flujos visibles queda en la sección **"Pendiente de aprobación"**, con sus regresiones explicadas.

**Fuera de alcance:**
- Pagos: webhook y `create-preference`, salvo la sanitización de logs (Fase 5).
- Reglas de Firestore (Fase 3).
- IA: el proxy sigue desactivado (Fase 4).
- No se tocan datos de producción.

---

## 1. Endpoints administrativos

| Endpoint | Hoy | Cambio | Estado |
|---|---|---|---|
| `GET /api/admin/stats` | Encabezado `x-user-email` falsificable | `requireAdmin`: Firebase ID Token verificado con `verifyIdToken` y admin por *custom claim* `admin: true` **o** email verificado (`email_verified`) incluido en `ADMIN_EMAILS` | Implementado |
| `POST /api/admin/verify-key` | Sin límite de intentos, comparación `===` | `requireAdmin`, rate limit de 5 intentos cada 15 min por usuario, `crypto.timingSafeEqual` | Implementado |
| `POST /api/admin/toggle-ai` | Abierto si falta `ADMIN_SECRET_KEY` | `requireAdmin` + clave obligatoria (falla cerrado si falta) + validación de `suspend` | Implementado |
| `GET /api/admin/list-buckets` | Sin autenticación | **Eliminado** (ningún componente lo usa) | Implementado |
| `GET /api/admin/fix-cors` | Sin autenticación; pone el CORS del bucket en `*` | **Eliminado** (ningún componente lo usa; existe `fix-cors-script.ts` para operación manual) | Implementado |
| CORS del bucket al arrancar | Se reescribe a `*` en cada arranque | Solo si `STORAGE_CORS_ON_STARTUP=true` | Implementado |

Cliente: `AdminDashboard.tsx` y `SecurityAdmin.tsx` envían `Authorization: Bearer <idToken>`. Se elimina el email escrito en `SecurityAdmin.tsx`.

**Regresiones y configuración:**
- Hay que definir `ADMIN_EMAILS` (separados por coma) o asignar el claim `admin` a la cuenta de administración. Sin eso, el panel responde 403 (falla cerrado). `npm run verify:config` lo advierte.
- `/astra-core-admin` ahora exige, además de la clave, haber iniciado sesión con una cuenta admin. Antes alcanzaba con conocer la clave.
- La visibilidad del menú de admin en el cliente (`App.tsx`, `Sidebar.tsx`) sigue usando el email escrito en el código. La parametrización queda para la Fase 7, pero el servidor ya no depende de eso.

## 2. Subida de archivos (`/api/storage/upload`)

| Riesgo | Cambio | Estado |
|---|---|---|
| Sin autenticación | `requireUser` (ID Token) | Implementado |
| Ruta arbitraria (escribir en la carpeta de otro usuario) | La ruta debe empezar con `users/<uid del token>/`; se rechazan `..`, `//`, `\`, caracteres de control y longitudes mayores a 1024 → 403 | Implementado |
| Sin límite de tamaño (memoria de 512 MiB) | `multer` con `fileSize = UPLOAD_MAX_BYTES` (25 MB por defecto), 1 archivo, campos acotados → 413 | Implementado |
| Signed URL con vencimiento en el año 2491, o `makePublic()` | URL de descarga de Firebase con token aleatorio (`firebaseStorageDownloadTokens`), el mismo formato que genera `getDownloadURL()` del SDK. No requiere permisos IAM de firma y **nunca** hace público el objeto | Implementado |
| Errores con la lista de buckets | Mensaje genérico | Implementado |

Cliente: `CourseContext.uploadViaProxy` envía `Authorization: Bearer <idToken>`. Las rutas que ya usa la app (`users/${uid}/courses/...` y `users/${uid}/files/...`) cumplen el prefijo.

**Regresiones:**
- Las **subidas nuevas** devuelven URLs `firebasestorage.googleapis.com/...&token=` en lugar de `storage.googleapis.com/...`. Las URLs ya guardadas en Firestore **no se modifican** y siguen funcionando. Efecto secundario positivo: `ref(storage, url)` (para borrar o leer) acepta el formato nuevo y no aceptaba las signed URLs.
- Los archivos de más de 25 MB se rechazan en el proxy. El cliente ya pasa automáticamente a la subida directa con el SDK, que está sujeta a `storage.rules`, así que el comportamiento visible se mantiene. El límite en `storage.rules` corresponde a la Fase 3.
- Los objetos que hoy son públicos por `makePublic()` **siguen siéndolo**: no se modifican datos. Revertirlos queda pendiente (ver más abajo).
- `/api/drive/upload` también aplica el límite de `UPLOAD_MAX_BYTES`.

## 3. Sesiones

| Problema | Cambio | Estado |
|---|---|---|
| Secreto escrito en el código | `SESSION_SECRET` | Resuelto en la Fase 1 |
| Cookie `secure` sin `trust proxy`: en Cloud Run la cookie probablemente no se emitía | `app.set('trust proxy', TRUST_PROXY)` (1 en producción, configurable) | Implementado |
| `saveUninitialized: true` (una sesión por cada visitante en memoria) | `false`: solo se guarda cuando hay datos (tokens OAuth o `state`) | Implementado |
| En desarrollo (`http://localhost`) la cookie `secure` no se emitía | `secure` y `SameSite=None` solo en producción; en desarrollo, `lax` sin `secure` | Implementado |
| El logout no cerraba la sesión del servidor (otra persona en el mismo navegador veía el Drive anterior) | `POST /api/auth/logout` destruye la sesión; `AuthContext.logout` lo invoca | Implementado |
| Cookie sin vencimiento y MemoryStore sin limpieza | `maxAge` configurable (`SESSION_MAX_AGE_HOURS`, 24 h por defecto) | Implementado |
| MemoryStore (se pierde en cada reinicio; no escala a más de una instancia) | Store persistente | **Pendiente de aprobación** (2-B) |
| `SameSite=None` (necesario solo para un iframe *cross-site*, como AI Studio) | Se mantiene `none` por defecto en producción; configurable con `SESSION_COOKIE_SAMESITE`. Contra CSRF se agrega verificación de `Origin` | Implementado (verificación de `Origin`); cambio a `lax` pendiente |

**Regresiones:**
- Con `trust proxy`, las sesiones **empiezan a funcionar** en Cloud Run. Es una mejora, pero significa que Calendar y Drive tendrán un comportamiento distinto del actual. Hay que probarlos.
- Con la cookie de 24 h, la conexión con Drive o Calendar se pierde al día siguiente o al reiniciar la instancia (antes se perdía al reiniciar). El usuario vuelve a conectar como hasta ahora.

## 4. OAuth de Google y Outlook

| Problema | Cambio | Estado |
|---|---|---|
| Sin `state` (CSRF de login) | `state` aleatorio de 32 bytes guardado en la sesión, comparado en tiempo constante y de un solo uso, con vencimiento a los 10 minutos; si no coincide → 400 sin intercambiar el código | Implementado |
| `postMessage(..., '*')` | `postMessage(..., window.location.origin)` | Implementado |
| Los listeners aceptaban **cualquier** origen `*.run.app` y **rechazaban** el dominio propio | `event.origin === window.location.origin` en `CalendarView` y `DrivePickerModal` | Implementado |
| `/api/auth/google/sync` acepta cualquier token y el access token vive en `localStorage` | Vincular la sesión al uid de Firebase y eliminar el token de `localStorage` | **Pendiente de aprobación** (2-C) |

**Regresiones:**
- Si el navegador bloquea la cookie de sesión (por ejemplo, Safari dentro de un iframe de terceros), el callback responde 400. Antes "funcionaba", pero los tokens se guardaban en una sesión que no volvía al usuario, así que la sincronización tampoco andaba.
- El cambio de origen **corrige** la actualización automática tras conectar el calendario en el dominio propio (`studysanctuary.net`), que hoy se ignoraba. En `*.run.app` sigue funcionando porque la ventana emergente y la app comparten origen.

## 5. Rate limiting y límites

Implementación propia en memoria (`server/security/rateLimit.ts`, sin dependencias nuevas). Es válida mientras Cloud Run use `maxScale: 1`; con varias instancias, hay que pasarla a Redis o Firestore.

| Alcance | Límite por defecto | Clave |
|---|---|---|
| Todo `/api/*` excepto el webhook de Mercado Pago | `RATE_LIMIT_API_PER_MINUTE` = 300 por minuto | IP (con `trust proxy`) |
| `verify-key` | 5 cada 15 min | uid |
| Subidas (`storage` y `drive`) | 60 cada 10 min | uid o sesión |
| `create-preference` | 10 por minuto | IP |
| URL y callback de OAuth | 30 por minuto | IP |

Respuesta: `429 {"error":"RATE_LIMITED"}` con `Retry-After`.

**Regresión:** varias personas detrás de una misma IP (redes universitarias) comparten el límite general. Por eso es amplio y configurable.

Cuerpos de petición: `express.json` con el límite explícito de 100 kB (el mismo que ya tenía por defecto). `multer` con límites de tamaño, cantidad de archivos y campos.

## 6. Errores, logs y encabezados

- **Manejador de errores JSON para `/api`:** errores de `multer` → 413/400; JSON inválido → 400; cualquier otro → 500 genérico. Nunca devuelve stack, mensajes internos ni nombres de buckets.
- **Respuestas genéricas** en las rutas de admin, upload, `create-preference` (conserva el prefijo "Error de Mercado Pago") y Drive. El detalle queda solo en el log del servidor.
- **`logError()`** registra solo `message`, `code` y `status`. Antes se registraban objetos de error completos de axios o del SDK de Mercado Pago, que pueden incluir encabezados `Authorization`.
- **Encabezados:** `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS en producción (sin `includeSubDomains`) y sin `X-Powered-By`. **CSP y `X-Frame-Options` quedan pendientes** (2-D) porque pueden bloquear GTM, Firebase, Mercado Pago o el iframe de AI Studio.
- **Cliente:** `handleFirestoreError` deja de incluir email, nombre y foto en el mensaje y en la consola.

## 7. Verificación de origen (CSRF) en endpoints que usan la cookie de sesión

`POST /api/auth/google/sync`, `POST /api/drive/upload` y `POST /api/auth/logout` rechazan peticiones con un encabezado `Origin` distinto del propio (`APP_URL` o el host de la petición). Los endpoints con `Authorization: Bearer` no lo necesitan.

---

## Pendiente de aprobación (cambia comportamiento visible o requiere decisiones)

| ID | Cambio | Regresión posible |
|---|---|---|
| 2-A | Asignar el *custom claim* `admin` con un script de operación (`setCustomUserClaims`) | Modifica datos de Firebase Auth en producción: debe ejecutarlo el propietario |
| 2-B | Store de sesión persistente (Firestore o Redis/Memorystore) | Escrituras en Firestore (costo) o un servicio pago (Memorystore). Alternativa: guardar los tokens OAuth cifrados por uid y eliminar las sesiones |
| 2-C | Vincular Drive/Calendar al uid (las rutas de Drive exigen ID Token) y eliminar `google_drive_token` de `localStorage` | Cambia `DrivePickerModal`, `CalendarView` y `AuthContext`; requiere reconectar Drive |
| 2-D | CSP y `frame-ancestors` | Puede bloquear GTM, Firebase Auth (iframes), Mercado Pago o el modo iframe; requiere probar en staging |
| 2-E | `SESSION_COOKIE_SAMESITE=lax` por defecto | Rompe el uso dentro de un iframe *cross-site* (AI Studio) |
| 2-F | Revocar el acceso público de los objetos creados con `makePublic()` | Modifica objetos de producción; las URLs públicas guardadas dejarían de funcionar si no se migran |
| 2-G | Eliminar los scripts de diagnóstico de la raíz (`dump-env.ts` imprime **todas** las variables, incluidos los secretos) | Ninguna para el producto; son herramientas de desarrollo |
| 2-H | `create-preference` con ID Token y `userId` tomado del token | Cambia el flujo de pago → Fase 5 |
