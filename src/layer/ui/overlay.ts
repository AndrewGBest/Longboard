// The layer's own on-screen elements: focus ring and toast. They live in a
// closed shadow root so the site's styles cannot affect them and ours cannot
// leak out. Styles use a constructed stylesheet, which page CSP does not block.
import type { OskKey } from '../../shared/osk';
import { boxOf } from '../spatial/box';

export const HOST_TAG = 'longboard-overlay';

const CSS = `
:host {
  all: initial; position: absolute; left: 0; top: 0; width: 0; height: 0; overflow: visible;
  pointer-events: none; z-index: 2147483647;
}
.ring {
  position: absolute; box-sizing: border-box; border: 4px solid #fff; border-radius: 10px;
  box-shadow: 0 0 0 3px rgba(0,0,0,.85), 0 0 24px 4px rgba(255,255,255,.35);
  display: none;
}
.ring.bump-left { animation: bump-left .18s ease-out; }
.ring.bump-right { animation: bump-right .18s ease-out; }
.ring.bump-up { animation: bump-up .18s ease-out; }
.ring.bump-down { animation: bump-down .18s ease-out; }
.ring.pulse { animation: pulse .16s ease-out; }
@keyframes bump-left { 50% { transform: translateX(-1.4vh); } }
@keyframes bump-right { 50% { transform: translateX(1.4vh); } }
@keyframes bump-up { 50% { transform: translateY(-1.4vh); } }
@keyframes bump-down { 50% { transform: translateY(1.4vh); } }
@keyframes pulse { 50% { transform: scale(.96); } }
.pointer {
  position: fixed; left: 0; top: 0; width: 4.4vh; height: 4.4vh; display: none;
  filter: drop-shadow(0 .3vh .5vh rgba(0,0,0,.7));
}
.pointer.show { display: block; }
.pointer path { fill: #fff; stroke: #111; stroke-width: 1.6; stroke-linejoin: round; }
.mark { position: absolute; box-sizing: border-box; border: 3px solid; border-radius: 6px; }
.mark.picked { border: 4px dashed #fff; box-shadow: 0 0 0 2px rgba(0,0,0,.8); }
.mark.include { border-color: #58d68d; background: rgba(88,214,141,.12); }
.mark.exclude { border-color: #ec7063; background: rgba(236,112,99,.14); }
.mark.row { border-color: #5dade2; }
.mark.player { border-color: #f4d03f; }
.toast {
  position: fixed; left: 50%; bottom: 7vh; transform: translate(-50%, 1.2vh);
  background: rgba(20,25,32,.97); color: #f1f3f6; font: 500 3vh/1.3 system-ui, sans-serif;
  padding: 1.8vh 3.2vh; border-radius: 10vh; max-width: 80vw; text-align: center; opacity: 0;
  box-shadow: 0 0 0 .2vh #2b3441, 0 1vh 4vh rgba(0,0,0,.6); transition: opacity .18s, transform .18s ease-out;
}
.toast.show { opacity: 1; transform: translate(-50%, 0); }
.loading {
  position: fixed; left: 0; top: 0; width: 100vw; height: .7vh; overflow: hidden;
  opacity: 0; transition: opacity .2s; filter: drop-shadow(0 0 .3vh rgba(0,0,0,.7));
}
.loading.show { opacity: 1; transition-delay: .25s; }
.loading i {
  position: absolute; top: 0; bottom: 0; left: 0; width: 34%; border-radius: 1vh; background: #5fd6c4;
  animation: loading 1.15s ease-in-out infinite; animation-play-state: paused;
}
.loading.show i { animation-play-state: running; }
@keyframes loading { from { transform: translateX(-100%); } to { transform: translateX(300%); } }
.osk {
  position: fixed; left: 50%; bottom: 4vh; transform: translateX(-50%);
  display: none; grid-template-columns: repeat(10, 7.4vh); gap: .9vh;
  padding: 2.2vh; border-radius: 2.6vh; background: rgba(20,25,32,.98);
  box-shadow: 0 0 0 .2vh #2b3441, 0 1vh 6vh rgba(0,0,0,.7);
}
.osk.show { display: grid; }
.osk.top { bottom: auto; top: 4vh; }
.osk .key {
  height: 7.4vh; border-radius: 1.3vh; background: #283140; color: #f1f3f6;
  font: 500 3.5vh/7.4vh system-ui, sans-serif; text-align: center;
}
.osk .key.wide { font-size: 2.6vh; font-weight: 600; background: #1d242e; color: #b7bfcb; }
.osk .key.wide.go { background: #5fd6c4; color: #062521; }
.osk .key.on, .osk .key.wide.on { background: #f1f3f6; color: #0b0e13; box-shadow: 0 0 0 .45vh rgba(255,255,255,.3); transform: scale(1.06); }
@media (prefers-reduced-motion: reduce) { .ring, .toast, .loading i { animation: none !important; transition: none !important; } }
`;

/** How long the ring is followed frame by frame after it was last seen to move. */
const FOLLOW_MS = 700;
/** How often a ring at rest is looked at. */
const WATCH_MS = 500;

export class Overlay {
  private readonly ring: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly oskEl: HTMLElement;
  private readonly pointerEl: SVGSVGElement;
  private readonly marksEl: HTMLElement;
  private readonly loadingEl: HTMLElement;
  private readonly host: HTMLElement;
  private target: Element | null = null;
  private toastTimer: number | undefined;
  private raf = 0;
  private placed = 'none';
  private followUntil = 0;
  private watch: number | undefined;

  constructor(private readonly doc: Document) {
    const host = doc.createElement(HOST_TAG);
    const root = host.attachShadow({ mode: 'closed' });
    const view = doc.defaultView;
    const Sheet = view && 'CSSStyleSheet' in view ? (view as unknown as { CSSStyleSheet: typeof CSSStyleSheet }).CSSStyleSheet : undefined;
    if (Sheet && 'adoptedStyleSheets' in root) {
      const sheet = new Sheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
    }
    this.ring = doc.createElement('div');
    this.ring.className = 'ring';
    this.toastEl = doc.createElement('div');
    this.toastEl.className = 'toast';
    this.toastEl.setAttribute('role', 'status');
    this.oskEl = doc.createElement('div');
    this.oskEl.className = 'osk';
    this.oskEl.setAttribute('role', 'group');
    this.oskEl.setAttribute('aria-label', 'On-screen keyboard');
    // The pointer: a plain arrow drawn here, with its tip at the top-left corner.
    const SVG = 'http://www.w3.org/2000/svg';
    this.pointerEl = doc.createElementNS(SVG, 'svg') as SVGSVGElement;
    this.pointerEl.setAttribute('class', 'pointer');
    this.pointerEl.setAttribute('viewBox', '0 0 24 24');
    const arrow = doc.createElementNS(SVG, 'path');
    arrow.setAttribute('d', 'M2 1 L2 19 L7 14.5 L10.5 22.5 L13.5 21.2 L10 13.3 L16.5 13.3 Z');
    this.pointerEl.append(arrow);
    this.marksEl = doc.createElement('div');
    this.loadingEl = doc.createElement('div');
    this.loadingEl.className = 'loading';
    this.loadingEl.append(doc.createElement('i'));
    root.append(this.marksEl, this.ring, this.loadingEl, this.toastEl, this.oskEl, this.pointerEl);
    doc.documentElement.append(host);
    this.host = host;
    // Anything that scrolls may be carrying the target (a row, a list); the
    // page's own scrolling needs nothing, since the ring scrolls with it.
    doc.addEventListener('scroll', (e) => { if (e.target !== doc) this.wake(); }, { capture: true, passive: true });
    view?.addEventListener('resize', () => this.wake(), { passive: true });
    // When the site puts its player in fullscreen, only that element and the
    // browser's top layer are drawn, so the ring and keyboard would vanish.
    // A manual popover lives in the top layer; showing it again after each
    // fullscreen change puts it back in front.
    if (typeof host.showPopover === 'function') {
      host.setAttribute('popover', 'manual');
      this.raise();
      doc.addEventListener('fullscreenchange', () => this.raise());
      // The same when the page opens something else in the top layer after
      // it: a dialog shown as modal, or a popover of its own. Whatever came
      // last is in front, so the overlay is shown again to be last. (Seen
      // on a film service's sign-in prompt, a modal dialog: the highlight,
      // the pointer and the keyboard were all drawn underneath it.)
      const lift = (): void => void view?.setTimeout(() => this.raise(), 0);
      doc.addEventListener('toggle', (e) => {
        if (e.target !== host && (e as Event & { newState?: string }).newState === 'open') lift();
      }, true);
      if (typeof MutationObserver === 'function') {
        new MutationObserver((records) => {
          if (records.some((r) => r.target instanceof HTMLDialogElement && r.target.open && r.target.matches(':modal'))) lift();
        }).observe(doc.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] });
      }
    }
  }

  private raise(): void {
    try {
      if (this.host.matches(':popover-open')) this.host.hidePopover();
      this.host.showPopover();
    } catch {
      // Not connected yet, or no popover support: the overlay still works outside fullscreen.
    }
  }

  track(el: Element | null): void {
    this.target = el;
    // The ring's corners follow the corners of what it is round, so it sits evenly round a pill or a card.
    const view = this.doc.defaultView;
    const corner = el && view ? parseFloat(view.getComputedStyle(el).borderTopLeftRadius) : 0;
    const most = el ? Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height) / 2 : 0;
    this.ring.style.borderRadius = `${Math.round(Math.max(10, Math.min(Number.isFinite(corner) ? corner : 0, most) + 6))}px`;
    this.wake();
  }

  /**
   * Puts the ring on its target. Returns true when anything had to change.
   * In page coordinates: the host sits at the page's origin and scrolls with
   * it, so while the page scrolls the browser moves the ring with its target
   * in the same frame. Placed by script alone it trailed a frame behind and
   * seemed to bounce.
   */
  private place(): boolean {
    const view = this.doc.defaultView;
    const t = this.target;
    let box = 'none';
    if (view && t && t.isConnected) {
      const r = boxOf(t, view);
      const pad = 6;
      // Kept on the screen sideways and below the page's top: round a control
      // at the very edge the ring was cut off by the edge.
      const edge = 3;
      const wide = this.doc.documentElement.clientWidth || view.innerWidth;
      const left = Math.max(r.left - pad, edge);
      const right = Math.max(Math.min(r.right + pad, wide - edge), left + 1);
      const top = Math.max(r.top - pad + view.scrollY, edge);
      const bottom = Math.max(r.bottom + pad + view.scrollY, top + 1);
      box = `${left + view.scrollX},${top},${right - left},${bottom - top}`;
    }
    if (box === this.placed) return false;
    this.placed = box;
    if (box === 'none') {
      this.ring.style.display = 'none';
      return true;
    }
    const [left, top, width, height] = box.split(',');
    this.ring.style.display = 'block';
    this.ring.style.left = `${left}px`;
    this.ring.style.top = `${top}px`;
    this.ring.style.width = `${width}px`;
    this.ring.style.height = `${height}px`;
    return true;
  }

  /**
   * Follows the target frame by frame for a short while, and for as long as
   * it keeps moving (a row sliding, a card growing). Then it stops: a ring
   * that sits still must not cost a measurement and a wake-up every frame for
   * as long as the app is open. A slow look, twice a second, catches a page
   * that shifts by itself (pictures loading above the target).
   */
  private wake(): void {
    const view = this.doc.defaultView;
    if (!view) return;
    this.followUntil = view.performance.now() + FOLLOW_MS;
    if (this.raf !== 0) return;
    const step = (): void => {
      this.raf = 0;
      if (this.place()) this.followUntil = view.performance.now() + FOLLOW_MS;
      if (this.target && view.performance.now() < this.followUntil) this.raf = view.requestAnimationFrame(step);
    };
    step();
    if (this.watch === undefined) {
      this.watch = view.setInterval(() => {
        if (!this.target) {
          view.clearInterval(this.watch);
          this.watch = undefined;
        } else if (this.raf === 0 && !this.doc.hidden && this.place()) this.wake();
      }, WATCH_MS);
    }
  }

  /**
   * A quick movement of the ring as feedback: a nudge toward an edge that
   * cannot be passed, or a squeeze when the focused control is pressed.
   */
  feedback(kind: 'left' | 'right' | 'up' | 'down' | 'press'): void {
    const name = kind === 'press' ? 'pulse' : `bump-${kind}`;
    const classes = this.ring.classList;
    classes.remove('bump-left', 'bump-right', 'bump-up', 'bump-down', 'pulse');
    // Reading a layout property restarts the animation when the same one repeats.
    void this.ring.offsetWidth;
    classes.add(name);
  }

  /** Draws the on-screen keyboard with one key highlighted; `null` hides it. */
  keyboard(
    rows: readonly (readonly OskKey[])[] | null,
    active?: { row: number; index: number },
    submitLabel?: string,
    dock: 'top' | 'bottom' = 'bottom',
  ): void {
    if (!rows) {
      this.oskEl.classList.remove('show');
      return;
    }
    const keys: HTMLElement[] = [];
    rows.forEach((row, r) =>
      row.forEach((key, i) => {
        const el = this.doc.createElement('div');
        el.className = `key${key.span > 1 ? ' wide' : ''}${key.kind === 'submit' ? ' go' : ''}${active && active.row === r && active.index === i ? ' on' : ''}`;
        el.style.gridColumn = `span ${key.span}`;
        el.textContent = key.kind === 'submit' && submitLabel ? submitLabel : key.label;
        keys.push(el);
      }),
    );
    this.oskEl.replaceChildren(...keys);
    this.oskEl.classList.toggle('top', dock === 'top');
    this.oskEl.classList.add('show');
  }

  /**
   * The profile editor's boxes: one round each element given, coloured by
   * what it is marked as. An empty list takes them all away. Drawn in page
   * coordinates, like the ring, so they stay on their elements as the page scrolls.
   */
  marks(list: ReadonlyArray<{ el: Element; kind: string }>): void {
    const view = this.doc.defaultView;
    const boxes: HTMLElement[] = [];
    for (const { el, kind } of list) {
      if (!view || !el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const box = this.doc.createElement('div');
      box.className = `mark ${kind}`;
      box.style.left = `${r.left + view.scrollX}px`;
      box.style.top = `${r.top + view.scrollY}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
      boxes.push(box);
    }
    this.marksEl.replaceChildren(...boxes);
  }

  /** Draws the pointer with its tip at a point of the page (CSS pixels); `null` hides it. */
  pointer(spot: { x: number; y: number } | null): void {
    if (!spot) {
      this.pointerEl.setAttribute('class', 'pointer');
      return;
    }
    this.pointerEl.style.transform = `translate(${Math.round(spot.x)}px, ${Math.round(spot.y)}px)`;
    this.pointerEl.setAttribute('class', 'pointer show');
  }

  /** The line along the top while a page is arriving. Shown after a moment, so a page that comes at once shows nothing. */
  loading(on: boolean): void {
    this.loadingEl.classList.toggle('show', on);
  }

  toast(message: string, ms = 2500): void {
    const view = this.doc.defaultView;
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    if (this.toastTimer !== undefined) view?.clearTimeout(this.toastTimer);
    this.toastTimer = view?.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
}
