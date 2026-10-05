/**
 * Level 2: The Great Gnome Decapitation (whack-a-mole, chapter 1).
 *
 * Kid Wes grabs garden gnomes as they pop out of the lawn. Ten grabs win;
 * five escapes lose. The last gnome's head pops off ("boing") and Wes
 * stuffs it into Libby's little library.
 */
import type { GameHost, MiniGame, MiniGameFactory } from '../types';
import { GOAL, GnomeField, HOLES, MAX_ESCAPES, RISE, SINK, upTime, type FieldEvent } from './field';

const IMG = {
  bg: 'img/bg/l2-yard.webp',
  gnome: 'img/sprites/gnome.png',
  head: 'img/sprites/gnome-head.png',
  library: 'img/sprites/little-library.png',
  wes: 'img/sprites/wes-kid.png',
};

const HAT = ['#e5483d', '#2f5fd0', '#2fa66b'];
const TUNIC = ['#2f5fd0', '#e5483d', '#f2b53a'];
const SKIN = '#f1c7a5';
/** Book-cover line art: thin even dark outlines, flat fills. */
const INK = '#3a3340';
const LINE = 1.8;
/** Gnome size at scale 1, virtual units. */
const GW = 64;
const GH = 96;

interface HolePos {
  x: number;
  y: number;
  s: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 'dirt' | 'star' | 'puff';
}

interface FloatText {
  text: string;
  x: number;
  y: number;
  t: number;
  dur: number;
  color: string;
  size: number;
}

/**
 * A grab: a cartoon hand (the player's, never attached to Wes) pops in,
 * closes on the gnome's hat, yanks it out of the hole and fades away.
 */
interface Grab {
  hole: number;
  variant: number;
  t: number;
  /** Gnome bottom y and rise fraction when tapped. */
  y0: number;
  rise: number;
  /** The tenth gnome flies onto Wes's head instead of the pile. */
  final: boolean;
  popped: boolean;
  launched: boolean;
}

interface Flyer {
  x0: number;
  y0: number;
  /** Pile slot it lands in, or -1 for the top of Wes's head (looked up per frame). */
  slot: number;
  t: number;
  dur: number;
  s0: number;
  s1: number;
  spin: number;
  variant: number;
}

/** Hand timeline: pop in, close on the hat, pull the gnome out, fade. */
const HAND_IN = 0.07;
const GRIP = 0.06;
const PULL = 0.15;
const PULLED = HAND_IN + GRIP + PULL;
const FADE = 0.25;
/** The gnome's arc onto the pile. */
const DROP = 0.4;
/** Kid Wes's quips, one every few grabs. */
const QUIPS = ['Got one!', 'Ha!', 'Gotcha!'];
const SLEEVE = '#3d63b0';
/** The lawn should start no lower than this, so three rows of holes fit on grass. */
const LAWN_TOP = 200;

/**
 * Find where the open lawn starts in a yard image: the first row (from the
 * top, below the sky) that is mostly green for a few rows running.
 */
function measureLawn(img: HTMLImageElement): number {
  try {
    const cw = 48;
    const ch = 96;
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return 0.5;
    g.drawImage(img, 0, 0, cw, ch);
    const d = g.getImageData(0, 0, cw, ch).data;
    const green = (y: number) => {
      let n = 0;
      let tot = 0;
      for (let x = Math.floor(cw * 0.15); x < cw * 0.85; x++) {
        const i = (y * cw + x) * 4;
        tot++;
        if (d[i + 1] > d[i] + 12 && d[i + 1] > d[i + 2] + 12) n++;
      }
      return n / tot;
    };
    for (let y = Math.floor(ch * 0.3); y < ch * 0.9; y++) {
      if (green(y) >= 0.8 && green(y + 1) >= 0.8 && green(y + 2) >= 0.8) return y / ch;
    }
  } catch {
    /* unreadable image: assume a mid horizon */
  }
  return 0.5;
}

const factory: MiniGameFactory = () => {
  let host: GameHost;
  const field = new GnomeField();
  let holes: HolePos[] = [];
  let wesX = 70;
  let wesBase = 388;
  let libX = 640;
  let libBase = 330;
  let bgCache: HTMLCanvasElement | null = null;
  let unResize: (() => void) | null = null;
  /** Where the open lawn starts in the yard image (fraction of its height). */
  let lawnFrac = 0.5;
  /** Yard image placement (bottom-anchored, zoomed so there's room for three rows of holes). */
  let bgRect = { x: 0, y: 0, w: 0, h: 0 };

  let clock = 0;
  let phase: 'intro' | 'play' | 'win' | 'lose' = 'intro';
  let phaseT = 0;
  let finished = false;
  let landed = 0;
  let cheer = 0;
  /** Quick squash when something lands on Wes's head. */
  let squashT = 0;
  let sad = 0;
  let shake = 0;
  const parts: Particle[] = [];
  const texts: FloatText[] = [];
  const grabs: Grab[] = [];
  let wesLine: string | null = null;
  let wesLineT = 0;
  const flyers: Flyer[] = [];
  const pileVariants: number[] = [];
  const puffs: Array<{ x: number; y: number; t: number }> = [];
  /** Per-hole time since the last escape, for the "Nyah!" taunt. */
  const taunt: number[] = new Array(HOLES).fill(-1);
  /** Win cinematic state. */
  let cinHole = 4;
  let cinVariant = 0;

  // ------------------------------------------------------------------ layout
  function layout(): void {
    const { W, H, safe } = host.stage;
    const left = safe.left;
    const right = W - safe.right;
    let lawnTop = 165;
    const img = host.image(IMG.bg);
    if (img) {
      const cover = Math.max(W / img.width, H / img.height);
      const need = (H - LAWN_TOP) / (img.height * (1 - lawnFrac));
      const k = Math.max(cover, Math.min(need, cover * 2));
      bgRect = { w: img.width * k, h: img.height * k, x: (W - img.width * k) / 2, y: H - img.height * k };
      lawnTop = bgRect.y + bgRect.h * lawnFrac;
    }
    const y0 = Math.max(206, Math.min(236, lawnTop + 22));
    const y2 = 357;
    wesX = left + 62;
    wesBase = 392;
    libX = right - 70;
    libBase = 332;
    const fieldL = left + 150;
    const fieldR = right - 140;
    const cx = (fieldL + fieldR) / 2 + 4;
    const spacing = Math.min(168, (fieldR - fieldL) / 3);
    const rows = [
      { y: y0, s: 0.86, k: 0.84 },
      { y: (y0 + y2) / 2 + 3, s: 0.97, k: 0.92 },
      { y: y2, s: 1.08, k: 1.0 },
    ];
    holes = [];
    for (const r of rows) for (let c = -1; c <= 1; c++) holes.push({ x: cx + c * spacing * r.k, y: r.y, s: r.s });
    bgCache = null;
  }

  // -------------------------------------------------------------- helpers
  function rand(a: number, b: number): number {
    return a + Math.random() * (b - a);
  }

  function burst(x: number, y: number, n: number, kind: Particle['kind'], color?: string): void {
    for (let i = 0; i < n; i++) {
      const a = kind === 'dirt' ? rand(-Math.PI * 0.9, -Math.PI * 0.1) : rand(0, Math.PI * 2);
      const sp = kind === 'dirt' ? rand(90, 220) : kind === 'star' ? rand(80, 200) : rand(20, 60);
      const life = kind === 'puff' ? rand(0.35, 0.6) : rand(0.4, 0.75);
      parts.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        max: life,
        size: kind === 'dirt' ? rand(2.5, 5) : kind === 'star' ? rand(4, 7) : rand(7, 12),
        color: color ?? (kind === 'dirt' ? (Math.random() < 0.5 ? '#7a4b27' : '#5b3a1e') : kind === 'star' ? '#ffe80f' : '#f4efe6'),
        kind,
      });
    }
  }

  function say(text: string, x: number, y: number, color = '#ffe80f', size = 26, dur = 0.9): void {
    texts.push({ text, x, y, t: 0, dur, color, size });
  }

  /** Bottom y of the gnome in hole i at rise fraction p. */
  function gnomeBottom(i: number, p: number): number {
    const h = holes[i];
    return h.y + 8 * h.s + (1 - p) * (GH + 6) * h.s;
  }

  /** Tap hitbox of the gnome in hole i: at least 60 wide and 56 tall. */
  function hitRect(i: number): { x: number; y: number; w: number; h: number } {
    const h = holes[i];
    const p = field.rise(i);
    const top = Math.min(gnomeBottom(i, p) - GH * h.s, h.y - 50) - 10;
    const bottom = h.y + 18 * h.s;
    const hw = Math.max(32, 36 * h.s);
    return { x: h.x - hw, y: top, w: hw * 2, h: bottom - top };
  }

  function pileSlot(k: number): { x: number; y: number; a: number } {
    // a little heap at Wes's feet: 4 + 3 + 2 + 1
    const rows = [4, 3, 2, 1];
    let r = 0;
    let idx = k;
    while (r < rows.length - 1 && idx >= rows[r]) {
      idx -= rows[r];
      r++;
    }
    const n = rows[r];
    const x = wesX + 66 + (idx - (n - 1) / 2) * 22;
    const y = wesBase - 4 - r * 13;
    const a = ((k * 73) % 7) / 7 - 0.5;
    return { x, y, a: -1.35 + a * 0.6 };
  }

  // ---------------------------------------------------------------- events
  function handle(e: FieldEvent): void {
    const h = holes[e.hole];
    switch (e.type) {
      case 'spawn':
        host.audio.sfx('pop');
        burst(h.x, h.y, 6, 'dirt');
        taunt[e.hole] = -1;
        break;
      case 'grab': {
        host.audio.sfx('grab');
        const variant = field.holes[e.hole].variant;
        grabs.push({ hole: e.hole, variant, t: 0, y0: gnomeBottom(e.hole, e.rise), rise: e.rise, final: false, popped: false, launched: false });
        say('+1', h.x + 34 * h.s, h.y - GH * h.s - 6, '#ffe80f', 30);
        cheer = 0.55;
        const g = field.grabbed;
        if (g % 3 === 1 && g < GOAL) wesSay(QUIPS[Math.floor(g / 3) % QUIPS.length]);
        if (g === 4) say('Two at once!', host.stage.W / 2, 150, '#fdfbf3', 30, 1.3);
        else if (g === 7) say('Faster!', host.stage.W / 2, 150, '#fdfbf3', 30, 1.1);
        else if (g === GOAL - 1) say('One more!', host.stage.W / 2, 150, '#fdfbf3', 30, 1.1);
        refreshHud();
        break;
      }
      case 'escape':
        host.audio.sfx('miss');
        burst(h.x, h.y, 5, 'puff');
        say('X', h.x, h.y - 40 * h.s, '#ef4444', 34, 0.8);
        taunt[e.hole] = 0;
        shake = 0.18;
        sad = 0.7;
        refreshHud();
        break;
      case 'win':
        startWin(e.hole);
        break;
      case 'lose':
        // the result screen plays the 'lose' sting; the escape already went "miss"
        phase = 'lose';
        phaseT = 0;
        say('They got away!', host.stage.W / 2, 160, '#fdfbf3', 40, 2);
        break;
    }
  }

  function refreshHud(): void {
    host.hud.setProgress(field.grabbed, GOAL, `Gnomes ${field.grabbed}/${GOAL}`);
    host.hud.setLives(MAX_ESCAPES - field.escapes, MAX_ESCAPES);
  }

  function startWin(hole: number): void {
    phase = 'win';
    phaseT = 0;
    cinHole = hole;
    // the last gnome skips the pile and lands on Wes's head
    const g = grabs.find((k) => k.hole === hole && !k.final);
    if (g) g.final = true;
    cinVariant = g?.variant ?? 0;
  }

  function tryTap(x: number, y: number): void {
    // a tap on a gnome's body grabs the front-most one drawn there
    for (let i = HOLES - 1; i >= 0; i--) {
      if (!field.grabbable(i)) continue;
      const h = holes[i];
      const bottom = gnomeBottom(i, field.rise(i));
      if (Math.abs(x - h.x) <= GW * h.s * 0.42 && y >= bottom - GH * h.s && y <= h.y + 6 * h.s) {
        field.grab(i);
        return;
      }
    }
    // otherwise the nearest gnome whose generous hitbox contains the tap
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < HOLES; i++) {
      if (!field.grabbable(i)) continue;
      const r = hitRect(i);
      if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
      const d = Math.hypot(x - holes[i].x, y - (r.y + r.h / 2));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      field.grab(best);
      return;
    }
    // empty hole: a small puff, no penalty
    for (const h of holes) {
      if (Math.abs(x - h.x) < 46 * h.s && Math.abs(y - h.y) < 30 * h.s) {
        puffs.push({ x: h.x, y: h.y - 4, t: 0 });
        burst(h.x, h.y - 2, 4, 'puff');
        host.audio.sfx('tap');
        return;
      }
    }
  }

  function finish(outcome: 'win' | 'lose'): void {
    if (finished) return;
    finished = true;
    if (outcome === 'win') {
      const e = field.escapes;
      host.finish({
        outcome: 'win',
        stars: Math.max(1, MAX_ESCAPES - e),
        score: field.grabbed,
        summary: e === 0 ? 'Ten gnomes and not one got away!' : `Ten gnomes grabbed! ${e} got away.`,
      });
    } else {
      host.finish({ outcome: 'lose', score: field.grabbed, summary: `Grabbed ${field.grabbed} of ${GOAL} gnomes.` });
    }
  }

  // ------------------------------------------------------------------ update
  function update(dt: number): void {
    clock += dt;
    phaseT += dt;
    cheer = Math.max(0, cheer - dt);
    squashT = Math.max(0, squashT - dt);
    sad = Math.max(0, sad - dt);
    shake = Math.max(0, shake - dt);

    if (phase === 'intro' && phaseT > 0.9) {
      phase = 'play';
      phaseT = 0;
    }
    if (phase === 'play') {
      for (const t of host.input.taps) tryTap(t.x, t.y);
      field.update(dt);
    } else if (phase !== 'intro') {
      field.update(dt); // lets leftover gnomes sink back
    }
    for (const e of field.drain()) handle(e);

    for (let i = 0; i < HOLES; i++) if (taunt[i] >= 0) taunt[i] += dt;

    if (wesLineT > 0) {
      wesLineT -= dt;
      if (wesLineT <= 0) wesLine = null;
    }
    for (let i = grabs.length - 1; i >= 0; i--) {
      const g = grabs[i];
      g.t += dt;
      const h = holes[g.hole];
      if (!g.popped && g.t >= HAND_IN + GRIP + PULL * 0.4) {
        // out it comes: pop, dust and dirt
        g.popped = true;
        host.audio.sfx('pop');
        burst(h.x, h.y, 10, 'dirt');
        burst(h.x, h.y - 4, 5, 'puff');
        burst(h.x, h.y - 40 * h.s, 6, 'star');
      }
      if (!g.launched && g.t >= PULLED) {
        g.launched = true;
        const top = pulledBottom(g) - GH * h.s * 0.5;
        const slot = g.final ? -1 : Math.min(GOAL - 2, landed + flyers.length);
        flyers.push({
          x0: h.x,
          y0: top,
          slot,
          t: 0,
          dur: DROP,
          s0: h.s,
          s1: g.final ? 0.9 : 0.42,
          spin: g.final ? 0 : pileSlot(slot).a,
          variant: g.variant,
        });
      }
      if (g.t >= PULLED + FADE) grabs.splice(i, 1);
    }
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.t += dt;
      if (f.t >= f.dur) {
        flyers.splice(i, 1);
        host.audio.sfx('land');
        if (f.slot < 0) continue; // landed on Wes's head: the cinematic takes over
        landed++;
        pileVariants[f.slot] = f.variant;
        const at = pileSlot(f.slot);
        burst(at.x, at.y, 4, 'puff');
      }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      if (p.kind === 'dirt') p.vy += 600 * dt;
      else if (p.kind === 'puff') {
        p.vx *= 0.92;
        p.vy = p.vy * 0.92 - 10 * dt;
      } else p.vy += 120 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      texts[i].t += dt;
      if (texts[i].t >= texts[i].dur) texts.splice(i, 1);
    }
    for (let i = puffs.length - 1; i >= 0; i--) {
      puffs[i].t += dt;
      if (puffs[i].t > 0.35) puffs.splice(i, 1);
    }

    if (phase === 'win') updateWin();
    if (phase === 'lose' && phaseT > 1.6) finish('lose');
  }

  // Win cinematic timeline (seconds from the tenth tap).
  const C_LAND = PULLED + DROP; // gnome lands on Wes's head
  const C_BOING = C_LAND + 0.3; // head pops off, body tumbles onto the pile
  const C_CATCH = C_BOING + 0.45; // head drops back onto Wes's head
  const C_ARRIVE = C_CATCH + 0.6; // Wes has run to the little library
  const C_STUFF = C_ARRIVE + 0.32; // head hops off his head into the library
  const C_DONE = C_STUFF + 0.2;
  const C_END = C_DONE + 0.65;
  let cinFlags = 0;

  function cinWesX(): number {
    const t = phaseT;
    const target = libX - 72;
    if (t < C_CATCH) return wesX;
    if (t < C_ARRIVE) {
      const k = (t - C_CATCH) / (C_ARRIVE - C_CATCH);
      return wesX + (target - wesX) * (1 - Math.pow(1 - k, 2));
    }
    return target;
  }

  function updateWin(): void {
    const t = phaseT;
    const fire = (bit: number, at: number, fn: () => void) => {
      if (t >= at && !(cinFlags & bit)) {
        cinFlags |= bit;
        fn();
      }
    };
    fire(1, C_LAND, () => {
      squashT = 0.2;
      const top = headTop();
      burst(top.x, top.y, 4, 'puff');
    });
    fire(2, C_BOING, () => {
      host.audio.sfx('jump');
      host.audio.sfx('pop');
      const top = headTop();
      burst(top.x, top.y - 50, 14, 'star');
      say('BOING!', top.x + 90, top.y - 40, '#ffe80f', 44, 1.0);
      shake = 0.12;
    });
    fire(4, C_CATCH, () => {
      squashT = 0.2;
      host.audio.sfx('whoosh');
    });
    if (t > C_CATCH && t < C_ARRIVE && Math.random() < 0.5) burst(cinWesX() - 20, wesBase - 2, 1, 'puff');
    fire(8, C_ARRIVE, () => {
      host.audio.sfx('swish');
      cheer = 0.4;
    });
    fire(16, C_STUFF, () => {
      host.audio.sfx('collect');
      burst(libX, libBase - 110, 18, 'star');
    });
    fire(32, C_DONE, () => {
      cheer = 0.6;
      wesSay('Yes!');
      say('Surprise, Libby!', host.stage.W / 2, 140, '#fdfbf3', 40, 1.4);
    });
    if (t >= C_END) finish('win');
  }

  // ------------------------------------------------------------------ render
  function render(ctx: CanvasRenderingContext2D): void {
    const { W, H } = host.stage;
    ctx.save();
    ctx.lineJoin = 'round';
    if (shake > 0) ctx.translate(rand(-4, 4) * (shake / 0.18), rand(-3, 3) * (shake / 0.18));
    drawBackground(ctx, W, H);
    drawLibrary(ctx);
    for (let i = 0; i < HOLES; i++) drawHole(ctx, i);
    drawPile(ctx);
    drawWes(ctx);
    for (const g of grabs) drawGrabHand(ctx, g);
    for (const f of flyers) {
      const k = f.t / f.dur;
      const s = f.s0 + (f.s1 - f.s0) * k;
      // to the pile, or to sit upright on top of Wes's head
      const head = headTop();
      const to = f.slot < 0 ? { x: head.x, y: head.y - (GH * s) / 2 } : pileSlot(f.slot);
      const x = f.x0 + (to.x - f.x0) * k;
      const y = f.y0 + (to.y - f.y0) * k - Math.sin(k * Math.PI) * (f.slot < 0 ? 55 : 60);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(f.slot < 0 ? Math.sin(k * Math.PI) * 0.5 : f.spin * k);
      drawGnome(ctx, 0, (GH * s) / 2, s, f.variant, 'whole');
      ctx.restore();
    }
    if (phase === 'win') drawWinCinematic(ctx);
    drawWesLine(ctx);
    drawParticles(ctx);
    drawTexts(ctx);
    if (phase === 'intro' || (phase === 'play' && phaseT < 0.6)) {
      const a = phase === 'intro' ? Math.min(1, phaseT * 4) : 1 - phaseT / 0.6;
      ctx.globalAlpha = Math.max(0, a);
      outlined(ctx, 'Grab 10 gnomes!', W / 2, 150, 40, '#ffe80f', "'Leckerli One', cursive");
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    host.input.renderControls(ctx);
  }

  function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, font = "'Permanent Marker', cursive"): void {
    ctx.font = `${size}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, size * 0.18);
    ctx.strokeStyle = INK;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const img = host.image(IMG.bg);
    if (img) {
      ctx.drawImage(img, bgRect.x, bgRect.y, bgRect.w, bgRect.h);
      return;
    }
    const k = host.stage.scale * host.stage.dpr;
    if (!bgCache || bgCache.width !== Math.round(W * k)) {
      bgCache = document.createElement('canvas');
      bgCache.width = Math.round(W * k);
      bgCache.height = Math.round(H * k);
      const c = bgCache.getContext('2d');
      if (c) {
        c.scale(k, k);
        paintYard(c, W, H);
      }
    }
    ctx.drawImage(bgCache, 0, 0, W, H);
  }

  /** Procedural sunny lawn, sky and picket fence: flat fills, ink outlines. */
  function paintYard(c: CanvasRenderingContext2D, W: number, H: number): void {
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.strokeStyle = INK;
    c.lineWidth = LINE;
    c.fillStyle = '#7ed2fe';
    c.fillRect(0, 0, W, 180);
    // sun
    c.fillStyle = '#ffe680';
    c.beginPath();
    c.arc(W * 0.62, 58, 24, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // clouds
    for (const [cx, cy, s] of [[W * 0.3, 70, 1], [W * 0.82, 52, 0.8], [W * 0.08, 92, 0.7]] as const) {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(cx - 34 * s, cy + 12 * s);
      c.arc(cx - 20 * s, cy + 2 * s, 13 * s, Math.PI * 0.8, Math.PI * 1.6);
      c.arc(cx, cy - 4 * s, 18 * s, Math.PI * 1.15, Math.PI * 1.9);
      c.arc(cx + 22 * s, cy + 3 * s, 13 * s, Math.PI * 1.35, Math.PI * 0.2);
      c.closePath();
      c.fill();
      c.stroke();
    }
    // tree line
    c.fillStyle = '#5aa84a';
    c.beginPath();
    c.moveTo(-20, 180);
    for (let x = -20; x < W + 40; x += 46) c.arc(x + 23, 140 + ((x * 7) % 11), 26, Math.PI, 0);
    c.lineTo(W + 40, 180);
    c.closePath();
    c.fill();
    c.stroke();
    // Wes's house corner on the left
    c.fillStyle = '#f7f1e3';
    c.fillRect(-10, 40, 120, 130);
    c.strokeRect(-10, 40, 120, 130);
    c.fillStyle = '#4a6fa5';
    c.beginPath();
    c.moveTo(-20, 48);
    c.lineTo(60, 10);
    c.lineTo(130, 48);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#9fd3f7';
    c.fillRect(22, 70, 34, 30);
    c.strokeRect(22, 70, 34, 30);
    c.beginPath();
    c.moveTo(39, 70);
    c.lineTo(39, 100);
    c.stroke();
    // lawn with flat mowing stripes (one lighter tone)
    c.fillStyle = '#7fcc5a';
    c.fillRect(0, 160, W, H - 160);
    c.fillStyle = '#93d76c';
    for (let x = -200; x < W + 200; x += 90) {
      c.beginPath();
      c.moveTo(x, 400);
      c.lineTo(x + 45, 400);
      c.lineTo(x + 45 + 90, 160);
      c.lineTo(x + 90, 160);
      c.closePath();
      c.fill();
    }
    // picket fence
    const fy = 112;
    c.fillStyle = '#fdfbf3';
    c.fillRect(0, fy + 14, W, 7);
    c.strokeRect(-2, fy + 14, W + 4, 7);
    c.fillRect(0, fy + 38, W, 7);
    c.strokeRect(-2, fy + 38, W + 4, 7);
    for (let x = 130; x < W + 20; x += 22) {
      c.fillStyle = '#fdfbf3';
      c.beginPath();
      c.moveTo(x, fy + 58);
      c.lineTo(x, fy + 6);
      c.lineTo(x + 7, fy - 2);
      c.lineTo(x + 14, fy + 6);
      c.lineTo(x + 14, fy + 58);
      c.closePath();
      c.fill();
      c.stroke();
    }
    c.beginPath();
    c.moveTo(0, fy + 58);
    c.lineTo(W, fy + 58);
    c.stroke();
    // a few flowers along the fence
    for (let i = 0; i < 9; i++) {
      const x = 150 + ((i * 137.5) % (W - 160));
      const y = 182 + (i % 3) * 6;
      c.fillStyle = ['#f9b6c8', '#ffe80f', '#ffffff'][i % 3];
      c.beginPath();
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        c.moveTo(x + Math.cos(a) * 4 + 3, y + Math.sin(a) * 4);
        c.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3, 0, Math.PI * 2);
      }
      c.fill();
      c.lineWidth = 1.2;
      c.stroke();
      c.lineWidth = LINE;
      c.fillStyle = '#f2b53a';
      c.beginPath();
      c.arc(x, y, 2, 0, Math.PI * 2);
      c.fill();
    }
  }

  function drawHoleBack(ctx: CanvasRenderingContext2D, h: HolePos): void {
    const s = h.s;
    ctx.fillStyle = 'rgba(58,51,64,0.14)';
    ctx.beginPath();
    ctx.ellipse(h.x, h.y + 4 * s, 44 * s, 16 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9a6a3e';
    ctx.strokeStyle = INK;
    ctx.lineWidth = LINE;
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, 40 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3a2618';
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, 30 * s, 10 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function drawHoleFront(ctx: CanvasRenderingContext2D, h: HolePos): void {
    const s = h.s;
    ctx.fillStyle = '#9a6a3e';
    ctx.strokeStyle = INK;
    ctx.lineWidth = LINE;
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, 40 * s, 14 * s, 0, 0, Math.PI);
    ctx.ellipse(h.x, h.y, 30 * s, 10 * s, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawHole(ctx: CanvasRenderingContext2D, i: number): void {
    const h = holes[i];
    drawHoleBack(ctx, h);
    let held: Grab | null = null;
    for (const g of grabs) if (g.hole === i && !g.launched) held = g;
    const p = held ? held.rise : field.rise(i);
    if (p > 0) {
      const hs = field.holes[i];
      let sx = 1;
      let sy = 1;
      let bottom = gnomeBottom(i, p);
      if (held) {
        bottom = pulledBottom(held);
        sy = pullStretch(held);
        sx = 1 / Math.sqrt(sy);
      } else if (hs.state === 'up' && hs.t < 0.18) {
        sy = 1 + 0.12 * Math.sin((hs.t / 0.18) * Math.PI);
        sx = 1 / Math.sqrt(sy);
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(h.x - 70 * h.s, h.y - 240 * h.s, 140 * h.s, 240 * h.s);
      ctx.ellipse(h.x, h.y, 30 * h.s, 10 * h.s, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(h.x, bottom);
      if (!held) ctx.rotate(Math.sin(clock * 7 + i) * 0.05);
      ctx.scale(sx, sy);
      drawGnome(ctx, 0, 0, h.s, held ? held.variant : hs.variant, 'whole');
      ctx.restore();
      // urgent glint when it's about to duck
      if (!held && hs.state === 'up' && hs.hold - hs.t < 0.3 && phase === 'play') {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = `${Math.round(18 * h.s)}px 'Permanent Marker', cursive`;
        ctx.textAlign = 'center';
        ctx.fillText('!', h.x + 30 * h.s, bottom - GH * h.s);
      }
    }
    drawHoleFront(ctx, h);
    if (taunt[i] >= 0 && taunt[i] < 0.7) {
      const a = 1 - taunt[i] / 0.7;
      ctx.globalAlpha = a;
      bubble(ctx, 'Nyah!', h.x, h.y - 28 * h.s - taunt[i] * 30, 15);
      ctx.globalAlpha = 1;
    }
    for (const pf of puffs) {
      if (Math.abs(pf.x - h.x) > 1 || Math.abs(pf.y + 4 - h.y) > 1) continue;
      const k = pf.t / 0.35;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#f4efe6';
      for (let j = 0; j < 3; j++) {
        ctx.beginPath();
        ctx.arc(pf.x + (j - 1) * 14 * h.s * (1 + k), pf.y - k * 10, (7 + 6 * k) * h.s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function bubble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number): void {
    ctx.font = `${size}px 'Patrick Hand', sans-serif`;
    const w = ctx.measureText(text).width + 14;
    const h = size + 8;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = LINE;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h, w, h, 8);
    ctx.moveTo(x - 5, y);
    ctx.lineTo(x, y + 7);
    ctx.lineTo(x + 5, y);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - h / 2 + 1);
  }

  /**
   * Draw a gnome with its bottom-centre at (x, y), scale s.
   * part: 'whole', 'body' (headless) or 'head' (centred on the face).
   */
  function drawGnome(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, v: number, part: 'whole' | 'body' | 'head'): void {
    const img = host.image(IMG.gnome);
    if (img) {
      const k = Math.min((GW * s) / img.width, (GH * s) / img.height);
      const w = img.width * k;
      const h = img.height * k;
      if (part === 'whole') {
        ctx.drawImage(img, x - w / 2, y - h, w, h);
      } else if (part === 'body') {
        const cut = 0.56;
        ctx.drawImage(img, 0, img.height * cut, img.width, img.height * (1 - cut), x - w / 2, y - h * (1 - cut), w, h * (1 - cut));
      } else {
        const head = host.image(IMG.head);
        if (head) {
          const hk = Math.min((46 * s) / head.width, (52 * s) / head.height);
          ctx.drawImage(head, x - (head.width * hk) / 2, y - (head.height * hk) / 2, head.width * hk, head.height * hk);
        } else {
          const cut = 0.6;
          ctx.drawImage(img, 0, 0, img.width, img.height * cut, x - w / 2, y - (h * cut) / 2, w, h * cut);
        }
      }
      return;
    }
    ctx.save();
    if (part === 'head') ctx.translate(x, y + 50 * s);
    else ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.lineWidth = LINE;
    ctx.strokeStyle = INK;
    if (part !== 'head') {
      // boots
      ctx.fillStyle = '#4a2f1d';
      ctx.beginPath();
      ctx.ellipse(-10, -3, 9, 5, 0, 0, Math.PI * 2);
      ctx.ellipse(10, -3, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // tunic
      ctx.fillStyle = TUNIC[v % 3];
      ctx.beginPath();
      ctx.moveTo(-22, -5);
      ctx.quadraticCurveTo(-21, -30, -14, -38);
      ctx.lineTo(14, -38);
      ctx.quadraticCurveTo(21, -30, 22, -5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // belt
      ctx.fillStyle = '#4a2f1d';
      ctx.fillRect(-20, -18, 40, 5);
      ctx.fillStyle = '#f2c94c';
      ctx.fillRect(-4, -19, 8, 7);
      // mittens
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.arc(-20, -20, 5, 0, Math.PI * 2);
      ctx.arc(20, -20, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (part !== 'body') {
      // beard
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-16, -50);
      ctx.quadraticCurveTo(-18, -28, 0, -20);
      ctx.quadraticCurveTo(18, -28, 16, -50);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // face
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.ellipse(0, -52, 13, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b2b3a';
      ctx.beginPath();
      ctx.arc(-6, -54, 1.8, 0, Math.PI * 2);
      ctx.arc(6, -54, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f08a8a';
      ctx.beginPath();
      ctx.arc(0, -49, 4.5, 0, Math.PI * 2);
      ctx.fill();
      // hat
      ctx.fillStyle = HAT[v % 3];
      ctx.beginPath();
      ctx.moveTo(-19, -56);
      ctx.quadraticCurveTo(-8, -78, 6, -86);
      ctx.quadraticCurveTo(10, -72, 19, -56);
      ctx.quadraticCurveTo(0, -61, -19, -56);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLibrary(ctx: CanvasRenderingContext2D): void {
    const open = phase === 'win' && phaseT > C_STUFF - 0.25 && phaseT < C_DONE;
    let bounce = 1;
    if (phase === 'win' && phaseT > C_STUFF) bounce = 1 + Math.max(0, 0.08 * Math.sin((phaseT - C_STUFF) * 18) * Math.exp(-(phaseT - C_STUFF) * 4));
    const img = host.image(IMG.library);
    ctx.save();
    ctx.translate(libX, libBase);
    ctx.scale(1 / bounce, bounce);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 40, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    if (img) {
      const k = Math.min(120 / img.width, 190 / img.height);
      const w = img.width * k;
      const h = img.height * k;
      ctx.drawImage(img, -w / 2, -h, w, h);
      ctx.restore();
      return;
    }
    // post
    ctx.fillStyle = '#8a5a32';
    ctx.fillRect(-7, -86, 14, 86);
    ctx.strokeStyle = INK;
    ctx.lineWidth = LINE;
    ctx.strokeRect(-7, -86, 14, 86);
    // box
    ctx.fillStyle = '#f7768e';
    ctx.beginPath();
    ctx.roundRect(-44, -160, 88, 76, 4);
    ctx.fill();
    ctx.stroke();
    // roof
    ctx.fillStyle = '#2f5fd0';
    ctx.beginPath();
    ctx.moveTo(-54, -156);
    ctx.lineTo(0, -196);
    ctx.lineTo(54, -156);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // shelf with books
    ctx.fillStyle = '#fdfbf3';
    ctx.fillRect(-34, -150, 68, 56);
    const books = ['#e5483d', '#2fa66b', '#f2b53a', '#2f5fd0', '#9b59b6', '#e8692f'];
    for (let r = 0; r < 2; r++) {
      for (let b = 0; b < 6; b++) {
        ctx.fillStyle = books[(b + r * 2) % books.length];
        const bh = 18 + ((b * 5 + r * 3) % 6);
        ctx.fillRect(-31 + b * 10.5, -124 + r * 28 - bh, 8.5, bh);
      }
      ctx.fillStyle = '#8a5a32';
      ctx.fillRect(-34, -124 + r * 28, 68, 3);
    }
    // glass door
    if (open) {
      ctx.fillStyle = 'rgba(160,215,245,0.6)';
      ctx.fillRect(-34 - 50, -150, 50, 56);
      ctx.strokeRect(-34 - 50, -150, 50, 56);
    } else {
      ctx.fillStyle = 'rgba(160,215,245,0.35)';
      ctx.fillRect(-34, -150, 68, 56);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-20, -146);
      ctx.lineTo(-30, -132);
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = LINE;
      ctx.strokeRect(-34, -150, 68, 56);
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath();
      ctx.arc(26, -122, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // sign
    ctx.fillStyle = '#fdfbf3';
    ctx.font = "11px 'Patrick Hand', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.fillText('LITTLE LIBRARY', 0, -168);
    ctx.restore();
  }

  function drawPile(ctx: CanvasRenderingContext2D): void {
    const n = Math.min(landed, GOAL - 1);
    for (let k = 0; k < n; k++) {
      const p = pileSlot(k);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      drawGnome(ctx, 0, (GH * 0.42) / 2, 0.42, pileVariants[k] ?? k % 3, 'whole');
      ctx.restore();
    }
  }

  function wesPose(): { x: number; jump: number; tilt: number; sx: number; sy: number } {
    let x = wesX;
    let jump = Math.abs(Math.sin(clock * 2.2)) * 2;
    let tilt = 0;
    let sx = 1;
    let sy = 1;
    if (cheer > 0) {
      const k = 1 - cheer / 0.55;
      jump = Math.sin(Math.min(1, k * 1.4) * Math.PI) * 26;
      sy = k < 0.1 ? 0.88 : 1.06;
      sx = 1 / sy;
    }
    if (sad > 0) tilt = -0.08 * Math.sin((sad / 0.7) * Math.PI);
    if (squashT > 0) {
      sy = 1 - 0.12 * Math.sin((squashT / 0.2) * Math.PI);
      sx = 1 / sy;
    }
    if (phase === 'win') {
      x = cinWesX();
      if (phaseT > C_CATCH && phaseT < C_ARRIVE) {
        jump = Math.abs(Math.sin(phaseT * 22)) * 8;
        tilt = 0.1;
      }
    }
    if (phase === 'lose') tilt = -0.12;
    return { x, jump, tilt, sx, sy };
  }

  function drawWes(ctx: CanvasRenderingContext2D): void {
    const p = wesPose();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(p.x, wesBase, 34 - p.jump * 0.3, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(p.x, wesBase - p.jump);
    ctx.rotate(p.tilt);
    ctx.scale(p.sx, p.sy);
    const img = host.image(IMG.wes);
    const armsUp = cheer > 0 || phase === 'win';
    if (img) {
      const k = Math.min(112 / img.width, 168 / img.height);
      const w = img.width * k;
      const h = img.height * k;
      ctx.drawImage(img, -w / 2, -h, w, h);
    } else {
      drawKidWes(ctx, armsUp);
    }
    ctx.restore();
  }

  /** Fallback kid Wes, bottom-centre at the origin, about 150 tall. */
  function drawKidWes(ctx: CanvasRenderingContext2D, armsUp: boolean): void {
    ctx.lineWidth = LINE;
    ctx.strokeStyle = INK;
    // legs + sneakers
    ctx.fillStyle = '#3d6fb6';
    ctx.fillRect(-16, -54, 13, 46);
    ctx.fillRect(3, -54, 13, 46);
    ctx.fillStyle = '#2b2b3a';
    ctx.beginPath();
    ctx.roundRect(-22, -10, 20, 10, 4);
    ctx.roundRect(2, -10, 20, 10, 4);
    ctx.fill();
    // arms: ink stroke under a skin stroke = outlined arm
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (armsUp) {
      ctx.moveTo(-20, -96);
      ctx.lineTo(-34, -132);
      ctx.moveTo(20, -96);
      ctx.lineTo(34, -132);
    } else {
      ctx.moveTo(-21, -94);
      ctx.lineTo(-27, -62);
      ctx.moveTo(21, -94);
      ctx.lineTo(27, -62);
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 9 + LINE * 2;
    ctx.stroke();
    ctx.strokeStyle = SKIN;
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.lineCap = 'butt';
    // striped tee
    ctx.fillStyle = '#e5483d';
    ctx.strokeStyle = INK;
    ctx.lineWidth = LINE;
    ctx.beginPath();
    ctx.roundRect(-22, -104, 44, 54, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fdfbf3';
    ctx.fillRect(-21, -90, 42, 6);
    ctx.fillRect(-21, -74, 42, 6);
    // head
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(0, -124, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // messy dark hair
    ctx.fillStyle = '#2a211c';
    ctx.beginPath();
    ctx.moveTo(-22, -126);
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      const r = i % 2 ? 26 : 21;
      ctx.lineTo(Math.cos(a) * r, -128 + Math.sin(a) * r);
    }
    ctx.quadraticCurveTo(10, -132, -22, -126);
    ctx.fill();
    // face
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(-7, -122, 2.2, 0, Math.PI * 2);
    ctx.arc(7, -122, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = LINE;
    ctx.beginPath();
    if (phase === 'lose' || sad > 0) ctx.arc(0, -108, 6, 1.15 * Math.PI, 1.85 * Math.PI);
    else ctx.arc(0, -116, 7, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  function wesHeight(): number {
    const img = host.image(IMG.wes);
    return img ? Math.min(112 / img.width, 168 / img.height) * img.height : 150;
  }

  /** Top of kid Wes's head (where the gnome rides during the win). */
  function headTop(): { x: number; y: number } {
    const p = wesPose();
    return { x: p.x + Math.sin(p.tilt) * wesHeight(), y: wesBase - p.jump - wesHeight() * p.sy + 8 };
  }

  function wesSay(text: string): void {
    wesLine = text;
    wesLineT = 1.0;
  }

  function drawWesLine(ctx: CanvasRenderingContext2D): void {
    if (!wesLine) return;
    const top = headTop();
    // above the gnome head when he's carrying it
    const carrying = phase === 'win' && phaseT >= C_LAND && phaseT < C_STUFF;
    ctx.globalAlpha = Math.min(1, wesLineT * 4);
    bubble(ctx, wesLine, top.x + 34, top.y - (carrying ? 70 : 6), 16);
    ctx.globalAlpha = 1;
  }

  /** How far a grabbed gnome has been pulled out (its bottom y). */
  function pulledBottom(g: Grab): number {
    const h = holes[g.hole];
    const k = Math.max(0, Math.min(1, (g.t - HAND_IN - GRIP) / PULL));
    const e = 1 - (1 - k) * (1 - k);
    const out = h.y - 24 * h.s;
    return g.y0 + (out - g.y0) * e;
  }

  /** Squash-and-stretch while it's yanked out. */
  function pullStretch(g: Grab): number {
    const k = Math.max(0, Math.min(1, (g.t - HAND_IN - GRIP) / PULL));
    return 1 + Math.sin(k * Math.PI) * 0.3;
  }

  /**
   * A cartoon hand reaching down from above: skin, ink outline, a little
   * blue t-shirt cuff. It is never attached to anybody.
   */
  function drawHand(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, closed: boolean, alpha: number): void {
    ctx.save();
    ctx.globalAlpha *= Math.max(0, Math.min(1, alpha));
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.rotate(-0.22);
    ctx.lineJoin = 'round';
    ctx.lineWidth = LINE / s;
    ctx.strokeStyle = INK;
    // cuff, cut off at the top like it comes from off-screen
    ctx.fillStyle = SLEEVE;
    ctx.beginPath();
    ctx.roundRect(-10, -34, 20, 12, 3);
    ctx.fill();
    ctx.stroke();
    // palm
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.roundRect(-10.5, -23, 21, 21, 8);
    ctx.fill();
    ctx.stroke();
    if (closed) {
      // fingers curled round the hat
      for (let f = 0; f < 4; f++) {
        ctx.beginPath();
        ctx.ellipse(-7.5 + f * 5, -1, 3.2, 4.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(-11, -9, 3.4, 5, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // open, fingers spread to grab
      for (let f = 0; f < 4; f++) {
        ctx.save();
        ctx.translate(-7.5 + f * 5, -4);
        ctx.rotate((f - 1.5) * 0.18);
        ctx.beginPath();
        ctx.roundRect(-2.4, 0, 4.8, 11, 2.4);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(-11, -13);
      ctx.rotate(0.9);
      ctx.beginPath();
      ctx.roundRect(-2.6, 0, 5.2, 10, 2.6);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawGrabHand(ctx: CanvasRenderingContext2D, g: Grab): void {
    const h = holes[g.hole];
    const s = 1.05 * h.s;
    // grip point: on the hat, a little below its tip
    const bottom = g.t < HAND_IN + GRIP ? gnomeBottom(g.hole, g.rise) : pulledBottom(g);
    const sy = pullStretch(g);
    const gx = h.x + 2 * h.s;
    const gy = bottom - GH * h.s * sy + 22 * h.s;
    if (g.t < HAND_IN) {
      const k = g.t / HAND_IN;
      drawHand(ctx, gx + 10 * (1 - k), gy - 26 * (1 - k), s * (0.6 + 0.4 * k), false, k);
    } else if (g.t < HAND_IN + GRIP) {
      drawHand(ctx, gx, gy, s, g.t > HAND_IN + GRIP * 0.4, 1);
    } else if (g.t < PULLED) {
      drawHand(ctx, gx, gy, s, true, 1);
    } else {
      // lets go as the gnome sails off, and fades
      const k = (g.t - PULLED) / FADE;
      drawHand(ctx, gx + 6 * k, gy - 16 * k, s, false, 1 - k);
    }
  }

  function drawWinCinematic(ctx: CanvasRenderingContext2D): void {
    const t = phaseT;
    // until C_LAND the hand and the flyer show the tenth gnome
    if (t < C_LAND) return;
    const top = headTop();
    const pose = wesPose();
    if (t < C_BOING) {
      // the whole gnome sits on Wes's head, wobbling
      ctx.save();
      ctx.translate(top.x, top.y);
      ctx.rotate(Math.sin(t * 40) * 0.07 + pose.tilt);
      drawGnome(ctx, 0, 0, 0.9, cinVariant, 'whole');
      ctx.restore();
      return;
    }
    // BOING: the head springs off; the body tumbles onto the pile
    const kb = Math.min(1, (t - C_BOING) / 0.45);
    const pile = pileSlot(GOAL - 1);
    const bodyX = top.x + (pile.x - top.x) * kb;
    const bodyY = top.y + (pile.y - top.y) * kb - Math.sin(kb * Math.PI) * 50;
    ctx.save();
    ctx.translate(bodyX, bodyY);
    ctx.rotate(kb * 2.2);
    drawGnome(ctx, 0, 0, 0.9 - kb * 0.35, cinVariant, 'body');
    ctx.restore();
    const headH = 52 * 1.25 * 0.9;
    const ride = { x: top.x, y: top.y - headH * 0.45 };
    let hx: number;
    let hy: number;
    let rot = 0;
    let sc = 1.25;
    if (t < C_CATCH) {
      const k = (t - C_BOING) / (C_CATCH - C_BOING);
      hx = ride.x;
      hy = ride.y - 20 - Math.sin(k * Math.PI) * 55 + k * 20;
      rot = k * Math.PI * 2;
      if (k < 0.45) {
        // cartoon spring between head and body
        ctx.strokeStyle = INK;
        ctx.lineWidth = LINE;
        ctx.beginPath();
        const y0 = hy + 22;
        const y1 = bodyY - 34;
        for (let i = 0; i <= 10; i++) {
          const yy = y0 + ((y1 - y0) * i) / 10;
          const xx = hx + (bodyX - hx) * (i / 10) + (i % 2 ? 6 : -6);
          if (i === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      }
    } else if (t < C_ARRIVE) {
      // riding on top of Wes's head while he runs
      hx = ride.x;
      hy = ride.y + Math.sin(t * 22) * 2;
      rot = pose.tilt + Math.sin(t * 22) * 0.06;
    } else if (t < C_STUFF) {
      // hops off his head into the library window
      const k = (t - C_ARRIVE) / (C_STUFF - C_ARRIVE);
      const door = { x: libX, y: libBase - 122 };
      hx = ride.x + (door.x - ride.x) * k;
      hy = ride.y + (door.y - ride.y) * k - Math.sin(k * Math.PI) * 60;
      rot = k * 0.6;
      sc = 1.25 - 0.45 * k;
    } else {
      hx = libX;
      hy = libBase - 122;
      sc = 0.8;
    }
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(rot);
    ctx.scale(sc, sc);
    drawGnome(ctx, 0, 0, 0.9, cinVariant, 'head');
    ctx.restore();
    if (t > C_DONE - 0.1) {
      // hearts around the library
      ctx.fillStyle = '#f7768e';
      for (let i = 0; i < 3; i++) {
        const a = t * 2 + i * 2.1;
        heart(ctx, libX + Math.cos(a) * 58, libBase - 130 + Math.sin(a) * 30 - (t - C_DONE) * 30, 7);
      }
    }
  }

  function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x, y + r);
    ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.4);
    ctx.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r);
    ctx.fill();
  }

  function drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of parts) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = p.kind === 'puff' ? a * 0.8 : a;
      ctx.fillStyle = p.color;
      if (p.kind === 'star') {
        star(ctx, p.x, p.y, p.size * (0.5 + a * 0.5));
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.kind === 'puff' ? p.size * (1.6 - a * 0.6) : p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawTexts(ctx: CanvasRenderingContext2D): void {
    for (const t of texts) {
      const k = t.t / t.dur;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.55 : k < 0.25 ? 1.15 - ((k - 0.15) / 0.1) * 0.15 : 1;
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.save();
      ctx.translate(t.x, t.y - k * 26);
      ctx.scale(pop, pop);
      outlined(ctx, t.text, 0, 0, t.size, t.color);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------- game
  const game: MiniGame = {
    async init(h) {
      host = h;
      await h.load(Object.values(IMG));
      const bg = h.image(IMG.bg);
      if (bg) lawnFrac = measureLawn(bg);
      layout();
      unResize = h.stage.onResize(layout);
      refreshHud();
    },
    update,
    render,
    destroy() {
      unResize?.();
      host.hud.setProgress(null);
      host.hud.setLives(null);
      // WebKit holds canvas memory until GC; release it now
      if (bgCache) bgCache.width = bgCache.height = 0;
      bgCache = null;
    },
    debugApi() {
      return {
        state: () => {
          const rect = host.stage.canvas.getBoundingClientRect();
          const sc = host.stage.scale;
          return {
            phase,
            grabbed: field.grabbed,
            escapes: field.escapes,
            upTime: upTime(field.grabbed),
            holes: holes.map((hp, i) => {
              const r = hitRect(i);
              const cx = r.x + r.w / 2;
              const cy = r.y + r.h / 2;
              return {
                i,
                state: field.holes[i].state,
                rise: field.rise(i),
                grabbable: field.grabbable(i),
                x: cx,
                y: cy,
                clientX: rect.left + cx * sc,
                clientY: rect.top + cy * sc,
                hit: r,
              };
            }),
          };
        },
        grab: (i: number) => field.grab(i),
        win: () => {
          if (phase === 'win' || phase === 'lose') return;
          phase = 'play';
          field.grabbed = GOAL - 1;
          const hs = field.holes[4];
          hs.state = 'up';
          hs.t = 0;
          hs.hold = 1;
          field.grab(4);
        },
        lose: () => {
          if (phase === 'win' || phase === 'lose') return;
          phase = 'play';
          field.escapes = MAX_ESCAPES - 1;
          const hs = field.holes[4];
          hs.state = 'sinking';
          hs.t = SINK - 0.001;
        },
        timing: { RISE, SINK },
      };
    },
  };
  return game;
};

export default factory;
