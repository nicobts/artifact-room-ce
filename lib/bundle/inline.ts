import type { BundleAsset } from "./index";

/**
 * Pure bundle inliner: rewrites a root HTML document so every reference that
 * resolves to a bundled asset becomes self-contained — scripts and stylesheets
 * inline into tags, binaries become data: URIs. References that do NOT resolve
 * to a bundled asset are left byte-for-byte untouched: they then behave exactly
 * like today's external-subresource story (CSP-blocked by default + advisory).
 *
 * Runs BEFORE scanHtml, so the scanner always sees the final served bytes.
 */

type Assets = ReadonlyMap<string, BundleAsset>;

const TEXT_DECODER = new TextDecoder();

/** Resolve a reference string against a base directory to an asset-map key. */
function resolveRef(baseDir: string, rawRef: string, assets: Assets): string | null {
  let ref = rawRef.trim();
  if (!ref || ref.startsWith("#") || ref.startsWith("//")) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(ref)) return null; // has a scheme (http:, data:, …)
  const cut = ref.search(/[?#]/);
  if (cut !== -1) ref = ref.slice(0, cut);
  try {
    ref = decodeURIComponent(ref);
  } catch {
    return null;
  }
  // A root-relative ref inside a bundle can only mean the bundle root.
  const startDir = ref.startsWith("/") ? "" : baseDir;
  const parts = startDir ? startDir.split("/") : [];
  for (const seg of ref.replace(/^\//, "").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  const key = parts.join("/");
  return assets.has(key) ? key : null;
}

function dirOf(key: string): string {
  const i = key.lastIndexOf("/");
  return i === -1 ? "" : key.slice(0, i);
}

function dataUri(asset: BundleAsset): string {
  return `data:${asset.mime};base64,${Buffer.from(asset.bytes).toString("base64")}`;
}

function decodeText(asset: BundleAsset): string {
  return TEXT_DECODER.decode(asset.bytes);
}

/** `</script` inside inlined JS would close the tag early — escape it. */
function escapeScriptText(js: string): string {
  return js.replace(/<\/script/gi, "<\\/script");
}

/** `</style` inside inlined CSS — `\3c ` is the CSS escape for `<`. */
function escapeStyleText(css: string): string {
  return css.replace(/<\/style/gi, "\\3c /style");
}

/**
 * Replace `url(...)` references (in a stylesheet or in inline style content)
 * that resolve to bundled assets with data: URIs. `@import` of bundled CSS is
 * intentionally not followed (rare in AI exports; unresolved refs degrade
 * gracefully under CSP).
 */
function inlineCssUrls(css: string, baseDir: string, assets: Assets): string {
  return css.replace(
    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*?))\s*\)/gi,
    (whole, dq, sq, bare) => {
      const ref = dq ?? sq ?? bare ?? "";
      const key = resolveRef(baseDir, ref, assets);
      if (!key) return whole;
      return `url("${dataUri(assets.get(key)!)}")`;
    },
  );
}

/** `<script src="assets/x.js"></script>` → inline `<script>` (attrs preserved). */
function inlineScripts(html: string, assets: Assets): string {
  return html.replace(
    /<script\b([^>]*?)\s+src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/script\s*>/gi,
    (whole, pre, dq, sq, bare, post, body) => {
      if (body.trim() !== "") return whole; // malformed: src AND a body — leave it
      const ref = dq ?? sq ?? bare ?? "";
      const key = resolveRef("", ref, assets);
      if (!key) return whole;
      const asset = assets.get(key)!;
      if (asset.mime !== "text/javascript") return whole;
      const attrs = `${pre} ${post}`.replace(/\s+/g, " ").trim();
      const open = attrs ? `<script ${attrs}>` : "<script>";
      return `${open}${escapeScriptText(decodeText(asset))}</script>`;
    },
  );
}

/** `<link rel="stylesheet" href="assets/x.css">` → `<style>` with its url()s inlined. */
function inlineStylesheets(html: string, assets: Assets): string {
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const relValue = (rel?.[1] ?? rel?.[2] ?? rel?.[3] ?? "").toLowerCase();
    if (!relValue.split(/\s+/).includes("stylesheet")) return tag;
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const ref = href?.[1] ?? href?.[2] ?? href?.[3] ?? "";
    const key = resolveRef("", ref, assets);
    if (!key) return tag;
    const asset = assets.get(key)!;
    if (asset.mime !== "text/css") return tag;
    const css = inlineCssUrls(decodeText(asset), dirOf(key), assets);
    return `<style>${escapeStyleText(css)}</style>`;
  });
}

/** Remaining `src` / `href` / `poster` attributes pointing at bundled assets. */
function inlineAttrRefs(html: string, assets: Assets): string {
  return html.replace(
    /\b(src|href|poster)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
    (whole, attr, dq, sq) => {
      const ref = dq ?? sq ?? "";
      const key = resolveRef("", ref, assets);
      if (!key) return whole;
      return `${attr}="${dataUri(assets.get(key)!)}"`;
    },
  );
}

/** `srcset` attributes: each candidate URL is resolved independently. */
function inlineSrcsets(html: string, assets: Assets): string {
  return html.replace(
    /\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
    (whole, dq, sq) => {
      const value = dq ?? sq ?? "";
      const rewritten = value
        .split(",")
        .map((candidate: string) => {
          const m = /^(\s*)(\S+)(.*)$/.exec(candidate);
          if (!m) return candidate;
          const key = resolveRef("", m[2], assets);
          if (!key) return candidate;
          return `${m[1]}${dataUri(assets.get(key)!)}${m[3]}`;
        })
        .join(",");
      return `srcset="${rewritten}"`;
    },
  );
}

export function inlineBundle(html: string, assets: Assets): string {
  if (assets.size === 0) return html;
  let out = html;
  // Order matters: scripts/stylesheets must inline as tags BEFORE the generic
  // attribute pass would turn their src/href into (CSP-blocked) data: URIs.
  out = inlineScripts(out, assets);
  out = inlineStylesheets(out, assets);
  out = inlineCssUrls(out, "", assets); // <style> blocks + style="" attributes
  out = inlineSrcsets(out, assets);
  out = inlineAttrRefs(out, assets);
  return out;
}
