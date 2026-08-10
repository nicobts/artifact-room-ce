/**
 * Channel contract between the in-iframe measurement shim and the parent shell.
 * The parent validates message SHAPE (and size) — it never trusts the values as
 * a security input. `analytics-engagement` forwards validated messages to the
 * beacon.
 */
export const SHIM_PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 2048;

export type ShimMessageType =
  | "view"
  | "slide_view"
  | "dwell"
  | "visible"
  | "hidden"
  | "blocked";

const TYPES = new Set<ShimMessageType>([
  "view",
  "slide_view",
  "dwell",
  "visible",
  "hidden",
  "blocked",
]);

export type DetectionKind = "sections" | "slides" | "scroll" | "document";

export const DETECTION_KINDS = new Set<DetectionKind>([
  "sections",
  "slides",
  "scroll",
  "document",
]);

export const MAX_LABELS = 40;
export const MAX_LABEL_CHARS = 48;

export interface ShimMessage {
  v: 1;
  type: ShimMessageType;
  slideIndex?: number;
  durationMs?: number;
  detection?: {
    method: string;
    kind?: DetectionKind;
    count: number;
    labels?: (string | null)[];
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Returns a sanitized message, or null if the input is malformed/oversized/spoofed. */
export function validateShimMessage(data: unknown): ShimMessage | null {
  if (typeof data !== "object" || data === null) return null;

  // Reject oversized payloads.
  let serialized: string;
  try {
    serialized = JSON.stringify(data);
  } catch {
    return null;
  }
  if (serialized.length > MAX_MESSAGE_BYTES) return null;

  const d = data as Record<string, unknown>;
  if (d.v !== SHIM_PROTOCOL_VERSION) return null;
  if (typeof d.type !== "string" || !TYPES.has(d.type as ShimMessageType)) {
    return null;
  }

  const msg: ShimMessage = { v: 1, type: d.type as ShimMessageType };

  if (
    typeof d.slideIndex === "number" &&
    Number.isFinite(d.slideIndex) &&
    d.slideIndex >= 0 &&
    d.slideIndex < 10000
  ) {
    msg.slideIndex = Math.floor(d.slideIndex);
  }
  if (
    typeof d.durationMs === "number" &&
    Number.isFinite(d.durationMs) &&
    d.durationMs >= 0 &&
    d.durationMs < DAY_MS
  ) {
    msg.durationMs = Math.floor(d.durationMs);
  }
  if (d.detection && typeof d.detection === "object") {
    const det = d.detection as Record<string, unknown>;
    if (
      typeof det.method === "string" &&
      typeof det.count === "number" &&
      Number.isFinite(det.count)
    ) {
      msg.detection = {
        method: det.method.slice(0, 32),
        count: Math.min(Math.max(0, Math.floor(det.count)), 9999),
      };
      if (typeof det.kind === "string" && DETECTION_KINDS.has(det.kind as DetectionKind)) {
        msg.detection.kind = det.kind as DetectionKind;
      }
      if (Array.isArray(det.labels)) {
        msg.detection.labels = det.labels
          .slice(0, MAX_LABELS)
          .map((l) => (typeof l === "string" ? l.slice(0, MAX_LABEL_CHARS) : null));
      }
    }
  }
  return msg;
}
