import { test, expect, type Page } from "@playwright/test";

const VIEWER_ORIGIN =
  process.env.VIEWER_ORIGIN ?? "http://view.localhost:4300";

function uniqueEmail(): string {
  return `e2e_prev_${Math.random().toString(36).slice(2)}@example.com`;
}

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E Preview");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password", { exact: true }).fill("supersecret1");
  await page.getByLabel("Confirm password").fill("supersecret1");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("the artifact detail page embeds a viewer-origin preview iframe", async ({
  page,
  context,
}) => {
  await signUp(page);
  const upload = await context.request.post("/api/creator/upload", {
    data: {
      title: "Preview Deck",
      html: "<!doctype html><html><body><h1>Preview me</h1></body></html>",
    },
  });
  const artifactId = (await upload.json()).id as string;

  await page.goto(`/artifacts/${artifactId}`);
  const frame = page.locator('iframe[title="Artifact preview"]');
  await expect(frame).toBeVisible();
  const src = await frame.getAttribute("src");
  expect(src).toContain(`${VIEWER_ORIGIN}/preview/`);
});

test("an invalid preview token fails closed on the viewer origin", async ({
  request,
}) => {
  const res = await request.get(`${VIEWER_ORIGIN}/preview/not.a.valid.token`);
  expect(res.status()).toBe(403);
});

test("minting a preview requires a creator session", async ({ request }) => {
  // `request` here carries no signed-in cookies.
  const res = await request.post("/api/creator/preview", {
    data: { artifactId: "whatever" },
  });
  expect(res.status()).toBe(401);
});
