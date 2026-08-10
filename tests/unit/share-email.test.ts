import { describe, it, expect } from "vitest";
import { normalizeEmail, emailMatches } from "@/lib/share-email";

describe("normalizeEmail", () => {
  it("trims and lower-cases", () => {
    expect(normalizeEmail("  Jane@Acme.COM ")).toBe("jane@acme.com");
  });

  it("does NOT fold dots or plus-tags", () => {
    // Folding would widen access beyond the address the creator typed.
    expect(normalizeEmail("j.doe+x@gmail.com")).toBe("j.doe+x@gmail.com");
  });
});

describe("emailMatches", () => {
  it("matches regardless of case and surrounding whitespace", () => {
    expect(emailMatches(" JANE@acme.com ", "jane@acme.com")).toBe(true);
  });

  it("rejects a different address", () => {
    expect(emailMatches("other@acme.com", "jane@acme.com")).toBe(false);
  });

  it("rejects gmail dot/plus variants", () => {
    expect(emailMatches("j.doe+x@gmail.com", "jdoe@gmail.com")).toBe(false);
  });

  it("rejects when nothing is stored", () => {
    expect(emailMatches("jane@acme.com", null)).toBe(false);
  });

  it("rejects an empty submission against a stored address", () => {
    expect(emailMatches("", "jane@acme.com")).toBe(false);
  });

  it("handles very different lengths without throwing", () => {
    // Raw timingSafeEqual throws on unequal-length buffers; hashing first
    // makes both operands 32 bytes.
    const long = `${"x".repeat(500)}@acme.com`;
    expect(() => emailMatches("a@b.co", long)).not.toThrow();
    expect(emailMatches("a@b.co", long)).toBe(false);
  });

  it("handles unicode addresses", () => {
    expect(emailMatches("JOSÉ@acme.com", "josé@acme.com")).toBe(true);
  });
});
