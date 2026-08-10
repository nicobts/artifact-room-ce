import { test, expect, type Page } from "@playwright/test";

function uniqueEmail(): string {
  return `e2e_drill_${Math.random().toString(36).slice(2)}@example.com`;
}

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E Drill");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password", { exact: true }).fill("supersecret1");
  await page.getByLabel("Confirm password").fill("supersecret1");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("per-share drill-down renders engagement for a seeded share", async ({
  page,
  context,
}) => {
  await signUp(page);
  const upload = await context.request.post("/api/creator/upload", {
    data: {
      title: "Drilldown Deck",
      html: "<!doctype html><html><body><h1>Slide</h1></body></html>",
    },
  });
  const artifactId = (await upload.json()).id as string;
  const shareRes = await context.request.post("/api/creator/shares", {
    data: { artifactId, protection: "public", recipientLabel: "Lee @ Hooli" },
  });
  const url = (await shareRes.json()).url as string;

  // Generate a view for this share.
  await page.goto(url);
  await expect(page.locator('iframe[title="Artifact"]')).toBeVisible();
  await page.waitForTimeout(2500); // beacon + flush

  // Reach the drill-down via the detail page link.
  await page.goto(`/artifacts/${artifactId}`);
  await page.getByRole("link", { name: /recipient detail/i }).first().click();

  await expect(page).toHaveURL(
    new RegExp(`/artifacts/${artifactId}/shares/`),
  );
  await expect(page.getByText("Lee @ Hooli")).toBeVisible();
  await expect(page.getByText("Engagement", { exact: true })).toBeVisible();
  await expect(page.getByText("Per-slide funnel", { exact: true })).toBeVisible();
  await expect(page.getByText("Sessions", { exact: true })).toBeVisible();
});

test("a share the creator does not own is not found (no leak)", async ({
  page,
  context,
}) => {
  await signUp(page);
  const upload = await context.request.post("/api/creator/upload", {
    data: {
      title: "Owned Deck",
      html: "<!doctype html><html><body><h1>x</h1></body></html>",
    },
  });
  const artifactId = (await upload.json()).id as string;

  // Streaming flushes the creator shell (200) before notFound() fires in the
  // nested segment, so the security-relevant signal is that NO share data leaks
  // and the not-found UI renders — not the HTTP status code.
  await page.goto(`/artifacts/${artifactId}/shares/does-not-exist-share-id`);
  await expect(page.getByText("Engagement", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText(/this page could not be found|not found|404/i).first(),
  ).toBeVisible();
});
