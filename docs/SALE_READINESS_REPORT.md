# StudySanctuary: estado para la venta

Versión **1.1.0-rc.1**, rama `release-candidate-1.1`, 22/10/2026. Distingue tres cosas:
- qué se puede vender hoy **como código fuente**;
- qué falta para venderlo **como SaaS en funcionamiento**;
- qué **dependencias y costos** asume el comprador.

Documentos relacionados:
- [`SALE_PACKAGE.md`](./SALE_PACKAGE.md): paquete comercial.
- [`BUYER_RISKS.md`](./BUYER_RISKS.md): riesgos.
- [`LICENSING_AND_IP.md`](./LICENSING_AND_IP.md): licencias y propiedad intelectual.

## Veredicto

| Modalidad | ¿Se puede ofrecer hoy? | Condición |
|---|---|---|
| **Código fuente transferible** | **Sí** | Con contrato de cesión que declare el origen en AI Studio, el uso de IA y las licencias de terceros. Debe aclarar que los textos legales son borradores y que la versión no está desplegada. |
| **SaaS en funcionamiento** | **No todavía.** No debe presentarse como SaaS en producción ni como negocio con ingresos demostrados. | Faltan los bloqueantes de la sección B: revisión legal, borrado de cuenta, edad, despliegue y pruebas con servicios reales |

## A. Listo para vender como código fuente

**Funcionalidades** (verificadas con IA y pagos simulados):

| Área | Estado |
|---|---|
| Cuentas | Ingreso con Google o Apple (Firebase Auth); perfil; panel de administración por claim |
| Estudio con IA | Resumen, flashcards, examen, plan adaptativo, ejercicios, esquema, tutor, matemática, podcast con voz, guías de libros, mapa |
| Organización | Cursos con archivos, calendario con recordatorios dentro de la app, tareas, actividad, grupos de estudio, feedback |
| Arena | Trivia con vidas, rachas, ranking por nivel y álbum de cartas |
| Créditos | Calculados en el **servidor** con transacciones: recarga diaria, prueba única, devolución si la IA falla, límites por usuario. **Créditos por origen:** las compras suman; los de la prueba y los planes vencen con aviso previo; los históricos no vencen. |
| Pagos | Mercado Pago Checkout Pro, **pagos únicos**: webhook con firma, idempotente; valida monto, moneda y plan; maneja pendientes, rechazos, reembolsos (quitan solo lo no usado de ese pago) y contracargos |
| Integraciones | Google Drive (permiso mínimo `drive.file`) y Calendar; Outlook Calendar |

**Calidad del código:**

| Área | Estado |
|---|---|
| Seguridad | Ninguna clave privada en el cliente (verificado en el build). Reglas de Firestore y Storage probadas. IA solo desde el servidor. Encabezados y CSP (en modo de reporte). Secretos en la configuración del servidor. |
| Pruebas | **158** unitarias, **93** en el emulador de Firebase (incluidas compatibilidad y concurrencia de créditos), **2** del build y **96** verificaciones en el navegador. Todas pasan. |
| Dependencias | 0 vulnerabilidades críticas. Las 12 restantes son de herramientas de desarrollo o no tienen corrección publicada (`DEPENDENCIES.md`). 623 paquetes de producción inventariados (`THIRD_PARTY_LICENSES.md`). |
| Demo | `npm run demo`: sin credenciales, sin costos, funciona sin conexión, con capturas reales y cuentas de ejemplo (`DEMO.md`) |
| Documentación | Instalación, configuración, transferencia, servicios, costos, licencias y propiedad intelectual, operación, informes de cada fase, paquete de venta, riesgos y borradores legales |
| Contenido | Sin testimonios inventados, promesas no implementadas ni comparaciones de precio falsas; con guardas de prueba |

**El contrato debe aclarar:**
- licencia y cesión de derechos: el proyecto empezó en Google AI Studio y se escribió con asistencia de IA (`LICENSING_AND_IP.md`);
- que `react-leaflet` usa la licencia Hippocratic-2.1, y que la música (SoundHelix) y los mapas (Esri) no tienen licencia comercial confirmada;
- que los textos legales son **borradores**;
- que `release-candidate-1.1` **no está fusionada** en `main` ni desplegada (`RELEASE_1.1.md`).

## B. Lo que falta para venderlo como SaaS en funcionamiento

**Bloqueantes:**

| # | Pendiente | Responsable | Detalle |
|---|---|---|---|
| B1 | **Revisión legal** de privacidad y términos, más los puntos pendientes (reembolsos, menores, conservación, jurisdicción, cookies) | Abogado y comprador | `docs/legal/` |
| B2 | **Borrar y exportar la cuenta** desde la app | Desarrollo | Hoy se gestiona por email. Lo exige la normativa de datos personales. |
| B3 | **Edad mínima o consentimiento parental** (hay niveles inicial y secundario) | Abogado y desarrollo | `BUYER_RISKS.md` L2 |
| B4 | **Decidir la base de Firestore** (`(default)` o la base con nombre) y conciliar los datos | Propietario | Script de comparación de solo lectura listo (`FIRESTORE_DATABASES.md`) |
| B5 | **Fusionar y desplegar** `release-candidate-1.1` en el orden documentado, y publicar las reglas finales | Propietario | Requiere aprobación; nada se desplegó (`RELEASE_1.1.md`) |
| B6 | Probar en el **sandbox de Mercado Pago**: firma del webhook, pendiente que se aprueba después, reembolso | Comprador | No se pudo hacer sin credenciales (`PHASE5_PAYMENTS.md` §5) |
| B7 | Probar con **Gemini real**: modelos de respaldo, voz, costo real por acción | Comprador | Con una clave de prueba y presupuesto acotado |
| B8 | **Verificación de Google** de la app OAuth (Calendar es un permiso sensible) | Comprador | Sin CASA (Drive usa solo `drive.file`) |
| B9 | **Música y mapas** con licencia comercial (y atribución del mapa) | Comprador | `LICENSING_AND_IP.md` §5 |
| B10 | **Rotar secretos** y quitar el email y los accesos del vendedor | Ambos | `SECURITY_CREDENTIALS.md`, `SALE_AND_TRANSFER.md` §6 |

**Recomendados:**

| # | Pendiente | Detalle |
|---|---|---|
| R1 | Revisar precios: el podcast cuesta 15–30 veces más que otras acciones con el mismo crédito; el Trimestral cuesta más por crédito que el Mensual; la cuota gratuita | Decisión de negocio; los precios no se tocaron |
| R2 | Banner de consentimiento de cookies (si se usa Google Tag Manager) | Depende de la revisión legal |
| R3 | Sesiones y tokens en un almacenamiento persistente para escalar a más de 1 instancia | `SESSIONS_LOW_COST.md` |
| R4 | Pasar la CSP a modo bloqueante después de revisar los reportes | — |
| R5 | Pantalla de administración para pagos marcados para revisión y reembolsos parciales | Hoy se revisan en Firestore |
| R6 | Arena validada en el servidor (hoy los puntos se pueden inflar) | — |
| R7 | Alojar en el propio dominio las imágenes de terceros | `LICENSING_AND_IP.md` §5 |
| R8 | Asistente de voz (experimental, desactivado): activarlo o quitarlo | Decisión de producto |
| R9 | Facturación fiscal de los planes | Fuera de la app |
| R10 | `xlsx` desde el CDN de SheetJS | `DEPENDENCIES.md` |

## C. Dependencias y costos que asume el comprador

> Precios de referencia consultados el 21/10/2026. **Cambian: verificalos** (`SALE_AND_TRANSFER.md` §3).

| Servicio | ¿Obligatorio? | Costo estimado | Notas |
|---|---|---|---|
| Google Cloud / Firebase (Cloud Run, Firestore, Auth, Storage) | Sí | **US$ 0–10/mes** con pocos cientos de usuarios activos (niveles gratuitos) | La base con nombre podría no tener nivel gratuito: verificar |
| **Gemini API** | Sí (IA) | **≈ US$ 0,003** por acción de texto; **US$ 0,05–0,10** por podcast; hasta ≈ US$ 0,18/día por usuario gratuito muy activo en herramientas del curso | **Es el costo principal.** Configurar alertas de presupuesto. |
| Mercado Pago | Para cobrar | Comisión por cobro (≈ 6,29% + IVA con crédito y acreditación inmediata, según terceros) | Cuenta propia del comprador |
| Google OAuth (Drive y Calendar) | Opcional | Gratis | Verificación de la app (sin CASA) |
| Música y teselas de mapas con licencia comercial | Sí, si se mantienen esas funciones | Variable (hay planes gratuitos con límites) | `LICENSING_AND_IP.md` §5 |
| Dominio, email de soporte | Sí | Variable | — |
| Google Tag Manager | Opcional | Gratis | Requiere consentimiento de cookies |
| Revisión legal | Sí, para operar | Honorarios profesionales | Privacidad, términos, cesión, datos personales, menores, consumo |
| Desarrollo pendiente (sección B) | Para operar | Horas de desarrollo | B2 y B3 son los más relevantes |

**Requisitos técnicos:** Node 22+, Java 21 (solo para emuladores y pruebas), cuenta de Google Cloud con facturación y `gcloud`.

## D. Modelo de créditos (decidido e implementado)

| Decisión | Elegida | Implementación |
|---|---|---|
| 1. Prueba gratis | **B:** los créditos de las pruebas nuevas vencen a los 7 días; los históricos no se modifican | ✅ |
| 2. Reembolsos parciales | **B:** revisión manual | ✅ (el pago queda marcado) |
| 3. Vencimiento del plan | **A:** sus créditos vencen al terminar, con aviso previo; los históricos y los comprados aparte no se eliminan | ✅ (aviso 7 días antes) |
| 4. Paquetes de créditos | **A:** no se venden por ahora | ✅ (sin producto nuevo) |

Detalle, pruebas y pasos de despliegue: `CREDITS_BUCKETS_PROPOSAL.md` §8.
