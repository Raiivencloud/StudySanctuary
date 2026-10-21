# StudySanctuary 📚

Plataforma de estudio con IA para estudiantes de nivel inicial, secundario, universitario y de posgrado. Organiza cursos, tareas y exámenes, y genera resúmenes, flashcards, exámenes, planes, ejercicios, esquemas, podcasts, un tutor virtual y la Arena (trivia con ranking) con Google Gemini. La monetización se hace con créditos y planes de pago único con Mercado Pago.

## Probarlo en 2 minutos (sin credenciales ni costos)

```bash
npm ci
npm run demo      # requiere Node 22+ y Java 21
```

Abrí http://localhost:3000 y usá **"Entrar como estudiante (demo)"**. La IA, los pagos y los datos son simulados y locales. Ver [`docs/DEMO.md`](docs/DEMO.md).

## Tecnología

| Capa | Detalle |
|---|---|
| Cliente | React 19, Vite 6, Tailwind 4, Firebase Web SDK (Auth, Firestore, Storage) |
| Servidor | Express en Cloud Run (`server.ts`, `server/`): proxy de Gemini, créditos transaccionales, pagos, integraciones y administración |
| Datos | Firestore con reglas probadas en el emulador (`firestore.rules`, `storage.rules`) |
| IA | Gemini, **solo desde el servidor**, con reintentos, modelos de respaldo, límites por usuario y devolución de créditos si falla |
| Pagos | Mercado Pago Checkout Pro, con webhook firmado, idempotente y validado |

## Comandos

```bash
npm run dev             # servidor + app (requiere .env; ver docs/CONFIGURATION.md)
npm run dev:emulators   # emuladores de Firebase + IA y pagos simulados
npm run demo            # lo anterior + datos de ejemplo y cuentas demo
npm run verify          # tipos, pruebas unitarias, escaneo de secretos y build
npm run test:rules      # reglas, créditos y pagos en el emulador (Java 21)
npm run verify:config   # valida la configuración sin mostrar valores
npm run build && npm start
```

## Documentación

| Tema | Documento |
|---|---|
| **Venta, instalación, transferencia, servicios, costos y licencias** | [`docs/SALE_AND_TRANSFER.md`](docs/SALE_AND_TRANSFER.md) |
| **Lista de comprobación final** | [`docs/FINAL_CHECKLIST.md`](docs/FINAL_CHECKLIST.md) |
| Demo segura | [`docs/DEMO.md`](docs/DEMO.md) |
| Configuración y variables | [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md), `.env.example` |
| Dependencias, vulnerabilidades y licencias | [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md) |
| Credenciales que hay que rotar | [`docs/SECURITY_CREDENTIALS.md`](docs/SECURITY_CREDENTIALS.md) |
| Reglas de Firestore y su despliegue | [`docs/FIRESTORE_SECURITY_3A.md`](docs/FIRESTORE_SECURITY_3A.md), [`docs/FIRESTORE_RULES_DEPLOYMENT.md`](docs/FIRESTORE_RULES_DEPLOYMENT.md), [`docs/FIRESTORE_DATABASES.md`](docs/FIRESTORE_DATABASES.md) |
| IA en el servidor y créditos (orden de despliegue) | [`docs/PHASE4_REPORT.md`](docs/PHASE4_REPORT.md), [`docs/CREDITS_SERVER_MODEL.md`](docs/CREDITS_SERVER_MODEL.md) |
| Pagos | [`docs/PHASE5_PAYMENTS.md`](docs/PHASE5_PAYMENTS.md) |
| Propuesta de créditos por origen | [`docs/CREDITS_BUCKETS_PROPOSAL.md`](docs/CREDITS_BUCKETS_PROPOSAL.md) |
| Herramientas de operación (solo lectura y claims) | [`docs/ops/README.md`](docs/ops/README.md) |

## Estructura

```text
src/          # app React: components/, contexts/, services/ (aiClient, geminiService), lib/, config/
server/       # ai/, credits/, payments/, routes/, security/, config.ts
scripts/      # dev-with-emulators.ts, demo/seed.ts, ops/, scan-secrets.ts, verify-config.ts
tests/        # unit/, rules/ (emulador), bundle/ (build sin secretos)
docs/         # documentación técnica y de traspaso
```
