import { describe, it, expect } from "vitest";
import { parseBeacon } from "@/lib/analytics/beacon";

/**
 * The beacon's persistable-type allowlist is the boundary between what a
 * viewer's browser can claim and what reaches the `event` table. Anything not
 * on it is dropped silently, which is what keeps an untrusted client from
 * inventing event types.
 */

function beacon(types: string[]) {
  return {
    token: "tok_test",
    clientId: "client_test",
    events: types.map((type) => ({ type })),
  };
}

function parsedTypes(types: string[]): string[] {
  return parseBeacon(beacon(types))?.events.map((e) => e.type) ?? [];
}

describe("parseBeacon type allowlist", () => {
  it("keeps the three types the viewer actually emits", () => {
    expect(parsedTypes(["view", "slide_view", "dwell"])).toEqual([
      "view",
      "slide_view",
      "dwell",
    ]);
  });

  it("drops an unknown type", () => {
    expect(parsedTypes(["definitely_not_a_type"])).toEqual([]);
  });

  it("drops `interaction` exactly as it drops an unknown type", () => {
    // Nothing emits `interaction`; it was scaffolding for click tracking that
    // was never built. Accepting it would let a client write rows no part of
    // the product produces or reads.
    expect(parsedTypes(["interaction"])).toEqual([]);
  });

  it("keeps the real types when they arrive alongside a dropped one", () => {
    expect(parsedTypes(["view", "interaction", "dwell"])).toEqual([
      "view",
      "dwell",
    ]);
  });

  it("drops server-generated types a client must not be able to claim", () => {
    // `reopen` and `forward_suspected` are derived server-side. A viewer
    // asserting them directly would forge the forwarding signal.
    expect(parsedTypes(["reopen", "forward_suspected"])).toEqual([]);
  });
});
