# Propuesta: créditos separados por origen

**Estado:** propuesta, pendiente de aprobación. **El comportamiento económico actual no cambió.** El módulo `server/credits/creditBuckets.ts` existe y está probado (`tests/unit/creditBuckets.test.ts`, 14 pruebas), pero **ninguna parte de la app lo usa todavía**.

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

1. ¿Los créditos de la **prueba gratis** vencen a los 7 días? (Hoy no vencen. La propuesta mantiene que no venzan.)
2. **Reembolso parcial:** ¿revocación proporcional automática o revisión manual?
3. **Al vencer el plan:** ¿se eliminan sus créditos no usados de inmediato o se da un margen (por ejemplo, 3 días)?
4. ¿Se ofrecen paquetes de créditos sueltos (`purchased`)? El modelo los soporta, pero el producto y el precio son decisión tuya. **Sin tu aprobación no se crea ningún producto ni precio nuevo.**
