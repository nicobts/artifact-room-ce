import { describe, it, expect } from "vitest";
import { getSignupMode, isSignupAllowed } from "@/lib/signup-gate";

describe("getSignupMode", () => {
  it("defaults to invite (secure by default)", () => {
    expect(getSignupMode({})).toBe("invite");
  });
  it("returns invite when set", () => {
    expect(getSignupMode({ SIGNUP_MODE: "invite" })).toBe("invite");
  });
  it("returns open only when explicitly set", () => {
    expect(getSignupMode({ SIGNUP_MODE: "open" })).toBe("open");
  });
  it("treats unknown values as invite (fail-safe)", () => {
    expect(getSignupMode({ SIGNUP_MODE: "nonsense" })).toBe("invite");
  });
});

describe("isSignupAllowed", () => {
  it("allows anyone in open mode", () => {
    expect(isSignupAllowed("a@b.com", { SIGNUP_MODE: "open" })).toBe(true);
  });

  it("allows allowlisted emails in invite mode (trimmed, case-insensitive)", () => {
    const env = {
      SIGNUP_MODE: "invite",
      SIGNUP_ALLOWLIST: "Jane@Acme.com, bob@x.io",
    };
    expect(isSignupAllowed("jane@acme.com", env)).toBe(true);
    expect(isSignupAllowed("  BOB@x.io ", env)).toBe(true);
  });

  it("blocks non-allowlisted emails in invite mode", () => {
    expect(
      isSignupAllowed("eve@evil.com", {
        SIGNUP_MODE: "invite",
        SIGNUP_ALLOWLIST: "jane@acme.com",
      }),
    ).toBe(false);
  });

  it("blocks everyone in invite mode with an empty allowlist", () => {
    expect(isSignupAllowed("a@b.com", { SIGNUP_MODE: "invite" })).toBe(false);
  });
});
