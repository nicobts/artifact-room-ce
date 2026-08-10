import { describe, it, expect } from "vitest";
import { parseAdminEmails } from "@/db/promote-admins";

describe("parseAdminEmails", () => {
  it("splits, trims, lowercases, dedupes, drops empties", () => {
    expect(parseAdminEmails(" Admin@X.com, b@y.com ,, admin@x.com ")).toEqual([
      "admin@x.com",
      "b@y.com",
    ]);
  });

  it("returns [] for unset or blank", () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails("")).toEqual([]);
    expect(parseAdminEmails(" , ")).toEqual([]);
  });
});
