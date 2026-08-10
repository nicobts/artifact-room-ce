import { describe, it, expect } from "vitest";
import { mintPreviewToken, verifyPreviewToken } from "@/lib/preview-token";
import { buildPreviewCsp, buildArtifactCsp } from "@/lib/csp";

describe("preview token", () => {
  it("round-trips a freshly minted token", () => {
    const t = mintPreviewToken("art-123");
    expect(verifyPreviewToken(t)).toEqual({ artifactId: "art-123" });
  });

  it("rejects a tampered token", () => {
    const t = mintPreviewToken("art-123");
    const tampered = t.slice(0, -1) + (t.endsWith("a") ? "b" : "a");
    expect(verifyPreviewToken(tampered)).toBeNull();
  });

  it("rejects a token whose payload was swapped (signature mismatch)", () => {
    const forgedPayload = Buffer.from(
      JSON.stringify({ a: "someone-elses", e: Date.now() + 10000 }),
      "utf8",
    ).toString("base64url");
    const real = mintPreviewToken("mine");
    const sig = real.slice(real.indexOf(".") + 1);
    expect(verifyPreviewToken(`${forgedPayload}.${sig}`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const now = 1_000_000;
    const t = mintPreviewToken("art-123", now, 1000);
    expect(verifyPreviewToken(t, now + 500)).toEqual({ artifactId: "art-123" });
    expect(verifyPreviewToken(t, now + 2000)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyPreviewToken("")).toBeNull();
    expect(verifyPreviewToken("no-dot")).toBeNull();
    expect(verifyPreviewToken(".onlysig")).toBeNull();
  });
});

describe("preview CSP", () => {
  it("permits framing by the app origin but keeps connect/form locked", () => {
    process.env.APP_ORIGIN = "https://app.example.com";
    const csp = buildPreviewCsp();
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors https://app.example.com");
  });

  it("differs from the artifact CSP only in frame-ancestors", () => {
    process.env.APP_ORIGIN = "https://app.example.com";
    const norm = (s: string) =>
      s
        .split("; ")
        .filter((d) => !d.startsWith("frame-ancestors"))
        .join("; ");
    expect(norm(buildPreviewCsp())).toBe(norm(buildArtifactCsp()));
  });
});
