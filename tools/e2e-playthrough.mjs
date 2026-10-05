// End-to-end story playthrough in headless Chromium (iPhone landscape).
// Plays every level through the real UI; each mini game is ended through
// window.__game.finish so this tests the meta flow, rewards and unlocks.
//
//   node tools/e2e-playthrough.mjs [baseUrl] [--w 844 --h 390] [--shots dir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5173/';
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const W = +opt('--w', 844);
const H = +opt('--h', 390);
const shots = opt('--shots', null);
if (shots) mkdirSync(shots, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
// any broken same-origin asset (image, audio, font) fails the run
page.on('response', (r) => r.status() >= 400 && r.url().startsWith(new URL(base).origin) && errors.push(`HTTP ${r.status()}: ${r.url()}`));

let n = 0;
const shot = async (name) => {
  if (!shots) return;
  await page.waitForTimeout(1400); // let fade/pop-in animations settle
  await page.screenshot({ path: `${shots}/${String(++n).padStart(2, '0')}-${name}.png` });
};
const tid = (id) => `[data-testid="${id}"]`;
const visible = (sel, timeout = 8000) => page.waitForSelector(sel, { state: 'visible', timeout });
const click = async (sel) => {
  await visible(sel);
  await page.click(sel);
};

/** Tap through a dialogue until the next screen appears. */
async function skipDialogue(until) {
  for (let i = 0; i < 40; i++) {
    if (await page.$(until)) return;
    const dlg = await page.$(tid('dialogue'));
    if (dlg) await dlg.click({ position: { x: W / 2, y: 40 } }).catch(() => {});
    await page.waitForTimeout(250);
  }
  await visible(until, 4000);
}

async function claimAll() {
  await visible(tid('rewards'));
  await shot('rewards');
  for (const b of await page.$$('[data-testid^="claim-"]')) {
    await b.click();
    await page.waitForTimeout(150);
  }
  await click(tid('rewards-continue'));
}

const LOC = { l1: 'lizHouse', l2: 'wesHouse', l3: 'ryno', l4: 'mall', l5: 'gym', l6: 'stellas', boss: 'parking', sq1: 'wesCar', sq2: 'lizHouse', sq3: 'secret' };

async function playLevel(id, result) {
  await visible(tid('map'));
  await click(tid(`pin-${LOC[id]}`));
  await click(tid(`play-level-${id}`));
  await visible(tid('narration'));
  await shot(`${id}-narration`);
  await click(tid('narration-next'));
  await click(tid('start-game'));
  await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  await shot(`${id}-game`);
  await page.evaluate((r) => window.__game.finish(r), result);
  await click(tid('result-continue'));
  if (await page.waitForSelector(tid('rewards'), { timeout: 2500 }).catch(() => null)) await claimAll();
  await skipDialogue(id === 'boss' ? tid('ending') : tid('map'));
}

const win = { outcome: 'win', stars: 5, score: 1000, flags: { noHit: true, allHigh: true, fiveStarRounds: 3 } };
const t0 = Date.now();
await page.goto(base);
await page.evaluate(() => localStorage.clear());
await page.reload();
await visible(tid('title'));
await shot('title');
await click(tid('new-game'));
await skipDialogue(tid('map'));
await shot('map-start');

for (const id of ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'sq3', 'sq2', 'sq1']) {
  await playLevel(id, win);
  const ok = await page.evaluate((l) => window.__app.save.isDone(l), id);
  if (!ok) throw new Error(`${id} not marked done`);
  console.log(`✓ ${id}`);
}

// The hidden Chuck Taylors appear in the back of Wesley's car.
await click(tid('pin-wesCar'));
await click(tid('reveal-chucks'));
await skipDialogue(tid('rewards'));
await claimAll();
await visible(tid('map'));
console.log('✓ chucks');
await shot('map-before-boss');

await playLevel('boss', { outcome: 'win', stars: 5, score: 9000 });
await shot('ending');
console.log('✓ boss → ending');

const s = await page.evaluate(() => window.__app.save.data);
const checks = {
  allDone: ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'boss', 'sq1', 'sq2', 'sq3'].every((l) => s.levels[l]?.done),
  items: Object.values(s.items).every((v) => v === 'owned'),
  chucks: s.chucks === 'found',
  songs: s.songs.length,
  heart: s.heart,
  blessing: !!s.flags.jocelynBlessing,
};
console.log(JSON.stringify(checks));
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await browser.close();
if (!checks.allDone || !checks.items || !checks.chucks || checks.songs < 23 || errors.length) process.exit(1);
