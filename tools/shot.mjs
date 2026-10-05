// Screenshot a URL in an iPhone-landscape viewport.
//   node tools/shot.mjs <url> <out.png> [--w 844 --h 390] [--wait 1500] [--click sel ...]
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const url = args[0];
const out = args[1];
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const W = +opt('--w', 844);
const H = +opt('--h', 390);
const wait = +opt('--wait', 1500);
const clicks = [];
args.forEach((a, i) => a === '--click' && clicks.push(args[i + 1]));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const logs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(url);
await page.waitForTimeout(wait);
for (const c of clicks) {
  await page.click(c);
  await page.waitForTimeout(700);
}
await page.screenshot({ path: out });
console.log(logs.join('\n') || 'no console errors');
await browser.close();
