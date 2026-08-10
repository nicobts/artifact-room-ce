import { describe, it, expect } from "vitest";
import { formatDuration, activityLine, formatBytes } from "@/lib/format";

describe("formatBytes", () => {
  it("formats sizes and handles null/zero", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(0)).toBe("—");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("formatDuration", () => {
  it("formats sub-minute and minute durations", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(-5)).toBe("0s");
    expect(formatDuration(4000)).toBe("4s");
    expect(formatDuration(65000)).toBe("1m 05s");
    expect(formatDuration(252000)).toBe("4m 12s");
  });
});

describe("activityLine", () => {
  const base = {
    artifactTitle: "Pitch Deck",
    shareMode: "recipient",
    slideIndex: null,
    createdAt: new Date(),
  };

  it("names the recipient when known", () => {
    expect(
      activityLine({ ...base, type: "view", recipientLabel: "Jane @ Acme" }),
    ).toBe("Jane @ Acme opened “Pitch Deck”");
  });

  it("falls back to 'Someone' for public shares", () => {
    expect(
      activityLine({ ...base, type: "view", shareMode: "public", recipientLabel: null }),
    ).toBe("Someone opened “Pitch Deck”");
  });

  it("includes slide index and forwarding wording", () => {
    expect(
      activityLine({ ...base, type: "forward_suspected", recipientLabel: "Bob", slideIndex: 3 }),
    ).toBe("Bob forwarded (suspected) “Pitch Deck” (slide 3)");
  });
});
