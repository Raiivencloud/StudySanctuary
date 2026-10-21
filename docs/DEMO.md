# Demostración segura (sin credenciales ni costos)

`npm run demo` levanta StudySanctuary completo en la computadora, con **datos de ejemplo** y **sin ningún servicio real**. Sirve para mostrarlo a un comprador o recorrerlo antes de configurar cuentas propias.

## 1. Requisitos

| Requisito | Para qué |
|---|---|
| Node.js **22 o superior** | App y servidor (`firebase-admin` 14 lo exige) |
| Java **21** | Emuladores de Firebase (Auth, Firestore y Storage) |
| `npm ci` (una vez) | Dependencias, incluido `firebase-tools` |

No hace falta cuenta de Google Cloud, Firebase, Gemini ni Mercado Pago, ni ningún archivo `.env`.

## 2. Arranque

```bash
npm ci
npm run demo
```

Cuando la consola muestre `Server running on http://localhost:3000`, abrí **http://localhost:3000**.

En la página de inicio aparece el recuadro **"Demo sin credenciales"**:
- **Entrar como estudiante (demo)**: Valentina, con Plan Trimestral activo, 3 cursos, tareas, exámenes, un grupo de estudio, el álbum de la Arena y un ranking con otros jugadores.
- **Entrar como administrador (demo)**: muestra el **Admin Panel** (claim `admin`).

El botón "Continuar con Google" de la landing también funciona con internet: abre la página de cuentas de prueba del emulador. Los botones de la demo funcionan **sin conexión**.

**Para empezar de cero:** detener con `Ctrl+C` y volver a ejecutar `npm run demo`. Los emuladores no guardan datos entre ejecuciones.

## 3. Qué es simulado

| Servicio | En la demo | En producción |
|---|---|---|
| Firebase (Auth, Firestore, Storage) | Emuladores locales, proyecto `demo-studysanctuary` | Proyecto real |
| IA (Gemini) | `AI_PROVIDER=fake`: respuestas de ejemplo en español con el tema pedido y la nota *"Contenido de demostración (modo desarrollo)"* | Gemini, con la clave del servidor |
| Créditos | **Reales** (los cobra el servidor), sobre los emuladores | Igual |
| Pagos | Checkout simulado: botones "Pagar: approved / pending / rejected"; webhook **firmado** | Mercado Pago Checkout Pro |
| Reglas de Firestore | Las **finales** (el cliente no puede escribir créditos) | Ver `PHASE4_REPORT.md` |

Siempre se ve el aviso **"DEMO · IA y pagos simulados · datos locales, sin costo"**.

## 4. Garantías de seguridad (verificadas con pruebas)

- Los datos de ejemplo **solo** se cargan si están definidas las tres variables de los emuladores y el proyecto empieza con `demo-`. Si no, el script se niega (`scripts/demo/seed.ts`).
- El servidor **rechaza** `AI_PROVIDER=fake` y `MERCADOPAGO_MODE=fake` en producción.
- Un **build de producción falla** si tiene activado `VITE_DEMO_MODE` o `VITE_USE_FIREBASE_EMULATORS` (`vite.config.ts`).
- La demo **no carga Google Tag Manager**.
- En el recorrido automático, el navegador no hizo **ninguna** solicitud a Gemini ni a Mercado Pago.

**Limitaciones:**
- Las imágenes decorativas (Unsplash, Picsum, DiceBear), la música de fondo (SoundHelix) y los mapas (Esri) se cargan desde internet. Sin conexión no aparecen, pero la app funciona igual.
- El reconocimiento de voz requiere Chrome o Edge (el asistente de voz no está conectado a ninguna pantalla; ver `PHASE6_COMMERCIAL_READINESS.md`, P6-4).

## 5. Recorrido sugerido (10 minutos)

1. **Landing** → "Entrar como estudiante (demo)".
2. **Dashboard:** cursos con su progreso, horas de estudio y racha calculadas con datos reales, plan diario, actividad reciente y notificaciones (campana).
3. **IA** → escribir un tema (por ejemplo, "Mitosis") → **Generar resumen**. Se descuenta 1 crédito; también se pueden probar flashcards, examen, plan adaptativo, ejercicios y esquema.
4. **Cursos** → abrir "Biología Celular" → herramientas del curso (sin costo de créditos, con cuota diaria).
5. **Tutor Virtual**, **Matemáticas**, **Podcast** (guion + audio) y **Explorador** (buscar "París" o "Machu Picchu").
6. **Arena** → ¡Entrar! → elegir una carta → responder (la opción correcta es la B en la demo) → ranking.
7. **Calendario** y **Grupos de estudio**.
8. **Planes** → "Comenzar ahora" en un plan → checkout simulado → **approved**. Vuelve con "Plan … – N Créditos Activos" y la fecha de fin. Probar también **pending** y **rejected**.
9. Cerrar sesión → "Entrar como administrador (demo)" → **Admin Panel**.

## 6. Verificación automática

Con la demo en marcha, el recorrido de la sección 5 se automatizó con Chromium: **17/17 verificaciones** (ver `PHASE6_COMMERCIAL_READINESS.md`, Resultados). Las suites del repositorio no necesitan la demo:

```bash
npm run verify       # tipos, pruebas unitarias, escaneo de secretos y build
npm run test:rules   # reglas, créditos y pagos sobre los emuladores
```
