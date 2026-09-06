import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = 'http://127.0.0.1:8000/index.html?capture=1&cold=1&tier=draft';
const outDir = path.resolve('docs/media');
const tmpRoot = path.resolve('.gif-frames');
const cases = [
  { name: 'ignia-overview', preset: 'hearth', warm: 120, step: 10, shot: 'orbit' },
  { name: 'ignia-combustors', preset: 'stove4', warm: 120, step: 8, shot: 'close' },
  { name: 'ignia-vortices', preset: 'tornado', warm: 180, step: 10, shot: 'orbit' },
  { name: 'ignia-transients', preset: 'explosion', warm: 12, step: 10, shot: 'orbit' },
];

await mkdir(outDir, { recursive: true });
await rm(tmpRoot, { recursive: true, force: true });
await mkdir(tmpRoot, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--use-angle=swiftshader',
  ],
});

const page = await browser.newPage({ viewport: { width: 480, height: 270 }, deviceScaleFactor: 1 });
page.on('console', msg => console.log(`[browser:${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => console.error('[browser:error]', err));

await page.goto(root, { waitUntil: 'load', timeout: 120_000 });
await page.waitForFunction(() => window.PYRE?.ready || window.PYRE_ERROR, null, { timeout: 120_000 });
const startupError = await page.evaluate(() => window.PYRE_ERROR || null);
if (startupError) throw new Error(startupError);

await page.evaluate(() => {
  document.body.classList.add('clean');
  window.PYRE.paused = true;
  window.PYRE.render.steps = 64;
  window.PYRE.resize(480, 270, 0.55);
});

const canvas = page.locator('#viewport');

for (const cfg of cases) {
  const dir = path.join(tmpRoot, cfg.name);
  await mkdir(dir, { recursive: true });
  console.log(`Rendering ${cfg.name} from preset ${cfg.preset}`);

  await page.evaluate(({ preset }) => {
    const app = window.PYRE;
    app.setPreset(preset);
    app.paused = true;
    app.render.steps = 64;
    app.resize(480, 270, 0.55);
    app.render.cacheTick = -1;
  }, cfg);

  // Advance the actual solver to a useful state. Breaking the warmup into chunks
  // keeps browser-driver heartbeats responsive under software WebGL.
  let remaining = cfg.warm;
  while (remaining > 0) {
    const n = Math.min(30, remaining);
    await page.evaluate(n => window.PYRE.advance(n, 1 / 120), n);
    remaining -= n;
  }

  for (let i = 0; i < 18; i++) {
    await page.evaluate(({ step, shot, t }) => {
      const app = window.PYRE;
      app.advance(step, 1 / 120);
      app.draw(shot, t);
    }, { step: cfg.step, shot: cfg.shot, t: i / 6 });
    await canvas.screenshot({ path: path.join(dir, `frame-${String(i).padStart(3, '0')}.png`) });
  }

  const gif = path.join(outDir, `${cfg.name}.gif`);
  const ff = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', '6', '-i', path.join(dir, 'frame-%03d.png'),
    '-filter_complex',
    'fps=6,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle',
    '-loop', '0', gif,
  ], { stdio: 'inherit' });
  if (ff.status !== 0) throw new Error(`ffmpeg failed for ${cfg.name}`);
}

await browser.close();
await rm(tmpRoot, { recursive: true, force: true });
console.log('README GIF generation complete.');
