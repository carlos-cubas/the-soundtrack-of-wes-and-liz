/**
 * App shell: one full-screen root and a single active screen.
 *
 * A screen is anything with an element and an optional cleanup. Overlays
 * (modals, toasts) attach to `app.root` and survive screen swaps only if the
 * screen that created them removes them.
 */
export interface Screen {
  el: HTMLElement;
  destroy?(): void;
}

class App {
  root!: HTMLElement;
  private current: Screen | null = null;
  readonly debug = new URLSearchParams(location.search).has('debug');

  mount(root: HTMLElement): void {
    this.root = root;
  }

  show(screen: Screen): void {
    if (this.current) {
      this.current.destroy?.();
      this.current.el.remove();
    }
    this.current = screen;
    screen.el.classList.add('screen');
    this.root.appendChild(screen.el);
  }

  get screen(): Screen | null {
    return this.current;
  }
}

export const app = new App();
