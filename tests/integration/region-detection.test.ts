import { describe, it, expect } from "vitest";
import { parseBeacon } from "@/lib/analytics/beacon";

const base = { token: "t", clientId: "c" };

describe("parseBeacon detection metadata", () => {
  it("keeps a valid detection object on a view event", () => {
    const p = parseBeacon({
      ...base,
      events: [{ type: "view", metadata: { detection: { method: "annotated", kind: "sections", count: 3, labels: ["A", "B", "C"] } } }],
    });
    expect(p?.events[0].metadata).toEqual({
      detection: { method: "annotated", kind: "sections", count: 3, labels: ["A", "B", "C"] },
    });
  });

  it("drops arbitrary metadata (never persisted raw)", () => {
    const p = parseBeacon({
      ...base,
      events: [{ type: "view", metadata: { anything: "else" } }],
    });
    expect(p?.events[0].metadata).toBeUndefined();
  });

  it("applies caps server-side independently of the client", () => {
    const p = parseBeacon({
      ...base,
      events: [{ type: "dwell", durationMs: 5, metadata: { detection: { method: "m".repeat(99), kind: "nope", count: 123456, labels: Array(99).fill("y".repeat(99)) } } }],
    });
    const det = (p?.events[0].metadata as { detection: { method: string; kind?: string; count: number; labels?: (string | null)[] } }).detection;
    expect(det.method).toHaveLength(32);
    expect(det.kind).toBeUndefined();
    expect(det.count).toBe(9999);
    expect(det.labels).toHaveLength(40);
    expect(det.labels?.[0]).toHaveLength(48);
  });
});
