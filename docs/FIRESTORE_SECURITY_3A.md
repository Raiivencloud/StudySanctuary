# Fase 3A: Informe de seguridad de Firestore

Rama local: `firestore-security-3a`. **No se desplegó nada ni se modificaron datos ni reglas de producción.** Todo se verificó con el Firebase Emulator (`npm run test:rules`, proyectos `demo-*`).

## 1. Resultado de las pruebas

| Suite | Resultado |
|---|---|
| `firestore.rules.test.ts`: reglas nuevas, modo transicional | **36/36** |
| Misma suite con las **reglas anteriores** (control) | 16/36: fallan las escaladas y varias conductas rotas, lo que demuestra que las pruebas detectan los problemas |
| `firestore.final.test.ts`: modo final, sin escrituras económicas del cliente | **4/4** |
| `storage.rules.test.ts` | **4/4** |
| `creditService.test.ts`: servidor de créditos (Fase 3B) | **8/8**, incluida la concurrencia |
| `opsScripts.test.ts`: scripts de operación (solo lectura y claims) | **4/4** |

## 2. Vulnerabilidades corregidas (en las reglas; efectivas al desplegar)

| # | Pedido | Antes | Ahora | Auditoría |
|---|---|---|---|---|
| 1 | Autoasignarse privilegios de admin | `role: 'admin'` en el propio perfil daba acceso total | `isAdmin()` = *custom claim* `admin` o el email del propietario verificado. `role` no se puede escribir (solo `'user'` al crear). Un `role: 'admin'` ya existente **queda sin efecto**. | C-03 |
| 2 | Acceso a documentos privados de otros | Posible mediante el admin falso; además, el dueño podía "transferir" documentos a otro `userId` | Sin admin falso. `userId` inmutable en tareas, exámenes, actividades, chats, archivos y progreso de libros | C-03 |
| 3 | Estadísticas e interruptor de IA | Cualquier usuario escribía `stats/*` | Escritura solo de admin o servidor. El cliente sigue leyendo. | A-03, A-04 |
| 4 | Mensajes de chats | Cualquier usuario leía y escribía los mensajes de cualquier chat | Solo el dueño del chat padre (o un admin) | A-03 |
| 5 | Grupos de estudio | El creador **no podía** quedar admin (bug); un admin no creador no podía editar el grupo | El creador queda admin (membresía `admin` permitida solo a él) y se lo reconoce como admin y miembro aunque falte la membresía (**grupos viejos recuperan su admin**). `createdBy` inmutable. Los miembros no se autopromueven. | A-03 |
| 6 | Rankings y puntuaciones | Puntos y créditos de Arena arbitrarios | Se exige la fórmula de `ArenaView` (racha +1 y `10 + 2 × racha` puntos), como máximo 1 respuesta correcta por segundo, `credits` y `maxLives` inmutables, y vidas solo −1 o restauración desde 0. El ranking **debe coincidir** con los puntos registrados del usuario. Se valida la forma de las cartas y las preguntas. | A-03 |
| 7 | Feedback sin moderación | `isPublic: true` desde el cliente aparecía en la landing | Se crea siempre privado (`isPublic: false`, con `publicCandidate` como sugerencia). Solo un admin lo publica. El autor puede leer el suyo. | A-03 |
| — | Créditos, planes y prueba gratis | Cualquier valor | **Modo transicional:** solo −1 crédito, recarga a 5 una vez por día UTC con saldo 0 y la prueba gratis una sola vez. No se pueden activar planes pagos ni reiniciar la prueba. No se puede borrar el propio perfil para recrearlo. `creditLedger` solo lo escribe el servidor. | C-03, C-04 |

## 3. Qué sigue abierto

| Tema | Por qué sigue abierto | Fase |
|---|---|---|
| **El cliente todavía ejecuta los créditos** (acotado) | Bloquearlo del todo rompe la IA hasta que el servidor cobre. El diseño, el servicio y las reglas finales ya están listos y probados. | 3B → 4 (`CREDITS_SERVER_MODEL.md`) |
| Doble uso de un crédito con dos pestañas a la vez | En el modo transicional, dos escrituras de −1 desde el mismo saldo leído pueden dar 2 usos por 1 crédito | 4 (transacción en el servidor) |
| **Arena: puntos "farmeables"** | Las respuestas correctas son legibles por el cliente (`arena_questions`), así que las reglas pueden exigir la fórmula y el ritmo, pero **no** verificar que la respuesta sea correcta. Restaurar vidas (cooldown o pago de 1 crédito) tampoco es verificable con reglas. Los rankings ya inflados **se mantienen** (no se tocaron datos). | Posterior: juego validado en el servidor |
| Grupos abiertos | Cualquier usuario puede unirse a cualquier grupo y leer sus notas (diseño actual del producto) | Decisión de producto (invitaciones o grupos privados) |
| Feedback publicado | No hay interfaz de moderación: un admin publica cambiando `isPublic` en la consola de Firebase | Herramienta de admin (posterior) |
| Email del propietario en las reglas | Respaldo de admin hasta asignar el claim | Fase 7 (transferencia) |
| Reglas en la base correcta | `firebase.json` publica solo en `(default)` | Despliegue (`FIRESTORE_RULES_DEPLOYMENT.md`) |
| `firestore.rules` ↔ servidor en bases distintas | Decisión pendiente | `FIRESTORE_DATABASES.md` |

## 4. Qué debe desplegarse junto (para no romper StudySanctuary)

Las reglas 3A requieren tres cambios pequeños del cliente, ya incluidos en esta rama:

| Cambio del cliente | Si las reglas se publican SIN este cambio |
|---|---|
| `userService.consumeCredit`: el registro en `stats/global` es no fatal | `consumeCredit` lanza un error: en el asistente de voz se pierde la respuesta de la IA y otras vistas muestran error tras generar |
| `FeedbackView`: `isPublic: false` + `publicCandidate` | Las opiniones con 4 o 5 estrellas fallan al enviarse |
| `ArenaView`: `lastAnsweredAt: serverTimestamp()` en las respuestas correctas | Cada respuesta correcta falla y la Arena deja de sumar puntos |

**Orden:**
1. Desplegar la app (cliente y servidor) de esta rama. Los cambios son compatibles con las reglas actuales.
2. Esperar a que los navegadores carguen la versión nueva (subir `VERSION` en `src/constants.ts` fuerza la limpieza de caché).
3. Desplegar `firestore.rules` en la base con nombre, siguiendo `FIRESTORE_RULES_DEPLOYMENT.md`.

**Vuelta atrás:** volver a publicar las reglas anteriores desde el historial de la consola. Es instantáneo.

Las reglas **finales** de créditos (`return false`) **no** se despliegan ahora: van con la Fase 4 (sección 3 de `CREDITS_SERVER_MODEL.md`).

## 5. Datos existentes: ¿algo queda inaccesible?

Ningún usuario pierde acceso de lectura a **sus** datos. Casos a tener en cuenta (no se modificó ningún dato):

| Caso | Efecto | ¿Requiere acción? |
|---|---|---|
| Mensajes "huérfanos": su chat padre no existe o no tiene `userId` | Solo un admin puede leerlos (antes los leía cualquiera). La app no los muestra, porque lista los mensajes desde el chat. | No. Se pueden contar con una consulta de solo lectura si querés confirmarlo. |
| Perfiles con `role: 'admin'` escrito por usuarios | Siguen en los datos, sin efecto | Opcional: limpieza con aprobación (modifica datos) |
| Rankings ya inflados | Siguen visibles; la próxima actualización de ese usuario debe coincidir con sus estadísticas | Opcional: limpieza con aprobación |
| Feedback ya publicado (`isPublic: true`) | Sigue publicado | No |
| Grupos creados con el bug (creador sin membresía) | **Recuperan** a su admin | No |
| Usuarios que querían borrar su perfil | Ya no pueden desde el cliente (ninguna función de la app lo hace) | No |
