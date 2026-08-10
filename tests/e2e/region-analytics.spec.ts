import { test, expect, type Page, type Frame } from "@playwright/test";

function uniqueEmail(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2)}@example.com`;
}

async function signUp(page: Page, name: string, prefix: string) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(uniqueEmail(prefix));
  await page.getByLabel("Password", { exact: true }).fill("supersecret1");
  await page.getByLabel("Confirm password").fill("supersecret1");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** The artifact iframe's content frame, regardless of the sandbox's opaque origin. */
async function artifactFrame(page: Page): Promise<Frame> {
  const handle = await page.locator('iframe[title="Artifact"]').elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) throw new Error("artifact iframe content frame not found");
  return frame;
}

/** The value span rendered next to a `Stat` label — used to read the Coverage stat. */
function statValue(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("xpath=following-sibling::span[1]");
}

test.describe.configure({ mode: "serial" });

test("annotated sections drive a labeled, covered drill-down", async ({ page, context }) => {
  await signUp(page, "E2E Sections", "e2e_ra_sections");

  const html = `<!doctype html><html><body style="margin:0">
    <section data-ar-section data-ar-label="Intro" style="min-height:900px;padding:2rem">Intro copy</section>
    <section data-ar-section data-ar-label="Details" style="min-height:900px;padding:2rem">Details copy</section>
    <section data-ar-section data-ar-label="Outro" style="min-height:900px;padding:2rem">Outro copy</section>
  </body></html>`;

  const upload = await context.request.post("/api/creator/upload", {
    data: { title: "Sectioned Deck", html },
  });
  const artifactId = (await upload.json()).id as string;
  const shareRes = await context.request.post("/api/creator/shares", {
    data: { artifactId, protection: "public", recipientLabel: "E2E Sections Recipient" },
  });
  const { id: shareId, url } = (await shareRes.json()) as { id: string; url: string };

  await page.goto(url);
  await expect(page.locator('iframe[title="Artifact"]')).toBeVisible();

  // Scroll each declared section into view so the IntersectionObserver walks
  // the full ladder (index 0 through the last section), not just the first.
  const frame = await artifactFrame(page);
  for (let i = 0; i < 3; i++) {
    await frame.evaluate((idx) => {
      const el = document.querySelectorAll("[data-ar-section]")[idx] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "center" });
    }, i);
    await page.waitForTimeout(700);
  }

  // Generous wait: the shell holds the view for up to 2200ms so detection can
  // ride along, and the shim reposts detection again at 2000ms.
  await page.waitForTimeout(3000);

  await expect(async () => {
    await page.goto(`/artifacts/${artifactId}/shares/${shareId}`);
    await expect(page.getByText("3 sections (annotated)")).toBeVisible();
    // Proves detection metadata (labels) survived shim → shell → beacon → query.
    await expect(page.getByText("Intro", { exact: true })).toBeVisible();
    await expect(page.getByText("Details", { exact: true })).toBeVisible();
    await expect(page.getByText("Outro", { exact: true })).toBeVisible();
    // Proves coverage computed against the real detection count (not "—").
    await expect(statValue(page, "Coverage")).not.toHaveText("—");
  }).toPass({ timeout: 25_000 });
});

test("a tall unannotated page reports scroll-quartile coverage at both extremes", async ({
  page,
  context,
}) => {
  await signUp(page, "E2E Quartiles", "e2e_ra_quartiles");

  const paragraphs = Array.from(
    { length: 80 },
    (_, i) => `<p style="margin:0;padding:24px 0">Filler paragraph ${i} for scroll depth.</p>`,
  ).join("\n");
  const html = `<!doctype html><html><body style="margin:0">${paragraphs}</body></html>`;

  const upload = await context.request.post("/api/creator/upload", {
    data: { title: "Tall Unannotated Page", html },
  });
  const artifactId = (await upload.json()).id as string;
  const shareRes = await context.request.post("/api/creator/shares", {
    data: { artifactId, protection: "public", recipientLabel: "E2E Quartiles Recipient" },
  });
  const { id: shareId, url } = (await shareRes.json()) as { id: string; url: string };

  await page.goto(url);
  await expect(page.locator('iframe[title="Artifact"]')).toBeVisible();
  // Bucket 0 ("0–25%") posts immediately on load, at scrollTop 0.
  await page.waitForTimeout(500);

  const frame = await artifactFrame(page);
  await frame.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  // Bucket 3 ("75–100%") posts once the scroll handler's rAF settles.
  await page.waitForTimeout(700);

  await page.waitForTimeout(3000);

  await expect(async () => {
    await page.goto(`/artifacts/${artifactId}/shares/${shareId}`);
    await expect(page.getByText("scroll depth (auto)")).toBeVisible();
    // Clamping proof: both the first and last quartile buckets are reachable.
    await expect(page.getByText("0–25%", { exact: true })).toBeVisible();
    await expect(page.getByText("75–100%", { exact: true })).toBeVisible();
    await expect(statValue(page, "Coverage")).not.toHaveText("—");
  }).toPass({ timeout: 25_000 });
});

test("the Analytics guidance card renders and expands via #improve-tracking", async ({
  page,
  context,
}) => {
  await signUp(page, "E2E Guidance", "e2e_ra_guidance");

  const upload = await context.request.post("/api/creator/upload", {
    data: {
      title: "Guidance Deck",
      html: "<!doctype html><html><body><h1>Hi</h1></body></html>",
    },
  });
  const artifactId = (await upload.json()).id as string;
  // A share just needs to exist for the Analytics page to render the table
  // (and the guidance card) instead of the empty state.
  await context.request.post("/api/creator/shares", {
    data: { artifactId, protection: "public" },
  });

  await page.goto("/analytics");
  const card = page.locator("#improve-tracking");
  await expect(card.getByText("Improve your tracking")).toBeVisible();
  await expect(card.getByText(/data-ar-section/).first()).toBeHidden();

  await card.getByRole("button", { name: /improve your tracking/i }).click();
  await expect(card.getByText(/data-ar-section/).first()).toBeVisible();
  await expect(card.getByText(/Wrap each logical section/)).toBeVisible();

  // Deep-linking the hash auto-expands the card on load, without a click.
  await page.goto("/analytics#improve-tracking");
  await expect(page.locator("#improve-tracking").getByText(/data-ar-section/).first()).toBeVisible();
});

test("a heavily-sectioned artifact still renders labels and coverage (byte-budget trim converges)", async ({
  page,
  context,
}) => {
  await signUp(page, "E2E Many Labels", "e2e_ra_labels");

  const SECTION_COUNT = 45;
  const RAW_LABEL_LEN = 40;
  // Deterministic ~40-char label; the shim's client-side `collapse()` slices
  // to 32 chars, so the surviving label is exactly this string's first 32
  // characters — computed the same way below for the assertion.
  function longLabel(i: number): string {
    const tag = `Section ${String(i + 1).padStart(2, "0")} `;
    return tag.padEnd(RAW_LABEL_LEN, "x");
  }

  const sections = Array.from(
    { length: SECTION_COUNT },
    (_, i) =>
      `<section data-ar-section data-ar-label="${longLabel(i)}" style="min-height:220px;padding:1rem">Section ${i}</section>`,
  ).join("\n");
  const html = `<!doctype html><html><body style="margin:0">${sections}</body></html>`;

  const upload = await context.request.post("/api/creator/upload", {
    data: { title: "Many Sections Deck", html },
  });
  const artifactId = (await upload.json()).id as string;
  const shareRes = await context.request.post("/api/creator/shares", {
    data: { artifactId, protection: "public", recipientLabel: "E2E Labels Recipient" },
  });
  const { id: shareId, url } = (await shareRes.json()) as { id: string; url: string };

  await page.goto(url);
  await expect(page.locator('iframe[title="Artifact"]')).toBeVisible();

  // Section 0 intersects on load; scroll a bit further so a second bucket of
  // slide_view events land too (coverage should be > 0, not just present).
  const frame = await artifactFrame(page);
  await frame.evaluate(() => {
    const el = document.querySelectorAll("[data-ar-section]")[5] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(700);

  await page.waitForTimeout(3000);

  const expectedLabel0 = longLabel(0).slice(0, 32);

  await expect(async () => {
    await page.goto(`/artifacts/${artifactId}/shares/${shareId}`);
    await expect(page.getByText(`${SECTION_COUNT} sections (annotated)`)).toBeVisible();
    // The message wasn't dropped: a real (truncated) label rendered end-to-end.
    await expect(page.getByText(expectedLabel0, { exact: true })).toBeVisible();
    await expect(statValue(page, "Coverage")).not.toHaveText("—");
  }).toPass({ timeout: 25_000 });
});
