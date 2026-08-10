const ATTR_URL_RE = /(?:href|src|action)\s*=\s*["']\s*(https?:\/\/[^"'\s>]+)/gi;
const CSS_URL_RE = /url\(\s*["']?\s*(https?:\/\/[^"')\s]+)/gi;
const IMPORT_RE = /@import\s+["']\s*(https?:\/\/[^"']+)/gi;

/** Absolute http(s) URLs referenced by the document (for Safe Browsing lookups). */
export function extractExternalUrls(html: string): string[] {
  const urls = new Set<string>();
  for (const re of [ATTR_URL_RE, CSS_URL_RE, IMPORT_RE]) {
    for (const match of html.matchAll(re)) {
      if (match[1]) urls.add(match[1]);
    }
  }
  return [...urls];
}
