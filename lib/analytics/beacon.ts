import "server-only";
import { randomUUID } from "node:crypto";
import { db as defaultDb } from "@/db/client";
import { event } from "@/db/schema";
import { getViewableArtifact } from "@/lib/share";
import { DETECTION_KINDS, MAX_LABELS, MAX_LABEL_CHARS, type DetectionKind } from "@/lib/viewer-shim/protocol";
import { resolveOrCreateViewerSession } from "./session";
import { enqueueEvents } from "./buffer";

type Db = typeof defaultDb;
type EventInsert = typeof event.$inferInsert;
export type EventSink = (rows: EventInsert[], db: Db) => void;

// Client-emitted types we persist. `reopen`/`forward_suspected` are
// server-generated; `visible`/`hidden`/`blocked` are client-only signals.
const PERSISTABLE = new Set(["view", "slide_view", "dwell"]);

export interface DetectionMetadata {
  method: string;
  kind?: DetectionKind;
  count: number;
  labels?: (string | null)[];
}

export interface BeaconEvent {
  type: "view" | "slide_view" | "dwell";
  slideIndex?: number;
  durationMs?: number;
  metadata?: { detection: DetectionMetadata };
}

export interface ParsedBeacon {
  token: string;
  clientId: string;
  events: BeaconEvent[];
}

/**
 * The ONLY metadata shape that survives beacon parsing. Mirrors the caps in
 * lib/viewer-shim/protocol.ts — the shim's own sanitization is not trusted,
 * since the beacon is a public endpoint independent of the shim/shell path.
 */
export function sanitizeDetection(raw: unknown): DetectionMetadata | null {
  if (typeof raw !== "object" || raw === null) return null;
  const det = raw as Record<string, unknown>;
  if (typeof det.method !== "string") return null;
  if (typeof det.count !== "number" || !Number.isFinite(det.count)) return null;

  const sanitized: DetectionMetadata = {
    method: det.method.slice(0, 32),
    count: Math.min(Math.max(0, Math.floor(det.count)), 9999),
  };
  if (typeof det.kind === "string" && DETECTION_KINDS.has(det.kind as DetectionKind)) {
    sanitized.kind = det.kind as DetectionKind;
  }
  if (Array.isArray(det.labels)) {
    sanitized.labels = det.labels
      .slice(0, MAX_LABELS)
      .map((l) => (typeof l === "string" ? l.slice(0, MAX_LABEL_CHARS) : null));
  }
  return sanitized;
}

/** Strict validation of the public beacon payload. */
export function parseBeacon(body: unknown): ParsedBeacon | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.token !== "string" || typeof b.clientId !== "string") return null;
  if (b.clientId.length > 64 || !Array.isArray(b.events)) return null;

  const events: BeaconEvent[] = [];
  for (const raw of b.events.slice(0, 100)) {
    if (typeof raw !== "object" || raw === null) continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.type !== "string" || !PERSISTABLE.has(e.type)) continue;
    const ev: BeaconEvent = { type: e.type as BeaconEvent["type"] };
    if (typeof e.slideIndex === "number" && e.slideIndex >= 0 && e.slideIndex < 10000) {
      ev.slideIndex = Math.floor(e.slideIndex);
    }
    if (
      typeof e.durationMs === "number" &&
      e.durationMs >= 0 &&
      e.durationMs < 86_400_000
    ) {
      ev.durationMs = Math.floor(e.durationMs);
    }
    const det = sanitizeDetection((e.metadata as Record<string, unknown> | undefined)?.detection);
    if (det) ev.metadata = { detection: det };
    events.push(ev);
  }
  return { token: b.token, clientId: b.clientId, events };
}

export interface RecordBeaconInput extends ParsedBeacon {
  serverSignalHash: string;
}

export interface RecordBeaconResult {
  ok: boolean;
  viewerSessionId?: string;
  written: number;
}

/**
 * Resolve the token → shareId (usable shares only), stitch the viewer session,
 * and emit events. Events key to `share` (NEVER artifact) — `event` has no
 * artifact column by construction. Writes go through the sink (default: the
 * write-behind buffer); tests inject a synchronous sink.
 */
export function recordBeacon(
  input: RecordBeaconInput,
  deps: { db?: Db; sink?: EventSink } = {},
): RecordBeaconResult {
  const db = deps.db ?? defaultDb;
  const sink = deps.sink ?? enqueueEvents;

  const viewable = getViewableArtifact(input.token, { db });
  if (!viewable) return { ok: false, written: 0 };
  const shareId = viewable.share.id;

  const session = resolveOrCreateViewerSession(
    db,
    shareId,
    input.clientId,
    input.serverSignalHash,
  );

  const rows: EventInsert[] = [];
  if (session.isForward) {
    rows.push({
      id: randomUUID(),
      shareId,
      viewerSessionId: session.viewerSessionId,
      type: "forward_suspected",
    });
  }
  if (session.isReopen) {
    rows.push({
      id: randomUUID(),
      shareId,
      viewerSessionId: session.viewerSessionId,
      type: "reopen",
    });
  }
  for (const e of input.events) {
    rows.push({
      id: randomUUID(),
      shareId, // <-- the spine; there is NO artifact key on event
      viewerSessionId: session.viewerSessionId,
      type: e.type,
      slideIndex: e.slideIndex ?? null,
      durationMs: e.durationMs ?? null,
      metadata: (e.metadata as object | null) ?? null,
    });
  }

  if (rows.length > 0) sink(rows, db);
  return { ok: true, viewerSessionId: session.viewerSessionId, written: rows.length };
}
