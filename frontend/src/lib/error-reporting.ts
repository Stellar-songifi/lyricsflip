/**
 * Client error reporting (LF-218).
 *
 * A tiny, dependency-free error-reporting module. It is enabled only when the
 * environment flag is set, and it deliberately collects a very small, fixed set
 * of fields so that no secrets (secret keys, signed XDR, full transaction
 * envelopes, etc.) ever leave the browser.
 *
 * Configuration (all optional, read at build time by Next.js):
 *   NEXT_PUBLIC_ERROR_REPORTING_ENABLED  "true" | "1" to enable reporting.
 *   NEXT_PUBLIC_ERROR_REPORTING_DSN      Endpoint / DSN to POST reports to.
 *   NEXT_PUBLIC_ERROR_REPORTING_ENV      Environment label (e.g. "staging").
 *
 * See frontend/PRIVACY.md for the privacy note describing what is collected.
 */

/** The only context fields that may be attached to a report. */
export interface ErrorReportContext {
  /** Name of the contract error (e.g. "InsufficientBalance"), never raw data. */
  contractError?: string;
  /** Stellar network the app was talking to (e.g. "testnet", "mainnet"). */
  network?: string;
  /** Route / pathname where the error occurred (e.g. "/play"). */
  route?: string;
  /** Optional short, human-readable label for the operation (e.g. "submit_answer"). */
  operation?: string;
  /** Where the report came from (e.g. "global-error"). */
  source?: string;
}

/** Shape of the payload actually sent to the tracker. */
export interface SanitizedErrorReport {
  message: string;
  name: string;
  stack?: string;
  environment: string;
  timestamp: string;
  contractError?: string;
  network?: string;
  route?: string;
  operation?: string;
  userAgent?: string;
}

const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 4000;
const MAX_FIELD_LENGTH = 120;

/** Patterns that indicate sensitive material which must never be transmitted. */
const SENSITIVE_PATTERNS: RegExp[] = [
  // Stellar secret seeds (S... 56 chars).
  /\bS[A-Z2-7]{55}\b/g,
  // Stellar public keys (G... 56 chars) — not secret, but not needed.
  /\bG[A-Z2-7]{55}\b/g,
  // Base64 blobs long enough to be XDR / transaction envelopes.
  /\b[A-Za-z0-9+/]{80,}={0,2}\b/g,
  // PEM private keys.
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  // Common secret-ish key/value pairs.
  /\b(secret|seed|private[_-]?key|mnemonic|password|token)\b\s*[:=]\s*\S+/gi,
];

const REDACTED = "[redacted]";

let initialized = false;
let enabled = false;
let dsn: string | undefined;
let environment = "unknown";

function readEnv(name: string): string | undefined {
  // Access via process.env so Next.js can inline NEXT_PUBLIC_* at build time.
  // Guarded so this module is safe to import in non-Node environments.
  try {
    const value = process.env?.[name];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

/**
 * Remove anything that looks like a secret key, full XDR, or credential from a
 * string. Also truncates to a sane maximum length.
 */
export function sanitizeString(value: unknown, maxLength = MAX_FIELD_LENGTH): string | undefined {
  if (value === undefined || value === null) return undefined;
  let text = typeof value === "string" ? value : String(value);
  for (const pattern of SENSITIVE_PATTERNS) {
    text = text.replace(pattern, REDACTED);
  }
  text = text.trim();
  if (text.length === 0) return undefined;
  if (text.length > maxLength) {
    text = `${text.slice(0, maxLength)}…`;
  }
  return text;
}

function sanitizeField(value: unknown): string | undefined {
  return sanitizeString(value, MAX_FIELD_LENGTH);
}

/**
 * Initialize the reporter. Safe to call multiple times; only the first call
 * takes effect. Returns whether reporting is enabled.
 */
export function initErrorReporting(): boolean {
  if (initialized) return enabled;
  initialized = true;

  const flag = readEnv("NEXT_PUBLIC_ERROR_REPORTING_ENABLED");
  dsn = readEnv("NEXT_PUBLIC_ERROR_REPORTING_DSN");
  environment = readEnv("NEXT_PUBLIC_ERROR_REPORTING_ENV") ?? "unknown";

  // Reporting requires both an explicit enable flag and a destination.
  enabled = isTruthy(flag) && Boolean(dsn);
  return enabled;
}

/** Whether error reporting is currently enabled. */
export function isErrorReportingEnabled(): boolean {
  if (!initialized) initErrorReporting();
  return enabled;
}

function normalizeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: sanitizeString(error.name, MAX_FIELD_LENGTH) ?? "Error",
      message: sanitizeString(error.message, MAX_MESSAGE_LENGTH) ?? "Unknown error",
      stack: sanitizeString(error.stack, MAX_STACK_LENGTH),
    };
  }
  if (typeof error === "string") {
    return {
      name: "Error",
      message: sanitizeString(error, MAX_MESSAGE_LENGTH) ?? "Unknown error",
    };
  }
  return {
    name: "Error",
    message: "Unknown error",
  };
}

/**
 * Build the sanitized payload that would be sent. Exposed for testing and for
 * callers that want to inspect what is collected.
 */
export function buildReport(error: unknown, context: ErrorReportContext = {}): SanitizedErrorReport {
  const normalized = normalizeError(error);
  const report: SanitizedErrorReport = {
    name: normalized.name,
    message: normalized.message,
    environment,
    timestamp: new Date().toISOString(),
  };

  if (normalized.stack) report.stack = normalized.stack;

  const contractError = sanitizeField(context.contractError);
  if (contractError) report.contractError = contractError;

  const network = sanitizeField(context.network);
  if (network) report.network = network;

  const route = sanitizeField(context.route);
  if (route) report.route = route;

  const operation = sanitizeField(context.operation);
  if (operation) report.operation = operation;

  if (typeof navigator !== "undefined" && typeof navigator.userAgent === "string") {
    report.userAgent = sanitizeString(navigator.userAgent, MAX_FIELD_LENGTH);
  }

  return report;
}

/**
 * Report an error to the configured tracker. No-op when reporting is disabled.
 * Never throws; failures to report are swallowed so they cannot break the app.
 */
export function reportError(error: unknown, context: ErrorReportContext = {}): void {
  if (!isErrorReportingEnabled() || !dsn) return;

  try {
    const payload = buildReport(error, context);

    // Prefer sendBeacon so reports survive page unloads; fall back to fetch.
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const sent = navigator.sendBeacon(dsn, blob);
      if (sent) return;
    }

    if (typeof fetch === "function") {
      void fetch(dsn, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        /* ignore reporting failures */
      });
    }
  } catch {
    /* never let reporting break the app */
  }
}

/** Reset internal state. Intended for tests only. */
export function __resetErrorReportingForTests(): void {
  initialized = false;
  enabled = false;
  dsn = undefined;
  environment = "unknown";
}