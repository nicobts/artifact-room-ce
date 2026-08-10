import { db as defaultDb } from "@/db/client";
import { event } from "@/db/schema";

type Db = typeof defaultDb;
type EventInsert = typeof event.$inferInsert;

/**
 * Server-side write-behind buffer. Beacon handlers enqueue and ack immediately;
 * a timer flushes batched, transactional inserts — keeping the single SQLite
 * writer off the hot path. `flushEvents` is also called by ops-hardening's
 * graceful-shutdown hook so no acknowledged event is lost on redeploy.
 *
 * MVP simplifications (documented): on a hard overflow the oldest `dwell` deltas
 * are dropped first (never `view`/`forward_suspected`); crash-time idempotency
 * keys are a future refinement.
 */
const FLUSH_MS = 1000;
const SOFT_CAP = 500;
const HARD_CAP = 5000;

let buffer: EventInsert[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

function applyBackpressure() {
  if (buffer.length <= HARD_CAP) return;
  const overflow = buffer.length - HARD_CAP;
  let dropped = 0;
  buffer = buffer.filter((e) => {
    if (dropped >= overflow) return true;
    if (e.type === "dwell") {
      dropped++;
      return false;
    }
    return true;
  });
  console.warn(`[analytics] backpressure dropped ${dropped} dwell events`);
}

export function enqueueEvents(rows: EventInsert[], db: Db = defaultDb): void {
  if (rows.length === 0) return;
  buffer.push(...rows);
  applyBackpressure();
  if (buffer.length >= SOFT_CAP) {
    flushEvents(db);
    return;
  }
  if (!timer) {
    timer = setInterval(() => flushEvents(db), FLUSH_MS);
    // Don't keep the process alive just for the flush timer.
    if (typeof timer.unref === "function") timer.unref();
  }
}

export function flushEvents(db: Db = defaultDb): number {
  if (buffer.length === 0) return 0;
  const batch = buffer;
  buffer = [];
  try {
    db.insert(event).values(batch).run();
    return batch.length;
  } catch (err) {
    console.error("[analytics] flush failed", err);
    return 0;
  }
}

export function bufferSize(): number {
  return buffer.length;
}
