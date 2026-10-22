# Inventario de datos personales (base para la revisión legal)

Describe lo que **hace hoy el código** (rama `phase7-commercial-blockers`). Sirve como insumo para el abogado que revise la política de privacidad y los términos (`src/legal/privacy.md`, `src/legal/terms.md`). No es asesoramiento legal.

## 1. Qué datos se guardan

| Dato | Dónde | Quién lo ve | Origen |
|---|---|---|---|
| Nombre, email, foto, identificador del proveedor (Google o Apple) | Firebase Authentication; `users/{uid}` | El usuario; los administradores | Inicio de sesión |
| Preferencias (tema, idioma), fechas de alta y último acceso | `users/{uid}` | El usuario | App |
| Plan, créditos, prueba gratis y libro mayor de créditos y pagos | `users/{uid}`, `users/{uid}/creditLedger` | El usuario (lectura); solo el servidor escribe | Servidor |
| Cursos, contenido generado, archivos subidos (PDF, Word, Excel, imágenes) | `user_courses`, `userFiles`, Firebase Storage | Solo el usuario | Usuario e IA |
| Conversaciones con el tutor (y con el asistente de voz, hoy desactivado) | `chats/{id}/messages` | Solo el usuario | Usuario e IA |
| Tareas, exámenes del calendario, actividad, progreso de libros | `tasks`, `exams`, `activities`, `bookProgress` | Solo el usuario | Usuario |
| **Grupos de estudio**: nombre, descripción, notas, miembros | `groups` | **Cualquier usuario registrado** (los grupos son abiertos) | Usuario |
| **Arena**: nombre visible, foto y puntos en el ranking | `arena_rankings` | **Cualquier usuario registrado** | App |
| Feedback: mensaje, puntaje, nombre y foto | `feedback` | Privado; un administrador puede publicarlo | Usuario |
| Órdenes y pagos: uid, plan, monto, moneda, estado e id de Mercado Pago | `paymentOrders`, `payments` | Solo el servidor | Servidor y Mercado Pago |
| Estadísticas agregadas de uso de IA (sin datos personales) | `stats/global` | Administradores | Servidor |

**No se guardan:** datos de tarjetas (los maneja Mercado Pago), contraseñas (el inicio de sesión es con Google o Apple) ni grabaciones de voz.

## 2. Terceros que procesan datos

| Tercero | Para qué | Qué recibe |
|---|---|---|
| Google Cloud / Firebase | Alojamiento, base de datos, archivos, autenticación | Todos los datos de la sección 1 |
| **Google Gemini API** | Generar el contenido de IA | El texto de cada solicitud y los **documentos** que el usuario adjunta. El uso de esos datos por Google depende del **plan contratado** (nivel gratuito o pago): verificar las condiciones vigentes de Gemini API. |
| Mercado Pago | Cobro de planes | Email del usuario, plan y monto. Mercado Pago procesa los datos de pago. |
| Google (Drive y Calendar), Microsoft (Outlook), solo si el usuario los conecta | Importar archivos y exámenes | Tokens de acceso **en la memoria del servidor** (no se guardan en la base). Drive usa `drive.file`: solo los archivos que el usuario sube o abre desde la app. |
| Google Tag Manager (si está configurado) | Analítica | Lo que configure el contenedor. **No hay banner de consentimiento de cookies.** |
| Unsplash, Picsum, DiceBear, Esri, SoundHelix, Transparent Textures | Imágenes, avatares, mapas, música | La **dirección IP** del navegador (recursos externos) |

## 3. Almacenamiento local del navegador
`localStorage`:
- versión de la app;
- tema y fondo de pantalla;
- caché de créditos y de plan (30 s);
- historial de exámenes de práctica;
- notificaciones leídas;
- caché del mapa;
- comentarios del estudio IA;
- estado del monitor de tráfico.

Firebase Auth guarda la sesión en IndexedDB. El servidor usa una **cookie de sesión** solo durante la conexión de Drive o Calendar.

## 4. Registros del servidor (Cloud Run)
Los errores se registran sin cuerpos de solicitud ni tokens. Algunos registros incluyen el **uid** (identificador interno), por ejemplo en IA, OAuth y pagos. Las IP se usan en memoria para limitar solicitudes.

## 5. Brechas respecto de lo que exigiría una política de privacidad completa

| Brecha | Estado |
|---|---|
| **Borrar la cuenta** y todos sus datos | **No existe** una función en la app. Hoy se haría a mano a pedido del usuario. |
| **Exportar los datos** del usuario | No existe |
| Plazos de conservación | No definidos: los datos se guardan hasta que se borran |
| **Menores de edad** | La app ofrece niveles "Inicial" y "Secundario". No hay verificación de edad ni consentimiento de padres o tutores. |
| Consentimiento de cookies o analítica | No hay banner. GTM se carga si está configurado. |
| Cifrado | Google Cloud cifra los datos en tránsito (HTTPS) y en reposo. **No hay cifrado de extremo a extremo**: el servidor y los administradores con acceso al proyecto pueden leer los datos. |
| Transferencia internacional | Google y Mercado Pago pueden procesar datos fuera del país del usuario |
| Registro de la base de datos ante la autoridad (en Argentina, AAIP) | No evaluado |
