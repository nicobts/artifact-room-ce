import { test, expect, type Page } from "@playwright/test";

function uniqueEmail(): string {
  return `e2e_sh_${Math.random().toString(36).slice(2)}@example.com`;
}

async function signUpAndUpload(page: Page, title: string) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E Sharer");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password", { exact: true }).fill("supersecret1");
  await page.getByLabel("Confirm password").fill("supersecret1");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/artifacts");
  await page.getByPlaceholder("Title").fill(title);
  await page
    .getByPlaceholder(/doctype html/i)
    .fill("<!doctype html><html><body><h1>Hi</h1></body></html>");
  await page.getByRole("button", { name: /^upload$/i }).click();
  await expect(page.getByText(title)).toBeVisible();
}

test("create a public share and see it listed", async ({ page }) => {
  await signUpAndUpload(page, "Share Deck");

  await page.getByRole("link", { name: /manage shares/i }).first().click();
  await expect(page).toHaveURL(/\/artifacts\/[^/]+$/);

  await page.getByLabel("Recipient label (optional)").fill("Jane @ Acme");
  await page.getByRole("button", { name: /create share/i }).click();

  await expect(page.getByText("Jane @ Acme")).toBeVisible();
});
