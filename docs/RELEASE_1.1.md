# Versión 1.1.0-rc.1 (candidata)

Rama local `release-candidate-1.1`, 22/10/2026. **No se fusionó en `main`, no se publicó y no se desplegó.**

Es la versión consolidada: una sola rama con todas las fases, en orden y sin conflictos. `main` (`5506591`) queda intacto. Como el historial es lineal, fusionarla es un *fast-forward*.

## 1. Qué contiene

| Commit | Fase | Resumen |
|---|---|---|
| `49970fa` | 1 | Configuración por variables de entorno, sin secretos en el código |
| `af31553` | 2 | Endurecimiento del servidor: administración, subidas, sesiones, OAuth |
| `5e3f19e` | 2–3 | Pruebas de reglas en el emulador |
| `32b6210` | 3A / 3B | Reglas de Firestore y servicio de créditos en el servidor |
| `56e2abb` | 4 | IA solo desde el servidor, créditos transaccionales |
| `c64c0e2` | 4 | Validación en el navegador; mapa, Arena y Dashboard |
| `cc5a1ac` | 5 | Pagos de Mercado Pago verificados en el servidor e idempotentes |
| `7edad5a` | 6 | Demo segura, documentación, dependencias |
| `7fc939a` | 7 | Privacidad honesta, borradores legales, sin promesas falsas |
| `73ffb51` | Cierre | **Modelo de créditos por origen aprobado** (`CREDITS_BUCKETS_PROPOSAL.md` §8) |
| (este) | Cierre | Versión 1.1.0-rc.1, licencias, paquete de venta, riesgos |

**Cambios de esta etapa de cierre** (sin funcionalidades nuevas ni cambios de precios):
- **Créditos por origen.**
  - La prueba suma 15 créditos que vencen a los 7 días.
  - Los planes suman sus créditos, que vencen con el plan, con aviso 7 días antes.
  - Los saldos existentes no vencen nunca.
  - Los reembolsos quitan solo lo no usado de ese pago.
  - Los parciales se revisan a mano.
  - No se venden paquetes de créditos.
- **Versión:** `package.json` pasa a `1.1.0-rc.1` y `VERSION` (`src/constants.ts`) a `1.1.0`. Al cargar la versión nueva, los navegadores limpian el caché local de la app (no la sesión).
- **Limpieza:** se quitaron 4 MB de texturas sin uso y de origen desconocido (`public/assets/textures/`).
- **`npm run licenses`** genera `THIRD_PARTY_LICENSES.md`.
- **Documentación:** [`LICENSING_AND_IP.md`](./LICENSING_AND_IP.md), [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md), [`SALE_PACKAGE.md`](./SALE_PACKAGE.md), [`BUYER_RISKS.md`](./BUYER_RISKS.md) y este documento.

## 2. Verificación (sin servicios pagos)

Todo con emuladores locales, IA simulada (`AI_PROVIDER=fake`) y Mercado Pago simulado (`MERCADOPAGO_MODE=fake`).

| Suite | Resultado |
|---|---|
| `npm run verify`: tipos, 158 unitarias, escaneo de secretos del código, build sin secretos | ✅ **158/158**, **2/2**, sin secretos |
| `npm run test:rules`: reglas, créditos (incluidas 11 de compatibilidad y concurrencia), pagos, IA | ✅ **93/93** |
| Navegador sobre `npm run demo` | ✅ **96/96** |

Detalle del navegador:

| Recorrido | Resultado | Qué cubre |
|---|---|---|
| Recorrido de la demo | 23/23 | Landing, ingreso demo, panel, cursos, IA, planes, sin llamadas externas |
| IA (Fase 4) | 18/18 | Cobro, devolución si falla, sin crédito, móvil |
| Herramientas | 21/21 | Herramientas de estudio y del curso |
| Arena | 10/10 | Partida, ranking, vidas, saltar la espera con 1 crédito |
| Voz | 3/3 | Llamadas del asistente (desactivado en la interfaz) |
| Pagos | 17/17 | Aprobado (**suma** al saldo), reembolso (**quita solo lo del plan**), pendiente → aprobado, rechazado |
| Aviso de vencimiento | 4/4 | Créditos por origen en la demo, saldo total, aviso "Créditos por vencer" en la campana |

## 3. Cómo fusionar y desplegar (requiere aprobación del propietario)

1. **Fusionar:** `git checkout main && git merge --ff-only release-candidate-1.1`. Las ramas de fase quedan como historial.
2. **Desplegar** siguiendo [`PHASE4_REPORT.md`](./PHASE4_REPORT.md) §4. Paso 0, requisitos:
   - decidir la base;
   - hacer un respaldo;
   - crear una clave nueva de Gemini;
   - configurar las variables.

   Paso 1, servidor y cliente juntos. Paso 3, reglas finales. Agregar a esa guía:
   - **Pagos:** `MERCADOPAGO_WEBHOOK_SECRET` y la URL del webhook ([`PHASE5_PAYMENTS.md`](./PHASE5_PAYMENTS.md)). Probar antes en el **sandbox**.
   - **Créditos por origen:** no requieren migración previa. Cada usuario se migra solo en su primera operación, y su saldo pasa a "histórico" sin vencimiento. Si algún navegador con la versión anterior escribe `remainingCredits` mientras las reglas viejas lo permitan, el servidor absorbe la diferencia en el saldo histórico. El total que el usuario ve se conserva.
   - **Reglas finales:** incluyen `creditBuckets` entre los campos que solo escribe el servidor.
3. **Vuelta atrás:** volver a la revisión anterior de Cloud Run y de las reglas. Los datos nuevos (`creditBuckets`) no rompen el código anterior, que sigue usando `remainingCredits`.

## 4. Lo que esta versión **no** resuelve

Ver [`BUYER_RISKS.md`](./BUYER_RISKS.md). En resumen:
- revisión legal;
- borrado y exportación de la cuenta;
- edad y cookies;
- pruebas con Gemini real y con el sandbox de Mercado Pago;
- precio del podcast;
- música y mapas con licencia comercial;
- escalar a más de una instancia.
