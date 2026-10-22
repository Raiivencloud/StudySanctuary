# Créditos separados por origen

**Estado:** **aprobado e implementado en desarrollo** (rama `release-candidate-1.1`). Las decisiones y lo implementado están en la **sección 8**. Las secciones 1 a 7 conservan el análisis original. Nada se desplegó ni se tocaron datos de producción.

Responde a tus decisiones 2, 3 y 4:
- **2.** Una compra no elimina los créditos que el usuario ya tiene.
- **3.** Los créditos de un plan vencen con el plan; los comprados aparte no vencen nunca.
- **4.** Un reembolso revoca solo lo no usado, registra lo consumido y nunca deja el saldo en negativo.

## 1. El problema hoy

Hay un solo número: `users/{uid}.remainingCredits`. No se sabe de dónde salió cada crédito. Por eso:
- al comprar un plan, la única regla posible fue **reemplazar** el saldo (se pierden los créditos que el usuario tenía);
- al vencer el plan, no se puede saber qué créditos eran del plan;
- en un reembolso, no se puede distinguir lo usado de lo no usado.

## 2. Modelo propuesto: "bolsas" de créditos

Cada usuario tiene una lista de bolsas en su perfil (`users/{uid}.creditBuckets`). `remainingCredits` **se mantiene** como el total, porque es lo que la app ya lee: el cliente y las pantallas no cambian.

| Tipo | Origen | Vence | Ejemplo |
|---|---|---|---|
| `free` | Recarga diaria gratuita (5 por día, solo con saldo 0) | No (igual que hoy) | `free` |
| `promo` | Prueba gratis y futuras promociones | Opcional, por promoción. La prueba gratis **no vence**, igual que hoy | `trial` |
| `legacy` | **Saldo existente al activar el modelo** | **Nunca** | `legacy` |
| `plan` | Compra de un plan (Mensual, Trimestral, Anual) | **Al terminar el plan** (decisión 3) | `payment_<id>` |
| `purchased` | Paquetes de créditos comprados aparte (producto futuro; hoy no existe) | **Nunca** (decisión 3) | `payment_<id>` |

Cada bolsa guarda su saldo, lo otorgado originalmente, el vencimiento y el pago que la generó. Así se puede informar qué parte se consumió.

**Orden de consumo:** primero lo que vence antes (gratis y promociones, después los planes por fecha de vencimiento). Al final, lo que no vence: primero `legacy` y después `purchased`. Así el usuario aprovecha los créditos que se le van a vencer y conserva los que pagó aparte.

## 3. Cómo se preservan los saldos existentes

- **Migración perezosa, sin proceso masivo:** la primera vez que el servidor toca a un usuario (consultar el saldo, cobrar o acreditar), su `remainingCredits` actual se convierte en una bolsa `legacy` **que nunca vence**. Nadie gana ni pierde créditos. No hay que correr un script sobre producción.
- **Por qué `legacy` y no "plan":** hoy no se puede saber qué parte del saldo de un usuario con plan activo vino de ese plan. Tratarlo como plan haría vencer créditos que hoy se conservan. La opción conservadora es que **todo lo existente se conserve**, y solo los créditos otorgados **después** del cambio siguen las reglas nuevas.
- **Seguridad ante una vuelta atrás:** si se vuelve a la versión anterior (que solo conoce el total) y después se reactiva el modelo, la diferencia entre el total y las bolsas se ajusta en la bolsa `legacy`. **El usuario conserva el total que veía.**

## 4. Reglas propuestas

| Evento | Hoy | Propuesta |
|---|---|---|
| Compra de un plan | El saldo **se reemplaza** por los créditos del plan | Se **agrega** una bolsa `plan`, con vencimiento igual al del plan. Las demás no se tocan. |
| Compra de otro plan con uno activo | Reemplaza el saldo y la fecha | Se agrega otra bolsa con su propio vencimiento. El plan visible (insignia, nombre) es el último comprado y su fin es el más lejano. |
| Vencimiento del plan | Se marca vencido y **los créditos se conservan** | Los créditos **no usados de esa bolsa** se eliminan, con una entrada `credits_expired` en el libro mayor. Las bolsas `legacy`, `purchased` y `free` no se tocan. |
| Reembolso o contracargo total | El plan se revoca y el saldo queda en **0** (Fase 5) | Se eliminan **solo los créditos no usados de ese pago**, se registra cuántos se consumieron, se revoca el plan si es el vigente y la bolsa queda cerrada. **Nunca hay saldo negativo**: no se descuenta de otras bolsas. |
| Reembolso parcial | Se marca para revisión | Se revoca la parte proporcional de lo otorgado, con tope en lo no usado, y se registra. Opcional: mantener la revisión manual. |
| Acción de IA que falla | Se devuelve el crédito | Se devuelve a la bolsa de la que salió, salvo que haya vencido o se haya cerrado por un reembolso. |
| Recarga diaria y prueba gratis | 5 por día con saldo 0; 15 una vez | **Igual** |

**Ejemplos:**
- Usuario con 40 créditos que compra el Mensual: hoy queda con 300; con la propuesta, con **340**. Si a los 30 días le sobran 100 del plan, vencen esos 100 y conserva los 40.
- Usuario que compra el Trimestral (1000), usa 120 y pide el reembolso: se revocan 880 y se registra que consumió 120. Si tenía 30 créditos `legacy`, los conserva.

## 5. Cambios técnicos al implementarlo (no hechos)

1. `creditService` y `paymentService` usan las funciones del módulo dentro de sus transacciones actuales. La atomicidad y la idempotencia no cambian: todo vive en el mismo documento del usuario más el libro mayor.
2. **Reglas de Firestore:** se agrega `creditBuckets` a `economicFields()`, para que el cliente no pueda escribirlo. Es imprescindible: el servidor confiaría en esas bolsas.
3. `GET /api/credits` puede devolver el desglose (opcional, para mostrar "100 vencen el 20/11").
4. Libro mayor: entradas nuevas `credits_expired` y `plan_revoked` (con `consumed` y `revoked`).
5. Las bolsas de pagos con saldo 0 se conservan para poder procesar contracargos tardíos. Se pueden depurar después de 12 meses.

## 6. Pruebas de compatibilidad

**Hechas** (`tests/unit/creditBuckets.test.ts`, 14/14):
- Migración: cualquier saldo existente (0, 1, 5, 15, 120, 300, 5000) se conserva exacto en `legacy`. Valores inválidos o bolsas con tipos inventados no crean créditos.
- Un usuario con plan activo conserva todo su saldo al vencer el plan (como hoy).
- Paridad con hoy: recarga diaria (5, solo con 0, una vez por día) y consumo (−1 por acción, sin saldo falla).
- Decisión 2: comprar suma (40 + 300 = 340), una sola vez por pago.
- Orden de consumo: lo que vence primero.
- Decisión 3: al vencer, solo se eliminan los créditos del plan; `legacy` y `purchased` quedan.
- Decisión 4: un reembolso revoca solo lo no usado y registra lo consumido. Nunca hay saldo negativo, aunque el usuario haya gastado más que el plan. Reembolso parcial proporcional con tope.
- Las devoluciones de IA vuelven a su bolsa, salvo si venció o se cerró por un reembolso.
- Vuelta atrás: si el código viejo modificó solo el total, se reconcilia al total visible.
- 2000 operaciones aleatorias: el total siempre es igual a la suma de las bolsas, sin negativos ni decimales.

**Al implementarlo** (emulador): las suites actuales de créditos, IA y pagos adaptadas, más:
- usuarios reales anonimizados (solo saldos) migrados en el emulador;
- concurrencia de compras y consumos;
- un usuario con datos de la versión anterior que se migra en su primera solicitud;
- la vuelta atrás y el regreso.

## 7. Decisiones que necesito antes de implementar

En todos los casos, los saldos que existan al activar el modelo **se conservan sin vencimiento** (bolsa `legacy`): las respuestas solo afectan a los créditos otorgados después.

### Pregunta 1: ¿Los créditos de la prueba gratis vencen a los 7 días?
Hoy no vencen. El plan se llama "7 DÍAS GRATIS" y promete "Acceso completo por 7 días".

| Alternativa | Consecuencias |
|---|---|
| **A. No vencen** (como hoy) | Simple y favorable al usuario. El nombre "7 días" no se corresponde con nada concreto: los 15 créditos se pueden usar en cualquier momento. |
| **B. Vencen a los 7 días** | Coherente con el nombre de la oferta. Acota el costo de IA de cuentas inactivas e incentiva usar la prueba. Hay que avisar el vencimiento (ya existe la notificación "Tu período de prueba termina…"). |

**Recomendación: B**, solo para las pruebas que se activen después del cambio, y con el vencimiento visible en la pantalla de planes.

### Pregunta 2: Reembolso parcial: ¿revocación proporcional automática o revisión manual?
Hoy se registra y se marca para revisión, sin tocar el plan.

| Alternativa | Consecuencias |
|---|---|
| **A. Proporcional automática** (por ejemplo, 50% reembolsado → se revoca el 50% de lo otorgado, con tope en lo no usado) | Sin trabajo manual y predecible. Pero un reembolso parcial lo **inicia el propio vendedor** en Mercado Pago, a menudo como compensación (una caída del servicio, un error), y en ese caso no querría quitar créditos. |
| **B. Revisión manual** (como hoy) | El operador decide según el motivo. Requiere mirar los pagos marcados (`payments` con `needsReview`); hoy no hay pantalla de administración para eso. |

**Recomendación: B.** Los reembolsos parciales son poco frecuentes y deliberados. Los reembolsos **totales** y los contracargos siguen siendo automáticos.

### Pregunta 3: Al vencer el plan, ¿sus créditos no usados se eliminan de inmediato o hay un margen?
Hoy **no se eliminan**: al vencer, el plan pasa a "vencido" pero los créditos quedan.

| Alternativa | Consecuencias |
|---|---|
| **A. Inmediato** | Coincide con "Plan activo por N días" y es fácil de explicar en los términos. Algún usuario puede perder créditos que no vio que vencían. |
| **B. Margen de 3 días** | Menos reclamos. La regla es más difícil de explicar, y en la práctica el plan dura 3 días más. |
| **C. Inmediato, pero si compra otro plan antes del vencimiento, los créditos no usados pasan al nuevo plan** | Incentiva la recompra y es favorable al usuario. Es algo más complejo (una regla más en la compra). |

**Recomendación: A**, con aviso previo: la notificación "Tu plan termina pronto" ya existe (7 días antes) y la fecha de fin se ve al comprar y en la pantalla de éxito. Como opción posterior, C.

### Pregunta 4: ¿Se ofrecen paquetes de créditos sueltos (`purchased`)?
Hoy no existen. El modelo los soporta y nunca vencen (decisión 3).

| Alternativa | Consecuencias |
|---|---|
| **A. No, por ahora** | Nada nuevo que fijar ni mantener. Quien necesite más créditos compra otro plan (con la decisión 2, los créditos se **suman**). |
| **B. Sí** | Ingreso adicional sin cambiar los planes. Hay que definir producto y precio (**tu aprobación**). Los créditos que no vencen son un pasivo indefinido: si el costo de la IA sube, se siguen honrando al costo nuevo. |

**Recomendación: A.** Dejarlo como opción para el comprador; el código ya lo contempla.

### Dato relacionado (sin cambios: los precios no se tocan)
Precio por crédito:
- Mensual: $1.200 / 300 = **$4,00**
- Trimestral: $4.200 / 1.000 = **$4,20**
- Anual: $12.000 / 5.000 = **$2,40**

**El Trimestral es más caro por crédito que el Mensual**, y comprar tres Mensuales ($3.600, 900 créditos) cuesta menos que un Trimestral. Por eso se quitaron los textos "¡Ahorrás $2.800!" y los precios tachados (`PHASE7_COMMERCIAL_BLOCKERS.md`). Revisar los precios es una decisión tuya.

## 8. Decisiones aprobadas e implementación

| # | Decisión | Implementación |
|---|---|---|
| 1 | **B.** Los créditos de las pruebas nuevas vencen a los 7 días; los históricos no se modifican | `startFreeTrial` **suma** 15 créditos en una bolsa `trial` que vence a los 7 días (antes reemplazaba el saldo). Solo vencen los no usados (`expired_trial` en el historial). |
| 2 | **B.** Reembolsos parciales: revisión manual | Sin cambios automáticos: el pago queda marcado `needsReview: partial_refund`, como antes. |
| 3 | **A.** Los créditos del plan vencen al terminar, con aviso previo; los históricos y los comprados aparte no se eliminan | La compra **suma** una bolsa `payment_<id>` que vence con ese plan. La campana avisa 7 días antes: "Tu plan termina pronto… Los créditos del plan que no uses vencen ese día", o "Créditos por vencer" (por ejemplo, la prueba). `/api/credits` devuelve `expiring` con la cantidad y la fecha. |
| 4 | **A.** Sin paquetes de créditos | No se vende nada nuevo. `grantPurchased` existe en el módulo, pero ningún flujo lo usa (una prueba lo verifica). |

**Cómo funciona ahora:**
- **Saldo existente:** en la primera operación de cada usuario, todo su saldo pasa a una bolsa `legacy` que **no vence nunca** y queda registrado en `migration_legacy`. Nadie gana ni pierde créditos.
- **Orden de consumo:** primero lo que vence antes (prueba, planes por fecha); después lo que no vence (recarga diaria, histórico).
- **Si la IA falla:** el crédito vuelve a la bolsa de la que salió. Si esa bolsa ya venció, no revive. Los cobros hechos con el código anterior vuelven al saldo histórico.
- **Recarga diaria:** sin cambios (5 créditos con saldo 0, una vez por día UTC). No vence.
- **Reembolso total o contracargo:** quita solo los créditos **no usados de ese pago**, registra los consumidos (`creditsConsumed`) y nunca deja saldo negativo. Si el plan reembolsado se compró **antes** de este modelo, sus créditos ya son históricos: **no se quitan**, el plan se revoca igual y el pago queda para revisión (`reviewReason: revoked_without_bucket`).
- **Varios planes:** cada uno vence en su fecha; la suscripción muestra la fecha de fin más lejana.
- **Vuelta atrás:** si se despliega el código anterior, este sigue funcionando porque escribe `remainingCredits`. Al volver al nuevo, la diferencia se absorbe en la bolsa histórica: el usuario conserva el total que veía.

**Archivos:** `server/credits/creditService.ts` (reescrito sobre `creditBuckets.ts`, misma API), `server/payments/paymentService.ts` (otorga y revoca por bolsa), `server/routes/credits.ts` (`expiring`), `firestore.rules` (`creditBuckets` es un campo económico: el cliente no puede escribirlo), `src/lib/studyStats.ts`, `src/components/Header.tsx` y `src/services/userService.ts` (aviso), `src/legal/terms.md` (reglas en el borrador de términos), `scripts/demo/seed.ts`.

**Pruebas:**

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `tests/rules/creditModel.emulator.test.ts` | 11 | **Nuevo.** Migración exacta de saldos existentes (incluidos 0 y sin campo); vuelta atrás del código; vencimiento de la prueba y de cada plan; aviso; devolución a la bolsa de origen; cobros del código anterior; recarga diaria. **Concurrencia:** 46 operaciones simultáneas (6 notificaciones del mismo pago, 5 pruebas, 30 consumos, 5 lecturas): el plan y la prueba se otorgan **una vez**, cada crédito queda contabilizado y el total coincide siempre con la suma de las bolsas. 8 devoluciones simultáneas devuelven una sola vez. |
| `tests/rules/payments.emulator.test.ts` | actualizado | La compra suma; el reembolso deja los créditos previos y registra los consumidos; el contracargo de un plan viejo quita solo sus 300 no usados; un pago del webhook anterior conserva el saldo histórico y queda para revisión |
| `tests/rules/creditService.test.ts` | actualizado | La compra suma; al vencer el plan, sus créditos no usados vencen |
| `tests/unit/creditModel.test.ts` | 4 | **Nuevo.** Aviso de vencimiento (cuándo sí y cuándo no, sin duplicar el aviso del plan), reglas en los términos, sin paquetes de créditos |

**Antes de desplegar en producción** (requiere tu aprobación):
1. Desplegar el servidor **junto con** las reglas (`creditBuckets` en `economicFields`).
2. Revisar con `ops/` los usuarios con planes activos: sus créditos pasan a históricos y **no vencerán** (decisión 1/3: los históricos no se modifican).
3. Comunicar el cambio a los usuarios. Desde ahora, las compras suman créditos y los créditos de los planes nuevos vencen.
