# Dependencias, vulnerabilidades y licencias

Revisión del 21/10/2026 con `npm audit` y `npm ls`. Para repetirla: `npm audit` y `npm run verify`.

## 1. Resultado

| | Antes | Después |
|---|---|---|
| Críticas | 1 | **0** |
| Altas | 22 | 4 (solo desarrollo o sin corrección publicada) |
| Moderadas | 20 | 7 |
| Bajas | 4 | 1 |
| **Total** | **47** | **12** |

### Cambios aplicados

| Cambio | Motivo | Verificación |
|---|---|---|
| `npm audit fix` (sin versiones mayores) | Corrigió 22 avisos: `axios`, `multer`, `compression`, `vite`, `react-router`, `websocket-driver` (la crítica), `dompurify`, `path-to-regexp`, `form-data`, `node-forge`, `postcss` y otros | Todas las suites |
| `firebase-admin` 13 → **14.5** | Resolvía `@google-cloud/firestore`, `@google-cloud/storage`, `google-gax`, `retry-request`, `teeny-request` y `uuid`. **Requiere Node 22** y la API modular. | Se migraron `server.ts`, `scripts/ops` y las pruebas a `firebase-admin/app`, `/auth` y `/storage`. Pruebas en el emulador: 82/82 |
| `mercadopago` 2 → **3.6** | `uuid` vulnerable. La versión 3 no tiene dependencias y conserva `MercadoPagoConfig`, `Preference.create` y `Payment.get` | Pruebas de pagos (unitarias y emulador) y arranque del build |
| `esbuild` 0.27 → 0.28 (desarrollo) | Lectura de archivos con el servidor de desarrollo en Windows | Build de producción |
| `overrides`: `@grpc/grpc-js ^1.14.6`, `qs ^6.16.1` | Todas las versiones de `firebase` (incluida la 13) fijan `@grpc/grpc-js ~1.9`, que es vulnerable, y `express` 4 traía `qs` 6.14 | Pruebas de reglas con el SDK cliente en Node y servidor HTTP |
| Se quitaron `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three` y `autoprefixer` | No se usaban. Eran unas 60 dependencias transitivas menos, incluida una sin licencia declarada (`webgl-constants`) | Build y bundle |
| `@types/leaflet` y `@types/multer` pasaron a `devDependencies` | Solo son tipos | `tsc` |
| `engines.node: ">=22"` | Lo exige `firebase-admin` 14. Cloud Run (buildpacks) usa esta versión. | — |
| Planillas de hasta 5 MB en Estudio IA | Mitiga los problemas de `xlsx` (sección 2) | — |

## 2. Vulnerabilidades aceptadas (sin corrección disponible)

| Paquete | Severidad | Dónde | Por qué se acepta | Acción recomendada |
|---|---|---|---|---|
| `xlsx` 0.18.5 (SheetJS) | Alta: *prototype pollution* y ReDoS al leer archivos manipulados | **Navegador**: el usuario abre **su propia** planilla en Estudio IA | El archivo nunca llega al servidor y solo afecta a la pestaña del mismo usuario que lo eligió. Hay un límite de 5 MB. SheetJS dejó de publicar en npm: la versión corregida (0.20.3) se distribuye en `cdn.sheetjs.com`, que no es accesible desde este entorno. | El comprador debería instalar `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` o reemplazarlo por `read-excel-file` |
| `mammoth` → `argparse`, `sprintf-js` | Moderada | Dependencias de la **interfaz de línea de comandos** de mammoth | La app solo usa `mammoth.extractRawText` en el navegador, que no las ejecuta. npm sugiere "bajar" a 0.3.29, que es una versión de 2016. | Ninguna. Revisar cuando salga una versión nueva. |
| `firebase-tools` (y `braces`, `chokidar`, `@google-cloud/pubsub`, `@opentelemetry/core`, `gaxios`, `uuid`) | Alta y moderada | **Solo desarrollo** (emuladores y despliegue de reglas) | No forma parte del build ni del servidor en producción. La última versión (15.34.1) mantiene los mismos avisos, y npm sugiere "bajar" a la 14. | Actualizar cuando Firebase publique una corrección |
| `esbuild` 0.27 dentro de `tsx` | Baja | Solo desarrollo, Windows | Dependencia interna de `tsx` | — |
| `@grpc/grpc-js` dentro de `firebase` | (resuelto con `overrides`) | El SDK cliente usa gRPC **solo en Node** (pruebas); en el navegador usa WebChannel | — | Quitar el `override` cuando Firebase actualice su dependencia |

## 3. Pendientes conocidos (no son vulnerabilidades)

| Tema | Detalle |
|---|---|
| `express-session` con `MemoryStore` | Avisa que no es apto para producción. Funciona porque `cloud-run.yaml` limita a **1 instancia**. Para escalar, usar un store compartido (decisión 2-B pendiente, `SESSIONS_LOW_COST.md`). |
| Versiones mayores disponibles | `firebase` 13 (cliente), `vite` 8, `@firebase/rules-unit-testing` 6. No resuelven avisos y conviene actualizarlas con calma después de la venta. |
| Bundle principal | `vendor` pesa 781 KB (203 KB gzip). Funciona, pero se puede optimizar con división de código. |

## 4. Licencias de las dependencias de producción

Casi todas son permisivas: MIT (508), Apache-2.0 (175), ISC (42), BSD (26), BlueOak, 0BSD, CC-BY-4.0 y Zlib.

| Paquete | Licencia | Observación |
|---|---|---|
| `react-leaflet`, `@react-leaflet/core` | **Hippocratic-2.1** | Licencia "ética", **no aprobada por la OSI**. Permite el uso comercial con condiciones (respeto de derechos humanos). **El comprador debería revisarla con un abogado**, o reemplazar `react-leaflet` por `leaflet` directo (MIT), que ya está instalado. |
| `lightningcss` | MPL-2.0 | Herramienta del build de Tailwind. Copyleft por archivo; no se distribuye modificado. Sin impacto. |
| `jszip` | (MIT OR GPL-3.0) | Se usa bajo MIT |
| `mercadopago` | MIT (en su `LICENSE`, aunque `package.json` no lo declara) | — |

**Licencia del propio proyecto:**
- No hay archivo `LICENSE`.
- Se marcó `"license": "UNLICENSED"` en `package.json` (software propietario, no publicado en npm) y se cambió el nombre del paquete de `react-example`, que venía de la plantilla, a `studysanctuary`.
- El contrato de venta debe definir la cesión de derechos. Ver `docs/SALE_AND_TRANSFER.md`.
