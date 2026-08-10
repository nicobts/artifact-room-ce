import { test, expect, type Page } from "@playwright/test";

const VIEWER_ORIGIN = process.env.VIEWER_ORIGIN ?? "http://view.localhost:4300";

function uniqueEmail(): string {
  return `e2e_view_${Math.random().toString(36).slice(2)}@example.com`;
}

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E Viewer");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password", { exact: true }).fill("supersecret1");
  await page.getByLabel("Confirm password").fill("supersecret1");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("a public share renders in a sandboxed iframe on the viewer origin", async ({
  page,
  context,
}) => {
  await signUp(page);

  // Use the authenticated browser context to upload + create a public share.
  const upload = await context.request.post("/api/creator/upload", {
    data: {
      title: "Viewer Deck",
      html: "<!doctype html><html><body><h1>Hello from the artifact</h1></body></html>",
    },
  });
  const artifactId = (await upload.json()).id as string;

  const share = await context.request.post("/api/creator/shares", {
    data: { artifactId, protection: "public" },
  });
  const url = (await share.json()).url as string;
  expect(url.startsWith(VIEWER_ORIGIN)).toBeTruthy();

  await page.goto(url);

  const frame = page.locator('iframe[title="Artifact"]');
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");

  // The artifact content renders inside the sandboxed frame.
  await expect(
    page.frameLocator('iframe[title="Artifact"]').getByText("Hello from the artifact"),
  ).toBeVisible();
});

test("the viewer origin carries no creator session cookie", async ({ page }) => {
  await signUp(page); // creator session now exists on the app origin
  await page.goto(`${VIEWER_ORIGIN}/v/some-token`);
  const cookies = await page.context().cookies(VIEWER_ORIGIN);
  expect(cookies.some((c) => c.name.startsWith("better-auth"))).toBe(false);
});
