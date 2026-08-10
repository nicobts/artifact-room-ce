import { extractExternalUrls } from "./urls";
import {
  looksLikeHtml,
  hasExternalFormAction,
  hasMetaRefreshExternal,
  findObfuscation,
  usesStorageApis,
  hasExternalSubresources,
} from "./heuristics";
import { getSignatures, matchSignature } from "./signatures";
import { checkSafeBrowsing } from "./safe-browsing";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export type ScanVerdict =
  | { ok: true; advisories: string[] }
  | { ok: false; rule: string; reason: string };

export interface ScanOptions {
  maxBytes?: number;
  declaredContentType?: string;
  /** Extra (DB-managed) known-bad signatures appended to the defaults. */
  signatures?: readonly string[];
  safeBrowsingKey?: string;
}

/**
 * Scan-and-reject pipeline. Ordered and fail-closed on the local
 * checks: any rejection returns `{ ok: false }` and the caller stores nothing.
 * On a clean pass it returns advisory (non-rejecting) compatibility flags.
 */
export async function scanHtml(
  bytes: Buffer,
  html: string,
  opts: ScanOptions = {},
): Promise<ScanVerdict> {
  const maxBytes = opts.maxBytes ?? MAX_UPLOAD_BYTES;

  // 1. Shape checks.
  if (
    opts.declaredContentType &&
    !/text\/html/i.test(opts.declaredContentType)
  ) {
    return { ok: false, rule: "content-type", reason: "Only text/html is accepted." };
  }
  if (bytes.length > maxBytes) {
    return { ok: false, rule: "size", reason: `File exceeds ${maxBytes} bytes.` };
  }
  if (!looksLikeHtml(html)) {
    return {
      ok: false,
      rule: "not-html",
      reason: "Content does not look like an HTML document.",
    };
  }

  // 2. Heuristic static checks (reject).
  if (hasExternalFormAction(html)) {
    return {
      ok: false,
      rule: "external-form",
      reason: "A form submits to an external origin (credential-harvest pattern).",
    };
  }
  if (hasMetaRefreshExternal(html)) {
    return {
      ok: false,
      rule: "meta-refresh",
      reason: "A meta refresh redirects to an external origin.",
    };
  }
  if (findObfuscation(html)) {
    return {
      ok: false,
      rule: "obfuscation",
      reason: "An obfuscated script pattern was detected.",
    };
  }
  const sig = matchSignature(html, getSignatures(opts.signatures));
  if (sig) {
    return {
      ok: false,
      rule: "signature",
      reason: "Content matches a known-bad signature.",
    };
  }

  // 3. Safe Browsing lookup on outbound URLs.
  const urls = extractExternalUrls(html);
  const sb = await checkSafeBrowsing(urls, opts.safeBrowsingKey);
  if (sb.flagged.length > 0) {
    return {
      ok: false,
      rule: "safe-browsing",
      reason: `An outbound URL is flagged as unsafe: ${sb.flagged[0]}`,
    };
  }

  // Clean: advisory (warn, never reject) compatibility flags.
  const advisories: string[] = [];
  if (usesStorageApis(html)) advisories.push("uses-storage-apis");
  if (hasExternalSubresources(html)) advisories.push("external-subresources");
  if (!sb.checked && urls.length > 0) advisories.push("safe-browsing-skipped");
  return { ok: true, advisories };
}
