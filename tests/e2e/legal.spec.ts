import { test, expect } from "@playwright/test";

/**
 * Legal documents (legal-pages): the auth-form links open a dialog (form
 * state preserved), and the same content lives at canonical routes.
 */

test("terms dialog opens on signup without losing form state", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill("keep-me@example.com");
  await page.getByRole("button", { name: "Terms" }).click();
  await expect(
    page.getByRole("dialog").getByText("Terms of Service"),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: /open as page/i }),
  ).toHaveAttribute("href", "/terms");
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Email")).toHaveValue("keep-me@example.com");
});

test("privacy dialog opens on login", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Privacy Policy" }).click();
  await expect(
    page.getByRole("dialog").getByText("Privacy Policy"),
  ).toBeVisible();
});

test("canonical legal pages render", async ({ page }) => {
  await page.goto("/terms");
  await expect(
    page.getByRole("heading", { level: 1, name: /terms of service/i }),
  ).toBeVisible();
  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { level: 1, name: /privacy policy/i }),
  ).toBeVisible();
});
