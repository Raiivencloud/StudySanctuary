# Licencias y propiedad intelectual para el traspaso

Revisión técnica al 22/10/2026 (rama `release-candidate-1.1`). **No es asesoramiento legal.** Junta lo que un abogado necesita para redactar la cesión, y marca lo que debe confirmar.

## 1. Resumen

| Tema | Situación | Riesgo | Acción antes de vender |
|---|---|---|---|
| Código propio | Sin archivo `LICENSE`; `package.json` declara `"license": "UNLICENSED"` (propietario, no publicado) | Bajo | Cesión de derechos por contrato (sección 2) |
| Autoría | Todos los commits del repositorio son de un único autor | Bajo | Declarar en el contrato que no hay otros autores ni empleadores con derechos |
| Origen en Google AI Studio | Restos de la plantilla: `metadata.json`, `firebase-blueprint.json`, un comentario en `vite.config.ts` | **Medio (a confirmar)** | Confirmar con un abogado los términos de AI Studio vigentes al crear el proyecto (sección 3) |
| Código asistido por IA | Partes generadas o modificadas con asistentes de IA (AI Studio, Claude) | **Medio (a confirmar)** | Declararlo en el contrato; la protección por derecho de autor de código generado por IA varía según el país |
| Dependencias de producción | 623 paquetes. 614 (98 %) usan licencias permisivas (MIT, Apache-2.0, ISC, BSD) | Bajo, salvo una | Conservar los avisos de licencia (sección 4) |
| `react-leaflet` (Hippocratic-2.1) | Licencia "ética", no aprobada por la OSI, con condiciones de uso | **Medio** | Revisión legal, o reemplazarlo por `leaflet` (BSD-2, ya instalado) |
| Recursos de terceros cargados desde la web | Imágenes de Unsplash, música de SoundHelix, texturas, avatares de DiceBear, mapas de Esri y NASA | **Medio** | Revisar los términos de cada uno y alojarlos en el propio dominio, o reemplazarlos (sección 5) |
| Marca "StudySanctuary" / "Study Sanctuary" | No consta registro | **A confirmar** | Buscar en el INPI (Argentina) y en los países de venta; acordar en el contrato si la marca se transfiere |
| Logo de Google | `public/assets/google-g.svg` en los botones de Google | Bajo | Usarlo solo según las pautas de marca de Google (botones de inicio de sesión) |
| Contenido generado por la IA | Lo genera Gemini a pedido del usuario | Bajo / medio | Términos de Gemini API; los términos de la app ya aclaran que puede contener errores |
| Datos de usuarios | No forman parte del código | **Alto si se transfieren** | Ver `SALE_AND_TRANSFER.md` §1 y §7 (Ley 25.326) |

## 2. Código propio

- **Sin licencia pública.** No hay `LICENSE`. `package.json` dice `"private": true` y `"license": "UNLICENSED"`: nadie más tiene permiso de uso. Es lo correcto para vender el código. Los derechos pasan al comprador por **contrato de cesión**, no por una licencia de código abierto.
- **Autoría.** El historial de Git (desde el 29/04/2026) tiene un solo autor. Las fases 1 a 7 y esta versión se hicieron con asistencia de IA, a pedido del propietario, en ramas propias. Los commits lo indican con la línea `Co-Authored-By`.
- **Qué conviene que diga el contrato:**
  - qué se cede (código, documentación, pruebas, diseños, capturas, nombre y dominio si corresponde);
  - si la cesión es exclusiva;
  - que el vendedor no conserva copias para explotar;
  - que se declararon las licencias de terceros ([`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md));
  - que parte del código se escribió con herramientas de IA (sección 3).

## 3. Origen en Google AI Studio y código asistido por IA

- El proyecto **empezó con Google AI Studio** (plantilla "react-example": `metadata.json` con `requestFramePermissions`, `firebase-blueprint.json`, el comentario sobre `DISABLE_HMR` en `vite.config.ts`). En general, los términos de Google para el contenido generado no reclaman su propiedad, pero **hay que confirmarlo con los términos vigentes al crear el proyecto**.
- **Código generado con IA:** en varios países la protección por derecho de autor exige intervención humana creativa. El código fue dirigido, revisado y probado por el propietario. Aun así, el abogado debe evaluar cómo afecta a la **garantía de titularidad** que da el vendedor.
- **Sugerencia:** declarar el uso de IA en el contrato, en lugar de garantizar una autoría exclusivamente humana.

## 4. Dependencias de terceros

Inventario completo y regenerable: [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) (`npm run licenses`).

| Licencia | Paquetes | Qué implica |
|---|---|---|
| MIT, ISC, BSD-2, BSD-3, BSD, 0BSD, BlueOak, Apache-2.0, MIT y Zlib | 614 | Uso comercial libre. Hay que **conservar los avisos de copyright** (el build de Vite los mantiene en los comentarios `@license` cuando el paquete los incluye). Apache-2.0 además pide conservar el archivo `NOTICE` si existe. |
| **Hippocratic-2.1** (`react-leaflet`, `@react-leaflet/core`) | 2 | Permite el uso comercial **con condiciones éticas** (derechos humanos, estándares laborales). No es de código abierto según la OSI. Algunos compradores o auditorías la rechazan. **Opción técnica:** reemplazar `react-leaflet` por `leaflet` directo en el mapa de `MultimediaGenerator.tsx` (BSD-2, ya instalado); es un cambio acotado a ese componente. |
| MPL-2.0 (`lightningcss`) | 3 | Solo se usa al compilar, no se distribuye modificado. Sin obligaciones prácticas. |
| MPL-2.0 o Apache-2.0 (`dompurify`), MIT o GPL-3.0 (`jszip`) | 2 | Doble licencia: se elige la permisiva (Apache-2.0 o MIT). |
| CC-BY-4.0 (`caniuse-lite`) | 1 | Datos que usa el build; no se distribuyen en la app. |
| `rgbcolor` ("MIT OR SEE LICENSE IN FEEL-FREE.md") | 1 | Dependencia de `jspdf` (vía `canvg`). Permisiva. |

**Atención:**
- `xlsx` 0.18.5 se instala desde npm, que **SheetJS ya no actualiza**: Apache-2.0, pero con vulnerabilidades conocidas. Ver [`DEPENDENCIES.md`](./DEPENDENCIES.md).
- `mercadopago` no declara la licencia en `package.json`, pero su `LICENSE` es MIT.
- El inventario incluye binarios de Linux x64 (`lightningcss-linux-*`). En otra plataforma cambian esos nombres, no las licencias.

## 5. Recursos (imágenes, música, fuentes, mapas)

| Recurso | Dónde | Situación | Acción |
|---|---|---|---|
| Fotos de **Unsplash** (`images.unsplash.com`, 52 referencias) | Arena, libros, multimedia, fondos | Licencia de Unsplash: uso comercial gratuito, **pero no permite** armar un servicio que compita con Unsplash ni vender las fotos sin modificar | Aceptable para fondos e ilustraciones. Conviene **descargarlas y alojarlas**: hoy dependen de que Unsplash las siga sirviendo. |
| Música de **SoundHelix** (`soundhelix.com`, 31 referencias) | Reproductor de música de estudio | Ejemplos de demostración de un generador; **los términos para uso comercial no están claros** | **Reemplazarla** por música con licencia comercial explícita, o quitar el reproductor |
| Texturas de **transparenttextures.com** | Fondos decorativos | Gratuitas, con atribución sugerida | Alojarlas o reemplazarlas por CSS |
| Avatares de **DiceBear** (`api.dicebear.com`) | Avatares por defecto | Cada estilo tiene su licencia (muchos CC0 o CC BY) | Verificar el estilo usado, o usar las iniciales locales que ya usa la demo |
| Mapas de **Esri** World Imagery (día) y **NASA** VIIRS (noche) | Mapa interactivo (`MultimediaGenerator.tsx`) | Las teselas de Esri requieren **cuenta y atribución** para uso comercial. Las de NASA son de dominio público, pero piden atribución. **El mapa tiene la atribución desactivada** (`attributionControl={false}`). Los íconos de los marcadores se cargan desde cdnjs (Leaflet, BSD-2). | Activar la atribución y usar un proveedor con plan comercial (Esri, MapTiler, Stadia), o alojar los íconos |
| Capturas de la landing (`public/assets/screens/`) | Landing | Capturas propias de la demo (Fase 7) | Sin riesgo |
| `public/logo.svg` | Marca | Propio del proyecto (a confirmar por el vendedor) | Incluirlo en la cesión |
| Texturas de la Tierra y la Luna (`public/assets/textures/`, 4 MB) | Ningún lado (quedaron del globo 3D eliminado en la Fase 6) | Origen desconocido | **Se eliminaron en esta versión** |
| Fuentes | Del sistema y de Tailwind; no se cargan fuentes externas | — | — |

## 6. Datos, marcas y servicios de terceros

- **Marcas de terceros en la interfaz:**
  - Google (inicio de sesión, Drive, Calendar);
  - Microsoft (Outlook);
  - Apple (inicio de sesión);
  - Mercado Pago;
  - Discord.

  Se usan para identificar servicios integrados, que es el uso que permiten sus pautas. No sugieren asociación.
- **Gemini API:** el comprador opera con su propia clave y acepta los términos de Google. En el plan gratuito de Gemini, Google puede usar los datos para mejorar sus productos: la política de privacidad borrador lo advierte. Para cursos con datos de menores conviene el plan pago.
- **Mercado Pago:** cuenta del comprador. Los datos de las tarjetas nunca pasan por la app.

## 7. Lista para el abogado

1. Contrato de cesión del código y de la documentación, con la declaración de licencias de terceros y del uso de IA.
2. Confirmar los términos de Google AI Studio aplicables al código inicial.
3. Decidir sobre `react-leaflet` (Hippocratic-2.1): aceptarla o pedir el reemplazo técnico.
4. Música de SoundHelix y teselas de Esri (y la atribución del mapa): reemplazarlas o conseguir la licencia antes de operar.
5. Búsqueda y, si corresponde, registro de la marca.
6. Textos legales de la app (borradores en `src/legal/`, guía en `legal/README.md`).
7. Datos de usuarios: no transferirlos sin una base legal.
