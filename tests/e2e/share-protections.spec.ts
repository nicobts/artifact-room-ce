import { test, expect, type BrowserContext, type Page } from "@playwright/test";

const VIEWER_ORIGIN = process.env.VIEWER_ORIGIN ?? "http://view.localhost:4300";
const EMAIL = "jane@acme.com";
const PW = "hunter2hunter2";

function uniqueEmail(): string {
  return `e2e_prot_${Math.random().toString(36).slice(2)}@example.com`;
}

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E Protections");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password", { exact: true }).fill("supersecret1");
  await page.getByLabel("Confirm password").fill("supersecret1");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Uploads an artifact and creates one share at the given protection. */
async function seedShare(
  context: BrowserContext,
  protection: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const upload = await context.request.post("/api/creator/upload", {
    data: {
      title: `Protected ${protection}`,
      html: "<!doctype html><html><body><h1>Protected artifact</h1></body></html>",
    },
  });
  expect(upload.ok()).toBeTruthy();
  const artifactId = (await upload.json()).id as string;

  const share = await context.request.post("/api/creator/shares", {
    data: { artifactId, protection, ...extra },
  });
  expect(share.status()).toBe(201);
  const url = (await share.json()).url as string;
  expect(url.startsWith(VIEWER_ORIGIN)).toBeTruthy();
  return url;
}

test("public: opens with no gate", async ({ page, context, browser }) => {
  await signUp(page);
  const url = await seedShare(context, "public");

  const guest = await browser.newContext();
  const gp = await guest.newPage();
  await gp.goto(url);
  await expect(gp.locator("iframe")).toBeVisible();
  await guest.close();
});

test("email: only the registered address opens it", async ({
  page,
  context,
  browser,
}) => {
  await signUp(page);
  const url = await seedShare(context, "email", { recipientEmail: EMAIL });

  const guest = await browser.newContext();
  const gp = await guest.newPage();
  await gp.goto(url);

  await expect(gp.getByLabel("Email")).toBeVisible();
  await expect(gp.getByLabel("Password")).toHaveCount(0);

  await gp.getByLabel("Email").fill("someone-else@acme.com");
  await gp.getByRole("button", { name: /unlock/i }).click();
  await expect(gp.getByText(/that didn.t work/i)).toBeVisible();

  await gp.getByLabel("Email").fill(EMAIL);
  await gp.getByRole("button", { name: /unlock/i }).click();
  await expect(gp.locator("iframe")).toBeVisible();
  await guest.close();
});

test("email_password: both are required together", async ({
  page,
  context,
  browser,
}) => {
  await signUp(page);
  const url = await seedShare(context, "email_password", {
    recipientEmail: EMAIL,
    password: PW,
  });

  const guest = await browser.newContext();
  const gp = await guest.newPage();
  await gp.goto(url);

  await expect(gp.getByLabel("Email")).toBeVisible();
  await expect(gp.getByLabel("Password")).toBeVisible();

  // Right address, wrong password — same message as a wrong address.
  await gp.getByLabel("Email").fill(EMAIL);
  await gp.getByLabel("Password").fill("not-the-password");
  await gp.getByRole("button", { name: /unlock/i }).click();
  await expect(gp.getByText(/that didn.t work/i)).toBeVisible();

  await gp.getByLabel("Password").fill(PW);
  await gp.getByRole("button", { name: /unlock/i }).click();
  await expect(gp.locator("iframe")).toBeVisible();
  await guest.close();
});

test("password: never asks for the address", async ({
  page,
  context,
  browser,
}) => {
  await signUp(page);
  const url = await seedShare(context, "password", {
    recipientEmail: EMAIL,
    password: PW,
  });

  const guest = await browser.newContext();
  const gp = await guest.newPage();
  await gp.goto(url);

  // The share stores an address for attribution, but the viewer is never
  // asked to type it.
  await expect(gp.getByLabel("Password")).toBeVisible();
  await expect(gp.getByLabel("Email")).toHaveCount(0);

  await gp.getByLabel("Password").fill(PW);
  await gp.getByRole("button", { name: /unlock/i }).click();
  await expect(gp.locator("iframe")).toBeVisible();
  await guest.close();
});

test("the unlock endpoint does not distinguish its failures", async ({
  page,
  context,
}) => {
  await signUp(page);
  const url = await seedShare(context, "email_password", {
    recipientEmail: EMAIL,
    password: PW,
  });
  const token = url.split("/v/")[1];

  const attempts = [
    { label: "unknown token", body: { token: "no-such-token-at-all", password: PW } },
    { label: "wrong email", body: { token, email: "nope@acme.com", password: PW } },
    { label: "wrong password", body: { token, email: EMAIL, password: "wrong" } },
    { label: "missing token", body: { password: PW } },
  ];

  const seen = new Set<string>();
  for (const a of attempts) {
    const res = await context.request.post("/api/public/unlock", { data: a.body });
    seen.add(`${res.status()}:${await res.text()}`);
  }

  // Every failure must be byte-identical, or the endpoint becomes an oracle
  // for which tokens exist and which addresses are registered.
  expect(seen.size).toBe(1);
});

test("the raw artifact endpoint refuses without a satisfied gate", async ({
  page,
  context,
  browser,
}) => {
  await signUp(page);
  const url = await seedShare(context, "password", {
    recipientEmail: EMAIL,
    password: PW,
  });
  const token = url.split("/v/")[1];

  const guest = await browser.newContext();
  const res = await guest.request.get(`${VIEWER_ORIGIN}/v/${token}/raw`);
  expect(res.status()).toBe(403);
  await guest.close();
});
