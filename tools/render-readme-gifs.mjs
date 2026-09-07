import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = 'http://127.0.0.1:8000/index.html?capture=1&cold=1&tier=draft&offline=1';
const outDir = path.resolve('docs/media');
const tmpRoot = path.resolve('.gif-frames');
const cases = [
  { name: 'ignia-overview-v8', preset: 'hearth', warm: 90, step: 8, shot: 'orbit' },
  { name: 'ignia-combustors-v8', preset: 'stove4', warm: 90, step: 7, shot: 'close' },
  { name: 'ignia-vortices-v8', preset: 'tornado', warm: 120, step: 8, shot: 'orbit' },
  { name: 'ignia-transients-v8', preset: 'explosion', warm: 8, step: 7, shot: 'orbit' },
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
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
  ],
});

const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
page.on('console', msg => console.log(`[browser:${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => console.error('[browser:error]', err));
page.on('requestfailed', req => console.error('[requestfailed]', req.url(), req.failure()?.errorText));

await page.goto(root, { waitUntil: 'domcontentloaded', timeout: 60_000 });
for (let i = 0; i < 120; i++) {
  const state = await page.evaluate(() => ({ ready: !!window.PYRE?.ready, error: window.PYRE_ERROR || null, body: document.body.className }));
  if (state.error) throw new Error(state.error);
  if (state.ready) break;
  if (i === 119) throw new Error(`IGNIA did not initialize; body=${state.body}`);
  await page.waitForTimeout(1000);
}

await page.evaluate(() => {
  document.body.classList.add('clean');
  window.PYRE.paused = true;
  window.PYRE.render.steps = 72;
  window.PYRE.resize(640, 360, 0.6);
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
    app.render.steps = 72;
    app.resize(640, 360, 0.6);
    app.render.cacheTick = -1;
  }, cfg);
  let remaining = cfg.warm;
  while (remaining > 0) {
    const n = Math.min(20, remaining);
    await page.evaluate(n => window.PYRE.advance(n, 1 / 120), n);
    remaining -= n;
  }
  for (let i = 0; i < 30; i++) {
    await page.evaluate(({ step, shot, t }) => {
      const app = window.PYRE;
      app.advance(step, 1 / 120);
      app.draw(shot, t);
    }, { step: cfg.step, shot: cfg.shot, t: i / 8 });
    await canvas.screenshot({ path: path.join(dir, `frame-${String(i).padStart(3, '0')}.png`) });
  }
  const gif = path.join(outDir, `${cfg.name}.gif`);
  const ff = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', '8', '-i', path.join(dir, 'frame-%03d.png'),
    '-filter_complex',
    'fps=8,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192:stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle',
    '-loop', '0', gif,
  ], { stdio: 'inherit' });
  if (ff.status !== 0) throw new Error(`ffmpeg failed for ${cfg.name}`);
}
await browser.close();
await rm(tmpRoot, { recursive: true, force: true });
console.log('README GIF generation complete.');
