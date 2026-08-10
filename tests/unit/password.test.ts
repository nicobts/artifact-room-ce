import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password (scrypt)", () => {
  it("verifies a correct password", () => {
    const stored = hashPassword("hunter2");
    expect(verifyPassword("hunter2", stored)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const stored = hashPassword("hunter2");
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("is salted: same input hashes differently and stores no plaintext", () => {
    const a = hashPassword("secret");
    const b = hashPassword("secret");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(a.includes("secret")).toBe(false);
  });

  it("rejects malformed stored values", () => {
    expect(verifyPassword("x", "garbage")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
  });
});
