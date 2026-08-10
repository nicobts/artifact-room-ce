import "server-only";
import { flushEvents } from "@/lib/analytics/buffer";
import { sqlite } from "@/db/client";
import { logger } from "@/lib/log";

/**
 * Graceful shutdown: on SIGTERM/SIGINT, flush the analytics write-behind buffer
 * (so no acknowledged event is lost), checkpoint the WAL (so Litestream/backups
 * capture the latest state), and close the DB handle.
 */
export interface ShutdownDeps {
  flush(): void;
  checkpointAndClose(): void;
}

function defaultCheckpointAndClose(): void {
  try {
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
    sqlite.close();
  } catch {
    /* best-effort */
  }
}

export function runShutdown(overrides: Partial<ShutdownDeps> = {}): void {
  const flush = overrides.flush ?? (() => flushEvents());
  const checkpointAndClose =
    overrides.checkpointAndClose ?? defaultCheckpointAndClose;
  flush();
  checkpointAndClose();
}

let registered = false;

export function registerShutdown(): void {
  if (registered) return;
  registered = true;
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      logger.info({ signal }, "graceful shutdown");
      runShutdown();
      process.exit(0);
    });
  }
}
