# Fase 6: Preparación comercial y calidad

Rama local: `phase6-commercial-readiness`, creada sobre `phase5-payments`.

**Alcance:**
- Sin servicios pagos.
- Sin cambios en producción.
- Sin publicar nada de esta fase sin aprobación.
- **Sin cambios en el comportamiento económico**: el modelo de créditos por origen está solo propuesto (`CREDITS_BUCKETS_PROPOSAL.md`).

## Cambios propuestos (documentados antes de implementarlos)

### P6-1: Textos de planes: pagos únicos (decisión 1, aprobada)
- Se quitaron "/mes", "/3 meses" y "/año", y la frase "Puedes cancelar en cualquier momento. Al suscribirte...".
- Ahora dice **"pago único · 30 días"** (o 90 o 365), cada plan aclara "Plan activo por N días", y al pie se explica: "no hay renovación automática ni débitos recurrentes".
- "Suscripción" pasa a **"Planes"** en el menú, en los cinco idiomas.
- La pantalla de éxito muestra **hasta qué fecha** está activo el plan y deja de prometer "créditos ilimitados", que no era cierto.
- **No cambian** precios, créditos, duración ni nombres de planes (los nombres se guardan en los datos).

### P6-2: Google Drive

**Hallazgos (confirmados en el código):**

| # | Problema | Efecto |
|---|---|---|
| D-1 | Se pide solo `drive.readonly` | **Subir a Drive nunca funcionó**: Google rechaza la subida por falta de permiso |
| D-2 | Al abrir el selector, y al iniciar sesión, el cliente envía a `/api/auth/google/sync` el token del **inicio de sesión de Google**, que no tiene permisos de Drive ni de Calendar, y el servidor **reemplaza** con él el token bueno de la conexión de Drive | Después de conectar Drive, la próxima vez que se abre el selector **deja de listar archivos** ("No se encontraron archivos en Drive") |
| D-3 | Los tokens no se renuevan: no se calcula el vencimiento ni se usa el `refresh_token` | A la hora de conectar, Drive y Calendar dejan de funcionar y la app muestra un error genérico en lugar de pedir que se reconecte |
| D-4 | La lista incluye carpetas y tipos de Google que no se pueden exportar (Formularios, Sites, accesos directos) | Elegirlos da "No se pudo descargar" |
| D-5 | Un documento de Google se exporta a PDF, pero se envía a la IA con el tipo `application/vnd.google-apps.document` | La IA recibe un tipo de archivo incorrecto |
| D-6 | La subida usa un separador multipart fijo y nombres con tildes o eñes se corrompen (multer los entrega en latin1) | Archivos que contienen ese separador se corrompen; nombres como "Biología.pdf" llegan mal |
| D-7 | `drive.readonly` es un permiso **restringido** de Google | Para publicar la app sin la pantalla de "app no verificada" hace falta una **evaluación de seguridad anual de terceros (CASA)**, con costo. Es importante para un comprador. |

**Correcciones:**
1. Se agrega `drive.file`, que permite **subir**. El acceso de lectura es **configurable** con `GOOGLE_DRIVE_ACCESS`:
   - `all` (**por defecto**, como hoy): `drive.readonly` + `drive.file`. Lista todo el Drive y requiere la verificación restringida (D-7).
   - `app`: solo `drive.file`, un permiso no sensible. Lista los archivos que el usuario subió o abrió desde StudySanctuary y **evita la evaluación CASA**. Ver más detalles en `SALE_AND_TRANSFER.md`.
2. `/api/auth/google/sync` **nunca reemplaza** un token obtenido con la conexión de Drive (OAuth). Solo guarda el de inicio de sesión si no hay otro.
3. Se guarda el vencimiento (`expires_in`) y, antes de que venza, se renueva con el `refresh_token`. Si Google rechaza el token, la API responde 401 y la pantalla vuelve a ofrecer "Conectar".
4. La lista excluye carpetas y tipos no importables, y se ordena por fecha de modificación.
5. Se exportan Documentos y Presentaciones (a PDF), Hojas de cálculo (a XLSX) y Dibujos (a PDF). Los demás tipos de Google responden 415 con un mensaje claro. El cliente usa el tipo **real** del archivo descargado.
6. La subida usa un separador aleatorio y corrige la codificación del nombre.

**Riesgo:** bajo. Solo afecta a Drive y Calendar, que hoy no funcionan como corresponde. Los usuarios que ya conectaron Drive tienen que **volver a conectarlo** una vez para conceder el permiso de subida; los tokens se guardan en memoria, así que también se pierden con cada reinicio del servidor.

### P6-3: Insignias de los planes
`Header` compara `planName === 'Trimestral'` y `'Anual'`, pero los nombres reales son "Plan Trimestral" y "Plan Anual". Por eso **las insignias de plata y oro que prometen los planes nunca se mostraron**. Se corrige comparando el tipo de plan (`trimestral` o `anual`) y su estado activo.

### P6-4: Asistente de voz (revisión)
- **Estado:** el componente `VoiceAssistant` **nunca estuvo conectado a ninguna pantalla**, en ningún momento del historial del repositorio. Es una funcionalidad sin terminar.
- **Errores corregidos** (para que quede listo si se decide usarlo):
  - En navegadores sin reconocimiento de voz (Firefox y algunos móviles) quedaba trabado en "escuchando". Ahora avisa que se use Chrome o Edge.
  - El idioma del reconocimiento estaba fijo en `es-ES`; ahora sigue el idioma de la app (es, en, pt, it, fr).
  - Un segundo `start()` mientras escucha lanzaba un error no controlado.
- **La parte de IA ya funcionaba:** respuesta + voz cobran 1 crédito, y si falla la voz se devuelve (validado en la Fase 4).
- **Decisión pendiente (tuya):**
  - **A.** Agregar un botón de micrófono en "Tutor Virtual" que abra el asistente. Son unas 10 líneas y no cambian el diseño.
  - **B.** Eliminarlo para no vender código sin uso.
  - **Recomiendo A**: es una funcionalidad visible y ya probada del lado del servidor.

### P6-5: Datos personales escritos en el código
- **Hallazgo:** si falta el perfil, el encabezado mostraba el nombre y el email de **otra persona real** (escritos en el código como valor por defecto; se omiten aquí), y la barra lateral, el email del propietario. La insignia "Fundador" comparaba el email del propietario con mayúsculas, así que no coincidía con el email real (Google lo entrega en minúsculas) y nunca se mostraba.
- **Corrección:**
  - Los textos de respaldo pasan a ser "Estudiante" y vacío.
  - La insignia "Fundador" usa la misma lista que el administrador de respaldo (`src/config/admin.ts`), así que al transferir se cambia **un solo archivo**.
  - El email del propietario en `firestore.rules` y el email de soporte (`HelpCenterView`) quedan en la lista de transferencia.

### P6-6: Contenido de muestra fijo en pantallas reales
| Hallazgo | Efecto | Corrección (mismo diseño) |
|---|---|---|
| El menú **"Cursos"** abría una **pantalla en blanco**: no existe esa vista | El usuario no encuentra sus cursos | "Cursos" muestra el Dashboard desplazado a la lista de cursos |
| Con cursos creados, el Dashboard mostraba **una sola tarjeta que dice "Aún no hay cursos"**, y al hacer clic abría el primer curso | **Los cursos a partir del segundo no son accesibles** desde ninguna pantalla | Se muestra una tarjeta por curso (nombre, descripción, nivel y progreso), con el mismo estilo |
| "Horas de estudio: **24.5**" y "Racha diaria: **12**" eran números fijos para todos | Información falsa | Horas = estimado del avance de cada curso (horas estimadas × progreso); racha = días seguidos con actividad registrada |
| "Actividad de estudio" siempre decía "No hay actividad reciente" y su botón no hacía nada | Información falsa | Se muestran las últimas actividades reales, y el botón abre el asistente de estudio |
| Las **notificaciones** del encabezado eran tres mensajes fijos ("Tu periodo de prueba termina en 2 días", "examen de Bioquímica mañana"...) iguales para todos, incluso para usuarios con plan pago | Información falsa | Se generan con datos reales: exámenes de los próximos 3 días, el plan o la prueba que vence en los próximos 7 días y la última actividad de IA |

**Riesgo:** bajo. Solo cambia qué datos se muestran; no se tocan escrituras ni créditos.

**Contenido de marketing que no se cambió** (decisión del comprador; está en la lista de comprobación):
- **Testimonios fijos de la landing** con nombres y carreras ("Mateo G., Ingeniería UBA"...): no salen de reseñas reales. Hay que reemplazarlos por reseñas moderadas (la app ya tiene `FeaturedFeedback`, que hoy no se usa) o quitarlos.
- **Beneficios de los planes** que no están implementados en el código: "Sin anuncios" (la app no tiene anuncios), "Soporte prioritario", "Velocidad Turbo", "Acceso prioritario" y "Grupos de estudio ilimitados" (no hay límite para nadie).

## Resultados

### Trabajos de esta fase

| Pedido | Resultado | Documento |
|---|---|---|
| Decisión 1: pagos únicos | Textos corregidos (P6-1); precios y planes sin cambios | — |
| Decisiones 2 a 4: créditos | **Diseño y pruebas de compatibilidad (14/14). Sin cambios en el comportamiento económico** | `CREDITS_BUCKETS_PROPOSAL.md` |
| Dependencias y vulnerabilidades | 47 → **12** (0 críticas). Las restantes son de desarrollo o no tienen corrección; `firebase-admin` 14 y `mercadopago` 3 | `DEPENDENCIES.md` |
| Google Drive | 7 problemas corregidos (subida, token pisado, renovación, tipos, nombres) y acceso configurable para evitar CASA | P6-2 |
| Asistente de voz | Revisado y corregido; **conectarlo a una pantalla es decisión tuya** | P6-4 |
| Demostración con IA simulada | `npm run demo`: datos de ejemplo, ingreso sin credenciales, aviso visible, IA de ejemplo presentable, pagos simulados | `DEMO.md` |
| Instalación, configuración y transferencia | Guía completa, con opción A (transferir el proyecto) y B (proyecto nuevo) | `SALE_AND_TRANSFER.md` |
| Servicios, licencias, costos y elementos a reemplazar | Tablas con precios de referencia (por verificar) y riesgos de precio | `SALE_AND_TRANSFER.md` §3 y §6 |
| Lista de comprobación final | Funcionalidades, seguridad, datos, legal y transferencia | `FINAL_CHECKLIST.md` |

**Errores encontrados al recorrer la demo** (corregidos, P6-5 y P6-6):
- el menú "Cursos" abría una pantalla en blanco;
- solo se podía acceder al primer curso;
- las métricas y las notificaciones eran inventadas;
- había datos personales de terceros en el encabezado;
- las insignias de los planes nunca se mostraban.

También se centralizaron los identificadores del propietario (GTM, Discord) en `src/config/brand.ts`, sin cambiar sus valores actuales.

### Pruebas

| Suite | Resultado |
|---|---|
| `npm run verify` (tipos, unitarias, escaneo de secretos, build) | **146/146** unitarias (+52 en la fase: créditos por origen, Drive, demo, datos reales, textos), **2/2** build |
| `npm run test:rules` (emulador) | **82/82** |
| Build de producción + arranque del servidor compilado | Correctos. Un build con `VITE_DEMO_MODE=true` **falla** (como se busca) |
| Navegador sobre `npm run demo` (Chromium) | **86/86**: recorrido de la demo 17, Fase 4 18, herramientas 21, Arena 10, asistente de voz 3, pagos 17 |

En el recorrido no hubo **ninguna** solicitud a Gemini ni a Mercado Pago, ni errores de JavaScript, ni rechazos de las reglas finales. Las pantallas de planes en 375 px no tienen scroll horizontal.

### Decisiones pendientes (tuyas)
1. Modelo de créditos por origen: las 4 preguntas de `CREDITS_BUCKETS_PROPOSAL.md`, sección 7.
2. Asistente de voz: conectarlo (opción A) o quitarlo (B).
3. Contenido que no se tocó: testimonios fijos, beneficios de planes no implementados y textos legales (`FINAL_CHECKLIST.md`, sección D).
4. Precio por acción: el podcast y la cuota gratuita (`SALE_AND_TRANSFER.md`, §3.2).
5. `GOOGLE_DRIVE_ACCESS`: mantener `all` (requiere CASA) o pasar a `app`.
