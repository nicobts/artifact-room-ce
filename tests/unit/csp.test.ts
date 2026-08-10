import { describe, it, expect } from "vitest";
import { buildArtifactCsp, buildShellCsp, buildAppCsp } from "@/lib/csp";

describe("artifact CSP", () => {
  const csp = buildArtifactCsp("");

  it("shuts egress and external form posts unconditionally", () => {
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("form-action 'none'");
  });

  it("allows inline (safe under the opaque sandbox origin)", () => {
    expect(csp).toContain("script-src 'unsafe-inline' 'self'");
  });

  it("sandboxes the document so direct top-level navigation stays opaque-origin", () => {
    expect(csp).toContain("sandbox allow-scripts");
  });

  it("forbids being framed by anyone but the viewer shell", () => {
    expect(csp).toContain("frame-ancestors 'self'");
  });

  it("blocks external subresources by default (empty allowlist)", () => {
    expect(buildArtifactCsp("")).not.toContain("jsdelivr");
  });

  it("appends an operator CDN allowlist to passive sources but keeps egress shut", () => {
    const withCdn = buildArtifactCsp("https://cdn.jsdelivr.net");
    expect(withCdn).toContain(
      "script-src 'unsafe-inline' 'self' https://cdn.jsdelivr.net",
    );
    expect(withCdn).toContain("img-src 'self' data: blob: https://cdn.jsdelivr.net");
    expect(withCdn).toContain("connect-src 'none'");
    expect(withCdn).toContain("form-action 'none'");
  });
});

describe("shell CSP", () => {
  const csp = buildShellCsp();
  it("cannot be framed and only posts forms to itself", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("default-src 'none'");
  });
});

describe("app CSP", () => {
  const prod = { viewerOrigin: "https://view.example.com", dev: false };

  it("is deny-by-default and cannot be framed", () => {
    const csp = buildAppCsp(prod);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it("frames ONLY the viewer origin (the in-console preview iframe)", () => {
    expect(buildAppCsp(prod)).toContain("frame-src https://view.example.com");
  });

  it("falls back to 'self' frame-src when the viewer origin is unset", () => {
    expect(buildAppCsp({ viewerOrigin: "", dev: false })).toContain(
      "frame-src 'self'",
    );
  });

  it("prod policy has no eval and no websocket relaxation", () => {
    const csp = buildAppCsp(prod);
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("ws:");
  });

  it("dev policy allows eval (Next dev tooling) and ws (HMR)", () => {
    const csp = buildAppCsp({ viewerOrigin: "http://view.localhost:3000", dev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws:");
  });
});
