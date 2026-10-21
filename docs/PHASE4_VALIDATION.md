# Validación completa de la Fase 4

Rama local: `phase4-validation`, creada sobre `phase4-ai-backend`. Se usa el entorno simulado (`npm run dev:emulators -- --final-rules`): emuladores de Firebase, IA simulada (`AI_PROVIDER=fake`) y las reglas **finales**. No se usó Gemini real ni ningún servicio pago.

## Cambios propuestos (documentados antes de implementarlos)

### V-1: Mapa (`MultimediaGenerator`): la búsqueda y la identificación de lugares nunca funcionaron
- **Hallazgo:** `searchLocation()` e `identifyLocation()` devuelven **texto libre**, pero la vista espera un objeto `{ name, lat, lon, weather, localTime, funFact }`. Al leer `result.name.replace(...)` se produce un error y el usuario ve "Error al buscar". El problema también existe en `main`.
- **Por qué importa ahora:** antes el error ocurría antes de descontar el crédito. Con la Fase 4 el servidor cobra al recibir una respuesta válida, así que **el usuario perdería 1 crédito en una función rota**.
- **Corrección:** las dos funciones piden JSON con un esquema (`responseSchema`) que tiene exactamente esos campos y lo devuelven ya interpretado. El servidor valida que sea JSON; si no lo es, reintenta y, si sigue fallando, **devuelve el crédito**. La pantalla no cambia.
- **Riesgo:** bajo. Solo cambia el prompt de esas dos funciones.

### V-2: Arena: la primera visita inicializa las cartas dos veces
- **Hallazgo:** `ArenaView` carga las estadísticas al montarse. Si la carga se dispara dos veces seguidas (en desarrollo por `StrictMode`; en producción si `user` cambia mientras carga), las dos ven que no existen estadísticas y las dos escriben el lote inicial de 20 cartas. Con las reglas anteriores quedaban **40 cartas** (20 huérfanas). Con las reglas 3A el segundo lote se rechaza (las estadísticas ya existen y no se pueden "crear" de nuevo) y queda un error `PERMISSION_DENIED` en la consola. El usuario no lo nota, pero ensucia los registros y oculta errores reales.
- **Corrección:** `getArenaUserStats` reutiliza la carga en curso para el mismo usuario. Sin cambios visuales ni de datos.
- **Riesgo:** muy bajo.

### V-3 (menor): el Dashboard mostraba "0" créditos a un usuario nuevo
- **Hallazgo:** la tarjeta "Créditos" del Dashboard leía el saldo una sola vez. Si la primera consulta llegaba antes de que existiera el perfil, quedaba en 0 aunque la barra lateral ya mostrara 5.
- **Corrección:** el Dashboard escucha el mismo evento `creditsUpdated` que la barra lateral. Sin cambios visuales.

## Resultados

Entorno: `npm run dev:emulators -- --final-rules` (emuladores, IA simulada, reglas **finales**), Chromium. Cada recorrido usa un usuario nuevo.

### Navegador: 53/53 verificaciones

| Herramienta | Qué se verificó | Resultado |
|---|---|---|
| Prueba gratis | La activa el servidor: 15 créditos, una sola vez | OK |
| Estudio IA: plan adaptativo, examen, ejercicios, esquemas | Genera y cobra 1 crédito cada uno | OK (resumen y flashcards ya estaban en la Fase 4) |
| **Libros** | Guía de estudio y lectura de capítulo: genera y cobra 1 crédito cada una | OK |
| **Mapa** | Búsqueda por texto y clic en el mapa: muestra el lugar y cobra 1 crédito (**V-1**) | OK |
| **Herramientas del curso** | Resumen, tarjetas, ejercicios, esquema y examen ("Generar Ahora"): generan contenido, **no cobran** créditos y cuentan en la cuota diaria (5 llamadas = 5 en la cuota) | OK |
| **Arena** | Primera visita: 20 cartas exactas (**V-2**). Respuesta correcta: +12 puntos y racha 1. Ranking igual a los puntos. Tres respuestas incorrectas: 0 vidas y espera registrada. Saltar la espera: −1 crédito en el servidor (libro mayor `arena_cooldown`), 3 vidas y aviso. Preguntas generadas sin costo | OK |
| **Asistente de voz** | Ver nota abajo. Respuesta + voz (PCM válido) = **1 crédito** por acción. Si falla la voz se devuelve el crédito | OK |
| Tutor, matemática, podcast, resumen, flashcards, sin saldo, error de IA | Recorrido de la Fase 4, repetido para detectar regresiones | 18/18 |
| Feedback | Se envía y queda privado | OK |
| Grupos de estudio | El creador queda como admin | OK |
| Dashboard | Muestra los 5 créditos de un usuario nuevo (**V-3**) | OK |
| Garantías | Ninguna solicitud del navegador a Gemini, sin errores de JavaScript, sin rechazos de las reglas finales | OK |

**Asistente de voz:** el componente `VoiceAssistant` **no se muestra en ninguna pantalla**: no se importa en ninguna vista, tampoco en `main`. Es código sin uso. Se probó ejecutando en el navegador su misma secuencia de llamadas (texto con `getAI(newAiAction('voice_assistant'))` y después voz con el modelo TTS), con los módulos reales de la app. Conectarlo a la interfaz es una **decisión de producto** y no se hizo. El micrófono (`SpeechRecognition`) no se puede probar en un navegador sin interfaz.

### Suites automáticas

| Suite | Resultado |
|---|---|
| `npm run verify` (tipos + unitarias + build) | **98/98** unitarias (3 nuevas: V-1 y V-2), **2/2** build |
| `npm run test:rules` (emulador) | **65/65** (nueva: primera visita a la Arena con las reglas) |

### Qué no se pudo verificar
- Respuestas reales de Gemini (modelos de respaldo, TTS real, calidad del JSON del mapa con el esquema).
- Micrófono y reconocimiento de voz.
- Los scripts del navegador están fuera del repositorio (Playwright no es una dependencia del proyecto). Se pueden incorporar si querés que formen parte de la entrega.

### Sigue abierto (sin cambios)
- `VoiceAssistant` sin usar (decisión de producto).
- La subida a Drive usa un permiso de solo lectura (existente).
- Arena: los puntos siguen siendo "farmeables" porque las respuestas correctas son legibles por el cliente (`FIRESTORE_SECURITY_3A.md`, sección 3).
