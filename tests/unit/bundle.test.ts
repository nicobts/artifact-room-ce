import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  isZip,
  extractBundle,
  normalizeBundle,
  MAX_BUNDLE_ENTRIES,
} from "@/lib/bundle";
import { inlineBundle } from "@/lib/bundle/inline";
import type { BundleAsset } from "@/lib/bundle";

const HTML = `<!doctype html><html><head></head><body><h1>Hi</h1></body></html>`;

function zip(entries: Record<string, Uint8Array>): Buffer {
  return Buffer.from(zipSync(entries));
}

function assetMap(entries: Record<string, { text?: string; bytes?: Uint8Array; mime: string }>) {
  const map = new Map<string, BundleAsset>();
  for (const [k, v] of Object.entries(entries)) {
    map.set(k, { bytes: v.bytes ?? strToU8(v.text ?? ""), mime: v.mime });
  }
  return map;
}

describe("isZip", () => {
  it("detects zip magic bytes and rejects non-zips", () => {
    expect(isZip(zip({ "index.html": strToU8(HTML) }))).toBe(true);
    expect(isZip(Buffer.from(HTML))).toBe(false);
    expect(isZip(Buffer.from(""))).toBe(false);
  });
});

describe("extractBundle — contract", () => {
  it("accepts one root HTML plus assets/", () => {
    const res = extractBundle(
      zip({
        "index.html": strToU8(HTML),
        "assets/style.css": strToU8("body{color:red}"),
        "assets/img/logo.png": new Uint8Array([1, 2, 3]),
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.htmlName).toBe("index.html");
    expect([...res.assets.keys()].sort()).toEqual([
      "assets/img/logo.png",
      "assets/style.css",
    ]);
  });

  it("silently ignores OS junk", () => {
    const res = extractBundle(
      zip({
        "index.html": strToU8(HTML),
        "__MACOSX/index.html": strToU8("junk"),
        "assets/.DS_Store": strToU8("junk"),
        "assets/Thumbs.db": strToU8("junk"),
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.assets.size).toBe(0);
  });

  it("rejects zero root HTML files", () => {
    const res = extractBundle(zip({ "assets/style.css": strToU8("a{}") }));
    expect(res).toMatchObject({ ok: false, rule: "bundle-html-count" });
  });

  it("rejects two root HTML files", () => {
    const res = extractBundle(
      zip({ "a.html": strToU8(HTML), "b.html": strToU8(HTML) }),
    );
    expect(res).toMatchObject({ ok: false, rule: "bundle-html-count" });
  });

  it("rejects an HTML file nested in a folder", () => {
    const res = extractBundle(zip({ "pages/index.html": strToU8(HTML) }));
    expect(res).toMatchObject({ ok: false, rule: "bundle-layout" });
  });

  it("rejects a stray root file outside assets/", () => {
    const res = extractBundle(
      zip({ "index.html": strToU8(HTML), "readme.txt": strToU8("hi") }),
    );
    expect(res).toMatchObject({ ok: false, rule: "bundle-layout" });
  });

  it("rejects disallowed asset extensions (nested zip, html, extensionless)", () => {
    for (const name of ["assets/inner.zip", "assets/page.html", "assets/noext"]) {
      const res = extractBundle(
        zip({ "index.html": strToU8(HTML), [name]: new Uint8Array([1]) }),
      );
      expect(res).toMatchObject({ ok: false, rule: "bundle-asset-type" });
    }
  });

  it("rejects traversal and hostile entry names", () => {
    for (const name of ["../evil.js", "/abs.css", "a\\b.css", "c:x.css"]) {
      const res = extractBundle(
        zip({ "index.html": strToU8(HTML), [name]: new Uint8Array([1]) }),
      );
      expect(res).toMatchObject({ ok: false, rule: "bundle-entry-name" });
    }
  });

  it("rejects archives with too many entries", () => {
    const entries: Record<string, Uint8Array> = { "index.html": strToU8(HTML) };
    for (let i = 0; i <= MAX_BUNDLE_ENTRIES; i++) {
      entries[`assets/f${i}.txt`] = strToU8("x");
    }
    const res = extractBundle(zip(entries));
    expect(res).toMatchObject({ ok: false, rule: "bundle-entries" });
  });

  it("rejects a decompression bomb by ratio before trusting inflation", () => {
    // ~4.9 MB of zeros compresses to a few KB — ratio guard must trip.
    const res = extractBundle(
      zip({
        "index.html": strToU8(HTML),
        "assets/zeros.txt": new Uint8Array(4_900_000),
      }),
    );
    expect(res).toMatchObject({ ok: false, rule: "bundle-bomb" });
  });

  it("rejects corrupt archives", () => {
    const bytes = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from("garbage"),
    ]);
    const res = extractBundle(bytes);
    expect(res).toMatchObject({ ok: false, rule: "bundle-corrupt" });
  });
});

describe("inlineBundle", () => {
  it("inlines <script src> into an inline script, preserving attributes", () => {
    const assets = assetMap({
      "assets/app.js": { text: `console.log("hi")`, mime: "text/javascript" },
    });
    const out = inlineBundle(
      `<script type="module" src="assets/app.js"></script>`,
      assets,
    );
    expect(out).toBe(`<script type="module">console.log("hi")</script>`);
  });

  it("escapes </script> sequences inside inlined JS", () => {
    const assets = assetMap({
      "assets/app.js": { text: `const s = "</script>";`, mime: "text/javascript" },
    });
    const out = inlineBundle(`<script src="assets/app.js"></script>`, assets);
    expect(out).toContain(`<\\/script>`);
    expect(out.match(/<\/script>/g)).toHaveLength(1); // only the closing tag
  });

  it("inlines a stylesheet link into <style> and resolves url() relative to the CSS file", () => {
    const assets = assetMap({
      "assets/style.css": {
        text: `body{background:url("bg.png")}`,
        mime: "text/css",
      },
      "assets/bg.png": { bytes: new Uint8Array([9, 9]), mime: "image/png" },
    });
    const out = inlineBundle(
      `<link rel="stylesheet" href="assets/style.css">`,
      assets,
    );
    expect(out).toContain("<style>");
    expect(out).toContain(`url("data:image/png;base64,`);
    expect(out).not.toContain("bg.png");
  });

  it("inlines img src and srcset candidates as data: URIs", () => {
    const assets = assetMap({
      "assets/a.png": { bytes: new Uint8Array([1]), mime: "image/png" },
      "assets/b.png": { bytes: new Uint8Array([2]), mime: "image/png" },
    });
    const out = inlineBundle(
      `<img src="./assets/a.png" srcset="assets/a.png 1x, assets/b.png 2x">`,
      assets,
    );
    expect(out).not.toContain("assets/a.png");
    expect(out).not.toContain("assets/b.png");
    expect(out.match(/data:image\/png;base64,/g)!.length).toBe(3);
  });

  it("inlines url() inside inline <style> blocks", () => {
    const assets = assetMap({
      "assets/bg.png": { bytes: new Uint8Array([7]), mime: "image/png" },
    });
    const out = inlineBundle(
      `<style>.x{background:url(assets/bg.png)}</style>`,
      assets,
    );
    expect(out).toContain("data:image/png;base64,");
  });

  it("leaves unresolved and external references untouched", () => {
    const assets = assetMap({
      "assets/a.png": { bytes: new Uint8Array([1]), mime: "image/png" },
    });
    const html =
      `<img src="assets/missing.png">` +
      `<script src="https://cdn.example/x.js"></script>` +
      `<a href="#anchor">x</a>`;
    expect(inlineBundle(html, assets)).toBe(html);
  });

  it("does not resolve refs that escape the bundle root", () => {
    const assets = assetMap({
      "assets/a.png": { bytes: new Uint8Array([1]), mime: "image/png" },
    });
    const html = `<img src="../assets/a.png">`;
    expect(inlineBundle(html, assets)).toBe(html);
  });
});

describe("normalizeBundle", () => {
  it("produces a single self-contained HTML document", () => {
    const res = normalizeBundle(
      zip({
        "index.html": strToU8(
          `<!doctype html><html><head><link rel="stylesheet" href="assets/s.css"></head>` +
            `<body><img src="assets/logo.png"><script src="assets/app.js"></script></body></html>`,
        ),
        "assets/s.css": strToU8("h1{color:blue}"),
        "assets/logo.png": new Uint8Array([137, 80, 78, 71]),
        "assets/app.js": strToU8("document.title='x'"),
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const html = res.bytes.toString("utf8");
    expect(html).toContain("<style>h1{color:blue}</style>");
    expect(html).toContain("data:image/png;base64,");
    expect(html).toContain("<script>document.title='x'</script>");
    expect(html).not.toContain("assets/");
  });
});
