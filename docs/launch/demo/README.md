# Share-and-watch demo

Scripts that record `docs/launch/assets/share-and-watch.gif`, the demo at the top of the
main README. Re-run them after UI changes so the GIF matches the product.

The recording drives a real instance with Playwright: it signs up, uploads `deck.html`,
creates a share labelled "Jane @ Acme", opens it as Jane in a separate browser profile
(scrolling the slides and dwelling on pricing), opens it once more from a different
browser off camera so forwarding detection fires, and ends on the share's engagement page.
All numbers on screen are captured by the app, not mocked.

## Run

Requires Docker, `npm ci` in the repo root (for `@playwright/test`), and `ffmpeg` on PATH.

```bash
docker compose up --build -d          # app on http://localhost:3000
npx playwright install chromium       # once
node docs/launch/demo/record.mjs      # writes docs/launch/demo/out/ (git-ignored)
node docs/launch/demo/make-gif.mjs    # writes docs/launch/assets/share-and-watch.gif
```

Set `APP=http://…` to record against another instance. `make-gif.mjs` trims the
recording to the moments marked in `out/marks.json`, speeds up the upload and viewing
segments slightly, and encodes at 960 px, 12 fps with a 128-colour palette.
