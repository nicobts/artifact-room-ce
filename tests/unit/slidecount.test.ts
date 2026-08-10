import { describe, it, expect } from "vitest";
import { parseSlideCount } from "@/lib/slidecount";

describe("parseSlideCount", () => {
  it("reads a declared <meta> slide count", () => {
    expect(
      parseSlideCount(`<meta name="slide-count" content="7">`),
    ).toBe(7);
  });

  it("counts data-slide attributes", () => {
    expect(
      parseSlideCount(
        `<div data-slide></div><div data-slide></div><div data-slide></div>`,
      ),
    ).toBe(3);
  });

  it("counts reveal.js sections", () => {
    const html = `<div class="reveal"><div class="slides"><section>1</section><section>2</section></div></div>`;
    expect(parseSlideCount(html)).toBe(2);
  });

  it("returns null when no convention is present", () => {
    expect(parseSlideCount(`<html><body><p>no slides</p></body></html>`)).toBeNull();
  });

  it("ignores absurd declared values", () => {
    expect(parseSlideCount(`<meta name="slide-count" content="0">`)).toBeNull();
  });
});
