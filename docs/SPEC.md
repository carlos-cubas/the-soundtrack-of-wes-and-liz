# The Soundtrack of Wes and Liz — build spec

An iPhone game built from Samira Cubas's game design deck (Canva, "IRP Quarter 1"),
based on *Better Than the Movies* by Lynn Painter. You play Wes Bennett trying to win
Liz Buxbaum's heart through mini games; every level adds a song to "The Liz and Wes
Playlist". **Be faithful to the deck.** All story text, levels, rewards and rules are in
`src/data/story.ts` (read it first — it is the source of truth for content).

## Stack

- Vite + TypeScript, no framework. Canvas 2D for action games, DOM for UI.
- Landscape only. Wrapped as a native iOS app with Capacitor (`ios/`), also a PWA.
- Run: `npx vite --port <yourport>` (pick a unique port per agent, 5180–5199).
- Typecheck: `npx tsc --noEmit`. Unit tests: `npx vitest run` (files in `tests/`).
- Headless screenshots/playtests: `node tools/shot.mjs <url> out.png` or write your own
  Playwright script (`import { chromium } from 'playwright'`). Use viewport 844×390,
  `hasTouch: true, isMobile: true`. **Do not use the Playwright MCP browser** — other
  agents share it. Put scratch files in your scratchpad dir, not the repo.
- Direct test entry: `http://localhost:<port>/?play=l1` runs just that game; when it ends
  `document.body.dataset.result` is set to the outcome. `&debug` sets `host.debug`.
  `?play=l1&flow=1` runs narration → game → rewards → outro.

## Files and ownership

```
src/core/       stage.ts (canvas + virtual coords), input.ts (touch, keys, on-screen
                controls), audio.ts (synth SFX, music sequencer, speech, previews),
                save.ts (progress/inventory), app.ts (screen switching)
src/data/       story.ts (ALL content), previews.json (Apple Music preview URLs)
src/audio/      tracks.ts (chiptune music patterns)
src/ui/         dom.ts (el/button/modal/toast/loadImage), hud.ts
src/screens/    title, map, narration, play (game host), result, reward, dialogue,
                inventory, soundtrack, ending, flow (level flow + reward rules)
src/games/<id>/ one folder per mini game; index.ts default-exports a MiniGameFactory
public/img/     art (see Art below)
```

Only edit files you own. If you need a change in a shared file (core/, ui/, data/,
screens/play.ts, games/types.ts), keep it minimal and backwards compatible, and say
so in your final report.

## The MiniGame contract (`src/games/types.ts`)

```ts
export default (level: LevelDef): MiniGame => ({
  async init(host) { /* preload with host.load([...]); set up controls */ },
  update(dt) { /* dt seconds, ≤ 0.05; not called while paused */ },
  render(ctx) { /* virtual units: host.stage.W (≈711–870) × 400 */ },
  onItemUse(item) { /* side quests only; return true if it took effect */ },
  destroy() {},
  debugApi() { return { win: () => …, state: () => … } }, // exposed as window.__game
});
```

- End with `host.finish({ outcome: 'win' | 'lose' | 'alt', stars?, score?, flags?, summary? })`.
  Reward rules (in `screens/flow.ts`): L3 win → bat; L4 win → boombox; L5
  `flags.noHit` → cap (a hit ends the level with outcome `'alt'`, not `'lose'`);
  L6 `flags.allHigh` → jersey. The song is always earned on completion.
- Coordinates: virtual height is always 400; width varies with the phone. Lay out
  relative to `stage.W` and keep touch controls inside `stage.safe` insets (the notch
  is on the left or right in landscape). For a fixed-size world use
  `stage.fitWorld(w, h)` + `applyWorld(ctx, t)` + `toWorld(point, t)`.
- Input: `host.input.addButton({id,x,y,r,label,color,keys:['Space']})`,
  `addDpad({id,x,y,r,axes:'lr'|'4'})`, `addStick({id,zone,r})`; read with
  `pressed(id)`, `isDown(id)`, `axis()`. Free touches: `input.taps`, `input.primary()`,
  `input.freePointers()`. Draw controls with `input.renderControls(ctx)` last.
  Arrow keys/WASD always feed `axis()` so desktop testing works.
- HUD (DOM, top bar): `host.hud.setTimer(s)`, `setLives(n,max)`, `setScore(t)`,
  `setProgress(v,max,label)`, `custom()`. The host already shows pause and the orange
  narration button at top-left: leave ~110 virtual units free at top-left, ~44 at top.
- `host.speed` is 2 when the hidden Chuck Taylors are equipped: multiply the player's
  movement speed by it in movement games (L1, L3, L5, SQ3).
- `host.banner('Round 3!')`, `host.toast('…')`, `host.audio.sfx('jump')`
  (see `SfxName` in core/audio.ts), `host.audio.speak(text, {who})`.
- Side-quest items (`host.equipped`): cap = hint, bat = skip one obstacle,
  boombox = invincible for 30 s, jersey = +1 life. The host shows the "Use" button;
  you implement `onItemUse`.
- Images: `await host.load(paths)` then `host.image(path)` (null if missing). **Always
  draw a procedural fallback** when an image is null — art lands in parallel.
  Sprites are trimmed PNG/WebP with alpha; draw them with aspect preserved
  ("contain" inside your hitbox), anchored bottom-centre for characters.
- Fonts: `'Leckerli One'` (titles), `'Pacifico'` (script), `'Patrick Hand'` (body),
  `'Permanent Marker'`.
- Performance: target 60 fps on an iPhone 12. Avoid per-frame allocations of big
  objects, cache static layers to an offscreen canvas.
- Difficulty: fair on a phone with thumbs. A first-time player should win L1–L3 in
  1–3 tries. Playtest your timing numbers in a script, not just by reading code.

## Look and feel

Samira's deck is a scrapbook: sky-blue paper (`#7ed2fe`), lemon-yellow brush titles
(`#ffe80f`), white handwriting, polaroids, tape, newspaper scraps, flowers. **Art
direction: the book cover's line art** (reference: art-src/ref/book-cover-full.png).
Clean, thin, even ink outlines with flat colour fills, no shading, no hatching, no
texture; simple webtoon-like faces. Procedural canvas drawings should match: dark
outlines (#3a3340, ~1.5–2 px, round joins), flat fills from the palette, at most one
flat shadow tone, no gradients.
CSS tokens are in `src/styles.css` (`--sky`, `--lemon`, `--cover`, `--cobalt`,
`--coral`, `--pink`, `--ink`, `--paper`, button colours). The deck's controller
colours map to buttons: **blue = claim reward, red = play song, orange = hear
narration, green = select / interact**. Keep that mapping everywhere.

Canvas palette suggestion: yellow `#f8de4f`, cobalt `#2f5fd0`, coral `#f7768e`,
pink `#f9b6c8`, mint `#9be3c9`, cream `#fdfbf3`, ink `#2b2b3a`, Liz's hair `#e8692f`,
Wes's hair `#2a211c`, skin tones `#f1c7a5` / `#e0ac85`.

## Art (public/img)

Generated with nano-banana via `python3 tools/genimg.py` (key in `.env.local`).
Character reference: `art-src/ref/character-sheet.png` (Wes, Liz, Michael, Jocelyn,
Helena left to right). Filenames are fixed so code can reference them before they
exist:

```
img/title.webp                  title key art (21:9, characters left, space right)
img/map.webp                    Samira's hand-drawn map, redrawn (2752×1536) ✅
img/scenes/<id>.webp            16:9 narration illustrations: prologue l1 l2 l3 l4 l5
                                l6 boss sq1 sq2 sq3 chucks ending
img/portraits/<who>[-mood].webp waist-up, transparent: wes wes-happy liz liz-happy
                                liz-sad liz-mad wes-kid liz-kid liz-kid-mad michael
                                jocelyn jocelyn-happy jocelyn-mad helena helena-happy
                                noah ryno
img/items/<id>.png              cap bat boombox jersey chucks (transparent)
img/bg/<id>.webp                gameplay backgrounds (see each game below)
img/sprites/<name>.png          transparent, trimmed
img/ui/*                        paper-blue.webp, cd-playlist.png, vinyl.png,
                                napkin-lw.png, tape.png, newspaper-1.webp, flower-*.png
img/puzzles/*                   side quest 2 puzzle art
```

## Levels (details in story.ts)

| id | title | game | play as | location |
|---|---|---|---|---|
| l1 | Barbie and the Frog | Donkey Kong in a Barbie Dreamhouse | frog | Liz's house |
| l2 | The Great Gnome Decapitation | Whack-a-mole, 10 gnomes, speeds up | Wes (kid) | Wes's house |
| l3 | Vomit Girl | 15-second maze out of Ryno's party to Wes's car | Wes | Ryno's house |
| l4 | Dress to Impress | 3 rounds × 2 min outfit picking, Jocelyn judges, need 5★ twice | Wes | Mall |
| l5 | Mrs. Potato Head | Dodge basketballs 10 rounds, faster each round | Liz | School gym |
| l6 | Ketchup Illustrations | Draw 5 pictures with a ketchup bottle held high | Wes | Stella's |
| boss | Parking Ever After | Magic Tiles 3 rhythm game, builds the confession rap | Wes | Parking spot |
| sq1 | Not the Hollywood Version | Date choices: be the real Wes | Wes | Wesley's car |
| sq2 | Letting Go | Series of 3 puzzles with Liz & Helena | Wes | Liz's house |
| sq3 | The Moldy Car | Storm dash to close Liz's car window | Wes | Secret area |
