# StudySanctuary: paquete de venta

Versión **1.1.0-rc.1** (rama `release-candidate-1.1`), 22/10/2026. Junta lo que necesita un comprador para evaluar el producto. Cada sección enlaza al documento técnico con el detalle.

> **Qué se vende:** el **código fuente** de una aplicación terminada y probada, con su documentación.
>
> **Qué no se vende:**
> - **no** es un SaaS en producción: esta versión no está desplegada;
> - **no** es un negocio con ingresos, usuarios pagos ni métricas de tracción demostradas;
> - **no** está listo para operar sin resolver antes los pendientes legales, técnicos y operativos de [`BUYER_RISKS.md`](./BUYER_RISKS.md).
>
> Todas las cifras de costos son **estimaciones** con precios públicos de referencia.

## 1. Descripción comercial

**StudySanctuary** es una plataforma web de estudio con inteligencia artificial para estudiantes de nivel inicial, secundario, universitario y de posgrado, en español.
- El estudiante organiza sus cursos, archivos, tareas y exámenes.
- Con un clic genera resúmenes, flashcards, exámenes de práctica, planes de estudio, ejercicios, esquemas, guías de lectura y podcasts con voz.
- Tiene un tutor virtual y una trivia competitiva (la **Arena**) con ranking y cartas coleccionables.

**Modelo de negocio:**
- **Créditos** que consumen las funciones de IA.
- Acceso gratuito con una recarga diaria y una prueba de 7 días.
- Tres **planes de pago único**, sin débitos recurrentes, cobrados con Mercado Pago (Argentina).

| Plan | Precio actual | Créditos | Duración |
|---|---|---|---|
| Prueba gratis | $ 0 | 15 (vencen a los 7 días) | 7 días, una vez por cuenta |
| Mensual | $ 1.200 ARS | 300 | 30 días |
| Trimestral | $ 4.200 ARS | 1.000 | 90 días |
| Anual | $ 12.000 ARS | 5.000 | 365 días |

Los precios **no se modificaron** durante la preparación para la venta y se configuran en `src/constants.ts`. El Trimestral cuesta un poco **más** por crédito que el Mensual (4,20 contra 4,00 pesos): conviene revisarlo.

**Para quién es la compra:**
- quien quiera operar un SaaS educativo en español con IA, sin desarrollarlo desde cero;
- un equipo que quiera una base técnica ya asegurada, probada y documentada.

## 2. Funcionalidades

Todas verificadas en la demo con IA y pagos simulados ([`FINAL_CHECKLIST.md`](./FINAL_CHECKLIST.md), sección A).

| Área | Qué hace |
|---|---|
| Cuentas | Ingreso con Google o Apple (Firebase Auth), perfil, nivel educativo, tema claro u oscuro, español e inglés |
| Estudio con IA | Resumen, flashcards, examen de práctica, plan adaptativo, ejercicios, esquema o diagrama, matemática paso a paso, tutor virtual, podcast con guion y voz, guías de estudio de libros, mapa interactivo |
| Cursos | Cursos con archivos (PDF, Word, Excel, texto), herramientas de IA por curso con una cuota diaria incluida |
| Organización | Calendario con exámenes y recordatorios dentro de la app, tareas, actividad, estadísticas del panel, notificaciones |
| Social | Grupos de estudio, feedback de usuarios, ranking |
| Arena | Trivia por nivel con vidas, rachas, espera (o saltarla con 1 crédito), ranking y álbum de cartas |
| Créditos | Controlados por el servidor con transacciones: recarga diaria, prueba única, devolución si la IA falla, **créditos por origen** (los de la prueba y los planes vencen con aviso previo; los anteriores no vencen) |
| Pagos | Mercado Pago Checkout Pro. Webhook firmado e idempotente que valida monto, moneda y plan. Maneja pendientes, rechazos, reembolsos y contracargos. |
| Integraciones | Google Drive (permiso mínimo `drive.file`), Google Calendar, Outlook Calendar |
| Administración | Panel por claim `admin`: usuarios, estadísticas, interruptor de IA para usuarios gratuitos |
| Legal | Política de privacidad y términos en **borrador**, mostrados como preliminares hasta su aprobación |

**Fuera del producto** (no prometido):
- el asistente de voz es experimental y está **desactivado**;
- no hay app móvil nativa (es web adaptable);
- no hay chat de soporte en vivo ni facturación fiscal.

## 3. Calidad y verificación

| Suite | Resultado (esta versión) |
|---|---|
| Unitarias (`npm test`) | **158/158** |
| Emulador de Firebase: reglas, créditos, pagos, IA (`npm run test:rules`) | **93/93** |
| Build sin secretos (`npm run test:build`) y escaneo de secretos | **2/2**, sin hallazgos |
| Navegador sobre la demo (recorrido, IA, herramientas, Arena, voz, pagos, aviso de vencimiento) | **96/96** |

Cómo se aseguró el producto:
- [`PHASE4_REPORT.md`](./PHASE4_REPORT.md): IA en el servidor.
- [`FIRESTORE_SECURITY_3A.md`](./FIRESTORE_SECURITY_3A.md): reglas de Firestore.
- [`PHASE5_PAYMENTS.md`](./PHASE5_PAYMENTS.md): pagos.
- [`CREDITS_BUCKETS_PROPOSAL.md`](./CREDITS_BUCKETS_PROPOSAL.md) §8: créditos.
- [`DEPENDENCIES.md`](./DEPENDENCIES.md): dependencias.

## 4. Requisitos de instalación

| Necesidad | Detalle |
|---|---|
| Para probarlo | Node 22+ y Java 21. `npm ci && npm run demo`: **sin credenciales, sin costos, sin conexión** ([`DEMO.md`](./DEMO.md)) |
| Para operarlo | Proyecto de Google Cloud con facturación (Cloud Run, Firestore, Auth, Storage, Secret Manager), clave de Gemini API, cuenta de Mercado Pago, dominio, `gcloud` |
| Opcional | Cliente OAuth de Google (Drive y Calendar), app de Microsoft Entra (Outlook), Google Tag Manager, Discord |
| Pasos | [`SALE_AND_TRANSFER.md`](./SALE_AND_TRANSFER.md) §4 (instalación desde cero) y [`CONFIGURATION.md`](./CONFIGURATION.md) (variables) |

## 5. Documentación técnica incluida

| Documento | Contenido |
|---|---|
| [`README.md`](../README.md) | Presentación, comandos, estructura |
| [`SALE_AND_TRANSFER.md`](./SALE_AND_TRANSFER.md) | Arquitectura, servicios, costos, instalación, transferencia, elementos a reemplazar |
| [`CONFIGURATION.md`](./CONFIGURATION.md), `.env.example` | Todas las variables, cuáles son secretas |
| [`DEMO.md`](./DEMO.md) | Demo segura |
| [`FIRESTORE_RULES_DEPLOYMENT.md`](./FIRESTORE_RULES_DEPLOYMENT.md), [`FIRESTORE_DATABASES.md`](./FIRESTORE_DATABASES.md) | Reglas y base de datos |
| [`PHASE4_REPORT.md`](./PHASE4_REPORT.md), [`CREDITS_SERVER_MODEL.md`](./CREDITS_SERVER_MODEL.md), [`CREDITS_BUCKETS_PROPOSAL.md`](./CREDITS_BUCKETS_PROPOSAL.md) | IA y créditos |
| [`PHASE5_PAYMENTS.md`](./PHASE5_PAYMENTS.md) | Pagos |
| [`SECURITY_CREDENTIALS.md`](./SECURITY_CREDENTIALS.md), [`SESSIONS_LOW_COST.md`](./SESSIONS_LOW_COST.md) | Credenciales a rotar, sesiones |
| [`ops/README.md`](./ops/README.md) | Herramientas de operación (solo lectura y claims) |
| [`DEPENDENCIES.md`](./DEPENDENCIES.md), [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md), [`LICENSING_AND_IP.md`](./LICENSING_AND_IP.md) | Dependencias, licencias, propiedad intelectual |
| [`legal/README.md`](./legal/README.md), [`legal/DATA_INVENTORY.md`](./legal/DATA_INVENTORY.md) | Borradores legales e inventario de datos |
| [`RELEASE_1.1.md`](./RELEASE_1.1.md) | Qué contiene esta versión y cómo fusionarla |
| [`SALE_READINESS_REPORT.md`](./SALE_READINESS_REPORT.md), [`FINAL_CHECKLIST.md`](./FINAL_CHECKLIST.md), [`BUYER_RISKS.md`](./BUYER_RISKS.md) | Estado para la venta, lista de comprobación, riesgos |

## 6. Costos de operación (estimados)

> Precios de referencia del 21/10/2026: verificarlos ([`SALE_AND_TRANSFER.md`](./SALE_AND_TRANSFER.md) §3).

| Concepto | Estimación |
|---|---|
| Google Cloud / Firebase | **US$ 0–10 por mes** con pocos cientos de usuarios activos (niveles gratuitos; verificar si la base con nombre tiene nivel gratuito) |
| Gemini API (costo principal) | ≈ **US$ 0,003** por acción de texto; **US$ 0,05–0,10** por podcast; hasta ≈ US$ 0,18 por día para un usuario gratuito muy activo en herramientas del curso |
| Mercado Pago | Comisión por cobro (≈ 6,29 % + IVA con crédito y acreditación inmediata, según terceros) |
| Dominio y email | Variable |
| Revisión legal | Honorarios: privacidad, términos, cesión, datos personales y menores |
| Desarrollo pendiente para operar | Borrar y exportar la cuenta; reemplazar la música y los mapas sin licencia comercial ([`BUYER_RISKS.md`](./BUYER_RISKS.md)) |

**Ejemplo teórico de margen por plan (no son ingresos reales):** un plan Mensual ($ 1.200) entrega 300 créditos. Si se usan todos en acciones de texto, la IA cuesta ≈ US$ 0,90; si se usan en podcasts, puede llegar a US$ 15–30. **Revisar el precio del podcast** antes de operar.

## 7. Limitaciones conocidas

| Limitación | Impacto | Referencia |
|---|---|---|
| Sin borrado ni exportación de la cuenta desde la app (se pide por email) | Lo exige la normativa de datos personales | `legal/DATA_INVENTORY.md` |
| Textos legales en borrador | No se puede operar sin aprobarlos | `legal/README.md` |
| Sin verificación de edad ni banner de cookies | Posibles menores (niveles inicial y secundario); GTM requiere consentimiento | `legal/DATA_INVENTORY.md` |
| Sesiones y tokens de integración en memoria | 1 sola instancia de Cloud Run; escalar requiere un almacenamiento persistente | `SESSIONS_LOW_COST.md` |
| Arena validada en el cliente | Los puntos del ranking se pueden inflar | `FINAL_CHECKLIST.md` B12 |
| CSP en modo de reporte | No bloquea todavía | `FINAL_CHECKLIST.md` B8 |
| Recursos externos (Unsplash, SoundHelix, Esri) cargados desde sus sitios | Dependencia externa y licencias a revisar | `LICENSING_AND_IP.md` §5 |
| Reembolsos parciales y pagos marcados se revisan a mano, sin pantalla de administración | Trabajo operativo | `PHASE5_PAYMENTS.md` |
| `xlsx` desde npm (sin actualizaciones) | Vulnerabilidades conocidas al leer Excel no confiables | `DEPENDENCIES.md` |
| Probado con IA y pagos **simulados** | Falta probar con Gemini real y el sandbox de Mercado Pago | `SALE_READINESS_REPORT.md` B5, B6 |
| Asistente de voz desactivado; onboarding que no guarda rol ni país; "¿Te resultó útil?" que solo guarda en el navegador; `translations.ts` sin uso | Funciones incompletas, no promocionadas | `PHASE7_COMMERCIAL_BLOCKERS.md` §7 |
| Las ramas de trabajo no están fusionadas en `main` | Hay que fusionar `release-candidate-1.1` | `RELEASE_1.1.md` |
