# Lista de comprobación final

Estado al **22/10/2026**, versión **1.1.0-rc.1** (rama `release-candidate-1.1`). Ver también [`SALE_READINESS_REPORT.md`](./SALE_READINESS_REPORT.md).

**Leyenda:**
- ✅ verificado con pruebas automáticas o en el navegador
- 🟡 hecho, pero falta verificarlo con servicios reales
- ⛔ **bloqueante** para vender o lanzar
- ⬜ pendiente o decisión del dueño

## A. Funcionalidades (demo con IA simulada; `docs/DEMO.md`)

| # | Funcionalidad | Estado | Cómo se verificó |
|---|---|---|---|
| A1 | Registro e inicio de sesión con Google | ✅ en el emulador, 🟡 con Google real | Demo y sesiones del emulador |
| A2 | Prueba gratis (15 créditos que vencen a los 7 días, una sola vez) y recarga diaria (5) | ✅ | Unitarias, emulador y navegador |
| A3 | Estudio IA: resumen, flashcards, examen, plan, ejercicios, esquema | ✅ (−1 crédito cada uno) | Navegador |
| A4 | Tutor virtual, matemáticas, podcast (guion + audio), libros, mapa | ✅ | Navegador |
| A5 | Herramientas del curso (sin costo, cuota diaria) | ✅ | Navegador |
| A6 | Arena: preguntas, puntos, ranking, vidas, espera y saltarla con 1 crédito | ✅ | Navegador |
| A7 | Calendario, tareas, grupos de estudio, feedback | ✅ | Navegador |
| A8 | Dashboard y notificaciones con datos reales; menú "Cursos" | ✅ (corregido en la Fase 6) | Navegador y unitarias |
| A9 | Planes: pago único, checkout, aprobado, pendiente, rechazado, reembolso | ✅ simulado, 🟡 con **sandbox real** de Mercado Pago | Emulador y navegador |
| A10 | Panel de administración (claim `admin`) | ✅ visible para la cuenta demo | Navegador |
| A11 | Google Drive (permiso mínimo `drive.file`: subir y usar archivos de la app; el selector ya está conectado en Estudio IA) y Calendar | ✅ con APIs simuladas y navegador, 🟡 con Google real | Unitarias y navegador |
| A12 | Asistente de voz | ⬜ **Experimental, desactivado** por decisión (una prueba impide mostrarlo) | Llamadas probadas en la Fase 4 |
| A13 | Interfaz en móvil (375 px) sin scroll horizontal | ✅ IA y planes | Navegador |
| A14 | Respuestas reales de Gemini (modelos de respaldo, voz) | 🟡 | Probar con una clave de desarrollo y presupuesto acotado |
| A15 | Créditos por origen: las compras suman, los créditos de la prueba y los planes vencen con aviso, los históricos no vencen, los reembolsos quitan solo lo no usado | ✅ | Emulador (compatibilidad y concurrencia) y navegador |

## B. Seguridad

| # | Punto | Estado |
|---|---|---|
| B1 | Ninguna clave privada en el cliente; escaneo de secretos del código y del build | ✅ `npm run verify` |
| B2 | La clave de Gemini filtrada antes fue **revocada** | ✅ (confirmado por el propietario) |
| B3 | La IA solo se usa desde el servidor, con identidad, créditos transaccionales y límites | ✅ |
| B4 | Reglas de Firestore: sin escalada a admin; datos privados por dueño; créditos y planes solo los escribe el servidor (reglas **finales**) | ✅ emulador. ⛔ **Falta publicarlas en producción** (orden en `PHASE4_REPORT.md`) |
| B5 | Webhook de Mercado Pago con firma, idempotente, que valida monto, moneda y plan | ✅ simulado, 🟡 confirmar la firma en el sandbox (`PHASE5_PAYMENTS.md`, sección 5) |
| B6 | Pagos de prueba rechazados en producción; simuladores rechazados en producción | ✅ |
| B7 | Admin por claim; secretos de administración con comparación en tiempo constante | ✅ |
| B8 | Encabezados de seguridad y CSP (en modo *Report-Only*) | ✅. ⬜ Activar el modo que bloquea después de revisar los reportes |
| B9 | Sesiones y tokens de integración en memoria (1 instancia) | ⬜ Store persistente si se escala (`SESSIONS_LOW_COST.md`) |
| B10 | Vulnerabilidades de dependencias: 0 críticas; las altas restantes son de desarrollo o no tienen corrección | ✅ `DEPENDENCIES.md`. ⬜ `xlsx` corregido desde el CDN de SheetJS |
| B11 | Datos personales de terceros en el código | ✅ eliminados (P6-5). ⬜ El email del propietario sigue en `firestore.rules` y `src/config/admin.ts` hasta el traspaso |
| B12 | Arena: los puntos se pueden inflar porque las respuestas son legibles por el cliente | ⬜ Juego validado en el servidor (mejora posterior) |
| B13 | Copia de seguridad de Firestore antes de desplegar | ⬜ `gcloud firestore export` |

## C. Datos y despliegue

| # | Punto | Estado |
|---|---|---|
| C1 | Decidir la base de Firestore (`(default)` o la base con nombre) y alinear `FIREBASE_DATABASE_ID` | ⛔ (`FIRESTORE_DATABASES.md`; comparación de solo lectura lista) |
| C2 | Conciliar los pagos que el webhook anterior escribió en `(default)` | ⬜ |
| C3 | Fusionar las ramas en `main` en el orden documentado y desplegar | ⬜ (aprobación del dueño) |
| C4 | Alertas de presupuesto en Google Cloud (Gemini) | ⬜ |
| C5 | Revisar los precios por acción: un podcast cuesta entre 15 y 30 veces más que un resumen; la cuota gratuita de 60 llamadas por día | ⬜ decisión de negocio (`SALE_AND_TRANSFER.md` §3.2) |
| C6 | Modelo de créditos por origen | ✅ aprobado e implementado en desarrollo (`CREDITS_BUCKETS_PROPOSAL.md` §8). ⬜ Desplegarlo con el resto (`RELEASE_1.1.md`) |

## D. Legal y contenido (bloqueantes para lanzar o vender)

| # | Punto | Estado |
|---|---|---|
| D1 | Política de privacidad y términos | 🟡 **Borradores** fieles a la implementación, mostrados como preliminares. ⛔ Falta la revisión y aprobación profesional |
| D2 | Testimonios inventados | ✅ Reemplazados por una presentación de funcionalidades (Fase 7) |
| D3 | Promesas no implementadas y comparaciones de precio falsas | ✅ Quitadas en planes, landing, configuración, ayuda, libros y podcast (Fase 7; `commercialBlockers.test.ts`) |
| D4 | Función para borrar la cuenta (derecho de supresión) | ⬜ no existe |
| D5 | Licencias de recursos externos (SoundHelix, Unsplash, Esri...) y de `react-leaflet` (Hippocratic) | 🟡 Inventario y análisis hechos (`LICENSING_AND_IP.md`, `THIRD_PARTY_LICENSES.md`). ⬜ Decisión legal y reemplazo de música y mapas |
| D6 | Facturación fiscal de los planes | ⬜ |
| D7 | Derechos sobre el código (origen en AI Studio, código asistido por IA) y contrato de cesión | 🟡 Análisis en `LICENSING_AND_IP.md`. ⬜ abogado |

## E. Transferencia (`SALE_AND_TRANSFER.md`)

| # | Paso | Estado |
|---|---|---|
| E1 | Repositorio: transferido o entregado, `release-candidate-1.1` fusionada (`RELEASE_1.1.md`) | ⬜ |
| E2 | Proyecto de Google Cloud y Firebase: propietario y facturación del comprador (opción A) o proyecto nuevo (opción B) | ⬜ |
| E3 | Rotar todos los secretos (`SECURITY_CREDENTIALS.md`) | ⬜ |
| E4 | Mercado Pago del comprador (token, webhook y sandbox probado) | ⬜ |
| E5 | Claim `admin` del comprador; quitar el del vendedor y su email de las reglas | ⬜ |
| E6 | Dominio, Search Console, GTM (`VITE_GTM_ID`), Discord (`VITE_COMMUNITY_URL`), email de soporte | ⬜ |
| E7 | Cliente OAuth de Google y verificación (sin CASA: solo `drive.file` y `calendar.readonly`) | ⬜ |
| E8 | Quitar los accesos del vendedor (IAM, Firebase, GitHub) | ⬜ |
| E9 | El comprador ejecuta `npm ci`, `npm run verify`, `npm run test:rules` y `npm run demo` en su máquina | ⬜ |
