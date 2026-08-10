import { defineConfig, devices } from "@playwright/test";
import { rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * Two-origin e2e (creator journey on the app origin, sandboxed render on the
 * viewer origin, forwarding detection via multi-context) — see docs/11-development.md.
 *
 * PORT ISOLATION: the suite runs on a dedicated port (default 4300), not the
 * conventional 3000. Two reasons:
 *
 *  1. `reuseExistingServer` will happily adopt whatever is already listening.
 *     On a machine running another Next project on :3000 the whole suite
 *     silently tests the WRONG APPLICATION — every spec fails at the first
 *     selector, which reads like a broken branch rather than a port clash.
 *  2. Next refuses to start a second dev server for the same project
 *     directory, so a developer's own `npm run dev` must not be on this port
 *     either.
 *
 * Override with `E2E_PORT` if 4300 is taken. The origins are derived from it
 * and passed to the dev server, so the app's own `.env` cannot desync the
 * suite (APP_ORIGIN/VIEWER_ORIGIN feed CSP `frame-src` and the share URLs).
 */
const PORT = Number(process.env.E2E_PORT ?? 4300);
const APP_ORIGIN = `http://app.localhost:${PORT}`;
const VIEWER_ORIGIN = `http://view.localhost:${PORT}`;

/**
 * DATABASE ISOLATION: the suite gets its own SQLite file, never the dev
 * database. Two problems this fixes, both of which read as a broken branch:
 *
 *  1. Test artifacts, shares and users accumulated in the database a developer
 *     was also using by hand, polluting their console.
 *  2. Rate limits live in the `rate_limit` table of whichever database is in
 *     use (see lib/rate-limit.ts). The `upload:ip:` cap is 60/hour and every
 *     e2e run shares one IP, so the suite could not run twice in an hour
 *     without spurious 429s surfacing as unrelated assertion failures.
 *
 * Dropping the file per run resets those counters by construction, so the
 * limits stay at their production values under test rather than being relaxed.
 *
 * The delete is best-effort: if something still holds the file we keep it
 * rather than failing the run. `reuseExistingServer` is off (see webServer
 * below) precisely so that "something" is never a server this run will then
 * test against.
 */
const E2E_DATABASE_PATH = process.env.E2E_DATABASE_PATH ?? "./data/e2e.sqlite";

/**
 * PREPARE ONCE PER RUN, NOT ONCE PER CONFIG LOAD.
 *
 * This file is re-evaluated in every worker process, and a retry restarts a
 * worker — so anything with side effects here runs repeatedly. An earlier
 * version deleted the database at module scope and consequently wiped it
 * MID-SUITE on the first retry, logging out users the previous tests had
 * signed up. Every later spec then failed on `toHaveURL` or a missing
 * element, and CI burned 25 minutes chasing it. Local runs never showed it
 * because `retries` is 0 off CI, so the config loaded exactly once.
 *
 * Two guards, deliberately belt-and-braces. `TEST_WORKER_INDEX` is set by
 * Playwright in worker processes and is authoritative: if it is present we are
 * not the run's entry point and must not touch the database. The flag then
 * covers any further re-entry within the same process.
 */
const isWorker = process.env.TEST_WORKER_INDEX !== undefined;
if (!isWorker && !process.env.E2E_DB_PREPARED) {
  process.env.E2E_DB_PREPARED = "1";

  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(`${E2E_DATABASE_PATH}${suffix}`, { force: true });
    } catch {
      // Held open by a reused dev server — see above.
    }
  }

/**
 * Migrate it here, before the web server is allowed to start.
 *
 * The app does migrate at boot (instrumentation.ts -> db/boot-migrate.ts), but
 * in dev that races the first request: Next begins serving while `register()`
 * is still running. Against a warm, already-migrated database nobody notices.
 * Against the empty one we just deleted, the first requests lost the race and
 * the server answered `SqliteError: no such table: user` — which surfaced as
 * unrelated `toHaveURL` assertion failures, and cost a CI run 24 minutes of
 * retries before failing.
 *
 * Running the migrator synchronously at config load removes the race outright:
 * Playwright evaluates this file before it launches `webServer`, so the schema
 * is guaranteed to exist by the time anything can query it.
 */
  execFileSync("npm", ["run", "db:migrate"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, DATABASE_PATH: E2E_DATABASE_PATH },
  });
}

// Specs read VIEWER_ORIGIN to assert cross-origin share URLs. `webServer.env`
// reaches the server process only, so publish it to the test runner too.
process.env.APP_ORIGIN = APP_ORIGIN;
process.env.VIEWER_ORIGIN = VIEWER_ORIGIN;

export default defineConfig({
  testDir: "./tests/e2e",
  // Serial: the app has ONE SQLite writer; parallel workers contend on the write
  // lock and make auth/upload writes slow. Serial matches the single-container
  // reality and keeps e2e deterministic.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000, // generous for first-hit dev route compilation
  expect: { timeout: 15_000 },
  use: {
    // App origin = app.localhost (sibling of view.localhost), matching the
    // production topology so host-only cookies behave as they will in prod.
    baseURL: APP_ORIGIN,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    // Node polls localhost (it resolves); the browser uses app.localhost.
    url: `http://localhost:${PORT}`,
    env: {
      PORT: String(PORT),
      APP_ORIGIN,
      VIEWER_ORIGIN,
      BETTER_AUTH_URL: APP_ORIGIN,
      DATABASE_PATH: E2E_DATABASE_PATH,
    },
    // Never adopt a server this run did not start. The suite replaces its
    // database before launching, so a leftover server is holding a handle to a
    // file that no longer exists: sign-up silently stops working and ~29 specs
    // fail on `toHaveURL`, pointing at nothing. Observed exactly that against a
    // dev server left over from an earlier session — a 9-minute red run whose
    // output named no cause, because reusing a server also suppresses the
    // `[WebServer]` log lines that would have shown it.
    //
    // Starting our own costs ~15s and makes the run mean what it says.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
