# Firestore: base `(default)` y base con nombre

> **Estado:** solo análisis. No se migraron, eliminaron ni modificaron datos. No se accedió a Firestore de producción: todo lo que sigue se deduce del código y debe confirmarse con el procedimiento de solo lectura de la sección 4.

## 1. Qué base usa cada parte del código

El proyecto de Firebase tiene (o tuvo) **dos bases de Firestore**:

- **`(default)`:** la base estándar de cualquier proyecto.
- **Una base con nombre**, creada por Google AI Studio. Su ID estaba en `firestoreDatabaseId` del `firebase-applet-config.json` original y ahora se configura con `VITE_FIREBASE_FIRESTORE_DATABASE_ID`.

| Componente | Base | Operaciones |
|---|---|---|
| **Cliente (toda la app)**: `src/firebase.ts` → `getFirestore(app, firestoreDatabaseId)` | **Con nombre** | Lee y escribe todas las colecciones: `users`, `user_courses` (+`content`), `tasks`, `activities`, `exams`, `chats` (+`messages`), `userFiles`, `bookProgress`, `groups` (+`members`, `notes`, `plans`), `feedback`, `stats`, `publicLibrary`, `arena_*` |
| **Servidor**: `server.ts` → `admin.firestore()` | **`(default)`** | **Webhook de Mercado Pago:** `set(merge)` en `users/{uid}` (`remainingCredits`, `subscriptionType`, `subscription.*`). **Panel de admin:** lee todos los `users` y `stats/global`. **Interruptor de IA:** escribe `stats/global.isAiSuspendedForFree`. |
| **Reglas e índices**: `firebase.json` → `"firestore": { "rules": "firestore.rules" }` (cómo desplegar en la base correcta: [`FIRESTORE_RULES_DEPLOYMENT.md`](./FIRESTORE_RULES_DEPLOYMENT.md)) | **Solo `(default)`** | `firebase deploy` publica `firestore.rules` **únicamente en `(default)`**. Las reglas de la base con nombre se gestionan por separado (posiblemente desde AI Studio o la consola). |
| **Firebase Auth** (cuentas de usuario) | No depende de la base | Las cuentas son del **proyecto**: no se ven afectadas por la base que se elija. |
| **Storage** (archivos) | No depende de la base | Bucket compartido. |

## 2. Consecuencias probables (requieren confirmación)

1. **Los pagos no llegan al usuario.** El webhook actualiza `users/{uid}` en `(default)`, pero la app lee los créditos y la suscripción de la base con nombre. El usuario que paga no vería sus créditos, salvo que alguien los haya cargado a mano.
   - Variante: si `(default)` **no existe**, la escritura del webhook falla con `NOT_FOUND`. El error se registra y Mercado Pago recibe igualmente `200 OK`, así que **no reintenta**.
2. **El panel de admin muestra datos de la base equivocada.** "Usuarios totales" contaría solo los documentos creados por el webhook en `(default)`, y "créditos consumidos" sería cerca de 0, porque el cliente los suma en `stats/global` de la base con nombre.
3. **El interruptor de IA escribe en `(default)`**, pero el cliente lee `stats/global` de la base con nombre. Esto se suma al hallazgo A-04: el interruptor nunca se aplica.
4. **Las reglas versionadas en el repositorio podrían no ser las que protegen los datos reales.** Hay que comparar en la consola las reglas activas de cada base.
5. **Fase 1:** si `VITE_FIREBASE_FIRESTORE_DATABASE_ID` no se define, el cliente pasa a usar `(default)` y la app parecería vacía. **Para conservar el comportamiento actual, hay que definirla con el ID de la base con nombre.**

## 3. Por qué no se cambió nada

Cambiar la base del servidor (`FIREBASE_DATABASE_ID`) altera el flujo de pagos y la fuente de datos del panel de admin. Unificar las bases requiere migrar datos. Las dos acciones necesitan una decisión informada **con datos reales**, así que el servidor sigue usando `(default)`, igual que antes.

## 4. Verificación de solo lectura (la ejecuta el propietario)

1. **Listar las bases:** consola de Firebase > Firestore (selector de base), o `gcloud firestore databases list --project <id>`.
2. **Comparar las reglas:** consola > Firestore > *Reglas*, con cada base seleccionada, contra `firestore.rules`.
3. **Contar documentos** sin ver su contenido: guía paso a paso en [`ops/FIRESTORE_COMPARISON.md`](./ops/FIRESTORE_COMPARISON.md). El script es de solo lectura, y eso está verificado con pruebas en el emulador.
4. **Logs de Cloud Run** (Logs Explorer): buscar `[Webhook] Subscription and credits updated` frente a `Webhook Error processing payment`. Así se sabe si el webhook llegó a escribir en `(default)`.
5. **Mercado Pago:** cruzar los pagos aprobados con los usuarios que tienen `subscription.lastPaymentId` en cada base.

## 5. Opciones (para decidir después de la verificación)

| Opción | Descripción | Ventajas | Riesgos |
|---|---|---|---|
| **A (recomendada)** | Apuntar el servidor a la base con nombre (`FIREBASE_DATABASE_ID=<id>`) y **conciliar** las suscripciones que el webhook haya escrito en `(default)`, copiándolas con `merge` a la base con nombre mediante un script revisado y con respaldo previo | No mueve los datos de los usuarios; es un cambio pequeño | Hay que desplegar las reglas en la base con nombre (`firebase.json` con `"database"`). Hay que conciliar con cuidado los pagos duplicados. |
| B | Migrar todo a `(default)` (exportar e importar) | Proyecto "estándar", más simple para el comprador | Migración completa, posible ventana de mantenimiento y riesgo de pérdida si se hace mal |
| C | Dejarlo como está | — | Los pagos siguen sin llegar (si la hipótesis se confirma) |

**Antes de cualquier opción:** hacer un respaldo con `gcloud firestore export gs://<bucket> --database=<id>`. Esto genera costo de almacenamiento y operaciones de lectura.
