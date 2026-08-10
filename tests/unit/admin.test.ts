import { describe, it, expect } from "vitest";
import { isAdmin } from "@/lib/admin";

describe("isAdmin (server-set role)", () => {
  it("grants only role === 'admin'", () => {
    expect(isAdmin({ role: "admin" })).toBe(true);
    expect(isAdmin({ role: "member" })).toBe(false);
  });

  it("denies missing/null users and roles", () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
    expect(isAdmin({})).toBe(false);
    expect(isAdmin({ role: null })).toBe(false);
  });

  it("is exact — no case folding or trimming of the role value", () => {
    expect(isAdmin({ role: "Admin" })).toBe(false);
    expect(isAdmin({ role: " admin" })).toBe(false);
  });
});
