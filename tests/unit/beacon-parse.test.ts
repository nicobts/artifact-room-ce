import { describe, it, expect } from "vitest";
import { parseBeacon } from "@/lib/analytics/beacon";

describe("parseBeacon", () => {
  it("keeps persistable events and drops client-only signals", () => {
    const r = parseBeacon({
      token: "t",
      clientId: "c",
      events: [
        { type: "view" },
        { type: "slide_view", slideIndex: 2 },
        { type: "hidden" },
        { type: "blocked" },
        { type: "dwell", slideIndex: 1, durationMs: 1000 },
        { type: "exfiltrate" },
      ],
    });
    expect(r).not.toBeNull();
    expect(r?.events.map((e) => e.type)).toEqual([
      "view",
      "slide_view",
      "dwell",
    ]);
  });

  it("rejects payloads missing token or clientId", () => {
    expect(parseBeacon({ clientId: "c", events: [] })).toBeNull();
    expect(parseBeacon({ token: "t", events: [] })).toBeNull();
    expect(parseBeacon("nope")).toBeNull();
  });

  it("sanitizes out-of-range numeric fields", () => {
    const r = parseBeacon({
      token: "t",
      clientId: "c",
      events: [{ type: "dwell", slideIndex: -1, durationMs: -5 }],
    });
    expect(r?.events[0].slideIndex).toBeUndefined();
    expect(r?.events[0].durationMs).toBeUndefined();
  });
});
