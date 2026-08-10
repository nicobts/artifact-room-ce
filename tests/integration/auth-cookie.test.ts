import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createSqlite } from "@/db/sqlite";

/**
 * Invariant: the two identity systems never merge. A creator's
 * BetterAuth session cookie must be HOST-ONLY — scoped to the app host and
 * never the registrable parent domain — so the viewer origin can never receive
 * a creator session. The structural half lives in `lib/auth.ts`
 * (crossSubDomainCookies is deliberately NOT enabled); this test is the
 * behavioral assertion: a real sign-up emits a session cookie with no
 * `Domain=` attribute.
 */
describe("creator session cookies are host-only", () => {
  it("sets a session cookie carrying no Domain attribute", async () => {
    // Point the auth singleton at a throwaway, migrated DB BEFORE importing it.
    const dir = mkdtempSync(join(tmpdir(), "ar-auth-cookie-"));
    const dbPath = join(dir, "test.sqlite");
    const seed = createSqlite(dbPath);
    migrate(drizzle(seed), { migrationsFolder: "./db/migrations" });
    seed.close();

    process.env.DATABASE_PATH = dbPath;
    process.env.BETTER_AUTH_SECRET =
      "test-secret-0000000000000000000000000000";
    process.env.APP_ORIGIN = "http://app.localhost:3000";
    process.env.SIGNUP_MODE = "open";

    const { auth } = await import("@/lib/auth");
    const res: Response = await auth.api.signUpEmail({
      body: {
        email: "creator@acme.com",
        password: "supersecret",
        name: "Creator",
      },
      asResponse: true,
    });

    const cookies = res.headers.getSetCookie();
    expect(cookies.length).toBeGreaterThan(0);

    const sessionCookie = cookies.find((c) => /session/i.test(c));
    expect(sessionCookie, "a session cookie should be set").toBeTruthy();

    // Host-only: no cookie may pin a Domain (which would widen it to the parent).
    for (const c of cookies) {
      expect(c.toLowerCase()).not.toContain("domain=");
    }
  });
});
