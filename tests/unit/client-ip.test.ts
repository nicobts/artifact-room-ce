import { describe, it, expect } from "vitest";
import { clientIp, trustedProxyHops } from "@/lib/client-ip";

function reqWith(xff: string | null): Request {
  const headers = new Headers();
  if (xff !== null) headers.set("x-forwarded-for", xff);
  return new Request("http://x/", { headers });
}

describe("clientIp", () => {
  it("returns the single proxied IP (one trusted hop)", () => {
    expect(clientIp(reqWith("203.0.113.7"), {})).toBe("203.0.113.7");
  });

  it("IGNORES a spoofed leftmost X-Forwarded-For and reads the proxy-appended rightmost entry", () => {
    // Attacker sends "1.1.1.1"; our single trusted proxy appends the real IP.
    expect(clientIp(reqWith("1.1.1.1, 203.0.113.7"), {})).toBe("203.0.113.7");
    // Rotating the spoofed left entry must NOT change the key.
    expect(clientIp(reqWith("9.9.9.9, 203.0.113.7"), {})).toBe("203.0.113.7");
  });

  it("honors TRUSTED_PROXY_HOPS for multi-proxy chains", () => {
    // Two trusted proxies: the outer appended the real client IP, the inner
    // appended the outer proxy's IP. Real client = 2nd-from-right.
    const env = { TRUSTED_PROXY_HOPS: "2" };
    expect(clientIp(reqWith("203.0.113.7, 172.16.0.1"), env)).toBe(
      "203.0.113.7",
    );
    // A spoofed leftmost entry is still ignored.
    expect(clientIp(reqWith("9.9.9.9, 203.0.113.7, 172.16.0.1"), env)).toBe(
      "203.0.113.7",
    );
  });

  it("falls back to 'local' when no XFF is present", () => {
    expect(clientIp(reqWith(null), {})).toBe("local");
    expect(clientIp(reqWith(""), {})).toBe("local");
  });

  it("clamps misconfigured hops to the leftmost rather than throwing", () => {
    expect(clientIp(reqWith("203.0.113.7"), { TRUSTED_PROXY_HOPS: "5" })).toBe(
      "203.0.113.7",
    );
  });

  it("defaults to 1 trusted hop", () => {
    expect(trustedProxyHops({})).toBe(1);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "3" })).toBe(3);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "garbage" })).toBe(1);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "0" })).toBe(1);
  });
});
