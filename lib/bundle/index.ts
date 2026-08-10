import { unzipSync } from "fflate";
import { inlineBundle } from "./inline";

/**
 * Zip-bundle ingest (zip-bundle-upload). A bundle is EXACTLY one root HTML
 * document plus an optional `assets/` subtree. It is validated fail-closed,
 * then normalized IN MEMORY into a single self-contained HTML document —
 * nothing extracted here ever touches the filesystem, and no multi-file
 * serving path exists downstream — the single-file artifact contract holds.
 */

export const MAX_BUNDLE_ENTRIES = 100;
export const MAX_ASSET_BYTES = 5 * 1024 * 1024; // per entry, uncompressed
export const MAX_TOTAL_UNCOMPRESSED = 30 * 1024 * 1024;
export const MAX_COMPRESSION_RATIO = 100; // bomb guard
export const MAX_INLINED_BYTES = 10 * 1024 * 1024; // normalized document cap

export interface BundleAsset {
  bytes: Uint8Array;
  mime: string;
}

export type ExtractResult =
  | { ok: true; htmlName: string; html: string; assets: Map<string, BundleAsset> }
  | { ok: false; rule: string; reason: string };

/** Extensions an `assets/` entry may have. Anything else rejects (fail closed). */
const ASSET_MIME: Record<string, string> = {
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
};

/** OS junk silently ignored rather than rejected (real-world macOS/Windows zips). */
const JUNK_BASENAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

/** Zip detection by magic bytes only — client MIME/filename are never trusted. */
export function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06)
  );
}

class BundleError extends Error {
  constructor(
    public rule: string,
    public reason: string,
  ) {
    super(reason);
  }
}

function isJunk(name: string): boolean {
  if (name.startsWith("__MACOSX/")) return true;
  const base = name.slice(name.lastIndexOf("/") + 1);
  return JUNK_BASENAMES.has(base);
}

function hasControlChars(name: string): boolean {
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

function assertSafeName(name: string): void {
  const bad =
    name.length > 255 ||
    name.startsWith("/") ||
    name.includes("\\") ||
    name.includes(":") ||
    hasControlChars(name) ||
    name.split("/").some((seg) => seg === "..");
  if (bad) {
    throw new BundleError(
      "bundle-entry-name",
      `Unsafe entry name in archive: "${name.slice(0, 80)}".`,
    );
  }
}

/**
 * Validate the bundle contract and return the root HTML + asset map.
 * Limits are enforced from central-directory metadata BEFORE inflated output
 * is trusted, then re-verified against actual inflated lengths.
 */
export function extractBundle(zipBytes: Uint8Array): ExtractResult {
  let entryCount = 0;
  let declaredTotal = 0;

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(zipBytes, {
      filter: (file) => {
        if (file.name.endsWith("/")) return false; // directory entry
        if (isJunk(file.name)) return false;
        assertSafeName(file.name);
        entryCount += 1;
        if (entryCount > MAX_BUNDLE_ENTRIES) {
          throw new BundleError(
            "bundle-entries",
            `Archive has more than ${MAX_BUNDLE_ENTRIES} files.`,
          );
        }
        if (file.originalSize > MAX_ASSET_BYTES) {
          throw new BundleError(
            "bundle-entry-size",
            `"${file.name}" exceeds ${MAX_ASSET_BYTES} bytes uncompressed.`,
          );
        }
        declaredTotal += file.originalSize;
        if (
          declaredTotal > MAX_TOTAL_UNCOMPRESSED ||
          declaredTotal > zipBytes.length * MAX_COMPRESSION_RATIO
        ) {
          throw new BundleError(
            "bundle-bomb",
            "Archive expands beyond the allowed uncompressed size.",
          );
        }
        return true;
      },
    });
  } catch (err) {
    if (err instanceof BundleError) {
      return { ok: false, rule: err.rule, reason: err.reason };
    }
    return { ok: false, rule: "bundle-corrupt", reason: "Archive is not a readable zip." };
  }

  const htmlNames: string[] = [];
  const assets = new Map<string, BundleAsset>();
  let actualTotal = 0;

  for (const [name, bytes] of Object.entries(unzipped)) {
    // Central-directory sizes can lie — re-verify what was actually inflated.
    actualTotal += bytes.length;
    if (bytes.length > MAX_ASSET_BYTES || actualTotal > MAX_TOTAL_UNCOMPRESSED) {
      return {
        ok: false,
        rule: "bundle-bomb",
        reason: "Archive expands beyond the allowed uncompressed size.",
      };
    }

    if (!name.includes("/") && /\.html?$/i.test(name)) {
      htmlNames.push(name);
      continue;
    }
    if (name.startsWith("assets/")) {
      const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
      const mime = name.includes(".") ? ASSET_MIME[ext] : undefined;
      if (!mime) {
        return {
          ok: false,
          rule: "bundle-asset-type",
          reason: `"${name}" is not an allowed asset type.`,
        };
      }
      assets.set(name, { bytes, mime });
      continue;
    }
    return {
      ok: false,
      rule: "bundle-layout",
      reason: `"${name}" is outside the allowed layout (one root HTML file + an assets/ folder).`,
    };
  }

  if (htmlNames.length !== 1) {
    return {
      ok: false,
      rule: "bundle-html-count",
      reason:
        htmlNames.length === 0
          ? "Archive contains no root HTML file."
          : "Archive must contain exactly one root HTML file.",
    };
  }

  const htmlName = htmlNames[0];
  return {
    ok: true,
    htmlName,
    html: Buffer.from(unzipped[htmlName]).toString("utf8"),
    assets,
  };
}

export type NormalizeResult =
  | { ok: true; bytes: Buffer }
  | { ok: false; rule: string; reason: string };

/**
 * Full bundle path: extract → validate → inline. Returns the normalized
 * single-file HTML bytes that then flow through the UNCHANGED scan-and-store
 * pipeline. Callers only reach this after `isZip` matched.
 */
export function normalizeBundle(zipBytes: Uint8Array): NormalizeResult {
  const extracted = extractBundle(zipBytes);
  if (!extracted.ok) return extracted;

  const inlined = inlineBundle(extracted.html, extracted.assets);
  const bytes = Buffer.from(inlined, "utf8");
  if (bytes.length > MAX_INLINED_BYTES) {
    return {
      ok: false,
      rule: "bundle-inlined-size",
      reason: `Bundle exceeds ${MAX_INLINED_BYTES} bytes once assets are inlined.`,
    };
  }
  return { ok: true, bytes };
}
