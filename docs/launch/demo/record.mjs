// Records the share-and-watch demo as video segments plus timing marks.
// Usage: see README.md in this folder.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP = process.env.APP || 'http://localhost:3000';
const OUT = path.join(__dirname, 'out');
const SIZE = { width: 1280, height: 800 };
const deck = fs.readFileSync(path.join(__dirname, 'deck.html'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function caption(page, text) {
  await page.evaluate((t) => {
    let el = document.getElementById('__demo_caption');
    if (!el) {
      el = document.createElement('div');
      el.id = '__demo_caption';
      el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;' +
        'background:#0f172a;color:#fff;font:600 20px/1.2 Inter,system-ui,sans-serif;padding:12px 22px;' +
        'border-radius:999px;box-shadow:0 8px 30px rgba(0,0,0,.25);pointer-events:none;white-space:nowrap';
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const marks = {};

  // ---- creator ----
  const creatorCtx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: path.join(OUT, 'creator'), size: SIZE } });
  const page = await creatorCtx.newPage();
  const c0 = Date.now();
  const cmark = (k) => { marks[k] = (Date.now() - c0) / 1000; };

  await page.goto(`${APP}/signup`);
  await page.getByLabel('Full name').fill('Nicolas Bossi');
  await page.getByLabel('Email').fill(`demo_${Date.now()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('supersecret1');
  await page.getByLabel('Confirm password').fill('supersecret1');
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto(`${APP}/artifacts`);
  await page.waitForLoadState('networkidle');

  cmark('upload_start');
  await caption(page, '1 · Upload any AI-generated HTML');
  await sleep(900);
  await page.getByPlaceholder('Title').click();
  await page.getByPlaceholder('Title').pressSequentially('Northwind × Acme — Q4 proposal', { delay: 35 });
  await page.getByPlaceholder(/doctype html/i).fill(deck);
  await sleep(700);
  await page.getByRole('button', { name: /^upload$/i }).click();
  await page.getByText('Northwind × Acme — Q4 proposal').first().waitFor();
  await sleep(1000);

  await page.getByRole('link', { name: /manage shares/i }).first().click();
  await page.waitForURL(/\/artifacts\/[^/]+$/);
  await page.waitForLoadState('networkidle');
  const artifactUrl = page.url();
  await caption(page, '2 · Create a link for one recipient');
  await sleep(800);
  await page.getByLabel('Recipient label (optional)').click();
  await page.getByLabel('Recipient label (optional)').pressSequentially('Jane @ Acme', { delay: 60 });
  await sleep(400);
  const shareResp = page.waitForResponse((r) => r.url().includes('/api/creator/shares') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /create share/i }).click();
  const shareUrl = (await (await shareResp).json()).url;
  await page.getByText('Jane @ Acme').first().waitFor();
  await sleep(1500);
  cmark('share_end');

  if (!shareUrl) throw new Error('share URL missing from API response');
  fs.writeFileSync(path.join(OUT, 'share-url.txt'), shareUrl);

  // ---- recipient (separate browser profile) ----
  const recCtx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: path.join(OUT, 'recipient'), size: SIZE } });
  const rec = await recCtx.newPage();
  const r0 = Date.now();
  await rec.goto(shareUrl);
  const frameEl = rec.locator('iframe[title="Artifact"]');
  await frameEl.waitFor();
  await sleep(600);
  marks.rec_start = (Date.now() - r0) / 1000;
  await caption(rec, '3 · Jane opens it — no login, no vendor branding');
  await sleep(1800);
  const frame = await (await frameEl.elementHandle()).contentFrame();
  const goSlide = (id) => frame.evaluate((i) => document.getElementById(i).scrollIntoView({ behavior: 'smooth' }), id);
  await goSlide('problem'); await sleep(1500);
  await goSlide('approach'); await sleep(1500);
  await goSlide('pricing'); await sleep(700);
  await caption(rec, '…and lingers on the pricing slide');
  await sleep(3500);
  await goSlide('next-steps'); await sleep(1500);
  marks.rec_end = (Date.now() - r0) / 1000;
  await sleep(2500);
  await rec.goto('about:blank'); // pagehide flushes the last slide's dwell
  await sleep(1500);

  // Off camera: a colleague opens a forwarded copy on another device.
  await recCtx.close();
  const fwdCtx = await browser.newContext({ viewport: SIZE, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15' });
  const fwd = await fwdCtx.newPage();
  await fwd.goto(shareUrl);
  await fwd.locator('iframe[title="Artifact"]').waitFor();
  await sleep(3000);
  await fwd.goto('about:blank');
  await sleep(1000);
  await fwdCtx.close();
  await sleep(1500);

  // ---- back to the creator ----
  await page.goto(artifactUrl);
  await page.waitForLoadState('networkidle');
  cmark('insight_start');
  await caption(page, '4 · See what Jane actually did');
  await sleep(1400);
  await page.getByRole('link', { name: /recipient detail/i }).first().click();
  await page.waitForURL(/\/shares\//);
  await page.waitForLoadState('networkidle');
  await caption(page, '4 · See what Jane actually did');
  await sleep(1800);
  const funnel = page.getByText('Per-slide funnel', { exact: true });
  if (await funnel.count()) {
    await funnel.scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, -120);
  }
  await caption(page, 'Per-slide dwell and forwarding — per recipient');
  await sleep(3500);
  cmark('insight_end');
  await page.screenshot({ path: path.join(OUT, 'insight.png'), fullPage: true });
  await creatorCtx.close();
  await browser.close();

  const vid = (d) => path.join(OUT, d, fs.readdirSync(path.join(OUT, d)).find((f) => f.endsWith('.webm')));
  marks.creatorVideo = vid('creator');
  marks.recipientVideo = vid('recipient');
  fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify(marks, null, 2));
  console.log(JSON.stringify(marks, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
