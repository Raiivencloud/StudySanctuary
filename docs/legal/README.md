# Textos legales: borradores para revisión profesional

> **No son asesoramiento legal.** Los redactó el equipo técnico a partir de lo que hace el código, para que un abogado los revise, complete y apruebe. No contienen garantías que el producto no cumpla.

| Archivo | Qué es |
|---|---|
| [`src/legal/privacy.md`](../../src/legal/privacy.md) | Borrador de la política de privacidad (se muestra en la app) |
| [`src/legal/terms.md`](../../src/legal/terms.md) | Borrador de los términos y condiciones (se muestra en la app) |
| [`DATA_INVENTORY.md`](./DATA_INVENTORY.md) | Qué datos se tratan, dónde, quién los ve y qué terceros intervienen, más las brechas conocidas |

## Cómo se muestran

- La landing tiene "Política de Privacidad" y "Términos de Uso", y Configuración tiene "Privacidad de la cuenta". Ambos abren `LegalModal`.
- Mientras quede **algún punto pendiente** o no esté `VITE_LEGAL_TEXTS_APPROVED=true`, se ve el aviso **"Versión preliminar, pendiente de revisión legal profesional"**.
- Los datos de identificación se completan con variables de entorno: `VITE_LEGAL_ENTITY_NAME`, `VITE_LEGAL_CONTACT_EMAIL`, `VITE_LEGAL_EFFECTIVE_DATE` y `VITE_LEGAL_ADDRESS`.
- Las cláusulas se completan editando los `.md`: cada `{{MARCADOR}}` sin completar se muestra como "[Pendiente de revisión legal: ...]".

## Puntos que debe definir el abogado (y el comprador)

| Marcador | Tema | Datos útiles |
|---|---|---|
| `RESPONSABLE`, `DOMICILIO`, `EMAIL_CONTACTO`, `FECHA_VIGENCIA` | Identificación del responsable | El comprador |
| `FINALIDADES_ADICIONALES` | Otras finalidades (por ejemplo, comunicaciones comerciales) | Hoy la app **no** envía emails ni comunicaciones comerciales |
| `CONDICIONES_PROVEEDOR_IA` | Uso de los datos por Google Gemini | **Depende del plan de Gemini API contratado**: en el nivel gratuito, las condiciones de Google pueden permitir usar los datos para mejorar sus productos. Elegir el plan y citar sus condiciones. |
| `ANALITICA`, `COOKIES_ANALITICA` | Google Tag Manager | Se carga si `VITE_GTM_ID` está configurado. **No hay banner de consentimiento.** Definir si se usa analítica y cómo se pide el consentimiento. |
| `TRANSFERENCIAS_INTERNACIONALES` | Datos procesados fuera del país | Google Cloud (región del proyecto), Gemini y Mercado Pago |
| `PLAZOS_CONSERVACION` | Cuánto se guardan los datos | Hoy no hay borrado automático |
| `DERECHOS_AUTORIDAD_CONTROL` | Autoridad de control y vías de reclamo | Por ejemplo, la AAIP en Argentina (Ley 25.326) |
| `POLITICA_MENORES`, `EDAD_MINIMA` | Menores de edad | La app ofrece niveles "Inicial" y "Secundario" y **no verifica la edad** |
| `POLITICA_REEMBOLSOS` | Reembolsos y derecho de arrepentimiento | El sistema ya revoca el plan ante un reembolso o contracargo (`PHASE5_PAYMENTS.md`). Definir los plazos y el procedimiento (botón de arrepentimiento si corresponde). |
| `REGLAS_CREDITOS_VENCIMIENTO` | Vencimiento de créditos | **Depende de las decisiones pendientes del modelo de créditos** (`CREDITS_BUCKETS_PROPOSAL.md`, sección 7). Hoy los créditos de un plan **no vencen** al terminar el plan. |
| `LIMITACION_RESPONSABILIDAD`, `LEY_Y_JURISDICCION`, `AVISO_CAMBIOS` | Cláusulas generales | — |

## Brechas técnicas que afectan a los textos

Ver [`DATA_INVENTORY.md`](./DATA_INVENTORY.md), sección 5. Las más importantes:
- **no hay borrado ni exportación de la cuenta** desde la app;
- no hay verificación de edad;
- no hay consentimiento de cookies.

Los textos actuales lo dicen tal como es (por ejemplo: "la app todavía no tiene una opción para hacerlo por tu cuenta").
