/**
 * Scrubs secrets from values before they are written to the log.
 * Keys are matched case-insensitively; anything that looks like a JWT is
 * masked wherever it appears, including inside free-text messages.
 */
const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|api[-_]?key|private[-_]?key|seed|signature/i;
const JWT_PATTERN = /\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g;
const BEARER_PATTERN = /\bBearer\s+[\w.~+/-]+=*/gi;

export const REDACTED = '[REDACTED]';

export function redactString(value: string): string {
  return value.replace(BEARER_PATTERN, `Bearer ${REDACTED}`).replace(JWT_PATTERN, REDACTED);
}

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object') return value;
  if (depth > 6) return '[Truncated]';
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message), stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(inner, depth + 1);
  }
  return out;
}

/** Strips the query string's sensitive params, e.g. `?token=...`. */
export function redactUrl(url: string): string {
  const [path, query] = url.split('?', 2);
  if (!query) return redactString(url);
  const params = query
    .split('&')
    .map((pair) => {
      const [key] = pair.split('=', 1);
      return SENSITIVE_KEY.test(decodeURIComponent(key)) ? `${key}=${REDACTED}` : pair;
    })
    .join('&');
  return redactString(`${path}?${params}`);
}
