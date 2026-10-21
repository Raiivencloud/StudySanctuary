/**
 * Owner-specific public identifiers, in one place (docs/SALE_AND_TRANSFER.md).
 * The defaults are the current owner's values; a new owner sets the VITE_* variables at build
 * time or edits the defaults here.
 */
const env = ((import.meta as any).env || {}) as Record<string, string | undefined>;

/** Community link shown in several screens (Discord). */
export const COMMUNITY_URL = env.VITE_COMMUNITY_URL || 'https://discord.gg/Y5yFKEYD9r';

/**
 * Google Tag Manager container. Disabled in the local demo and with VITE_GTM_ID=off.
 * Only the GTM-XXXX format is accepted (the id is inserted into a script).
 */
export function gtmContainerId(): string | null {
  if (env.VITE_DEMO_MODE === 'true' || env.VITE_USE_FIREBASE_EMULATORS === 'true') return null;
  const id = env.VITE_GTM_ID ?? 'GTM-TSHX7NTR';
  return /^GTM-[A-Z0-9]{4,12}$/.test(id) ? id : null;
}
