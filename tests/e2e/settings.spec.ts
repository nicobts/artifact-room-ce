import { test, expect } from "@playwright/test";

/**
 * Creator settings (oss-finalization): profile rename and password change.
 * Serial within this file — the password test signs out and back in.
 */

function uniqueEmail(): string {
  return `e2e_${Math.random().toString(36).slice(2)}@example.com`;
}

async function signUp(page: import("@playwright/test").Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Settings User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("supersecret1");
  await page.getByLabel("Confirm password").fill("supersecret1");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("renaming the profile updates the sidebar", async ({ page }) => {
  await signUp(page, uniqueEmail());

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings/);

  const nameInput = page.getByLabel("Display name");
  await nameInput.fill("Renamed Creator");
  await page.getByRole("button", { name: /save changes/i }).click();

  // The sidebar footer re-renders with the new name after refresh.
  await expect(
    page.getByText("Renamed Creator", { exact: true }).first(),
  ).toBeVisible();
});

test("changing the password requires the current one and takes effect", async ({
  page,
}) => {
  const email = uniqueEmail();
  await signUp(page, email);
  await page.goto("/settings");

  // Wrong current password → error, nothing changes.
  await page.locator("#current-password").fill("not-the-password");
  await page.locator("#new-password").fill("evenmoresecret2");
  await page.locator("#confirm-new-password").fill("evenmoresecret2");
  await page.getByRole("button", { name: /change password/i }).click();
  await expect(page).toHaveURL(/\/settings/);

  // Correct current password → success (fields reset).
  await page.locator("#current-password").fill("supersecret1");
  await page.locator("#new-password").fill("evenmoresecret2");
  await page.locator("#confirm-new-password").fill("evenmoresecret2");
  await page.getByRole("button", { name: /change password/i }).click();
  await expect(page.locator("#current-password")).toHaveValue("");

  // Old password no longer works; the new one does.
  await page.getByRole("button", { name: "Settings User" }).click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Email").fill(email);
  await page.locator("#password").fill("supersecret1");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.locator("#password").fill("evenmoresecret2");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});
