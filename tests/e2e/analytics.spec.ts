import { test, expect, type Page } from "@playwright/test";

function uniqueEmail(): string {
  return `e2e_an_${Math.random().toString(36).slice(2)}@example.com`;
}

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E Analytics");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password", { exact: true }).fill("supersecret1");
  await page.getByLabel("Confirm password").fill("supersecret1");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("viewing a recipient link records a view that surfaces in the dashboard", async ({
  page,
  context,
}) => {
  await signUp(page);
  const upload = await context.request.post("/api/creator/upload", {
    data: { title: "Analytics Deck", html: "<!doctype html><html><body><h1>Hi</h1></body></html>" },
  });
  const artifactId = (await upload.json()).id as string;
  const shareRes = await context.request.post("/api/creator/shares", {
    data: { artifactId, protection: "public", recipientLabel: "Jane @ Acme" },
  });
  const url = (await shareRes.json()).url as string;

  // View the artifact (the shim emits a `view`, the shell beacons it).
  await page.goto(url);
  await expect(page.locator('iframe[title="Artifact"]')).toBeVisible();
  await page.waitForTimeout(2500); // allow beacon + write-behind flush

  // The creator dashboard shows the view, attributed to this recipient share.
  // The dashboard is server-rendered, so reload until the buffered event flushes.
  await page.goto(`/artifacts/${artifactId}`);
  // The recipient label now appears in both the recent-events feed and the
  // share list; either is a valid confirmation.
  await expect(page.getByText("Jane @ Acme").first()).toBeVisible();
  await expect(async () => {
    await page.reload();
    await expect(page.getByText(/[1-9]\d* views/).first()).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });
});
