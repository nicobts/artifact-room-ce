import { describe, it, expect } from "vitest";
import { injectShim } from "@/lib/viewer-shim/shim";

describe("shim source (region analytics)", () => {
  const src = injectShim("<html><body></body></html>", "http://view.test");

  it("detects declared sections first", () => {
    expect(src).toContain("data-ar-section");
    expect(src.indexOf("data-ar-section")).toBeLessThan(src.indexOf("data-slide"));
  });

  it("labels regions from data-ar-label, id, or headings", () => {
    expect(src).toContain("data-ar-label");
    expect(src).toMatch(/h1,\s*h2,\s*h3|h1, h2, h3/);
  });

  it("falls back to scroll quartiles with canonical labels", () => {
    expect(src).toContain("0\\u201325%".replace("\\u2013", "–"));
    expect(src).toContain("75–100%");
    expect(src).toContain("scroll");
  });

  it("re-posts detection once for the hydration race", () => {
    expect(src).toContain("repost");
  });

  it("computes the scroll bucket from normalized scroll progress, not viewport midpoint", () => {
    expect(src).toContain("scrollHeight-window.innerHeight");
    expect(src).not.toContain("innerHeight/2");
  });

  it("resets the dwell timer inside flush so pagehide never double-counts a dwell", () => {
    const flushBody = src.slice(src.indexOf("function flush("), src.indexOf("function flush(") + 200);
    expect(flushBody).toContain("enter=Date.now()");
  });

  it("caps labels at 40 before the byte-budget trim", () => {
    expect(src).toContain("labels.length>40");
  });

  it("still injects before </body>", () => {
    expect(src.trim().endsWith("</body></html>")).toBe(true);
  });
});
