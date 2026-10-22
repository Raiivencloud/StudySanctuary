/**
 * Legal texts (src/legal/privacy.md, terms.md): PRELIMINARY drafts for professional review.
 * {{PLACEHOLDERS}} are filled from the build variables below; anything not filled is shown as
 * "[Pendiente de revisión legal: ...]" so an unfinished text is never mistaken for a final one.
 */
export type LegalValues = Record<string, string | undefined>;

const LABELS: Record<string, string> = {
  RESPONSABLE: 'razón social del responsable',
  EMAIL_CONTACTO: 'email de contacto',
  FECHA_VIGENCIA: 'fecha de vigencia',
  DOMICILIO: 'domicilio',
};

/** Replaces {{KEY}} with its value, or with a visible pending marker. */
export function fillLegalText(markdown: string, values: LegalValues): string {
  return markdown.replace(/\{\{([A-Z_]+)\}\}/g, (_, key: string) => {
    const value = values[key]?.trim();
    if (value) return value;
    const label = LABELS[key] || key.toLowerCase().replace(/_/g, ' ');
    return `[Pendiente de revisión legal: ${label}]`;
  });
}

/** Values available at build time (VITE_LEGAL_*). Long clauses are completed in the .md files themselves. */
export function legalValuesFromEnv(env: Record<string, string | undefined>): LegalValues {
  return {
    RESPONSABLE: env.VITE_LEGAL_ENTITY_NAME,
    EMAIL_CONTACTO: env.VITE_LEGAL_CONTACT_EMAIL,
    FECHA_VIGENCIA: env.VITE_LEGAL_EFFECTIVE_DATE,
    DOMICILIO: env.VITE_LEGAL_ADDRESS,
  };
}

/** The texts count as final only when a reviewer marks them approved AND no placeholder is left. */
export function isLegalTextFinal(filled: string, approvedFlag: string | undefined): boolean {
  return approvedFlag === 'true' && !filled.includes('[Pendiente de revisión legal');
}
