// Builds ../assets/share-and-watch.gif from the segments recorded by record.mjs.
// Requires ffmpeg on PATH. Usage: see README.md in this folder.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const m = JSON.parse(fs.readFileSync(path.join(__dirname, "out", "marks.json"), "utf8"));
const out = path.join(__dirname, "..", "assets", "share-and-watch.gif");
const f = (x) => Math.max(0, x).toFixed(2);
const filter = [
  `[0:v]trim=${f(m.upload_start - 0.2)}:${f(m.share_end)},setpts=(PTS-STARTPTS)/1.25[a]`,
  `[1:v]trim=${f(m.rec_start - 0.1)}:${f(m.rec_end)},setpts=(PTS-STARTPTS)/1.15[b]`,
  `[0:v]trim=${f(m.insight_start)}:${f(m.insight_end)},setpts=PTS-STARTPTS[c]`,
  `[a][b][c]concat=n=3:v=1:a=0,fps=12,scale=960:-1:flags=lanczos,split[x][y]`,
  `[x]palettegen=max_colors=128:stats_mode=diff[p]`,
  `[y][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
].join(';');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', m.creatorVideo, '-i', m.recipientVideo, '-filter_complex', filter, '-loop', '0', out], { stdio: 'inherit' });
console.log(out);
