/**
 * Licenses that the content policy (docs/content-policy.md) permits for
 * lyric cards.
 *
 * Rules:
 *  1. Original demo lyrics written for LyricsFlip → CC0-1.0
 *  2. Public-domain compositions and lyrics (US + contributor's country)
 *     → one of the public-domain SPDX identifiers below
 *  3. Licensed from a lyrics provider (LyricFind, Musixmatch, etc.) under a
 *     written agreement → LicenseRef-<provider>  (validated by prefix only;
 *     the exact provider name is not checked here)
 *
 * Any license value that is not in this list (and is not a valid
 * LicenseRef-<provider> prefix) will be rejected at submission time.
 *
 * The seed script and admin create endpoint both pass through this same
 * allow-list, so the database can never contain a card with an unlicensed
 * value.
 */
export const ALLOWED_SPDX_LICENSES: readonly string[] = [
  // Original demo / open content
  'CC0-1.0',

  // Public domain
  'CC-PDDC',       // Creative Commons Public Domain Dedication and Certification
  'LicenseRef-PublicDomain',
] as const;

/**
 * Prefix for provider-licensed data (e.g. "LicenseRef-LyricFind",
 * "LicenseRef-Musixmatch"). The value must start with this prefix followed
 * by a non-empty provider slug containing only alphanumerics and hyphens.
 */
export const LICENSE_REF_PREFIX = 'LicenseRef-';

/**
 * Returns true if `license` is permitted by the content policy.
 *
 * A value is permitted when it is:
 *   - listed verbatim in ALLOWED_SPDX_LICENSES, or
 *   - a valid LicenseRef-<provider> identifier (LicenseRef- followed by one
 *     or more alphanumeric/hyphen characters, e.g. "LicenseRef-LyricFind").
 */
export function isAllowedLicense(license: string): boolean {
  if (ALLOWED_SPDX_LICENSES.includes(license)) {
    return true;
  }
  // LicenseRef-<provider>: prefix + at least one alphanumeric character
  if (license.startsWith(LICENSE_REF_PREFIX)) {
    const provider = license.slice(LICENSE_REF_PREFIX.length);
    return /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(provider);
  }
  return false;
}
