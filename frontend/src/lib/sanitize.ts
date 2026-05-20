/**
 * Client-side XSS sanitization & input validation utilities.
 *
 * Complement to the backend's sanitizeInput/threatDetection middleware.
 * These helpers protect against reflected/stored XSS in user-generated
 * content rendered via dangerouslySetInnerHTML or URL construction.
 */

const SCRIPT_TAG = /<script[\s\S]*?>[\s\S]*?<\/script>/gi;
const ON_EVENT_ATTR = /\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_PROTO = /javascript\s*:/gi;
const DATA_URI_EXEC = /data:\s*text\s*\/\s*html\s*;/gi;
const HTML_TAG_STRIP = /<[^>]*>/g;

/**
 * Strips HTML tags and dangerous content from a string.
 * Safe for display in text nodes — NOT safe for dangerouslySetInnerHTML.
 */
export function stripTags(input: string): string {
  return input
    .replace(SCRIPT_TAG, "")
    .replace(ON_EVENT_ATTR, "")
    .replace(JAVASCRIPT_PROTO, "blocked:")
    .replace(DATA_URI_EXEC, "blocked:")
    .replace(HTML_TAG_STRIP, "")
    .trim();
}

/**
 * Sanitize a string for safe use in a URL (e.g., redirect params).
 * Removes javascript: and data: URIs that could be used for XSS.
 */
export function sanitizeUrl(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("data:text/html") ||
    trimmed.startsWith("vbscript:")
  ) {
    return "";
  }
  return input.trim();
}

/**
 * Encode a string for safe embedding in HTML attribute values.
 */
export function encodeAttr(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Validate an email address format.
 */
export function isValidEmail(input: string): boolean {
  if (!input || input.length > 254) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(input.trim());
}

/**
 * Validate a UUID v4 format.
 */
export function isValidUuid(input: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    input.trim(),
  );
}

/**
 * Sanitize a search/filter query — strip control characters and trim.
 */
export function sanitizeQuery(input: string): string {
  return input.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().slice(0, 500);
}

/**
 * Strip non-numeric characters from a phone / numeric input.
 */
export function stripNonNumeric(input: string): string {
  return input.replace(/\D/g, "");
}
