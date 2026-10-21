/**
 * Client-side admin detection. This only controls what the UI shows: every admin
 * operation is authorized by the server (custom claim `admin` or ADMIN_EMAILS).
 */

// Legacy owner account, kept so the admin menu keeps working until the `admin`
// custom claim is assigned (scripts/ops/admin-claims.ts). To be removed when the
// project is transferred (audit A-07).
const LEGACY_ADMIN_EMAILS = ['agusgestro17@gmail.com'];

/** "Fundador" badge in the header: the same legacy owner account (replace or empty it when transferring). */
export function isFounder(email: string | null | undefined): boolean {
  return Boolean(email) && LEGACY_ADMIN_EMAILS.includes(email!.toLowerCase());
}

export function isAdminUser(email: string | null | undefined, claims: Record<string, unknown> | undefined): boolean {
  if (claims?.admin === true) return true;
  return Boolean(email) && LEGACY_ADMIN_EMAILS.includes(email!.toLowerCase());
}
