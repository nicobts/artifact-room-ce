import { describe, it, expect } from "vitest";
import {
  generateToken,
  timingSafeEqualToken,
  isShareUsable,
} from "@/lib/share-token";

describe("generateToken", () => {
  it("produces URL-safe, high-entropy tokens", () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, URL-safe
    // 32 random bytes -> 43 base64url chars (no padding).
    expect(Buffer.from(t, "base64url").length).toBe(32);
  });

  it("is unique across many draws", () => {
    const set = new Set(Array.from({ length: 1000 }, () => generateToken()));
    expect(set.size).toBe(1000);
  });
});

describe("timingSafeEqualToken", () => {
  it("returns true for identical tokens", () => {
    const t = generateToken();
    expect(timingSafeEqualToken(t, t)).toBe(true);
  });

  it("returns false for different tokens of equal length", () => {
    expect(timingSafeEqualToken("a".repeat(43), "b".repeat(43))).toBe(false);
  });

  it("returns false for different lengths without throwing", () => {
    expect(timingSafeEqualToken("short", "muchlongertoken")).toBe(false);
  });
});

describe("isShareUsable", () => {
  const now = new Date("2026-06-23T12:00:00Z");

  it("is usable when neither revoked nor expired", () => {
    expect(isShareUsable({ revokedAt: null, expiresAt: null }, now)).toBe(true);
  });

  it("is unusable when revoked", () => {
    expect(
      isShareUsable({ revokedAt: new Date("2026-06-01"), expiresAt: null }, now),
    ).toBe(false);
  });

  it("is unusable when expired", () => {
    expect(
      isShareUsable({ revokedAt: null, expiresAt: new Date("2026-06-22") }, now),
    ).toBe(false);
  });

  it("is usable when expiry is in the future", () => {
    expect(
      isShareUsable({ revokedAt: null, expiresAt: new Date("2026-07-01") }, now),
    ).toBe(true);
  });
});
