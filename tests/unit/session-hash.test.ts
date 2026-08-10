import { describe, it, expect } from "vitest";
import { computeServerSignalHash } from "@/lib/analytics/session";

describe("computeServerSignalHash", () => {
  it("is a deterministic hash, not the raw signal (no PII at rest)", () => {
    const a = computeServerSignalHash("Mozilla/5.0 UA", "en-US");
    const b = computeServerSignalHash("Mozilla/5.0 UA", "en-US");
    expect(a).toBe(b);
    expect(a).not.toContain("Mozilla");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it("differs for different signals", () => {
    expect(computeServerSignalHash("A", "en")).not.toBe(
      computeServerSignalHash("B", "en"),
    );
  });
});
