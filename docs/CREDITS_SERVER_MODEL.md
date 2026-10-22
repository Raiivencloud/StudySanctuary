# Fase 3B: El servidor como autoridad de créditos y suscripciones

> **Estado:** diseño aprobado para preparación. El servicio está implementado y probado (`server/credits/creditService.ts` y `tests/rules/creditService.test.ts`), pero **no está conectado**. Se conecta en la Fase 4, junto con el proxy de IA. No se activó Gemini ni se modificaron datos.

## 1. Problema actual

El navegador decide los créditos:

- `getUserCredits()` crea el saldo y hace la recarga diaria.
- `consumeCredit()` descuenta **después** de llamar a la IA, con una lectura y una escritura sin transacción.
- `updateSubscription('prueba')` activa la prueba gratis.

Las reglas de la Fase 3A limitan estas escrituras a transiciones acotadas (descontar 1, recargar a 5 una vez por día UTC con saldo 0 y una única prueba gratis), pero el cliente **sigue siendo quien las ejecuta**. Ese es el modo **transicional**, y no es la solución definitiva.

## 2. Modelo objetivo

| Requisito | Cómo se cumple |
|---|---|
| El servidor es la autoridad | Solo el Admin SDK (servidor) escribe `remainingCredits`, `subscriptionType`, `hasUsedFreeTrial`, `lastCreditReset`, `subscription` y `role`. Las reglas finales lo bloquean para el cliente. |
| Descuentos transaccionales | `consume(uid, requestId)` corre en `runTransaction`: lee el saldo, valida y descuenta en una sola operación atómica. Se cobra **antes** de llamar al modelo; si la IA falla, `refund(uid, requestId)` devuelve el crédito. |
| Concurrencia | Firestore reintenta la transacción si otra modificó el documento. **Probado:** 20 solicitudes simultáneas con 3 créditos → exactamente 3 cobradas y 17 rechazadas con `INSUFFICIENT_CREDITS`. |
| Reintentos sin doble cobro | Cada solicitud tiene un `requestId` (lo genera el cliente o el proxy). El cobro queda en `users/{uid}/creditLedger/consume_{requestId}`, y repetirlo no vuelve a cobrar. |
| Recarga diaria validada en el servidor | Dentro de la misma transacción: si el saldo es ≤ 0 y `lastCreditReset` no es el día UTC del **reloj del servidor**, se recarga a 5. El cliente no puede adelantar la fecha. |
| El usuario no activa planes pagos | Solo `applyPlanPurchase(uid, planId, paymentId)`, llamado por el webhook **verificado** (Fase 5). Es idempotente por `paymentId`. No hay endpoint para el cliente. |
| Prueba gratis única | `startFreeTrial(uid)`, transaccional, rechaza con `TRIAL_ALREADY_USED`. |
| Vencimiento | `expireIfDue(uid)` pasa a `expired` un plan vencido. Se invoca en `getBalance` o con un job diario (Cloud Scheduler, dentro de la capa gratuita). |
| Auditoría | Cada movimiento deja una entrada en `creditLedger`. El usuario la puede leer y solo el servidor la puede escribir (regla ya activa en la Fase 3A). |

**Sin migración de datos:** el servicio usa los mismos campos de `users/{uid}` que ya lee la app (`UserCreditStats`, `Sidebar`, etc.).

**Planes y precios:** se toman de `src/constants.ts` sin cambios. Al pagar, los créditos del plan **se suman** al saldo y vencen con el plan; los saldos anteriores no vencen. Es el modelo aprobado de créditos por origen (`CREDITS_BUCKETS_PROPOSAL.md` §8; antes reemplazaban el saldo).

## 3. Despliegue coordinado (Fase 4): qué va junto

Las reglas finales (`clientCreditTransitionsEnabled()` → `false`) **rompen la IA** si se publican antes de que el cliente deje de escribir créditos. Por eso se despliega en este orden, sin saltear pasos:

| Paso | Cambio | ¿Se puede hacer solo? |
|---|---|---|
| 0 | **Decisión de base de datos:** el servidor debe usar la misma base que la app (`FIREBASE_DATABASE_ID` = base con nombre). Ver `FIRESTORE_DATABASES.md`. | Requisito previo |
| 1 | **Servidor:** proxy de IA (`/api/ai/generate`) que llama a `consume()` antes del modelo y a `refund()` si falla. Endpoints `GET /api/credits` (saldo, recarga y vencimiento) y `POST /api/credits/trial`. Rate limit por uid. | Sí: es compatible con el cliente actual |
| 2 | **Cliente:** `callGemini` y `generatePodcastAudio` pasan por el proxy; `getUserCredits` lee `GET /api/credits`; se eliminan `consumeCredit` y `updateSubscription`; la prueba gratis pasa a `POST /api/credits/trial`; `ArenaView.handleBypassCooldown` usa un endpoint del servidor. | Solo después del paso 1 |
| 3 | **Reglas finales:** `return false; // CLIENT_CREDIT_TRANSITIONS` en `firestore.rules`, desplegadas en la base correcta (`FIRESTORE_RULES_DEPLOYMENT.md`). Ya están probadas en `tests/rules/firestore.final.test.ts`. | Solo cuando el paso 2 esté en producción **y** los clientes en caché se hayan actualizado (subir `VERSION` en `src/constants.ts` para forzar la limpieza) |
| 4 | **Webhook (Fase 5):** usar `applyPlanPurchase` después de verificar la firma y el monto. | Puede ir después, sobre la misma base |

**Vuelta atrás:** si algo falla después del paso 3, volver a publicar las reglas transicionales (`return true`) desde el historial de la consola. Es instantáneo y no toca datos.

## 4. Riesgos

- **Latencia:** cada solicitud de IA suma una transacción de Firestore (decenas de ms).
- **Costo de Firestore:** por solicitud, ~2 lecturas y 2 escrituras (saldo y ledger). Con miles de solicitudes diarias sigue dentro de la cuota gratuita o en centavos.
- **El ledger crece:** se puede agregar una política de TTL (por ejemplo, 180 días). Cada borrado se factura como un borrado normal.
- **Zona horaria:** la recarga diaria usa el día UTC, como hoy. Cambiarla a la hora de Argentina es una decisión de producto.
