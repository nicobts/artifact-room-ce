import { test, expect } from "@playwright/test";

/**
 * Root entry-point behavior (the marketing landing moved to its own repo):
 * `/` on the app origin never renders content — it redirects to /login for
 * anonymous visitors and to /dashboard for an authenticated creator.
 */

function uniqueEmail(): string {
  return `e2e_${Math.random().toString(36).slice(2)}@example.com`;
}

test("/ redirects to /login when logged out", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("/ redirects to /dashboard when authenticated", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E User");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password", { exact: true }).fill("supersecret1");
  await page.getByLabel("Confirm password").fill("supersecret1");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard/);
});
