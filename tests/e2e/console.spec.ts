import { test, expect, type Page } from "@playwright/test";

function uniqueEmail(): string {
  return `e2e_console_${Math.random().toString(36).slice(2)}@example.com`;
}

async function signUp(page: Page): Promise<string> {
  const email = uniqueEmail();
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E Console");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("supersecret1");
  await page.getByLabel("Confirm password").fill("supersecret1");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return email;
}

test("new account: dashboard empty state and clean navigation", async ({ page }) => {
  const email = await signUp(page);

  // Empty-state guidance, not fake demo data.
  await expect(
    page.getByRole("link", { name: /upload your first artifact/i }),
  ).toBeVisible();

  // Navigation contains only real routes...
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Artifacts" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Analytics" })).toBeVisible();

  // ...and none of the stock shadcn dead links or fake user.
  for (const dead of ["Projects", "Team", "Data Library", "Word Assistant", "Quick Create"]) {
    await expect(page.getByText(dead, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByText("shadcn")).toHaveCount(0);
  await expect(page.getByText("m@example.com")).toHaveCount(0);

  // Admin is hidden for a non-admin creator.
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);

  // The real signed-in user is shown.
  await expect(page.getByText(email)).toBeVisible();
});

test("populated dashboard + analytics surface (chart, table, filter, sort)", async ({
  page,
  context,
}) => {
  await signUp(page);

  // Two shares on two artifacts — enough to exercise the table and its filter
  // deterministically (shares list immediately; no dependency on async beacon
  // flush — that path is covered by analytics.spec).
  async function makeShare(
    title: string,
    protection: string,
    extra: Record<string, unknown> = {},
  ) {
    const upload = await context.request.post("/api/creator/upload", {
      data: { title, html: "<!doctype html><html><body><h1>Hi</h1></body></html>" },
    });
    const artifactId = (await upload.json()).id as string;
    await context.request.post("/api/creator/shares", {
      data: { artifactId, protection, ...extra },
    });
  }
  await makeShare("Recipient Deck", "password", {
    recipientEmail: "dana@globex.com",
    recipientLabel: "Dana @ Globex",
    password: "hunter2hunter2",
  });
  await makeShare("Public Deck", "public");

  // Dashboard is no longer the empty state once an artifact exists.
  await page.goto("/dashboard");
  await expect(
    page.getByRole("link", { name: /upload your first artifact/i }),
  ).toHaveCount(0);
  await expect(page.getByText(/Recent activity/i)).toBeVisible();
  await expect(page.getByText(/Top artifacts by engagement/i)).toBeVisible();

  // Analytics surface: chart + both share rows.
  await page.goto("/analytics");
  await expect(page.getByText(/Views over time/i)).toBeVisible();
  await expect(page.getByRole("cell", { name: "Recipient Deck" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Public Deck" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Dana @ Globex" })).toBeVisible();

  // Mode filter: public-only hides the recipient row; recipient-only hides the public one.
  await page.getByLabel("Filter by mode").click();
  await page.getByRole("option", { name: "public" }).click();
  await expect(page.getByRole("cell", { name: "Dana @ Globex" })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Public Deck" })).toBeVisible();

  await page.getByLabel("Filter by mode").click();
  await page.getByRole("option", { name: "recipient" }).click();
  await expect(page.getByRole("cell", { name: "Recipient Deck" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Public Deck" })).toHaveCount(0);

  // Sorting by a column header does not break the table.
  await page.getByRole("button", { name: /Views/ }).first().click();
  await expect(page.getByRole("cell", { name: "Recipient Deck" })).toBeVisible();
});
