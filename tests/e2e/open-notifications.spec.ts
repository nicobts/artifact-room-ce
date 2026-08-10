import { test, expect, type Page } from "@playwright/test";

function uniqueEmail(): string {
  return `e2e_notif_${Math.random().toString(36).slice(2)}@example.com`;
}

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E Notif");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password", { exact: true }).fill("supersecret1");
  await page.getByLabel("Confirm password").fill("supersecret1");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("a recipient open surfaces in the notifications bell and clears on view", async ({
  page,
  context,
}) => {
  await signUp(page);
  const upload = await context.request.post("/api/creator/upload", {
    data: {
      title: "Notify Deck",
      html: "<!doctype html><html><body><h1>Hi</h1></body></html>",
    },
  });
  const artifactId = (await upload.json()).id as string;
  const shareRes = await context.request.post("/api/creator/shares", {
    data: { artifactId, protection: "public", recipientLabel: "Morgan @ Stark" },
  });
  const url = (await shareRes.json()).url as string;

  // Recipient opens the link → a `view` event is recorded.
  await page.goto(url);
  await expect(page.locator('iframe[title="Artifact"]')).toBeVisible();
  await page.waitForTimeout(4000); // beacon + write-behind flush (generous on Windows dev)

  // The projection surfaces the first-open through the creator API (this is the
  // backend signal; the bell renders it). Poll until the buffered event flushes.
  await expect(async () => {
    const res = await context.request.get("/api/creator/notifications");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      unread: number;
      items: { line: string }[];
    };
    expect(body.unread).toBeGreaterThanOrEqual(1);
    expect(body.items.some((i) => /opened/.test(i.line))).toBeTruthy();
  }).toPass({ timeout: 30_000 });

  // The header bell reflects the unread count.
  await page.goto("/dashboard");
  const bell = page.getByRole("button", { name: /notifications/i });
  await expect(async () => {
    await page.reload();
    await expect(bell).toHaveAccessibleName(/unread/i, { timeout: 3000 });
  }).toPass({ timeout: 20_000 });

  // Open the feed → the first-open item is listed and the badge clears.
  await bell.click();
  await expect(page.getByText(/opened\s+“Notify Deck”/).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(bell).toHaveAccessibleName("Notifications");
});
