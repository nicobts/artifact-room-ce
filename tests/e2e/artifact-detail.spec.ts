import { test, expect, type Page } from "@playwright/test";

function uniqueEmail(): string {
  return `e2e_detail_${Math.random().toString(36).slice(2)}@example.com`;
}

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E Detail");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password", { exact: true }).fill("supersecret1");
  await page.getByLabel("Confirm password").fill("supersecret1");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("artifact detail shows metadata, analytics recap, events, and shares", async ({
  page,
  context,
}) => {
  await signUp(page);
  const upload = await context.request.post("/api/creator/upload", {
    data: {
      title: "Detail Deck",
      html: "<!doctype html><html><body><h1>Hello detail</h1></body></html>",
    },
  });
  const artifactId = (await upload.json()).id as string;
  await context.request.post("/api/creator/shares", {
    data: { artifactId, protection: "public", recipientLabel: "Casey @ Initech" },
  });

  await page.goto(`/artifacts/${artifactId}`);

  // Section titles present (card titles are styled divs; the Shares heading is an h2).
  await expect(page.getByText("Details", { exact: true })).toBeVisible();
  await expect(page.getByText("Analytics recap", { exact: true })).toBeVisible();
  await expect(page.getByText("Recent events", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shares" })).toBeVisible();

  // Metadata persisted at upload → a real byte size renders (not the "—" placeholder).
  await expect(page.getByText("Uploaded")).toBeVisible();
  await expect(page.getByText(/^\d+(\.\d+)? (B|KB|MB)$/)).toBeVisible();

  // Share management retained.
  await expect(page.getByText("Casey @ Initech")).toBeVisible();

  // Preview embed present (from artifact-preview).
  await expect(page.locator('iframe[title="Artifact preview"]')).toBeVisible();
});
