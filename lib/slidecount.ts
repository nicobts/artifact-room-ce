/**
 * Declared-convention slide-count parser (nullable). Per-slide *inference* at
 * render time lives in the viewer shim; this is the precise declared path used
 * at upload to seed `artifact.slideCount`.
 */
export function parseSlideCount(html: string): number | null {
  // 1. <meta name="slide-count" content="N">
  const meta = html.match(
    /<meta\b[^>]*\bname\s*=\s*["'](?:slide-count|slidecount)["'][^>]*\bcontent\s*=\s*["'](\d{1,4})["']/i,
  );
  if (meta) return clampPositive(meta[1]);

  // 2. data-slide attributes.
  const dataSlides = html.match(/\bdata-slide\b/gi);
  if (dataSlides && dataSlides.length >= 2) return dataSlides.length;

  // 3. reveal.js: top-level sections inside a .reveal deck.
  if (/class\s*=\s*["'][^"']*\breveal\b/i.test(html)) {
    const sections = html.match(/<section\b/gi);
    if (sections && sections.length >= 2) return sections.length;
  }

  return null;
}

function clampPositive(s: string): number | null {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 && n < 10000 ? n : null;
}
