# Fase 5: Pagos con Mercado Pago

Rama local: `phase5-payments`, creada sobre `phase4-validation`.

**Alcance:**
- Sin pagos reales ni credenciales de producción. Todas las pruebas usan un Mercado Pago simulado.
- Sin cambios en Firebase real ni despliegues.
- **Sin cambios de precios ni de planes.** Los montos, créditos y duraciones son los mismos de `src/constants.ts`.

## 1. Auditoría del flujo actual (antes de esta fase)

Flujo: `SubscriptionView` → `POST /api/create-preference` → Checkout Pro de Mercado Pago (pago único, `Preference`) → `POST /api/mercadopago-webhook` → `users/{uid}`.

| # | Hallazgo | Evidencia | Gravedad |
|---|---|---|---|
| P-1 | **El webhook no verifica la firma** (`x-signature`). Cualquiera puede llamarlo. | `server.ts`, `/api/mercadopago-webhook` | Alta. El daño es limitado porque el servidor consulta el pago a la API de Mercado Pago, pero cualquiera puede forzar consultas y reprocesos. |
| P-2 | **Doble acreditación.** Cada notificación de un pago aprobado vuelve a escribir el plan: **repone los créditos al total y extiende la fecha de vencimiento desde ese momento**. Mercado Pago manda varias notificaciones por pago (`payment.created`, `payment.updated`, reintentos), y también llegan semanas después (por ejemplo, al abrir una disputa). | No hay registro de pagos ya aplicados; usa `set(..., {merge: true})` | **Crítica** |
| P-3 | **Pagos perdidos.** Si falla la consulta a Mercado Pago o la escritura en Firestore, el error se registra y se responde **200**: Mercado Pago no reintenta y el usuario paga sin recibir el plan. | `catch` + `res.status(200)` | **Crítica** |
| P-4 | **No se valida monto, moneda ni plan.** Se confía en `metadata.plan_id` y no se compara `transaction_amount` ni `currency_id` con el plan. | webhook | Media (defensa en profundidad: hoy las preferencias las crea solo el servidor) |
| P-5 | **`/api/create-preference` no exige sesión.** El `userId` y el email salen del cuerpo de la solicitud, y el `userId` viaja como `external_reference`. Cualquiera puede generar pagos a nombre de cualquier cuenta o con el email de otra persona. | `server.ts` (pendiente 2-H de la Fase 2) | Media |
| P-6 | **Reembolsos y contracargos no se manejan.** Un pago reembolsado o con contracargo conserva el plan y los créditos. | El webhook ignora todo estado distinto de `approved` | Alta |
| P-7 | **Pendientes y rechazados no quedan registrados**, y la pantalla de éxito dice "Tu suscripción está activa" con "Plan – 0 Créditos" fijos, aunque el pago siga pendiente o el webhook todavía no haya llegado. | `App.tsx` (`SubscriptionSuccess planName="Plan" credits={0}`) | Media (confunde al usuario y genera reclamos) |
| P-8 | Las URLs de retorno apuntan siempre a `studysanctuary.net`, y las de fallo y pendiente van a `/pricing`, que no existe en la app. La redirección `/success` descarta los parámetros que agrega Mercado Pago. | `back_urls`, `app.get('/success')` | Baja (rompe pruebas y otros dominios) |
| P-9 | Los precios y créditos están **duplicados** en `server.ts` (dos tablas) además de `src/constants.ts`. Un cambio de precio en un solo lugar desincroniza el cobro. | `server.ts` | Baja |
| P-10 | En producción se aceptarían pagos de prueba (`live_mode: false`). | webhook | Baja |
| P-11 | **Los planes son pagos únicos, pero la pantalla dice "/mes", "/3 meses" y "/año".** No hay renovación automática: al vencer, el plan pasa a vencido y el usuario debe volver a pagar. | `SubscriptionView` + `Preference` | Decisión de producto (sección 4) |
| P-12 | La base de datos del webhook es la de `FIREBASE_DATABASE_ID`. Si no coincide con la que lee la app, los pagos se acreditan en otra base. | Fase 2 / `FIRESTORE_DATABASES.md` | Alta si se configura mal |

Lo que ya estaba bien: las preferencias las crea solo el servidor con el precio fijo, el webhook consulta el estado real del pago a la API (no confía en el cuerpo), está excluido del límite general de solicitudes y, desde la Fase 3A, las reglas impiden que el cliente active planes o se asigne créditos.

## 2. Cambios propuestos (documentados antes de implementarlos)

**Módulo nuevo `server/payments/`** que reemplaza el código de pagos de `server.ts`:

1. **Una sola tabla de planes** (`server/payments/plans.ts`), derivada de `SUBSCRIPTION_PLANS`, usada por la preferencia, la validación y la acreditación. Una prueba fija los valores actuales (1200/300/30 días, 4200/1000/90 días, 12000/5000/365 días, en ARS).
2. **Orden de pago del servidor.** `POST /api/create-preference` **exige el ID token**. El `uid` y el email salen del token, no del cuerpo. Antes de crear la preferencia se guarda `paymentOrders/{orderId}` con uid, plan, monto y moneda, y `external_reference` pasa a ser el `orderId`, no el uid.
3. **Webhook verificado.** Se valida la firma `x-signature` (HMAC-SHA256 de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con la clave secreta del panel) usando comparación en tiempo constante. Sin firma válida, responde 401 y no procesa. En producción, `MERCADOPAGO_WEBHOOK_SECRET` es obligatoria.
4. **El estado real siempre se consulta a la API** con el token del servidor y se valida:
   - que la orden exista;
   - que el monto sea **exactamente** el de la orden y la moneda sea `ARS`;
   - que el plan sea el de la orden;
   - que en producción no sea un pago de prueba.

   Si algo no coincide, el pago no se acredita, queda registrado como `rejected_validation` y se escribe un log para revisarlo.
5. **Idempotente y atómico.** Una transacción de Firestore aplica el plan, la entrada del libro mayor `payment_<id>` y el registro `payments/{paymentId}`. Si la entrada ya existe, no hace nada. Notificaciones repetidas, reintentos y llegadas simultáneas acreditan **una sola vez**.
6. **Estados:**
   - `approved`: acredita;
   - `pending` / `in_process` / `authorized`: se registra y el usuario ve "pendiente";
   - `rejected` / `cancelled`: se registra;
   - `refunded` / `charged_back`: **se revoca** (ver punto 7);
   - `in_mediation` (disputa abierta): se registra, sin cambios hasta la resolución;
   - reembolso **parcial**: se registra y se marca para revisión manual.
7. **Reembolsos y contracargos (valor por defecto, ajustable).** Si el plan revocado sigue siendo el vigente del usuario, la suscripción pasa a `revoked`, el plan a "Gratis" y los créditos a 0. Desde el día siguiente vuelve la recarga gratuita diaria. Si el usuario ya compró otro plan después, no se toca el plan vigente: se registra y se marca para revisión. Todo queda en el libro mayor (`revoke_<id>`). El usuario no puede deshacerlo porque las reglas no le permiten escribir esos campos.
8. **Errores transitorios.** Si falla la API de Mercado Pago o Firestore, se responde **500** para que Mercado Pago reintente. Las notificaciones ignorables (otros temas, pagos ajenos) responden 200.
9. **Confirmación al volver del checkout** (`POST /api/payments/sync`, con sesión): la pantalla de éxito pide al servidor que consulte ese pago. Se aplica la misma validación y solo si la orden es del usuario. Es una red de seguridad si el webhook se demora, y muestra el estado real.
10. **Retorno y pantalla de éxito.** Las `back_urls` usan `APP_URL`, y `/success` conserva los parámetros. `SubscriptionSuccess` muestra el plan y los créditos reales, o "Pago pendiente" o "No se acreditó", **con el mismo diseño**.
11. **Misma base que la app.** Con Mercado Pago configurado, el servidor exige que `FIREBASE_DATABASE_ID` coincida con `VITE_FIREBASE_FIRESTORE_DATABASE_ID` (mismo control que la IA).
12. **Mercado Pago simulado** para desarrollo y pruebas (`MERCADOPAGO_MODE=fake`, **rechazado en producción**): crea preferencias y pagos en memoria y permite simular aprobaciones, rechazos, reembolsos y contracargos sin dinero real.

13. **Pagos anteriores a esta fase.** El webhook viejo no dejaba entrada en el libro mayor, pero sí guardaba `subscription.lastPaymentId`.
    - Si llega una notificación de un pago que ya figura como `lastPaymentId` del usuario, se considera **ya acreditado**: se completa la entrada del libro mayor (`backfilled: true`) sin tocar el plan, y un reembolso o contracargo posterior lo revoca normalmente.
    - Una preferencia vieja (con el uid como `external_reference`) se acredita solo si el pago se aprobó en los últimos 7 días. Los más antiguos quedan registrados para revisión manual, para no volver a acreditar compras viejas.

**Reglas de Firestore:** `paymentOrders` y `payments` son solo del servidor: el cliente no los lee ni los escribe. El usuario ve sus pagos aplicados en su `creditLedger`.

**Fuera de alcance sin tu aprobación:** precios, créditos por plan, duración, si los créditos se suman o reemplazan al comprar (hoy **reemplazan**) y qué pasa con los créditos al vencer el plan (hoy **se conservan**).

## 3. Resultados

### Pruebas

| Suite | Resultado | Qué cubre |
|---|---|---|
| Unitarias (`npm test`) | **115/115** (17 nuevas de pagos) | Firma: formato del manifiesto, secreto o id o request-id alterados, encabezado incompleto. Tabla de planes con los precios actuales; `server.ts` ya no tiene precios. Preferencia con la orden como `external_reference`. Router: token obligatorio que ignora `userId` del cuerpo, webhook sin firma o con firma falsa (401, sin procesar), formatos Webhooks e IPN, errores transitorios (500), pagos ajenos (403), pagos desactivados (503). Configuración: secreto obligatorio en producción, simulador rechazado en producción, base distinta rechazada, pagos de prueba rechazados en producción. |
| Build (`npm run test:build`) | **2/2** | Sin secretos en el bundle |
| Emulador (`npm run test:rules`) | **82/82** (17 nuevas de pagos) | Ver detalle abajo |
| **Navegador** (Chromium, checkout simulado, reglas finales) | **17/17** | Ver detalle abajo |
| Regresión en el navegador (Fases 4 y validación) | 18/18, 21/21, Arena 10/10 | La verificación de texto de "Libros · lectura" falló una vez por tiempo de espera; el cobro fue correcto, y al repetirla pasó 2 de 2. |

**Emulador de Firestore (transacciones reales, Mercado Pago simulado):**
- La orden guarda el uid, el plan, el monto (4200) y `ARS`, y `external_reference` es la orden. Rechaza el plan "prueba" y perfiles inexistentes.
- **Aprobado:** 300 créditos, plan activo, vencimiento a 30 días, entrada en el libro mayor, registro del pago y orden `paid`.
- **Duplicados:** 5 notificaciones repetidas no reponen los créditos gastados ni extienden el vencimiento.
- **Concurrencia:** 15 notificaciones simultáneas del mismo pago acreditan **exactamente una vez**.
- **Validación:** un monto, una moneda o un plan distintos, o un pago de prueba en producción, **no se acreditan**: quedan para revisión y la orden pasa a `rejected_validation`.
- **Pendiente → aprobado:** se registra y se acredita al aprobarse. Rechazado, cancelado y en proceso no acreditan.
- **Reembolso:** revoca el plan una sola vez: créditos en 0, estado `revoked` y entrada `revoke_`. Una repetición o un "approved" tardío no cambian nada, y el interruptor de IA trata al usuario como gratuito.
- **Contracargo de un pago viejo** cuando ya hay un plan más nuevo: se conserva el plan nuevo y se marca para revisión.
- **Reembolso antes de acreditar:** solo se registra.
- **Disputa y reembolso parcial:** el plan se mantiene y se marca para revisión.
- **Propiedad:** la confirmación al volver solo acepta pagos del propio usuario.
- **Transición:**
  - una preferencia vieja (uid como referencia) reciente se acredita;
  - una con monto incorrecto no;
  - un pago que el webhook viejo ya acreditó **no se vuelve a acreditar**, y su contracargo lo revoca;
  - un pago viejo de más de 7 días queda para revisión.
- Pagos u órdenes desconocidos se ignoran sin escribir nada.
- **Webhook por HTTP:**
  - sin firma o con firma falsa: 401, sin acreditar;
  - caída simulada de Mercado Pago: 500, y el reintento acredita;
  - 4 reintentos simultáneos: una sola acreditación.
- **Reglas:** el cliente no puede leer ni escribir órdenes ni registros de pago, ni reactivar un plan revocado o asignarse créditos.

**Navegador (checkout simulado de punta a punta, webhooks firmados):**
- **Aprobado** (Plan Trimestral):
  - la preferencia se pide **con token y sin `userId`**;
  - vuelve a `/success` con el id del pago;
  - la pantalla muestra **"Plan Trimestral - 1000 Créditos Activos"**, y el servidor y la barra lateral muestran 1000;
  - sin errores de JavaScript ni llamadas externas.
- **Reembolso** simulado: el webhook firmado revoca el plan (créditos en 0).
- **Pendiente:**
  - la pantalla dice "Tu pago está en proceso" y no "activa";
  - no se acredita nada;
  - al aprobarse, el webhook acredita y la pantalla **se actualiza sola** a "Plan Mensual - 300 Créditos Activos".
- **Rechazado:** vuelve a Suscripción con el aviso "El pago no se completó" y no se acredita nada.

### Archivos

| Archivo | Cambio |
|---|---|
| `server/payments/plans.ts` | Tabla única de planes (derivada de `SUBSCRIPTION_PLANS`) |
| `server/payments/signature.ts` | Verificación de `x-signature` (HMAC-SHA256, comparación en tiempo constante) |
| `server/payments/gateway.ts` | Mercado Pago real (SDK oficial, `Preference` + `Payment.get`) y simulado |
| `server/payments/paymentService.ts` | Órdenes y procesamiento idempotente y atómico de pagos |
| `server/routes/payments.ts` | `/api/create-preference` (con token), `/api/payments/sync`, `/api/mercadopago-webhook`, checkout simulado de desarrollo |
| `server/credits/creditService.ts` | Usa la tabla única; `planPurchaseWrites` compartido |
| `server/config.ts` | `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_MODE`, `MERCADOPAGO_ALLOW_TEST_PAYMENTS` y sus controles |
| `server.ts` | Se eliminó el código de pagos anterior; `/success` conserva los parámetros |
| `src/components/SubscriptionView.tsx` | Pide la preferencia con `authFetch` y solo envía `planId`; aviso al volver de un pago fallido |
| `src/components/SubscriptionSuccess.tsx` | Estado real del pago (confirmando, activo, pendiente o no acreditado), con el mismo diseño |
| `firestore.rules` | `paymentOrders` y `payments`: solo el servidor (explícito) |
| `scripts/dev-with-emulators.ts` | Mercado Pago simulado con webhooks firmados (secreto aleatorio por ejecución) |
| `.env.example`, `docs/CONFIGURATION.md` | Variables nuevas; `MERCADOPAGO_PUBLIC_KEY` ya no se usa |

## 4. Pago único frente a suscripción recurrente

**Hoy:** Checkout Pro con `Preference`, que es un **pago único**. La pantalla de planes muestra "/mes", "/3 meses" y "/año", lo que sugiere una renovación automática que **no existe**. Al vencer, el plan pasa a "vencido" y el usuario tiene que volver a pagar. Esta fase **no cambió** ese modelo.

| | A. Pagos únicos ("pases") **(recomendado ahora)** | B. Suscripción recurrente (Mercado Pago Suscripciones / `preapproval`) |
|---|---|---|
| Qué cambia | Solo textos: "Pago único · sin renovación automática", más un aviso antes del vencimiento con un botón "Renovar" | Planes `preapproval_plan` por período, notificaciones `subscription_preapproval` y `subscription_authorized_payment`, acreditación idempotente por cada cobro, cancelación y pausa |
| Esfuerzo | Bajo (textos y un aviso) | Medio: endpoints, webhooks nuevos, pantalla "Mi suscripción" con **botón de baja**, cobros fallidos y reintentos |
| Riesgos | Menor ingreso recurrente | Obligación de una **baja simple y visible** para servicios con renovación automática (verificar con un asesor legal), cobros fallidos, reclamos por cobros no esperados |
| Encaje con lo hecho | Ya está completo | `paymentService` sirve de base: cada cobro autorizado se procesa como un pago con su orden (la suscripción) |

**Recomendación:** A para la venta (honesto y sin deuda operativa) y B como mejora posterior si el comprador quiere ingresos recurrentes. **Cualquiera de las dos cambia textos de la pantalla de planes, así que espera tu decisión.**

### Decisiones de negocio pendientes (no se cambiaron)
1. **Al comprar, los créditos del plan *reemplazan* el saldo** (comportamiento actual). Si alguien compra con créditos sobrantes, los pierde. Alternativa: sumarlos.
2. **Al vencer el plan, los créditos se conservan** (comportamiento actual de `expireIfDue`). Alternativa: llevarlos a 0, o a 5, al vencer.
3. **Reembolsos y contracargos:** se usa el valor por defecto descrito en el punto 2.7 (revocar y dejar los créditos en 0). Se puede cambiar, por ejemplo, para descontar solo los créditos no usados.
4. Modelo A o B (arriba).

## 5. Riesgos pendientes

| Riesgo | Detalle | Qué hacer |
|---|---|---|
| **Firma en las notificaciones de `notification_url`** | La documentación de Mercado Pago describe `x-signature` para los Webhooks configurados en el panel. No se pudo verificar con Mercado Pago real (sin credenciales) que las notificaciones enviadas a la `notification_url` de la preferencia lleven esa firma. Si no la llevan, el webhook las rechaza (401). La red de seguridad de la pantalla de éxito acredita al volver, pero **un pago pendiente que se aprueba después** (por ejemplo, en efectivo) no se acreditaría hasta que el usuario vuelva. | **Antes de producción:** configurar en el panel *Webhooks → Pagos* con la misma URL, y probar en el **sandbox** con credenciales de prueba: un pago aprobado, uno pendiente que se aprueba después y un reembolso. Verificar en los logs que no haya `firma inválida`. |
| Conciliación | Si el webhook estuvo caído más tiempo que la ventana de reintentos de Mercado Pago, un pago puede quedar sin acreditar (el usuario puede reintentar desde la pantalla de éxito, pero no siempre vuelve). | Propuesta: un script de solo lectura que compare los pagos aprobados de Mercado Pago (API de búsqueda) con el libro mayor. No implementado. |
| Revisión manual | Los pagos con `needsReview` (montos que no coinciden, reembolsos parciales, disputas, contracargos de planes viejos) no tienen una pantalla de administración. | Consultarlos en la consola de Firestore (`payments` con `needsReview == true`). Herramienta de admin posterior. |
| Base de datos | El control de base distinta solo funciona si `VITE_FIREBASE_FIRESTORE_DATABASE_ID` también está en el entorno del servidor, y en Cloud Run normalmente solo está en el build. | Definir **las dos** variables en Cloud Run, o verificar con `npm run verify:config -- --production` antes de desplegar. Resolver `(default)` frente a la base con nombre (`FIRESTORE_DATABASES.md`) **antes** de activar pagos. |
| Pagos acreditados en `(default)` | El webhook anterior escribía en `(default)` si `FIREBASE_DATABASE_ID` no estaba definido. | Conciliar esos pagos (Fase 4, paso 4). |
| Órdenes abandonadas | Cada intento de pago crea una orden, aunque no se pague. | Política de TTL de Firestore sobre `paymentOrders.createdAt` (por ejemplo, 90 días). |
| SDK y API reales | Los formatos reales se verificaron solo contra los tipos del SDK oficial y la documentación, no contra la API. | Prueba en el sandbox (punto 1). |

## 6. Orden de despliegue (nada de esto se ejecutó)

1. Requisitos de la Fase 4 (base decidida, respaldo, `FIREBASE_DATABASE_ID`).
2. En el panel de Mercado Pago: crear o rotar el **Access Token**, configurar **Webhooks → Pagos** con `https://<dominio>/api/mercadopago-webhook` y copiar la **clave secreta**.
3. En Cloud Run, como secretos: `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET`, más `APP_URL`, `FIREBASE_DATABASE_ID` y `VITE_FIREBASE_FIRESTORE_DATABASE_ID` en el runtime. Verificar con `npm run verify:config -- --production`.
4. **Entorno de prueba primero:** credenciales de test y `MERCADOPAGO_ALLOW_TEST_PAYMENTS=true` (solo ahí) para recorrer en el sandbox: aprobado, pendiente → aprobado, rechazado, reembolso. Revisar los logs `[Payments]`.
5. Producción: desplegar el servidor y el cliente juntos (el cliente nuevo envía el token; el viejo recibiría 401) y subir `VERSION`.
6. Publicar las reglas (`paymentOrders` y `payments` explícitos; el resto no cambia).
7. **Vuelta atrás:** volver a la revisión anterior de Cloud Run. Los pagos registrados quedan en `payments` y el libro mayor, y un despliegue posterior los reconoce sin duplicar.
