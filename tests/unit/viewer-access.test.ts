import { describe, it, expect } from "vitest";
import { signAccess, verifyAccess, accessCookieName } from "@/lib/viewer-access";

describe("viewer access cookie", () => {
  it("verifies a valid signature", () => {
    const value = signAccess("share-1");
    expect(verifyAccess("share-1", value)).toBe(true);
  });

  it("rejects a signature minted for a different share", () => {
    const value = signAccess("share-1");
    expect(verifyAccess("share-2", value)).toBe(false);
  });

  it("rejects missing or empty values", () => {
    expect(verifyAccess("share-1", undefined)).toBe(false);
    expect(verifyAccess("share-1", "")).toBe(false);
  });

  it("namespaces the cookie per share", () => {
    expect(accessCookieName("abc")).toBe("av_abc");
  });
});

describe("viewer access secret (fail-closed in production)", () => {
  it("throws when no secret is configured in production", () => {
    const env = process.env as Record<string, string | undefined>;
    const prev = {
      NODE_ENV: env.NODE_ENV,
      VA: env.VIEWER_ACCESS_SECRET,
      BA: env.BETTER_AUTH_SECRET,
    };
    env.NODE_ENV = "production";
    delete env.VIEWER_ACCESS_SECRET;
    delete env.BETTER_AUTH_SECRET;
    try {
      expect(() => signAccess("share-1")).toThrow(/must be set in production/);
    } finally {
      env.NODE_ENV = prev.NODE_ENV;
      if (prev.VA !== undefined) env.VIEWER_ACCESS_SECRET = prev.VA;
      if (prev.BA !== undefined) env.BETTER_AUTH_SECRET = prev.BA;
    }
  });
});
