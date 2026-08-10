/**
 * Static heuristic checks on raw HTML. These are intentionally regex-based (no
 * DOM dependency): scanning is the probabilistic intake gate; the render-time
 * sandbox (viewer-render-sandbox) is the actual guarantee. Defense in depth.
 */

/** Looks like an HTML document at all. */
export function looksLikeHtml(html: string): boolean {
  return /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html);
}

/** A <form> whose action posts to an absolute external origin — the #1 credential-harvest vector. */
export function hasExternalFormAction(html: string): boolean {
  return /<form\b[^>]*\baction\s*=\s*["']\s*https?:\/\//i.test(html);
}

/** A meta-refresh that redirects to an external origin. */
export function hasMetaRefreshExternal(html: string): boolean {
  return /<meta\b[^>]*http-equiv\s*=\s*["']\s*refresh\s*["'][^>]*content\s*=\s*["'][^"']*url=\s*https?:\/\//i.test(
    html,
  );
}

/** A password input present in the document. */
export function hasPasswordInput(html: string): boolean {
  return /<input\b[^>]*\btype\s*=\s*["']\s*password\s*["']/i.test(html);
}

const OBFUSCATION_PATTERNS: RegExp[] = [
  /eval\s*\(\s*atob\s*\(/i,
  /eval\s*\(\s*unescape\s*\(/i,
  /document\.write\s*\(\s*unescape\s*\(/i,
  /eval\s*\(\s*String\.fromCharCode/i,
  /atob\s*\(\s*["'][A-Za-z0-9+/=]{200,}["']\s*\)/i, // large base64 blob decoded inline
];

/** Returns the matched obfuscation pattern source, or null. */
export function findObfuscation(html: string): string | null {
  for (const re of OBFUSCATION_PATTERNS) if (re.test(html)) return re.source;
  return null;
}

/** Advisory (not a rejection): document uses client storage APIs that won't work under the sandbox. */
export function usesStorageApis(html: string): boolean {
  return (
    /\b(?:localStorage|sessionStorage|indexedDB)\b/.test(html) ||
    /document\s*\.\s*cookie/.test(html)
  );
}

/** Advisory (not a rejection): document references external subresources (blocked by default at render). */
export function hasExternalSubresources(html: string): boolean {
  return (
    /<(?:script|link|img|source|iframe|audio|video)\b[^>]*\b(?:src|href)\s*=\s*["']\s*https?:\/\//i.test(
      html,
    ) ||
    /@import\s+["']?\s*https?:\/\//i.test(html) ||
    /url\(\s*["']?\s*https?:\/\//i.test(html)
  );
}
