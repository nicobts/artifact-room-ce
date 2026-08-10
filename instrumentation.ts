/**
 * Next.js instrumentation hook — runs once on server startup (Node runtime).
 * Registers graceful-shutdown signal handlers and the (optional, off-by-default)
 * OpenTelemetry seam.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Apply pending DB migrations before the server accepts traffic. Done here
  // (not in a Docker entrypoint) so the migrator is traced into the standalone
  // build and runs wherever the app runs, keeping `node server.js` as PID 1.
  const { runMigrations } = await import("@/db/boot-migrate");
  runMigrations();

  // Dev-only test credentials from env (no-op in production and when unset).
  const { seedDevUser } = await import("@/db/dev-seed");
  await seedDevUser();

  const { registerShutdown } = await import("@/lib/shutdown");
  registerShutdown();

  // OpenTelemetry seam: when OTEL_EXPORTER_OTLP_ENDPOINT is set, initialize the
  // OTel SDK here (install @opentelemetry/* first). When unset, nothing runs and
  // no external calls are made — self-host friendly.
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    const { logger } = await import("@/lib/log");
    logger.info("OpenTelemetry endpoint configured; initialize the SDK here.");
  }
}
