# Fase 4: IA en el servidor y créditos transaccionales

Rama local: `phase4-ai-backend`, creada sobre `firestore-security-3a`.

**Alcance:**
- Se trabajó solo en un entorno de desarrollo.
- No se usó Gemini real: se usaron un proveedor simulado y clientes falsos en las pruebas.
- No se tocó Firebase de producción ni se migraron o borraron datos.
- No se activaron las reglas finales en producción ni se publicó ni desplegó nada.

## 1. Qué cambió

**Antes:** el navegador llamaba a Gemini con una clave pública y descontaba los créditos después, desde el cliente.

**Ahora:** el navegador solo habla con `POST /api/ai/generate`. El servidor procesa cada solicitud en este orden:

1. **Identidad:** Firebase ID Token. Sin token: 401, sin cobro y sin llamada al modelo.
2. **Límites por usuario:** 20 solicitudes por minuto y 3 simultáneas (configurables).
3. **Duplicados:** una solicitud idéntica en curso (doble clic) recibe 409.
4. **Interruptor de IA:** si está activo, los usuarios sin plan pago reciben `AI_SUSPENDED_FREE`. **Ahora sí funciona** (hallazgo A-04).
5. **Créditos:** se cobra **antes** de llamar al modelo, con una transacción de Firestore (`server/credits/creditService.ts`). Sin saldo: 402.
6. **Gemini:** reintentos con espera creciente y modelos de respaldo, con un presupuesto fijo de intentos y tiempo máximo. Antes esta lógica estaba en el navegador. Una respuesta vacía o un JSON ilegible cuenta como falla.
7. **Si la IA falla,** se devuelve el crédito de **toda la acción**.

`/api/credits` reemplaza la lógica de créditos del cliente:

| Endpoint | Función |
|---|---|
| `GET /api/credits` | Saldo, con recarga diaria y vencimiento de planes calculados en el servidor |
| `POST /api/credits/trial` | Prueba gratis, una vez por cuenta |
| `POST /api/credits/spend` | Gastar 1 crédito en saltar la espera de Arena |

Ningún endpoint activa planes pagos.

**Cliente:**
- Las vistas no cambian. Las funciones de `geminiService` conservan sus firmas y suman un parámetro opcional `billing`.
- Se eliminaron el SDK de Gemini, la clave del navegador y `consumeCredit`.
- El bundle bajó unos 272 KB y ya no contiene ningún endpoint de Google AI.

### Precios: sin cambios
Se cobra **1 crédito por acción del usuario**, como antes, aunque la acción haga varias llamadas al modelo. Las acciones se definen en `src/shared/aiFeatures.ts`.

| Herramienta | Llamadas | Créditos |
|---|---|---|
| Estudio IA (resumen, plan, flashcards, examen, ejercicios, diagrama) | 1 | 1 |
| Podcast (guion + audio) | 2 | 1, se devuelve si falla el audio (igual que antes: sin audio no se cobraba) |
| Asistente de voz (respuesta + voz) | 2 | 1 |
| Tutor, matemática, libros, mapa | 1 | 1 |
| Herramientas del curso (`CourseDetail`), preguntas de Arena | 1–8 | **0, como antes**, con cuota diaria de 60 llamadas |
| Saltar la espera de Arena | — | 1 (`/api/credits/spend`) |

## 2. Pruebas realizadas

| Suite | Resultado | Qué cubre |
|---|---|---|
| Unitarias (`npm test`) | **95/95** | Router de IA (identidad, 402, devolución, acciones de varias llamadas, cuotas, duplicados, concurrencia, rate limit, interruptor, validación, filtrado de opciones); generación (reintentos, respaldo, presupuesto de intentos, 429, JSON inválido, audio, tiempo límite); proveedor simulado; garantías estáticas (sin SDK de Gemini en `src`, sin escrituras de créditos en el cliente, cada vista que cobraba etiqueta su acción) |
| Build (`npm run test:build`) | **2/2** | Sin secretos en el bundle, **sin `@google/genai` ni `generativelanguage.googleapis.com`** |
| Emulador (`npm run test:rules`) | **64/64** | Reglas transicionales y finales; consultas de chats (nuevo); servicio de créditos (concurrencia, idempotencia, recarga, prueba gratis, plan, vencimiento, cuota); **router de IA sobre HTTP con créditos reales:** 12 acciones simultáneas con 3 créditos → 3 respondidas, 9 con 402, el modelo se llama 3 veces |
| **Navegador** (Chromium, `dev:emulators --final-rules`) | **18/18** | Ver detalle abajo |

**Recorrido en el navegador**, con las reglas **finales** activas, emuladores y la IA simulada:
- Un usuario nuevo ve los 5 créditos diarios que calcula el servidor.
- Resumen: −1 crédito.
- Error de IA: el crédito se devuelve y el usuario ve un aviso.
- Flashcards (JSON): −1 crédito.
- Tutor virtual: −1 crédito.
- Matemática (JSON con esquema): −1 crédito.
- Podcast (2 llamadas): −1 crédito.
- Sin saldo: la acción se bloquea con aviso.
- **Ninguna solicitud del navegador a Gemini.**
- Sin errores de JavaScript.
- Vista de IA en 375 px sin scroll horizontal.

No se probaron en el navegador el asistente de voz (necesita micrófono y reconocimiento de voz), libros, mapa, herramientas del curso ni saltar la espera de Arena. Están cubiertos por pruebas unitarias y estáticas.

### Problemas encontrados y corregidos
1. **Chats del tutor y del asistente de voz con las reglas 3A:** al crear un chat, la lista de sesiones lo seleccionaba mientras era una escritura local pendiente. La suscripción a los mensajes arrancaba antes de que el chat existiera en el servidor y las reglas la rechazaban: **la respuesta no aparecía en pantalla**. Corrección: solo se selecciona un chat ya guardado (`VirtualTutor.tsx` y `VoiceAssistant.tsx`). **Esta corrección también debe acompañar a las reglas 3A.**
2. **Usuario nuevo con "0 Créditos":** la primera consulta de saldo llegaba antes de que existiera el perfil. Ahora se reintenta brevemente.

## 3. Posibles regresiones y cambios de comportamiento

| Cambio | Impacto |
|---|---|
| Se cobra antes de generar y se devuelve si la IA falla | Si la IA responde bien pero la vista falla después (por ejemplo, un error al guardar), el crédito queda cobrado. El servidor valida el JSON con la misma tolerancia que el cliente, así que es poco probable. |
| Podcast con guion de menos de 10 caracteres (no genera audio) | Se cobra; antes no. Caso extremo. |
| Asistente de voz: si falla la voz, se devuelve el crédito | Antes se cobraba igual. Favorece al usuario. |
| El tutor envía su personalidad y el historial | Antes la capa intermedia los descartaba, así que las respuestas cambian (deberían mejorar). |
| Las solicitudes de voz ya no llevan la instrucción de sistema de apuntes | Más correcto para los modelos de voz |
| Cuota diaria de 60 llamadas en las herramientas gratuitas | "Generar todo" en un curso usa 6, así que rinde unas 10 veces por día. **Decisión de negocio:** ajustable con `AI_INCLUDED_DAILY_QUOTA`. |
| Límites de 20 solicitudes por minuto y 3 simultáneas por usuario | Ajustables |
| Latencia | Un salto más por el servidor y una transacción de Firestore por acción |
| Archivos en base64 de hasta 15 MB pasan por el servidor | Revisar la memoria de Cloud Run (512 MiB) con PDFs grandes |
| El interruptor de IA ahora funciona | Activarlo muestra a los usuarios gratuitos el mensaje de mantenimiento |
| Estadísticas del panel | El servidor registra `aiCalls_*` y `credits_*` en la misma base donde cobra |
| Errores existentes que no se tocaron | `MultimediaGenerator` espera `{lat, lon}` de `searchLocation`, que devuelve texto; la subida a Drive usa un permiso de solo lectura |

## 4. Orden exacto de despliegue seguro

> Nada de esto se ejecutó. Cada paso requiere tu aprobación.

**Paso 0: requisitos (sin despliegue)**
1. Ejecutar la comparación de bases ([`ops/FIRESTORE_COMPARISON.md`](./ops/FIRESTORE_COMPARISON.md)) y decidir la base. Recomendación: la base con nombre, que es la que usa la app.
2. Hacer un respaldo: `gcloud firestore export gs://<bucket> --database=<id>`.
3. Crear una clave **nueva** de Gemini, restringida a la API de Gemini, en Secret Manager. Configurar alertas de presupuesto en GCP.
4. Preparar las variables de Cloud Run:
   - `FIREBASE_DATABASE_ID=<base de la app>`
   - `AI_PROXY_ENABLED=true`, `AI_PROVIDER=gemini`, `GEMINI_API_KEY` (secreto)
   - las de la Fase 2: `SESSION_SECRET`, `ADMIN_EMAILS`, `ADMIN_SECRET_KEY`, `APP_URL`
   - en el build: `VITE_FIREBASE_*`, con `VITE_FIREBASE_FIRESTORE_DATABASE_ID` = la misma base

   Verificar con `npm run verify:config -- --production`. **Quitar `VITE_GEMINI_API_KEY`** del hosting.

**Paso 1: desplegar servidor y cliente de `phase4-ai-backend`, manteniendo las reglas actuales de producción**
- Es compatible: el cliente nuevo no escribe créditos y funciona con cualquier versión de las reglas.
- Con `FIREBASE_DATABASE_ID` configurado, el webhook de pagos pasa a escribir en la base que lee la app.
- Subir `VERSION` en `src/constants.ts` para que los navegadores carguen la versión nueva. Se borra el `localStorage`, pero no la sesión.
- **Verificación:** iniciar sesión, hacer una acción de IA, ver que el saldo baja 1 y revisar los logs (`[AI]`).
- **Vuelta atrás:** volver a la revisión anterior de Cloud Run.

**Paso 2: observar de 24 a 48 horas**
- Los errores de `/api/ai/generate` y la tasa de 402/429 en los logs.
- Los reportes de CSP.
- El consumo de Gemini en la facturación.

**Paso 3: publicar las reglas finales** (`return false; // CLIENT_CREDIT_TRANSITIONS`) en la base correcta, siguiendo [`FIRESTORE_RULES_DEPLOYMENT.md`](./FIRESTORE_RULES_DEPLOYMENT.md).
- Antes: `npm run test:rules` (incluye el modo final).
- No hace falta pasar por las reglas transicionales si la Fase 4 ya está en producción.
- **Vuelta atrás:** volver a publicar la versión anterior de las reglas desde el historial de la consola, que es instantáneo.

**Paso 4: después**
- Conciliar los pagos que el webhook escribió en `(default)` (opción A de `FIRESTORE_DATABASES.md`).
- Fase 5 (pagos): webhook verificado con `applyPlanPurchase`.

> **Ruta alternativa,** si se quisiera publicar la 3A **antes** que la 4: desplegar la app de `firestore-security-3a` **con la corrección del chat del punto 2.1** (hay que portarla) y después las reglas en modo transicional.

## 5. Para resolver `(default)` frente a la base con nombre, sin compartir credenciales

1. Iniciás sesión vos, en tu computadora: `gcloud auth application-default login`. Se abre el navegador y no se crean archivos de claves. Recomiendo una cuenta con el rol `Cloud Datastore Viewer`, que es de solo lectura.
2. Ejecutás `npx tsx scripts/ops/compare-firestore-databases.ts --project TU_PROYECTO --named-db ID_DE_LA_BASE`.
3. **Me pasás solo la tabla de números** que imprime. No contiene datos de usuarios, emails, IDs ni credenciales.
4. Opcional: `gcloud auth application-default revoke` al terminar.

La guía detallada y cómo interpretar el resultado están en [`ops/FIRESTORE_COMPARISON.md`](./ops/FIRESTORE_COMPARISON.md). El script es de solo lectura, y eso está demostrado con pruebas en el emulador.

## 6. No verificado

- Respuestas reales de Gemini: disponibilidad actual de cada modelo de la lista de respaldo y formatos reales del TTS.
- Comportamiento en Cloud Run (memoria con archivos grandes, latencia) y costos reales por acción.
- Vistas no recorridas en el navegador (sección 2).
