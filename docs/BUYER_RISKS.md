# Riesgos que el comprador debe conocer

Lista final al 22/10/2026 (versión 1.1.0-rc.1). Ordenada por gravedad. El vendedor la entrega para que el comprador decida con información completa; ninguno de estos riesgos está oculto en el código.

**Gravedad:**
- **Alta:** impide operar legalmente o con seguridad.
- **Media:** costo o trabajo relevante.
- **Baja:** mejora recomendada.

## A. Legales y de datos

| # | Riesgo | Gravedad | Mitigación |
|---|---|---|---|
| L1 | **Textos legales en borrador.** Privacidad y términos describen el funcionamiento real, pero los puntos de un abogado están pendientes: responsable, reembolsos y arrepentimiento, menores, conservación, jurisdicción, cookies | Alta | Revisión profesional; `VITE_LEGAL_TEXTS_APPROVED=true` solo después (`legal/README.md`) |
| L2 | **Posibles menores de edad** (niveles inicial y secundario) **sin verificación de edad** ni consentimiento parental | Alta | Definir una edad mínima o un flujo de consentimiento con el abogado; implementarlo |
| L3 | **Sin borrado ni exportación de la cuenta** desde la app | Alta | Desarrollarlo antes de operar (`legal/DATA_INVENTORY.md`) |
| L4 | **Datos de los usuarios actuales**: no se pueden transferir sin una base legal (Ley 25.326 en Argentina) | Alta si se transfieren | Asesoramiento legal; o empezar con una base nueva |
| L5 | **Titularidad del código**: empezó en Google AI Studio y se escribió con asistencia de IA | Media | Contrato de cesión con la declaración correspondiente (`LICENSING_AND_IP.md` §2–3) |
| L6 | **`react-leaflet` con licencia Hippocratic-2.1** (no OSI) | Media | Aceptarla tras una revisión legal, o reemplazarla por `leaflet` (cambio acotado) |
| L7 | **Música de SoundHelix y mapas de Esri sin licencia comercial confirmada**; el mapa oculta la atribución | Media | Reemplazarlos o licenciarlos y activar la atribución (`LICENSING_AND_IP.md` §5) |
| L8 | **Google Tag Manager sin banner de cookies** | Media | Desactivarlo (`VITE_GTM_ID=off`) o agregar el consentimiento |
| L9 | **Marca no registrada** (a confirmar) | Media | Búsqueda y registro en el INPI |
| L10 | **Sin facturación fiscal** de los planes | Media | Resolverla fuera de la app (sistema de facturación) |
| L11 | **Gemini en el plan gratuito** puede usar los datos para mejorar los productos de Google | Media | Plan pago de Gemini, sobre todo con datos de menores |

## B. Económicos

| # | Riesgo | Gravedad | Mitigación |
|---|---|---|---|
| E1 | **El podcast cuesta 1 crédito, igual que un resumen, pero su costo de IA es 15–30 veces mayor.** Un plan usado solo en podcasts puede costar más de lo que se cobró | Alta | Ajustar el costo en créditos del podcast o su límite (decisión de negocio; los precios no se tocaron) |
| E2 | **La cuota diaria gratuita** de herramientas del curso (60 llamadas) puede costar ≈ US$ 0,18 por día por usuario muy activo | Media | Ajustar `AI_INCLUDED_DAILY_QUOTA`; interruptor de IA para usuarios gratuitos; **alertas de presupuesto** |
| E3 | **Costos verificados solo con valores de referencia**: no con Gemini real ni con el precio de la voz (TTS) | Media | Medir con una clave de prueba y un presupuesto acotado |
| E4 | **Trimestral más caro por crédito que el Mensual** (4,20 contra 4,00 pesos) | Baja | Revisar los precios |
| E5 | **Los créditos anteriores a la versión 1.1 no vencen nunca**, incluidos los de planes comprados antes. Si un plan anterior se reembolsa, sus créditos no se quitan solos | Baja | Por decisión del vendedor. Esos pagos quedan marcados para revisión (`revoked_without_bucket`). |
| E6 | **Firestore con base con nombre**: podría no tener nivel gratuito | Baja | Verificarlo o usar `(default)` (`FIRESTORE_DATABASES.md`) |

## C. Técnicos

| # | Riesgo | Gravedad | Mitigación |
|---|---|---|---|
| T1 | **Nada de esta preparación se desplegó.** Producción sigue con el código de `main`: créditos descontados en el navegador, webhook de pagos anterior y reglas de Firestore anteriores | Alta | Fusionar `release-candidate-1.1` y desplegar en el orden documentado (`RELEASE_1.1.md`) |
| T2 | **Pagos y Gemini probados solo con simuladores** | Alta | Sandbox de Mercado Pago (firma del webhook, pendiente → aprobado, reembolso) y Gemini real antes de abrir |
| T3 | **Dos bases de Firestore**: la app y el webhook anterior escribieron en bases distintas | Media | Decidir la base y conciliar con el script de solo lectura (`FIRESTORE_DATABASES.md`) |
| T4 | **Una sola instancia** de Cloud Run (sesiones y tokens en memoria) | Media | Almacenamiento persistente para escalar (`SESSIONS_LOW_COST.md`) |
| T5 | **Puntos de la Arena manipulables** desde el cliente | Media | Validar el juego en el servidor |
| T6 | **`xlsx` sin actualizaciones en npm** (vulnerabilidades al leer archivos no confiables) | Media | Instalarlo desde el CDN de SheetJS (`DEPENDENCIES.md`) |
| T7 | 12 vulnerabilidades restantes en dependencias (de desarrollo o sin corrección publicada) | Baja | `npm audit` periódico |
| T8 | **CSP en modo de reporte** | Baja | Pasarla a bloqueante después de revisar los reportes |
| T9 | **Reembolsos parciales y pagos marcados sin pantalla de administración** | Baja | Revisarlos en Firestore (`payments`, `needsReview`) o desarrollar la pantalla |
| T10 | **Dependencia de recursos externos** (imágenes, música, mapas) | Baja | Alojarlos en el propio dominio |
| T11 | **Funciones incompletas no promocionadas:** voz (desactivada), onboarding que no guarda rol ni país, "¿Te resultó útil?" que solo guarda en el navegador | Baja | Completarlas o quitarlas |

## D. Operativos y de traspaso

| # | Riesgo | Gravedad | Mitigación |
|---|---|---|---|
| O1 | **Secretos del vendedor** en el proyecto actual | Alta | Rotar todos al traspasar (`SECURITY_CREDENTIALS.md`); la clave de Gemini filtrada antes ya fue revocada |
| O2 | **Email del vendedor** con privilegios de administrador en `firestore.rules` y `src/config/admin.ts` | Alta | Reemplazarlo y usar el claim `admin` (`SALE_AND_TRANSFER.md` §6) |
| O3 | **Verificación de Google OAuth** pendiente (Calendar es un permiso sensible) | Media | Iniciarla con tiempo; Drive usa `drive.file` (sin CASA) |
| O4 | **Soporte**: email y Discord del vendedor | Media | Reemplazarlos (`VITE_COMMUNITY_URL`, `VITE_SUPPORT_EMAIL`) |
| O5 | **Copia de seguridad** antes del primer despliegue | Media | `gcloud firestore export` |
| O6 | **El historial de Git conserva datos personales** de versiones anteriores: el email del propietario y el nombre y el email de un tercero que estaban escritos en el código (ya quitados del estado actual) | Media | Entregar el código **sin historial** (una copia del último commit) o reescribir el historial antes del traspaso. Requiere decisión del propietario: `main` ya es público. |

## E. Lo que **no** es un riesgo (verificado)

- Ninguna clave privada en el código ni en el build (escaneo automático).
- La IA solo se usa desde el servidor, con identidad, créditos transaccionales y límites.
- El cliente no puede escribir créditos, planes ni roles (reglas probadas en el emulador).
- Los pagos se verifican en el servidor, son idempotentes y validan monto, moneda y plan. Un pago repetido no acredita dos veces.
- Ninguna operación de créditos acredita dos veces ni pierde créditos, incluso con decenas de operaciones simultáneas (`creditModel.emulator.test.ts`).
- Sin testimonios inventados ni promesas falsas en la interfaz (guardas de prueba).
