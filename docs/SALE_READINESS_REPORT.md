# StudySanctuary: estado para la venta

Rama `phase7-commercial-blockers`, 22/10/2026. Distingue tres cosas: qué se puede vender hoy **como código fuente**, qué falta para venderlo **como SaaS en funcionamiento**, y qué **dependencias y costos** asume el comprador.

## A. Listo para vender como código fuente

**Funcionalidades** (verificadas con IA y pagos simulados):

| Área | Estado |
|---|---|
| Cuentas | Ingreso con Google o Apple (Firebase Auth); perfil; panel de administración por claim |
| Estudio con IA | Resumen, flashcards, examen, plan adaptativo, ejercicios, esquema, tutor, matemática, podcast con voz, guías de libros, mapa |
| Organización | Cursos con archivos, calendario con recordatorios dentro de la app, tareas, actividad, grupos de estudio, feedback |
| Arena | Trivia con vidas, rachas, ranking por nivel y álbum de cartas |
| Créditos | Calculados en el **servidor** con transacciones: recarga diaria, prueba única, devolución si la IA falla, límites por usuario |
| Pagos | Mercado Pago Checkout Pro, **pagos únicos**: webhook con firma, idempotente; valida monto, moneda y plan; maneja pendientes, rechazos, reembolsos y contracargos |
| Integraciones | Google Drive (permiso mínimo `drive.file`) y Calendar; Outlook Calendar |

**Calidad del código:**

| Área | Estado |
|---|---|
| Seguridad | Ninguna clave privada en el cliente (verificado en el build). Reglas de Firestore y Storage probadas. IA solo desde el servidor. Encabezados y CSP (en modo de reporte). Secretos en la configuración del servidor. |
| Pruebas | **154** unitarias, **82** en el emulador de Firebase, **2** del build y **92** verificaciones en el navegador. Todas pasan. |
| Dependencias | 0 vulnerabilidades críticas. Las 12 restantes son de herramientas de desarrollo o no tienen corrección publicada (`DEPENDENCIES.md`). |
| Demo | `npm run demo`: sin credenciales, sin costos, funciona sin conexión, con capturas reales y cuentas de ejemplo (`DEMO.md`) |
| Documentación | Instalación, configuración, transferencia, servicios, costos, licencias, operación, informes de cada fase y borradores legales |
| Contenido | Sin testimonios inventados, promesas no implementadas ni comparaciones de precio falsas; con guardas de prueba |

**Para venderlo como código, el contrato debe aclarar:**
- licencia y cesión de derechos (el proyecto empezó en Google AI Studio; ver `SALE_AND_TRANSFER.md` §7);
- que los textos legales son **borradores**;
- que las 8 ramas de trabajo **no están fusionadas** en `main`; orden de fusión en `PHASE4_REPORT.md` y `PHASE5_PAYMENTS.md`.

## B. Lo que falta para venderlo como SaaS en funcionamiento

**Bloqueantes:**

| # | Pendiente | Responsable | Detalle |
|---|---|---|---|
| B1 | **Revisión legal** de privacidad y términos, más los puntos pendientes (reembolsos, menores, conservación, jurisdicción, cookies) | Abogado y comprador | `docs/legal/` |
| B2 | **Borrar y exportar la cuenta** desde la app | Desarrollo | Hoy se gestiona por email. Lo exige la normativa de datos personales. |
| B3 | **Decidir la base de Firestore** (`(default)` o la base con nombre) y conciliar los datos | Propietario | Script de comparación de solo lectura listo (`FIRESTORE_DATABASES.md`) |
| B4 | **Fusionar las ramas y desplegar** en el orden documentado, y después publicar las reglas finales | Propietario | Requiere aprobación; nada se desplegó |
| B5 | Probar en el **sandbox de Mercado Pago**: firma del webhook, pendiente que se aprueba después, reembolso | Comprador | No se pudo hacer sin credenciales (`PHASE5_PAYMENTS.md` §5) |
| B6 | Probar con **Gemini real**: modelos de respaldo, voz, costo real por acción | Comprador | Con una clave de prueba y presupuesto acotado |
| B7 | **Verificación de Google** de la app OAuth (Calendar es un permiso sensible) | Comprador | Sin CASA (Drive usa solo `drive.file`) |

**Recomendados:**

| # | Pendiente | Detalle |
|---|---|---|
| R1 | Decisiones del modelo de créditos (4 preguntas) e implementación | `CREDITS_BUCKETS_PROPOSAL.md` §7 |
| R2 | Revisar precios: el Trimestral cuesta más por crédito que el Mensual; el podcast cuesta 15–30 veces más que otras acciones; la cuota gratuita | Decisión de negocio; los precios no se tocaron |
| R3 | Banner de consentimiento de cookies (si se usa Google Tag Manager) y verificación de edad | Depende de la revisión legal |
| R4 | Sesiones y tokens en un almacenamiento persistente para escalar a más de 1 instancia | `SESSIONS_LOW_COST.md` |
| R5 | Pasar la CSP a modo bloqueante después de revisar los reportes | — |
| R6 | Pantalla de administración para pagos marcados para revisión | — |
| R7 | Arena validada en el servidor (hoy los puntos se pueden inflar) | — |
| R8 | Alojar en el propio dominio las imágenes y la música de terceros, y revisar sus licencias | `SALE_AND_TRANSFER.md` §6 |
| R9 | Asistente de voz (experimental, desactivado): activarlo o quitarlo | Decisión de producto |
| R10 | Facturación fiscal de los planes | Fuera de la app |

## C. Dependencias y costos que asume el comprador

> Precios de referencia consultados el 21/10/2026. **Cambian: verificalos** (`SALE_AND_TRANSFER.md` §3).

| Servicio | ¿Obligatorio? | Costo estimado | Notas |
|---|---|---|---|
| Google Cloud / Firebase (Cloud Run, Firestore, Auth, Storage) | Sí | **US$ 0–10/mes** con pocos cientos de usuarios activos (niveles gratuitos) | La base con nombre podría no tener nivel gratuito: verificar |
| **Gemini API** | Sí (IA) | **≈ US$ 0,003** por acción de texto; **US$ 0,05–0,10** por podcast; hasta ≈ US$ 0,18/día por usuario gratuito muy activo en herramientas del curso | **Es el costo principal.** Configurar alertas de presupuesto. |
| Mercado Pago | Para cobrar | Comisión por cobro (≈ 6,29% + IVA con crédito y acreditación inmediata, según terceros) | Cuenta propia del comprador |
| Google OAuth (Drive y Calendar) | Opcional | Gratis | Verificación de la app (sin CASA) |
| Dominio, email de soporte | Sí | Variable | — |
| Google Tag Manager | Opcional | Gratis | Requiere consentimiento de cookies |
| Revisión legal | Sí, para operar | Honorarios profesionales | Privacidad, términos, datos personales, posibles menores, consumo |
| Desarrollo pendiente (sección B) | Para operar | Horas de desarrollo | B2 y R1 son los más relevantes |

**Requisitos técnicos:** Node 22+, Java 21 (solo para emuladores y pruebas), cuenta de Google Cloud con facturación y `gcloud`.

## D. Decisiones del modelo de créditos (pendientes)

Resumen de `CREDITS_BUCKETS_PROPOSAL.md` §7, que tiene las alternativas y consecuencias completas:

| Pregunta | Recomendación |
|---|---|
| 1. ¿Vencen los créditos de la prueba gratis a los 7 días? | **Sí**, solo para pruebas nuevas, avisando la fecha |
| 2. ¿Reembolso parcial: automático proporcional o revisión manual? | **Revisión manual** (los inicia el propio vendedor). Los totales y los contracargos siguen siendo automáticos. |
| 3. ¿Al vencer el plan, se quitan los créditos de inmediato o con margen? | **De inmediato, con aviso previo** (ya existe la notificación de 7 días) |
| 4. ¿Paquetes de créditos sueltos? | **No por ahora**: el modelo lo soporta y queda como opción para el comprador |

En todos los casos, los saldos existentes se conservan sin vencimiento.
