# Fase 7: Bloqueantes comerciales

Rama local: `phase7-commercial-blockers`, creada sobre `phase6-commercial-readiness`.

**Alcance:**
- Sin cambios en producción, sin servicios pagos y **sin cambios de precios**.
- El modelo económico de créditos **no se implementó**: su análisis está en `CREDITS_BUCKETS_PROPOSAL.md`, sección 7.

## 1. Privacidad y textos legales (prioridades 1 y 2)

| Antes | Ahora |
|---|---|
| Modal "Protocolo de Privacidad": **"encriptación end-to-end"**, "ningún fragmento… para entrenar modelos", "erradicación total" de los datos, botón "Descargar legales" que no hacía nada | `LegalModal` con **borradores** de política de privacidad y términos (`src/legal/*.md`) escritos a partir de lo que hace el código. Aviso visible **"Versión preliminar, pendiente de revisión legal profesional"** hasta aprobarlos. |
| "Términos de Uso" deshabilitado | Abre los términos |
| "Privacidad de la cuenta" (Configuración) no hacía nada | Abre la política |
| Pantalla de planes: "aceptás nuestros Términos…" sin enlace | Enlaces a ambos textos |

- Los textos dicen lo que es: **no hay cifrado de extremo a extremo**, la IA es Google Gemini (y su uso de los datos depende del plan contratado), los grupos y el ranking son visibles para otros usuarios, el borrado de la cuenta se pide por email.
- Los datos que no le corresponde definir al equipo técnico (responsable, reembolsos, menores, jurisdicción, conservación…) quedan como **`[Pendiente de revisión legal: …]`**.

Más información:
- [`legal/README.md`](./legal/README.md): guía para el abogado y lista de marcadores.
- [`legal/DATA_INVENTORY.md`](./legal/DATA_INVENTORY.md): qué datos se tratan, quién los ve, qué terceros intervienen y qué falta (borrado, exportación, edad, cookies).

## 2. Testimonios y promesas (prioridades 3 y 4)

Un relevamiento sistemático de todos los componentes encontró contenido inventado o funciones que no existen.

| Pantalla | Se quitó o corrigió |
|---|---|
| **Landing** | Testimonios con nombres y universidades: **reemplazados por una presentación de funcionalidades reales** ("Resúmenes y flashcards", "Podcast de estudio"…). También se quitaron: "UBA • UTN • UNLP" y "algoritmos adaptados a universidades argentinas"; "ejercicios reales de exámenes UBA y UTN"; simuladores químicos, laboratorios virtuales y diagramas de cuerpo libre (no existen); "Maximiza tu IQ"; "corrección automatizada para maestros"; "2x más rápido"; "Tutor IA cuántico"; "v4.0.2"; "redes neuronales" y "perfil cognitivo"; "diseño curricular de tu país"; las 5 estrellas por materia; "Estado del sistema: Operativo"; "© SANCTUARY LABS"; los botones de Twitter y GitHub sin destino; las **fotos de stock presentadas como la interfaz**, reemplazadas por **capturas reales** de la app (funcionan sin conexión). |
| **Planes** | Quitados "Grupos ilimitados", "Sin anuncios", "Soporte prioritario/preferencial", "Velocidad Turbo", "Acceso prioritario" y "EL MÁS ELEGIDO". Quitados los **precios tachados y "¡Ahorrás $2.800/$6.000!"**, que eran falsos: el Trimestral cuesta **más** por crédito que el Mensual. Los sellos de plata y oro (que sí existen) se nombran como en la app. Los precios no cambiaron. |
| **Configuración** | Antes mostraba para todos "12 cursos", "85%", "Plan de Prueba – 7 Días Gratis", "IA Ilimitada", "Sincronización Drive" y "Premium". Ahora muestra **datos reales** (cursos, progreso promedio, plan real con su fecha de fin y créditos). También se quitaron: el **falso cambio de contraseña** (el ingreso es con Google o Apple); los interruptores de notificaciones sin efecto; la foto de perfil de ejemplo de terceros; la opción "Português", que mostraba la app en inglés. "Ver planes" ahora navega. |
| **Ayuda** | Se quitó el **"Chat en vivo 24/7"**, que respondía con un temporizador. Quedan preguntas frecuentes reales (créditos, planes únicos, errores de la IA, borrado de la cuenta) y contacto por email y Discord. |
| **Encabezado** | "PLAN PREMIUM" fijo → plan real. Quitado "Ver historial completo" (no hacía nada). |
| **Detalle de curso** | Quitadas las etiquetas fijas ("Formalismo"…), "Próximo hito: Examen de Unidad" (ahora el próximo examen real del calendario), "Prioridad Alta" y "4.5 horas" inventadas. **Los indicadores de carga ya no giran para siempre** en cursos sin archivos. "Inicio" navega. |
| **Calendario** | El "recordatorio" mostraba un aviso falso. Ahora **sí** define cuándo aparece el examen en las notificaciones de la app (solo dentro de la app; no hay email ni push). |
| **Podcast** | La barra de progreso era una animación fija de "5:00". Ahora muestra el **tiempo real del audio**. Quitados los botones de adelantar y retroceder sin función. |
| **Libros** | Pedía a la IA el **"texto ÍNTEGRO"** de libros con derechos de autor: texto inventado y un riesgo legal. Ahora genera una **guía de estudio por capítulo** con la aclaración de que no reemplaza la lectura. Quitados los puntajes inventados y los botones sin función. |
| **Grupos** | La búsqueda ahora filtra. Quitado el contador de miembros (nunca se actualizaba) y el botón "Agregar Plan" sin función. |
| Otros | "Gemelo digital 3D" → "Mapa interactivo" (es un mapa 2D). "Clima" y "Hora local" → "Clima típico" y "Hora aprox." (los estima la IA). Nombres de prueba del desarrollador ("Raiiven Games", "Agustín", "Raiivencloud"). Aviso de créditos agotados con un botón que no navegaba. "Comunidad en Discord" en lugar de "Soporte preferencial". |

Las pruebas `tests/unit/commercialBlockers.test.ts` impiden que vuelvan estos textos.

## 3. Google Drive con permisos mínimos (prioridad 5)
- Solo se pide `drive.file`: la app ve **únicamente los archivos que el usuario sube o abre desde StudySanctuary**. Se **eliminó** la opción de leer todo el Drive (`drive.readonly`); configurar `GOOGLE_DRIVE_ACCESS=all` hace que el servidor no arranque, con un mensaje claro.
- No requiere la evaluación de seguridad CASA de Google (Calendar `calendar.readonly` sigue requiriendo verificación).
- **El selector de Drive no estaba conectado a ninguna pantalla**: el botón "Google Drive" de Estudio IA no hacía nada. Ahora abre el selector.
- Con una lista vacía (siempre al empezar, por el permiso mínimo) **no había forma de subir el primer archivo**. Ahora hay un botón "Subir a Drive", y la explicación de qué ve la app.

## 4. Asistente de voz (prioridad 6)
Queda como **función experimental, desactivada**: un comentario en el componente lo indica y una prueba falla si alguna pantalla lo importa.

## 5. Demo profesional (prioridad 7)
- Landing con **capturas reales** de la app.
- Avatares locales con iniciales: sin imágenes de terceros, funciona sin conexión.
- Ícono de Google local.
- Sin reseñas de ejemplo publicadas.
- Respuestas de IA simuladas también para las guías de libros.
- Si fallan las cuentas demo, el script lo informa en lugar de seguir con datos incompletos.

## 6. Resultados

| Suite | Resultado |
|---|---|
| `npm run verify` (tipos, unitarias, escaneo de secretos, build) | **154/154** unitarias (+8 de esta fase), **2/2** build |
| `npm run test:rules` (emulador) | **82/82** |
| Navegador sobre `npm run demo` | **92/92**: recorrido de la demo 23 (6 nuevas de esta fase), Fase 4 18, herramientas 21, Arena 10, voz 3, pagos 17 |

## 7. Pendiente (no se cambió)
- `translations.ts`: no se muestra en ninguna pantalla (contiene textos de ejemplo como "+12%"). Limpiar o eliminar.
- Los botones "¿Te resultó útil?" de Estudio IA y del detalle de curso guardan la respuesta solo en el navegador.
- El onboarding de la landing pregunta el rol y el país, pero **no los guarda**.
- No existe borrado ni exportación de la cuenta desde la app (`legal/DATA_INVENTORY.md`).
- El presupuesto de US$ 20 que se ve en el panel de administración es un valor fijo.
