import './core/polyfills';
import './styles.css';
import './screens/screens.css';
import { app } from './core/app';
import { audio } from './core/audio';
import { save } from './core/save';
import { LEVELS, type LevelId } from './data/story';
import { playLevel } from './screens/flow';
import { showMap } from './screens/map';
import { runGame } from './screens/play';
import { showTitle } from './screens/title';
import { installFastClick } from './ui/fastclick';

const root = document.getElementById('app')!;
app.mount(root);
audio.applySettings(save.data.settings);

// Keep iOS from zooming the page behind the game. Single-finger panning is
// already off via `touch-action: none`; cancelling every touchmove here used
// to make iOS drop taps, so only pinches are blocked.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });
installFastClick();

// iPads can run the game in a resizable window, where turning the device doesn't help.
const iPad = /iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const hintText = document.querySelector('#rotate-hint p');
if (iPad && hintText) hintText.textContent = 'Turn your iPad sideways or make the window wider to play';

const params = new URLSearchParams(location.search);
const direct = params.get('play') as LevelId | null;

async function boot() {
  await document.fonts?.ready;
  if (direct && LEVELS[direct]) {
    // Test entry: ?play=l1 runs the game directly; &flow=1 runs the full flow.
    if (params.has('flow')) return playLevel(direct);
    const r = await runGame(LEVELS[direct]);
    (window as any).__lastResult = r;
    document.body.dataset.result = r.outcome;
    return showMap();
  }
  if (params.get('screen') === 'map') return showMap();
  showTitle();
}

void boot();

// Debug helpers for tests and development.
(window as any).__app = { save, playLevel, showMap, showTitle, LEVELS };

// serviceWorker only exists in secure contexts (https, localhost); the native
// app runs at capacitor://localhost and is skipped by the protocol check.
if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
