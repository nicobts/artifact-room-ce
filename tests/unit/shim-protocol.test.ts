import { describe, it, expect } from "vitest";
import {
  validateShimMessage,
  MAX_MESSAGE_BYTES,
} from "@/lib/viewer-shim/protocol";

describe("validateShimMessage", () => {
  it("accepts a valid message", () => {
    expect(validateShimMessage({ v: 1, type: "slide_view", slideIndex: 2 })).toMatchObject(
      { type: "slide_view", slideIndex: 2 },
    );
  });

  it("rejects the wrong protocol version", () => {
    expect(validateShimMessage({ v: 2, type: "view" })).toBeNull();
  });

  it("rejects an unknown type", () => {
    expect(validateShimMessage({ v: 1, type: "exfiltrate" })).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(validateShimMessage("nope")).toBeNull();
    expect(validateShimMessage(null)).toBeNull();
    expect(validateShimMessage(42)).toBeNull();
  });

  it("rejects oversized payloads", () => {
    const big = {
      v: 1,
      type: "view",
      detection: { method: "x".repeat(MAX_MESSAGE_BYTES), count: 1 },
    };
    expect(validateShimMessage(big)).toBeNull();
  });

  it("sanitizes out-of-range numeric fields", () => {
    const m = validateShimMessage({
      v: 1,
      type: "dwell",
      slideIndex: -5,
      durationMs: -1,
    });
    expect(m?.slideIndex).toBeUndefined();
    expect(m?.durationMs).toBeUndefined();
  });
});

describe("extended detection (region analytics)", () => {
  const base = { v: 1, type: "view" };

  it("passes kind and labels through with caps applied", () => {
    const msg = validateShimMessage({
      ...base,
      detection: {
        method: "annotated",
        kind: "sections",
        count: 3,
        labels: ["Intro", "x".repeat(100), null],
      },
    });
    expect(msg?.detection).toEqual({
      method: "annotated",
      kind: "sections",
      count: 3,
      labels: ["Intro", "x".repeat(48), null],
    });
  });

  it("drops an invalid kind but keeps method/count (back-compat shape)", () => {
    const msg = validateShimMessage({
      ...base,
      detection: { method: "declared", kind: "bogus", count: 5 },
    });
    expect(msg?.detection).toEqual({ method: "declared", count: 5 });
  });

  it("slices labels to 40 entries and rejects non-string entries to null", () => {
    const labels = Array.from({ length: 50 }, (_, i) => (i === 2 ? 7 : `s${i}`));
    const msg = validateShimMessage({
      ...base,
      detection: { method: "annotated", kind: "sections", count: 50, labels },
    });
    expect(msg?.detection?.labels).toHaveLength(40);
    expect(msg?.detection?.labels?.[2]).toBeNull();
  });

  it("still accepts the legacy detection shape untouched", () => {
    const msg = validateShimMessage({
      ...base,
      detection: { method: "framework", count: 12 },
    });
    expect(msg?.detection).toEqual({ method: "framework", count: 12 });
  });

  it("rejects a non-finite count, dropping detection but keeping the rest of the message", () => {
    const msg = validateShimMessage({
      ...base,
      detection: { method: "m", count: NaN },
    });
    expect(msg?.detection).toBeUndefined();
  });
});
