import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    /**
     * Vitest's 5s default is too tight for this suite's first run on a cold
     * machine, and the failure it produces is badly misleading.
     *
     * Any test that creates a user goes through BetterAuth signup, which
     * hashes the password with scrypt — deliberately expensive, and CPU-bound.
     * Warm, that costs ~750ms. On a first run after `npm ci`, with 26 test
     * files transforming and importing in parallel and the CPU oversubscribed,
     * the same call has been measured at 10-13s. Three tests then fail with
     * "Test timed out in 5000ms" — always the first user-creating test in
     * admin-role, auth-cookie and dev-seed — and a re-run is green.
     *
     * That reads as a flaky or broken branch, which is exactly the impression
     * a newcomer's very first `npm run test:integration` should not give. The
     * work is legitimately slow, not stuck, so the timeout is the thing that
     * was wrong. Hooks get the same allowance: they run migrations and a
     * signup of their own.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/server-only-stub.ts", import.meta.url),
      ),
    },
  },
});
