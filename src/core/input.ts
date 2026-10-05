/**
 * Input: multi-touch pointers in virtual coordinates, keyboard state, and
 * on-screen virtual controls (d-pad, joystick, buttons) drawn on the canvas.
 *
 * Per-frame edge state (`justDown`, `taps`, `pressed`) is cleared by
 * `endFrame()`, which the game host calls after each update.
 */
import type { Stage } from './stage';

export interface Pointer {
  id: number;
  x: number;
  y: number;
  /** Last client (CSS px) position, used to re-map after a resize. */
  cx: number;
  cy: number;
  startX: number;
  startY: number;
  startT: number;
  down: boolean;
  /** Which control (if any) captured this pointer. */
  owner: string | null;
}

export interface Tap {
  x: number;
  y: number;
}

type ButtonDef = {
  kind: 'button';
  id: string;
  x: number;
  y: number;
  r: number;
  label?: string;
  color?: string;
  keys?: string[];
};
type DpadDef = {
  kind: 'dpad';
  id: string;
  x: number;
  y: number;
  r: number;
  /** 'lr' = left/right only, '4' = four-way. */
  axes: 'lr' | '4';
};
type StickDef = {
  kind: 'stick';
  id: string;
  /** Activation zone; the stick appears where the finger lands. */
  zone: { x: number; y: number; w: number; h: number };
  r: number;
};
type ControlDef = ButtonDef | DpadDef | StickDef;

const KEYMAP: Record<string, string[]> = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
};

export class Input {
  readonly pointers = new Map<number, Pointer>();
  /** Pointer-down positions this frame (not captured by a control). */
  taps: Tap[] = [];
  /** Pointer-up events this frame (not captured by a control). */
  releases: Tap[] = [];
  private keys = new Set<string>();
  private keysPressed = new Set<string>();
  private controls: ControlDef[] = [];
  private ctrlDown = new Set<string>();
  private ctrlPressed = new Set<string>();
  private stickState = new Map<string, { cx: number; cy: number; dx: number; dy: number; pid: number }>();
  private dpadState = new Map<string, { x: number; y: number }>();
  enabled = true;

  private offResize: () => void;

  constructor(private stage: Stage) {
    const c = stage.canvas;
    // deferred so games can re-lay out their controls in their own resize handler first
    this.offResize = stage.onResize(() => queueMicrotask(() => this.refresh()));
    c.addEventListener('pointerdown', this.onDown, { passive: false });
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  /**
   * Re-map held pointers to virtual coordinates and re-evaluate controls.
   * Runs on stage resize (rotation), and after a game moves its controls.
   */
  refresh(): void {
    for (const p of this.pointers.values()) {
      const v = this.stage.toVirtual(p.cx, p.cy);
      p.x = v.x;
      p.y = v.y;
    }
    this.updateControls();
  }

  destroy(): void {
    this.offResize();
    const c = this.stage.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  // ---------------------------------------------------------------- pointers
  private onDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    try {
      this.stage.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events in tests can't be captured */
    }
    const v = this.stage.toVirtual(e.clientX, e.clientY);
    const p: Pointer = {
      id: e.pointerId,
      x: v.x,
      y: v.y,
      cx: e.clientX,
      cy: e.clientY,
      startX: v.x,
      startY: v.y,
      startT: performance.now(),
      down: true,
      owner: null,
    };
    p.owner = this.hitControl(p);
    this.pointers.set(e.pointerId, p);
    if (!p.owner) this.taps.push({ x: v.x, y: v.y });
    this.updateControls();
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const v = this.stage.toVirtual(e.clientX, e.clientY);
    p.x = v.x;
    p.y = v.y;
    p.cx = e.clientX;
    p.cy = e.clientY;
    this.updateControls();
  };

  private onUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const v = this.stage.toVirtual(e.clientX, e.clientY);
    p.x = v.x;
    p.y = v.y;
    p.down = false;
    if (!p.owner) this.releases.push({ x: v.x, y: v.y });
    this.pointers.delete(e.pointerId);
    this.updateControls();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.keys.has(e.code)) this.keysPressed.add(e.code);
    this.keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onBlur = () => {
    this.keys.clear();
    this.pointers.clear();
    this.updateControls();
  };

  /** Free (uncaptured) pointers currently held down. */
  freePointers(): Pointer[] {
    return [...this.pointers.values()].filter((p) => !p.owner);
  }

  /** The first free pointer held down, if any. */
  primary(): Pointer | null {
    for (const p of this.pointers.values()) if (!p.owner) return p;
    return null;
  }

  key(code: string): boolean {
    return this.keys.has(code);
  }
  keyPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  // ---------------------------------------------------------------- controls
  /** Remove all on-screen controls. */
  clearControls(): void {
    this.controls = [];
    this.ctrlDown.clear();
    this.stickState.clear();
    this.dpadState.clear();
  }

  /**
   * Add a round button. `keys` are keyboard codes that also trigger it
   * (default: Space for the first button).
   */
  addButton(def: Omit<ButtonDef, 'kind'>): void {
    this.controls.push({ kind: 'button', ...def });
  }

  addDpad(def: Omit<DpadDef, 'kind'>): void {
    this.controls.push({ kind: 'dpad', ...def });
  }

  /** Floating joystick: appears wherever a finger lands inside `zone`. */
  addStick(def: Omit<StickDef, 'kind'>): void {
    this.controls.push({ kind: 'stick', ...def });
  }

  /** Is a control button (or its keys) held? */
  isDown(id: string): boolean {
    if (this.ctrlDown.has(id)) return true;
    const def = this.controls.find((c) => c.id === id);
    if (def && def.kind === 'button') return (def.keys ?? []).some((k) => this.keys.has(k));
    return false;
  }

  /** Was a control button (or its keys) pressed this frame? */
  pressed(id: string): boolean {
    if (this.ctrlPressed.has(id)) return true;
    const def = this.controls.find((c) => c.id === id);
    if (def && def.kind === 'button') return (def.keys ?? []).some((k) => this.keysPressed.has(k));
    return false;
  }

  /**
   * Direction vector from d-pads, joysticks and arrow/WASD keys,
   * each component in [-1, 1].
   */
  axis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const s of this.dpadState.values()) {
      x += s.x;
      y += s.y;
    }
    for (const s of this.stickState.values()) {
      x += s.dx;
      y += s.dy;
    }
    if (KEYMAP.left.some((k) => this.keys.has(k))) x -= 1;
    if (KEYMAP.right.some((k) => this.keys.has(k))) x += 1;
    if (KEYMAP.up.some((k) => this.keys.has(k))) y -= 1;
    if (KEYMAP.down.some((k) => this.keys.has(k))) y += 1;
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  }

  private hitControl(p: Pointer): string | null {
    for (let i = this.controls.length - 1; i >= 0; i--) {
      const c = this.controls[i];
      if (c.kind === 'button' || c.kind === 'dpad') {
        const slop = c.kind === 'button' ? 1.25 : 1.3;
        if (Math.hypot(p.x - c.x, p.y - c.y) <= c.r * slop) {
          if (c.kind === 'button') this.ctrlPressed.add(c.id);
          return c.id;
        }
      } else {
        const z = c.zone;
        if (p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h && !this.stickState.has(c.id)) {
          this.stickState.set(c.id, { cx: p.x, cy: p.y, dx: 0, dy: 0, pid: p.id });
          return c.id;
        }
      }
    }
    return null;
  }

  private updateControls(): void {
    this.ctrlDown.clear();
    this.dpadState.clear();
    const owned = new Map<string, Pointer[]>();
    for (const p of this.pointers.values()) {
      if (!p.owner) continue;
      const arr = owned.get(p.owner) ?? [];
      arr.push(p);
      owned.set(p.owner, arr);
    }
    for (const c of this.controls) {
      const ps = owned.get(c.id);
      if (c.kind === 'button') {
        if (ps?.length) this.ctrlDown.add(c.id);
      } else if (c.kind === 'dpad') {
        if (!ps?.length) continue;
        const p = ps[ps.length - 1];
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        const dead = c.r * 0.18;
        let x = 0;
        let y = 0;
        if (c.axes === 'lr') {
          x = dx < -dead ? -1 : dx > dead ? 1 : 0;
        } else {
          const ang = Math.atan2(dy, dx);
          if (Math.hypot(dx, dy) > dead) {
            // 8-way with generous diagonals
            const oct = Math.round(ang / (Math.PI / 4));
            const dirs = [
              [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
            ];
            const d = dirs[((oct % 8) + 8) % 8];
            x = d[0];
            y = d[1];
          }
        }
        this.dpadState.set(c.id, { x, y });
      } else {
        const st = this.stickState.get(c.id);
        if (!st) continue;
        const p = this.pointers.get(st.pid);
        if (!p) {
          this.stickState.delete(c.id);
          continue;
        }
        let dx = p.x - st.cx;
        let dy = p.y - st.cy;
        const len = Math.hypot(dx, dy);
        if (len > c.r) {
          // drag the base along so direction changes feel immediate
          st.cx = p.x - (dx / len) * c.r;
          st.cy = p.y - (dy / len) * c.r;
          dx = p.x - st.cx;
          dy = p.y - st.cy;
        }
        const n = Math.min(1, Math.hypot(dx, dy) / c.r);
        const l = Math.hypot(dx, dy) || 1;
        st.dx = n < 0.15 ? 0 : (dx / l) * n;
        st.dy = n < 0.15 ? 0 : (dy / l) * n;
      }
    }
  }

  /** Draw the on-screen controls (call at the end of render). */
  renderControls(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const c of this.controls) {
      if (c.kind === 'button') {
        const down = this.ctrlDown.has(c.id);
        ctx.globalAlpha = down ? 0.95 : 0.78;
        ctx.fillStyle = c.color ?? '#22c55e';
        ctx.beginPath();
        ctx.arc(c.x, c.y + (down ? 2 : 0), c.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = down ? 0.2 : 0.3;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(c.x, c.y + (down ? 2 : 0), c.r, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(c.x, c.y + (down ? 2 : 0), c.r - 1.5, 0, Math.PI * 2);
        ctx.stroke();
        if (c.label) {
          ctx.fillStyle = '#fff';
          ctx.font = `${Math.round(c.r * 0.62)}px 'Patrick Hand', sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(c.label, c.x, c.y + (down ? 2 : 0) + 1);
        }
      } else if (c.kind === 'dpad') {
        const st = this.dpadState.get(c.id);
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9;
        const arrows: Array<[number, number]> = c.axes === 'lr' ? [[-1, 0], [1, 0]] : [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [ax, ay] of arrows) {
          const active = st && ((ax !== 0 && st.x === ax) || (ay !== 0 && st.y === ay));
          ctx.fillStyle = active ? '#f7768e' : '#2b2b3a';
          ctx.save();
          ctx.translate(c.x + ax * c.r * 0.58, c.y + ay * c.r * 0.58);
          ctx.rotate(Math.atan2(ay, ax));
          const s = c.r * 0.26;
          ctx.beginPath();
          ctx.moveTo(s, 0);
          ctx.lineTo(-s * 0.7, -s);
          ctx.lineTo(-s * 0.7, s);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      } else {
        const st = this.stickState.get(c.id);
        if (!st) continue;
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(st.cx, st.cy, c.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(st.cx + st.dx * c.r, st.cy + st.dy * c.r, c.r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Clear per-frame edge state. Called by the host after update(). */
  endFrame(): void {
    this.taps = [];
    this.releases = [];
    this.keysPressed.clear();
    this.ctrlPressed.clear();
  }

  /** Drop all held state (e.g. when pausing). */
  reset(): void {
    this.pointers.clear();
    this.keys.clear();
    this.endFrame();
    this.updateControls();
  }
}
