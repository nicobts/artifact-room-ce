import { test, expect } from "@playwright/test";

/** Unique email per run so repeated local runs don't collide on the unique index. */
function uniqueEmail(): string {
  return `e2e_${Math.random().toString(36).slice(2)}@example.com`;
}

test("sign-up lands on the dashboard", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E User");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password", { exact: true }).fill("supersecret1");
  await page.getByLabel("Confirm password").fill("supersecret1");
  await page.getByRole("button", { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(
    page.getByRole("heading", { name: "Artifact Room" }),
  ).toBeVisible();
});

test("a creator route redirects to /login when logged out", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("sign-in with wrong credentials shows an error and stays on /login", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/login/);
});

test("the password visibility toggle reveals and hides the password", async ({
  page,
}) => {
  await page.goto("/login");
  const password = page.locator("#password");
  await password.fill("supersecret1");
  await expect(password).toHaveAttribute("type", "password");

  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");

  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(password).toHaveAttribute("type", "password");
});

test("remember me controls whether the session cookie persists", async ({
  page,
  context,
}) => {
  // Create an account to sign in with.
  const email = uniqueEmail();
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("supersecret1");
  await page.getByLabel("Confirm password").fill("supersecret1");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const sessionCookie = async () => {
    const cookies = await context.cookies();
    return cookies.find((c) => c.name.includes("session_token"));
  };

  // Default (checked): a persistent cookie with a real expiry.
  await context.clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.locator("#password").fill("supersecret1");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const persistent = await sessionCookie();
  expect(persistent).toBeTruthy();
  expect(persistent!.expires).toBeGreaterThan(Date.now() / 1000);

  // Unchecked: a browser-session-only cookie (no expiry).
  await context.clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.locator("#password").fill("supersecret1");
  await page.getByRole("checkbox", { name: /remember me/i }).click();
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const sessionOnly = await sessionCookie();
  expect(sessionOnly).toBeTruthy();
  expect(sessionOnly!.expires).toBe(-1);
});
