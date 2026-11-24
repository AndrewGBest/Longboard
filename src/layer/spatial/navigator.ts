// The navigator: finds what on a page the highlight can go to, decides where
// an arrow takes it, and puts it there. The scoring of one box against
// another is geometry.ts; the questions asked of single elements are in
// visibility.ts, scrolling.ts, dialogs.ts and controls.ts.
import type { Direction } from '../../shared/actions';
import type { ProfileGroup } from '../../shared/profile';
import { scrollBy } from '../generic/scroll';
import { boxOf } from './box';
import { isLongSlider, isSidewaysSlider, isSlider, press, shouldZoom, ZOOM_ATTR, zoomTarget } from './controls';
import { composedParent, deepClosest, deepContains, deepQueryAll } from './deep';
import { MENU_ENTRY, pinnedNotices } from './dialogs';
import { pickInitial, pickNext, type Rect } from './geometry';
import { pageScrolls, paneWithMore, rowOf, scrollWithinList } from './scrolling';
import {
  acrossTheWindow,
  clippedAwayFrom,
  isLaidOut,
  isOnScreen,
  isPinned,
  isVisible,
  onScreenish,
  outOfReach,
  shownIn,
} from './visibility';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[tabindex]:not([tabindex="-1"])',
  // A styled radio or checkbox: the real input is invisible inside its label,
  // so the label is the thing to focus and click. (When the input is visible
  // it wins, because wrappers of another candidate are dropped.)
  'label:has(input[type="radio"])',
  'label:has(input[type="checkbox"])',
  // The same, with the input elsewhere and tied by `for` (checked below).
  'label[for]',
  // What ordinary sites use besides: more roles, disclosure widgets, inline
  // handlers, editable regions, and media with the browser's own controls.
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="combobox"]',
  '[role="slider"]',
  '[role="treeitem"]',
  '[role="textbox"]',
  'summary',
  'area[href]',
  '[onclick]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  'video[controls]',
  'audio[controls]',
  // A frame from elsewhere cannot be driven from here; it can be landed on,
  // and OK on it hands the highlight into it or starts pointer mode
  // (parts/frames.ts).
  'iframe',
].join(',');

/** Elements that are often made clickable with a script and nothing in the markup to say so. */
const MAYBE_CLICKABLE =
  'div, span, li, img, svg, td, article, section, figure, picture, p, h1, h2, h3, h4, h5, h6, i, b, em, strong';
/** How many such elements are looked at in one pass: the look costs a style lookup each. */
const MAX_STYLE_LOOKS = 2500;

/** For a `label[for]`: the checkbox or radio it stands for, or null when it labels something else. */
function labelledToggle(label: Element): HTMLInputElement | null {
  const id = label.getAttribute('for');
  const target = id ? label.ownerDocument.getElementById(id) : null;
  return target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio') ? target : null;
}

/** Set on the element that has the highlight. */
export const FOCUS_ATTR = 'data-longboard-focus';

/** What a navigator is told about the page it works on. All of it is optional. */
export interface NavigatorOptions {
  /** Selectors the site's profile adds to what can be focused. */
  extraFocusable?: string[];
  /** Elements the layer itself owns; never candidates. */
  ignoreWithin?: string;
  /** Told each time the highlight moves, and with null when it is taken away. */
  onFocusChange?: (el: Element | null) => void;
  /** Elements the layer has found it must not land on (one that jumps elsewhere when it gets the cursor). */
  avoid?: (el: Element) => boolean;
  /** Controls that are never focus targets (carousel arrows the layer presses itself at a row's edge). */
  skip?: string[];
  /** When it returns an element, only candidates inside that element are considered. */
  scope?: () => Element | null;
  /** Selectors that are never candidates, nor anything inside them (a profile's "exclude"). */
  exclude?: string[];
  /** Containers a profile names as a row, a column or a grid. */
  groups?: ProfileGroup[];
  /** Where the highlight starts on a page, when a profile says. */
  initial?: string | undefined;
  /**
   * What a profile says Back closes first (a notice's close button). When
   * one is showing in a bar pinned right across the window, the highlight
   * starts on it: such a notice is the first thing in the way, and its
   * small button was otherwise the last thing reached. A small panel in a
   * corner is not in the way, and the page starts where it always does.
   */
  closeFirst?: readonly string[] | undefined;
  /**
   * Also offer elements that only look clickable: the page shows the hand
   * cursor over them. For sites with no profile, where it is the only sign.
   */
  looksClickable?: boolean;
  /** A class the layer puts on the root element while it hides the real pointer; see handCursorTargets. */
  cursorHiddenClass?: string;
  /**
   * A target more than a screen beyond the edge is scrolled toward, not
   * jumped to, so the text in between can be read. For sites with no
   * profile; a held key does this everywhere.
   */
  readingScroll?: boolean;
  /** Only a control holding a picture grows when focused. For sites with no profile. */
  growPicturesOnly?: boolean;
}

/** True when `outer` wholly contains `inner` and is at least four times its area. */
function covers(outer: Rect, inner: Rect): boolean {
  if (inner.left < outer.left || inner.right > outer.right || inner.top < outer.top || inner.bottom > outer.bottom)
    return false;
  const area = (r: Rect): number => (r.right - r.left) * (r.bottom - r.top);
  return area(outer) >= 4 * area(inner);
}

/**
 * A link over this share of the screen, with a control on top of it, is a
 * backdrop. A large card is not: seen on a search engine, a news card a
 * fifth of the screen with one small menu button on it.
 */
const BACKDROP_SHARE = 0.4;

/** The box of `el` as a person sees it (box.ts), which is what moves are scored on. */
function toRect(el: Element): Rect {
  return boxOf(el);
}

/** Where a page's footer is, by its own markup. A held Down stops short of it. */
const FOOTER = 'footer, [role="contentinfo"]';

/** How far past the screen's edge a target may be, in screens, and still be jumped to while reading. */
export const READING_REACH = 0.35;

/** Moves closer together than this are a held key (or a very quick thumb). */
const RAPID_MS = 220;

/**
 * Keeps the highlight for one document. `candidates` lists what it can go
 * to, `move` takes it one step in a direction, `focus` puts it on an element.
 */
export class SpatialNavigator {
  private current: Element | null = null;
  private zoomed: Element | null = null;
  /** Where focus last was in each sideways-scrolling row. */
  private readonly rowMemory = new WeakMap<Element, Element>();
  /** Where the highlight last was in each group a profile asked to be remembered. */
  private readonly groupMemory = new WeakMap<Element, Element>();
  /** True while this navigator is itself giving an element keyboard focus (so the layer can tell that from the page doing it). */
  focusing = false;
  /** The outermost elements found to show the hand cursor. */
  private readonly hands = new Set<Element>();
  /** Elements already looked at for the hand cursor. */
  private readonly looked = new WeakSet<Element>();
  private handsLooked = false;
  /** The move being made goes straight to its target (see `move`). */
  private straight = false;
  private lookWaiting = false;
  /** When the last move was made, to tell a held key from single presses. */
  private lastMoveAt = 0;
  private rapid = false;

  constructor(
    private readonly doc: Document,
    private readonly opts: NavigatorOptions = {},
  ) {}

  /** What has the highlight, or null. Something the page has since removed does not count. */
  get focused(): Element | null {
    if (this.current && !this.current.isConnected) this.current = null;
    return this.current;
  }

  /** Where on the page the highlight was last put, for carrying on when the page replaces what had it. */
  private lastBox: Rect | null = null;

  /**
   * Where the highlight was, in window terms, when what had it has been
   * taken out of the page and that place is still on screen. Null otherwise.
   */
  lostBox(): Rect | null {
    const view = this.doc.defaultView;
    if (!this.lastBox || !view) return null;
    const held = this.focused;
    if (held && isLaidOut(held, view)) return null;
    const box = {
      left: this.lastBox.left - view.scrollX,
      right: this.lastBox.right - view.scrollX,
      top: this.lastBox.top - view.scrollY,
      bottom: this.lastBox.bottom - view.scrollY,
    };
    if (box.bottom <= 0 || box.top >= view.innerHeight || box.right <= 0 || box.left >= view.innerWidth) return null;
    return box;
  }

  /** The control now standing where the highlight was, if the page put one there. */
  private standIn(box: Rect, all: readonly Element[]): Element | null {
    const x = (box.left + box.right) / 2;
    const y = (box.top + box.bottom) / 2;
    let best: Element | null = null;
    let bestArea = Infinity;
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      // Of much the same size: a whole card around a small button is not that button.
      const area = r.width * r.height;
      const was = (box.right - box.left) * (box.bottom - box.top);
      if (area > was * 2.5 || area < was / 2.5) continue;
      if (area < bestArea) {
        best = el;
        bestArea = area;
      }
    }
    return best;
  }

  /**
   * Everything focus can go to. With `near`, only what is within a few
   * screens above or below: far down a long page the full list takes long
   * enough to build that held keys queue up.
   */
  candidates(near = false): Element[] {
    const view = this.doc.defaultView;
    if (!view) return [];
    const above = -2 * view.innerHeight;
    const below = 3 * view.innerHeight;
    const selector = [FOCUSABLE, ...(this.opts.extraFocusable ?? [])].join(',');
    const scope = this.opts.scope?.() ?? null;
    const skip = this.validSelector(this.opts.skip);
    const exclude = this.validSelector(this.opts.exclude);
    const seen = new Set<Element>();
    const faded = new Map<Element, boolean>();
    const found = deepQueryAll(scope ?? this.doc, selector);
    if (this.opts.looksClickable)
      found.push(...this.handCursorTargets(scope ?? this.doc, near ? { above, below } : null));
    for (const el of found) {
      if (this.opts.ignoreWithin && deepClosest(el, this.opts.ignoreWithin)) continue;
      if (skip && el.matches(skip)) continue;
      if (this.opts.avoid?.(el)) continue;
      if (exclude && deepClosest(el, exclude)) continue;
      // A frame too small to hold anything worth pointing at is a tracker or a spacer.
      if (el instanceof HTMLIFrameElement) {
        const box = el.getBoundingClientRect();
        if (box.width < 120 || box.height < 60) continue;
      }
      if (near) {
        const r = el.getBoundingClientRect();
        if (r.bottom < above || r.top > below) continue;
      }
      if (!isVisible(el, view, faded)) continue;
      if (outOfReach(el, view)) continue;
      // Too small to aim at or to see a ring on from a couch (a carousel's
      // row of dots, six to nine pixels high on Steamboat's service).
      // A slider is the exception: it is as thin as its track (a player's
      // progress bar is three or four pixels high on a public video site, and
      // it is the control someone watching wants most).
      const size = el.getBoundingClientRect();
      if (Math.min(size.width, size.height) < 10 && !isLongSlider(el)) continue;
      seen.add(el);
    }
    // A label tied to a toggle by `for` stands in for it only when the toggle
    // itself cannot be focused.
    for (const el of [...seen]) {
      if (!(el instanceof HTMLLabelElement) || !el.hasAttribute('for') || el.querySelector('input')) continue;
      const toggle = labelledToggle(el);
      if (!toggle || (seen.has(toggle) && onScreenish(toggle, view))) seen.delete(el);
    }
    // Nothing parked far outside the page is a target. When it is a toggle,
    // its label is what the user sees and is used instead, even if the label
    // is hidden from assistive technology. Seen on the live site: a season
    // list opened by a label whose checkbox sits 100,000 pixels to the left.
    for (const el of [...seen]) {
      if (onScreenish(el, view)) continue;
      seen.delete(el);
      if (!(el instanceof HTMLInputElement) || (el.type !== 'checkbox' && el.type !== 'radio')) continue;
      for (const label of el.labels ?? []) {
        const r = label.getBoundingClientRect();
        const style = view.getComputedStyle(label);
        if (
          r.width >= 4 &&
          r.height >= 4 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          style.opacity !== '0'
        )
          seen.add(label);
      }
    }
    // Drop wrappers that contain another candidate, so a card and the link
    // inside it do not both receive focus.
    // (Found by walking up from each candidate, not by comparing every pair:
    // a long article has thousands of links.)
    // A real link stays when what it holds is only a small control in a
    // corner of it. Seen on a search engine's news cards: the card is one
    // link with a small menu button inside, and only the button could be
    // reached.
    const wrappers = new Set<Element>();
    for (const el of seen) {
      let box: Rect | null = null;
      for (let up = composedParent(el); up; up = composedParent(up)) {
        if (!seen.has(up) || wrappers.has(up)) continue;
        box ??= toRect(el);
        if (!up.matches('a[href]') || !covers(toRect(up), box)) wrappers.add(up);
      }
    }
    const inner = [...seen].filter((el) => !wrappers.has(el));
    // Drop backdrops too: a link stretched over a whole banner, with the
    // banner's real buttons lying on top of it. Seen on the live site, where
    // such a link swallowed sideways movement.
    // A backdrop is a large part of the screen, or has several controls on
    // it. One small control inside a link's box does not make the link a
    // backdrop. Seen on a search engine's results: each result's title link
    // has a small menu button inside its box, and the title could not be
    // reached at all.
    const rects = inner.map(toRect);
    const screen = view.innerWidth * view.innerHeight;
    const front = inner.filter((el, i) => {
      // A link that runs on from one line of text to the next is never a
      // backdrop: the box round both lines takes in the other links on
      // them, but the link itself does not lie under them. Found by the
      // referee on an encyclopedia's article: every such link was dropped.
      if (el.getClientRects().length > 1) return true;
      // Nor is an embedded frame or a video: what is in it is another
      // document or a picture, and the page's controls that pass over its
      // box (a menu bar pinned to the bottom of the screen) are not "on" it.
      // Seen on a video site whose player is a frame from elsewhere: the bar
      // lay over the frame's lower edge and the player could not be reached.
      if (el instanceof HTMLIFrameElement || el instanceof HTMLMediaElement) return true;
      const mine = rects[i]!;
      const onTop = rects.filter((other, j) => j !== i && covers(mine, other)).length;
      if (onTop === 0) return true;
      return onTop < 2 && (mine.right - mine.left) * (mine.bottom - mine.top) < screen * BACKDROP_SHARE;
    });
    // One target per spot: when several controls occupy the same box (a card's
    // link and a transparent button over it), keep the one that can be seen,
    // and a link before anything else.
    const bySpot = new Map<string, Element>();
    const rank = (el: Element): number =>
      (view.getComputedStyle(el).opacity === '0' ? 0 : 2) + (el.matches('a[href]') ? 1 : 0);
    for (const el of front) {
      const r = el.getBoundingClientRect();
      const spot = [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v / 6)).join(',');
      const held = bySpot.get(spot);
      if (!held || rank(el) > rank(held)) bySpot.set(spot, el);
    }
    const kept = new Set(bySpot.values());
    return front.filter((el) => kept.has(el));
  }

  /**
   * Elements the page shows the hand cursor over, that nothing in the markup
   * marks as controls: the outermost element of each such region. The cursor
   * is inherited, so everything inside a clickable card reports it too; only
   * the one whose parent does not is taken.
   *
   * Finding them means a look at every element near the screen, and a style
   * lookup for many. On a page of ten thousand elements that is far too much
   * to do on a key press, so it is not done there: a key press uses what is
   * already known, and the looking is done when the page is first asked
   * about and after that in idle moments (see lookForHands).
   */
  private handCursorTargets(root: ParentNode, band: { above: number; below: number } | null): Element[] {
    if (!this.handsLooked) this.lookForHands();
    else this.lookSoon();
    const out: Element[] = [];
    for (const el of this.hands) {
      if (!el.isConnected) {
        this.hands.delete(el);
        continue;
      }
      if (root !== this.doc && !deepContains(root as Element, el)) continue;
      if (band) {
        const r = el.getBoundingClientRect();
        if (r.bottom < band.above || r.top > band.below) continue;
      }
      out.push(el);
    }
    return out;
  }

  /** Asks for a look in the next idle moment, unless one is already waiting. */
  private lookSoon(): void {
    const view = this.doc.defaultView;
    if (!view || this.lookWaiting) return;
    this.lookWaiting = true;
    const run = (): void => {
      if (!this.lookWaiting) return;
      this.lookWaiting = false;
      this.lookForHands();
    };
    // In an idle moment, and in any case soon: the idle call was seen never
    // to come in a frame showing a video full screen (2026-11-22), which
    // left controls made after the first look unseen for good.
    if (typeof view.requestIdleCallback === 'function') view.requestIdleCallback(run, { timeout: 400 });
    view.setTimeout(run, typeof view.requestIdleCallback === 'function' ? 450 : 120);
  }

  /**
   * Looks at the elements near the screen that have not been looked at yet
   * and remembers which show the hand cursor. While the layer is hiding the
   * real pointer (a class on the root that sets every cursor to none) the
   * class has to come off for the looking, which restyles the page; that is
   * the other reason this is kept away from key presses.
   */
  private lookForHands(): void {
    const view = this.doc.defaultView;
    if (!view || !this.opts.looksClickable) return;
    this.handsLooked = true;
    const known = [FOCUSABLE, ...(this.opts.extraFocusable ?? [])].join(',');
    const above = -2 * view.innerHeight;
    const below = 3 * view.innerHeight;
    const fresh: Element[] = [];
    for (const el of deepQueryAll(this.doc, MAYBE_CLICKABLE)) {
      if (this.looked.has(el)) continue;
      const r = el.getBoundingClientRect();
      // Not yet near the screen: looked at when it is.
      if (r.bottom < above || r.top > below) continue;
      this.looked.add(el);
      if (r.width < 10 || r.height < 10) continue;
      // Inside a real control it is that control's cursor.
      if (deepClosest(el, known)) continue;
      fresh.push(el);
      if (fresh.length >= MAX_STYLE_LOOKS) break;
    }
    if (fresh.length === 0) return;
    const rootEl = this.doc.documentElement;
    const hiding = this.opts.cursorHiddenClass;
    const wasHidden = hiding !== undefined && rootEl.classList.contains(hiding);
    if (wasHidden) rootEl.classList.remove(hiding);
    const hand = new Map<Element, boolean>();
    const isHand = (el: Element): boolean => {
      let answer = hand.get(el);
      if (answer === undefined) {
        answer = this.hands.has(el) || view.getComputedStyle(el).cursor === 'pointer';
        hand.set(el, answer);
      }
      return answer;
    };
    for (const el of fresh) {
      if (!isHand(el)) continue;
      const parent = composedParent(el);
      if (parent && parent !== this.doc.body && parent !== rootEl && isHand(parent)) continue;
      this.hands.add(el);
    }
    if (wasHidden) rootEl.classList.add(hiding);
  }

  /** The selectors of `list` this browser can parse, joined as one; null when there are none. */
  private validSelector(list: readonly string[] | undefined): string | null {
    const valid = (list ?? []).filter((sel) => {
      try {
        this.doc.querySelector(sel);
        return true;
      } catch {
        return false;
      }
    });
    return valid.length ? valid.join(',') : null;
  }

  /** The innermost group a profile names that `el` sits in, if any. */
  private groupOf(el: Element): { el: Element; group: ProfileGroup } | null {
    let found: { el: Element; group: ProfileGroup } | null = null;
    for (const group of this.opts.groups ?? []) {
      let container: Element | null = null;
      try {
        container = deepClosest(el, group.selector);
      } catch {
        // A selector this browser cannot parse names no group.
      }
      if (container && (!found || deepContains(found.el, container))) found = { el: container, group };
    }
    return found;
  }

  /** Focuses the candidate whose centre is nearest to a point, for picking up where a vanished control was. */
  focusNearest(point: { x: number; y: number }, pool: readonly Element[] = this.candidates()): boolean {
    let best: Element | null = null;
    let bestDistance = Infinity;
    for (const el of pool) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot((r.left + r.right) / 2 - point.x, (r.top + r.bottom) / 2 - point.y);
      if (d < bestDistance) {
        best = el;
        bestDistance = d;
      }
    }
    return this.focus(best);
  }

  /** True when the focused control is entirely outside the window (the page was scrolled away from it). */
  focusIsOffScreen(): boolean {
    const el = this.focused;
    const view = this.doc.defaultView;
    if (!el || !view) return false;
    const r = el.getBoundingClientRect();
    return r.bottom <= 0 || r.top >= view.innerHeight || r.right <= 0 || r.left >= view.innerWidth;
  }

  /** Focuses the first page control wholly on screen, reading order; pinned bars only if there is nothing else. */
  focusFirstOnScreen(allowPinned = true): boolean {
    const view = this.doc.defaultView;
    if (!view) return false;
    const onScreen = this.candidates().filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= view.innerHeight && r.left >= 0 && r.right <= view.innerWidth;
    });
    const cache = new Map<Element, boolean>();
    const flowing = onScreen.filter((el) => !isPinned(el, view, cache));
    const pool = flowing.length || !allowPinned ? flowing : onScreen;
    // Not a small icon when there is anything else. Seen on Steamboat's service: a
    // banner's mute button sits above and to the right of its main button,
    // and reading order alone put the first press on it.
    const icon = Math.max(view.innerHeight * 0.12, 48);
    const main = pool.filter((el) => {
      const r = el.getBoundingClientRect();
      // An icon is small and about square; a short text link is not one.
      return r.width > icon || r.height > icon || r.width >= r.height * 1.5;
    });
    const pick = main.length ? main : pool;
    return this.focus(pick[pickInitial(pick.map(toRect))] ?? null);
  }

  /**
   * Focuses what a page is about: its first control in reading order that is
   * not in a pinned bar and not a small icon, on screen if there is one,
   * otherwise the first below. Seen on Steamboat's service: at the TV scale the
   * banner's buttons start just below the screen and only its mute icon is
   * on it.
   */
  private focusFirstContent(all: readonly Element[]): boolean {
    const view = this.doc.defaultView;
    if (!view) return false;
    const cache = new Map<Element, boolean>();
    const icon = Math.max(view.innerHeight * 0.12, 48);
    const main = all.filter((el) => {
      if (isPinned(el, view, cache)) return false;
      const r = el.getBoundingClientRect();
      return r.top >= 0 && (r.width > icon || r.height > icon || r.width >= r.height * 1.5);
    });
    const onScreen = main.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom <= view.innerHeight && r.left >= 0 && r.right <= view.innerWidth;
    });
    const pick = onScreen.length ? onScreen : main;
    if (pick.length) return this.focus(pick[pickInitial(pick.map(toRect))] ?? null);
    return this.focusFirstOnScreen(false);
  }

  /** Focuses the first candidate inside `container`, reading order. */
  focusFirstIn(container: Element): boolean {
    const inside = this.candidates().filter((el) => deepContains(container, el));
    return this.focus(inside[pickInitial(inside.map(toRect))] ?? null);
  }

  /**
   * Down from a slider that lies sideways goes to the nearest control in its
   * own row first. Left and right on it are the slider's keys, so the buttons
   * a player puts at either end of its progress bar could be reached no other
   * way. (Seen on a public video site: play to the left of the bar, sound and
   * settings to the right, all in one row.)
   */
  private besideSlider(dir: Direction, pool: readonly Element[]): boolean | null {
    const from = this.focused;
    if (dir !== 'down' || !from || !isSidewaysSlider(from) || !isLongSlider(from)) return null;
    const r = from.getBoundingClientRect();
    const mid = (r.top + r.bottom) / 2;
    let best: Element | null = null;
    let bestGap = Infinity;
    for (const el of pool) {
      if (el === from || isSlider(el)) continue;
      const b = el.getBoundingClientRect();
      if (b.top > mid || b.bottom < mid) continue;
      const gap = b.left >= r.right ? b.left - r.right : r.left >= b.right ? r.left - b.right : -1;
      if (gap < 0 || gap >= bestGap) continue;
      best = el;
      bestGap = gap;
    }
    return best ? this.focus(best) : null;
  }

  /**
   * `straight`: go to the next thing that way however far it is, without the
   * step-at-a-time scrolling of a page being read or of a held key (leaving
   * a player for the page round it).
   */
  move(dir: Direction, straight = false): boolean {
    // Measured from the end of the last move: on a long page a move takes
    // time itself, and that must not make a held key look like single presses.
    this.rapid = !straight && Date.now() - this.lastMoveAt < RAPID_MS;
    this.straight = straight;
    // First among what is near the screen, which is quick; the whole page
    // only when nothing near lies that way.
    const before = this.focused;
    const beforeBox = this.lastBox;
    const near = this.candidates(true);
    this.comeBack(near);
    // What came up only because the highlight rested here, and closed when
    // the highlight stepped into it, is passed over.
    const few = this.withoutFleeting(near);
    const moved =
      this.besideSlider(dir, near) ??
      (few ? this.step(dir, few) : null) ??
      this.step(dir, near) ??
      this.step(dir, this.candidates()) ??
      false;
    const now = this.focused;
    if (now && now !== before) {
      this.arrival = before && beforeBox ? { from: before, fromBox: beforeBox, known: this.knownHere } : null;
      this.knownHere = new WeakSet(near);
    }
    this.lastMoveAt = Date.now();
    return moved;
  }

  /** How the highlight got where it is: from what, and what there was to go to when it arrived on that. */
  private arrival: { from: Element; fromBox: Rect; known: WeakSet<Element> } | null = null;
  /** What there was to go to when the highlight arrived where it is. */
  private knownHere = new WeakSet<Element>();
  /** A place whose pop-up closed under the highlight, and what was there before the pop-up. */
  private fleeting: { box: Rect; known: WeakSet<Element> } | null = null;

  /** A box kept in page terms, in window terms; null when none of it is on screen. */
  private inWindow(box: Rect): Rect | null {
    const view = this.doc.defaultView;
    if (!view) return null;
    const r = {
      left: box.left - view.scrollX,
      right: box.right - view.scrollX,
      top: box.top - view.scrollY,
      bottom: box.bottom - view.scrollY,
    };
    return r.bottom <= 0 || r.top >= view.innerHeight || r.right <= 0 || r.left >= view.innerWidth ? null : r;
  }

  /**
   * What had the highlight is gone. If it was reached from something still
   * on screen, the highlight goes back to that (or to what now stands in its
   * place), and what it opened is remembered as fleeting. Says whether it did.
   */
  comeBack(all: readonly Element[], given?: Element): boolean {
    const view = this.doc.defaultView;
    const a = this.arrival;
    if (!view || !a || !this.lostBox()) return false;
    const box = this.inWindow(a.fromBox);
    if (!box) return false;
    let back: Element | null = a.from.isConnected && isLaidOut(a.from, view) ? a.from : this.standIn(box, all);
    if (given) {
      const r = given.getBoundingClientRect();
      const x = (r.left + r.right) / 2;
      const y = (r.top + r.bottom) / 2;
      back = given === back || (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) ? given : null;
    }
    if (!back) return false;
    this.fleeting = { box: a.fromBox, known: a.known };
    this.arrival = null;
    this.current?.removeAttribute(FOCUS_ATTR);
    this.current = back;
    back.setAttribute(FOCUS_ATTR, '');
    this.lastBox = a.fromBox;
    this.opts.onFocusChange?.(back);
    return true;
  }

  /**
   * Back on the place whose pop-up closed under the highlight: the
   * candidates that were there before the pop-up, so the next move passes
   * over what the pop-up brought. Null when that does not apply.
   */
  private withoutFleeting(all: readonly Element[]): Element[] | null {
    const from = this.focused;
    const box = this.fleeting ? this.inWindow(this.fleeting.box) : null;
    if (!from || !box || !this.fleeting) return null;
    const r = from.getBoundingClientRect();
    const x = (r.left + r.right) / 2;
    const y = (r.top + r.bottom) / 2;
    if (x < box.left || x > box.right || y < box.top || y > box.bottom) return null;
    const known = this.fleeting.known;
    const few = all.filter((el) => el === from || known.has(el));
    return few.length > 1 ? few : null;
  }

  /** Pinned notices, and strips beside a scrolling pane, the highlight has already been taken to once. */
  private offered = new WeakSet<Element>();

  /** One attempt at a move among `all`. Null when nothing lies in that direction. */
  private step(dir: Direction, all: Element[]): boolean | null {
    const view = this.doc.defaultView;
    // What had focus may have been put away without being removed (an entry
    // of a menu that has closed). It is then nowhere, and moving "from" it
    // lands somewhere arbitrary; carry on as if nothing had focus.
    const held = this.focused;
    // The page replaced or hid what had the highlight (a picture drawn
    // again, a list filled in). Carry on from where it was: from what stands
    // there now, or failing that from the place itself, not from the top again.
    const lost = this.lostBox();
    if (held && view && !isLaidOut(held, view)) this.clear();
    let from = this.focused;
    if (lost) {
      const stand = this.standIn(lost, all);
      if (stand) {
        this.current = stand;
        stand.setAttribute(FOCUS_ATTR, '');
        from = stand;
      } else {
        const i = pickNext(lost, all.map(toRect), dir);
        if (i !== -1) return this.focus(all[i] ?? null);
      }
    }
    if (!from) {
      // Focus was lost part-way down a page (what had it was replaced as
      // more of the page loaded): carry on from what is on screen, not from the top.
      // If nothing is on screen yet, keep scrolling the way the key points
      // rather than jumping to the bar at the top.
      if (view && view.scrollY > view.innerHeight / 2) {
        if (!this.focusFirstOnScreen(false) && (dir === 'up' || dir === 'down')) {
          view.scrollBy({ top: (dir === 'down' ? 0.8 : -0.8) * view.innerHeight, behavior: 'instant' });
        }
        return true;
      }
      // A notice the profile knows how to close comes first.
      for (const sel of this.opts.closeFirst ?? []) {
        let close: Element | null = null;
        try {
          close = all.find((el) => el.matches(sel)) ?? null;
        } catch {
          // A selector this browser cannot parse names nothing.
        }
        if (close && view && acrossTheWindow(close, view)) return this.focus(close);
      }
      // A profile may say where the highlight starts.
      if (this.opts.initial) {
        let first: Element | null = null;
        try {
          first = all.find((el) => el.matches(this.opts.initial!)) ?? null;
        } catch {
          // A selector this browser cannot parse names nothing.
        }
        if (first) return this.focus(first);
      }
      // Nothing has focus yet on this page. The first press goes to what the
      // page is about (its main button, its first card), not to the bar
      // pinned across the top; Up, which points at the bar, still gets it.
      if (dir !== 'up' && this.focusFirstContent(all)) return true;
      const i = pickInitial(all.map(toRect));
      return this.focus(all[i] ?? null);
    }
    let others = all.filter((el) => el !== from);
    // Up and down follow the page. A bar pinned to the screen is always
    // "nearest" once the page has scrolled under it, and focusing it jumps
    // the page back to where the bar lives; so from page content it is only
    // a target when there is no page content left in that direction.
    if (view && (dir === 'up' || dir === 'down')) {
      const cache = new Map<Element, boolean>();
      if (!isPinned(from, view, cache)) {
        const flowing = others.filter((el) => !isPinned(el, view, cache));
        if (pickNext(toRect(from), flowing.map(toRect), dir) !== -1) others = flowing;
        else {
          // And then only a bar on the side of the screen the key points to:
          // the bar across the top is never "down". (Seen on a messenger's
          // site: with the highlight left behind above the screen, Down went
          // to a button in the top bar, which was "below" it; the page jumped
          // back, and Down went round between the two.)
          others = others.filter((el) => {
            if (!isPinned(el, view, cache)) return true;
            const r = el.getBoundingClientRect();
            const middle = (r.top + r.bottom) / 2;
            return dir === 'down' ? middle > view.innerHeight / 2 : middle < view.innerHeight / 2;
          });
        }
      }
    }
    // Left and right stay in the page too. A pinned strip of tabs lies across
    // whatever row has scrolled under it, and would be "in the row". From a
    // sideways-scrolling row it is never a target (the row's own edge handling
    // takes over); elsewhere only when no page content lies that way.
    if (view && (dir === 'left' || dir === 'right')) {
      const cache = new Map<Element, boolean>();
      if (!isPinned(from, view, cache)) {
        const flowing = others.filter((el) => !isPinned(el, view, cache));
        if (rowOf(from, view) || pickNext(toRect(from), flowing.map(toRect), dir) !== -1) others = flowing;
      }
    }
    // Up and down go to the larger thing first. A small control lying inside
    // another's box (the menu button inside a search result's link) is at
    // the same height as what holds it, and was landed on in its place;
    // left and right still reach it.
    if (dir === 'up' || dir === 'down') {
      const rects = others.map(toRect);
      const mine = toRect(from);
      // From such a small control, what holds it is not above or below it either.
      // Nor is a small control inside the focused one's own box below it.
      const whole = others.filter(
        (_, i) =>
          !covers(rects[i]!, mine) &&
          !covers(mine, rects[i]!) &&
          !rects.some((outer, j) => j !== i && covers(outer, rects[i]!)),
      );
      if (whole.length < others.length && pickNext(mine, whole.map(toRect), dir) !== -1) others = whole;
    }
    // Up and down inside a menu stay in the menu while it has an entry that
    // way. Seen on Steamboat's service: the player's menus lie over its control
    // row, and the row's buttons were nearer than the next entry.
    if ((dir === 'up' || dir === 'down') && from.matches(MENU_ENTRY)) {
      const home = from.getRootNode();
      const peers = others.filter((el) => el.getRootNode() === home && el.matches(MENU_ENTRY));
      if (pickNext(toRect(from), peers.map(toRect), dir) !== -1) others = peers;
    }
    // A group a profile names: movement along it stays in it while it has a
    // member that way, and a row's end is its end (left and right never leave
    // a row). Across it, movement leaves as usual.
    const home = this.groupOf(from);
    if (home) {
      const sideways = dir === 'left' || dir === 'right';
      const along = home.group.axis === 'grid' || (home.group.axis === 'horizontal') === sideways;
      if (along) {
        const peers = others.filter((el) => deepContains(home.el, el));
        if (pickNext(toRect(from), peers.map(toRect), dir) !== -1) others = peers;
        else if (home.group.axis === 'horizontal') return null;
      }
    }
    // Something scrolled out of sight in a pane of its own is where its box
    // says only for someone inside that pane. From outside, it is not there.
    // (Seen on a music site: below the last link of a side column, Down chose
    // a card hidden further down a list higher up the column; showing it
    // scrolled that list, and the highlight ended above where it began.)
    for (let n = 0; view && n < 12; n++) {
      const j = pickNext(toRect(from), others.map(toRect), dir);
      const pick = j === -1 ? null : others[j];
      if (!pick || !clippedAwayFrom(pick, from, view, dir === 'up' || dir === 'down')) break;
      others = others.filter((el) => el !== pick);
    }
    const i = pickNext(toRect(from), others.map(toRect), dir);
    if (i === -1) {
      // Inside one notice or pop-up nothing is left out of reach sideways
      // for lying a little higher or lower: the nearest thing that way in
      // it is taken. (Seen on a film service's cookie notice: its button,
      // a link in its words and its X are at three heights, and Right from
      // the button went nowhere.)
      if (view && (dir === 'left' || dir === 'right')) {
        const box = this.opts.scope?.() ?? pinnedNotices(this.doc, view).find((n) => deepContains(n, from)) ?? null;
        if (box && deepContains(box, from)) {
          const f = from.getBoundingClientRect();
          let best: Element | null = null;
          let least = Infinity;
          for (const el of all) {
            if (el === from || !deepContains(box, el) || !isVisible(el, view)) continue;
            const r = el.getBoundingClientRect();
            if (dir === 'right' ? r.left < f.right - 1 : r.right > f.left + 1) continue;
            const gap =
              (dir === 'right' ? r.left - f.right : f.left - r.right) +
              2 * Math.abs((r.top + r.bottom) / 2 - (f.top + f.bottom) / 2);
            if (gap < least) {
              least = gap;
              best = el;
            }
          }
          if (best) return this.focus(best);
        }
      }
      return null;
    }
    let target = others[i] ?? null;
    if (target && (dir === 'up' || dir === 'down')) target = this.rowEntry(target, from, others);
    // Coming into a group that remembers: back to where the highlight last was in it.
    if (target) {
      const dest = this.groupOf(target);
      if (dest?.group.remember && dest.el !== home?.el) {
        const last = this.groupMemory.get(dest.el);
        if (last && others.includes(last)) target = last;
      }
    }
    // A notice pinned to an edge that asks for an answer (it calls itself a
    // dialog, but does not hold the page) is offered on the way past: when
    // what would be next lies under it or beyond it, or, the first time,
    // when what would be next is off the screen. Otherwise a pinned bar is reached only when
    // the page has run out, and a page that goes on for ever never does.
    // (Seen on a streaming site: its cookie notice lay across the bottom
    // quarter of the screen and could not be answered.)
    if (target && view && (dir === 'up' || dir === 'down')) {
      const t = target.getBoundingClientRect();
      const f = from.getBoundingClientRect();
      for (const notice of pinnedNotices(this.doc, view)) {
        if (deepContains(notice, from) || deepContains(notice, target)) continue;
        const n = notice.getBoundingClientRect();
        if (dir === 'down' ? (n.top + n.bottom) / 2 <= f.bottom : (n.top + n.bottom) / 2 >= f.top) continue;
        const x = (t.left + t.right) / 2;
        const y = (t.top + t.bottom) / 2;
        const under = x >= n.left && x <= n.right && y >= n.top && y <= n.bottom;
        const away = dir === 'down' ? t.top >= view.innerHeight : t.bottom <= 0;
        // Or it lies on the way: what would be next is on screen beyond it. (Seen on a
        // film service: its notice hangs under the top bar, and Down from
        // the bar went over it to the page.)
        const middle = (n.top + n.bottom) / 2;
        const passed = !away && (dir === 'down' ? middle < y && n.bottom <= t.bottom : middle > y && n.top >= t.top);
        if (!under && !passed && !(away && !this.offered.has(notice))) continue;
        const inside = all.filter((el) => el !== from && deepContains(notice, el) && isVisible(el, view));
        if (inside.length === 0) continue;
        this.offered.add(notice);
        const j = pickNext(toRect(from), inside.map(toRect), dir);
        return this.focus(inside[j === -1 ? pickInitial(inside.map(toRect)) : j] ?? null);
      }
    }
    // A pane that scrolls by itself is not left by the key that scrolls it
    // while it has more to show that way: the pane moves on and the
    // highlight takes up what comes into view. (Seen on a film service and a
    // music one: a notice lay under the pane, Down from the last card in
    // view went to the notice, and the rest of the pane was never reached.)
    if (target && view && (dir === 'up' || dir === 'down')) {
      const pane = paneWithMore(from, this.doc, view, dir);
      // What lies outside the pane is offered once all the same: a strip
      // under the pane that asks something (which country, on that film
      // service) could otherwise only be reached from the pane's far end.
      // After that the pane scrolls on, and the strip is at its end.
      let outside: Element | null = pane && !deepContains(pane, target) ? target : null;
      while (outside && pane) {
        const up = composedParent(outside);
        if (!up || deepContains(up, pane)) break;
        outside = up;
      }
      const firstTime = !!outside && !this.offered.has(outside) && isOnScreen(target, view);
      if (firstTime && outside) this.offered.add(outside);
      // The same when what is next in the pane is still out of sight below
      // (or above) its edge, and something outside the pane is in view that
      // way: that is what the eye would go to next, so it is offered first, once.
      if (pane && deepContains(pane, target)) {
        const p = pane.getBoundingClientRect();
        const t = target.getBoundingClientRect();
        const unseen =
          dir === 'down' ? t.top >= Math.min(p.bottom, view.innerHeight) - 1 : t.bottom <= Math.max(p.top, 0) + 1;
        if (unseen) {
          const beside = all.filter((el) => {
            if (el === from || deepContains(pane, el) || !isOnScreen(el, view) || !isVisible(el, view)) return false;
            const r = el.getBoundingClientRect();
            return dir === 'down' ? r.top >= p.bottom - 1 : r.bottom <= p.top + 1;
          });
          const j = pickNext(toRect(from), beside.map(toRect), dir);
          const pick = beside[j === -1 ? pickInitial(beside.map(toRect)) : j] ?? null;
          let strip: Element | null = pick;
          while (strip) {
            const up = composedParent(strip);
            if (!up || deepContains(up, pane)) break;
            strip = up;
          }
          if (pick && strip && !this.offered.has(strip)) {
            this.offered.add(strip);
            return this.focus(pick);
          }
        }
      }
      if (pane && !deepContains(pane, target) && !firstTime) {
        pane.scrollBy({ top: (dir === 'down' ? 0.8 : -0.8) * pane.clientHeight, behavior: 'instant' });
        const inside = this.candidates(true).filter(
          (el) => el !== from && deepContains(pane, el) && shownIn(el, pane, view) >= 0.99,
        );
        const j = pickNext(toRect(from), inside.map(toRect), dir);
        if (j !== -1) return this.focus(inside[j] ?? null, { scroll: false });
        if (shownIn(from, pane, view) < 0.5) this.focusOnScreen(dir, pane);
        return true;
      }
    }
    // A held key stops at the last row and does not run on into the page's
    // footer: more rows may be about to load in front of it, and the footer
    // would carry the focus away from them. A single press still goes there.
    if (target && this.rapid && dir === 'down' && target.closest(FOOTER) && !from.closest(FOOTER)) return true;
    // A held key must not run ahead of a page that loads more as it scrolls:
    // a target far outside the screen may only be the next thing loaded so
    // far (the footer, with rows still to come before it). Scroll toward it
    // and let the next repeat decide again.
    if (
      target &&
      view &&
      !this.straight &&
      (this.rapid || this.opts.readingScroll) &&
      (dir === 'up' || dir === 'down')
    ) {
      const r = target.getBoundingClientRect();
      // A single press on a page being read jumps to what is just past the
      // edge: bringing it to the middle then moves the page by less than a
      // screen, so nothing in between goes by unseen. Further than that is
      // scrolled toward.
      const reach = this.rapid ? 0 : view.innerHeight * READING_REACH;
      const far = dir === 'down' ? r.top > view.innerHeight + reach : r.bottom < -reach;
      // Whatever holds the target is what scrolls (the page, or a pane of a
      // web app, or Longboard's own menu). If nothing can scroll that way the
      // target is jumped to after all: scrolling the window when it is a pane
      // that holds the target would leave a held key going nowhere.
      if (far && scrollBy(this.doc, target, dir, this.rapid) !== null) return true;
    }
    return this.focus(target);
  }

  /**
   * Entering a sideways-scrolling row from above or below goes to where the
   * user last was in that row, or to its first item on screen, instead of to
   * whichever item happens to be nearest after the rows were scrolled.
   */
  private rowEntry(target: Element, from: Element, candidates: readonly Element[]): Element {
    const view = this.doc.defaultView;
    if (!view) return target;
    const row = rowOf(target, view);
    if (!row || row === rowOf(from, view)) return target;
    const inRow = candidates.filter((el) => deepContains(row, el));
    const remembered = this.rowMemory.get(row);
    if (remembered && inRow.includes(remembered)) return remembered;
    const rowLeft = row.getBoundingClientRect().left;
    let first = target;
    for (const el of inRow) {
      const r = el.getBoundingClientRect();
      if (r.left >= rowLeft - 4 && r.left < first.getBoundingClientRect().left) first = el;
    }
    return first;
  }

  /**
   * Moves from a point on screen rather than from the focused element. With
   * nothing in that direction it takes the control nearest the point (a live
   * station's player has its bottom controls disabled; landing on the far
   * corner's Close button there would be a surprise).
   */
  moveFrom(point: { x: number; y: number }, dir: Direction): boolean {
    const all = this.candidates();
    const from: Rect = { left: point.x, top: point.y, right: point.x, bottom: point.y };
    const i = pickNext(from, all.map(toRect), dir);
    if (i !== -1) return this.focus(all[i] ?? null);
    // Not a slider when there is anything else: arriving on the volume control is no use to anyone.
    const plain = all.filter((el) => !(el instanceof HTMLInputElement && el.type === 'range'));
    return this.focusNearest(point, plain.length ? plain : all);
  }

  /**
   * Focuses a control that is wholly on screen, without moving the page: the
   * first one in reading order after a scroll down, the last after a scroll
   * up. Used when the page was scrolled because there was nothing to move to.
   * `within` is what was scrolled.
   */
  focusOnScreen(dir: Direction, within?: Element): boolean {
    const view = this.doc.defaultView;
    if (!view) return false;
    const cache = new Map<Element, boolean>();
    // Only what the scrolling brought: inside the pane that scrolled, when it was a pane.
    const pane =
      within && within !== this.doc.scrollingElement && within !== this.doc.documentElement && within !== this.doc.body
        ? within
        : null;
    const inPane = this.candidates(true).filter(
      (el) => (!pane || deepContains(pane, el)) && !isPinned(el, view, cache),
    );
    let onScreen = inPane.filter((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.top >= 0 &&
        r.bottom <= view.innerHeight &&
        r.left >= 0 &&
        r.right <= view.innerWidth &&
        (!pane || shownIn(el, pane, view) >= 0.99)
      );
    });
    // A pane shorter than its cards may show none of them whole: then what is mostly in view.
    if (onScreen.length === 0 && pane) onScreen = inPane.filter((el) => shownIn(el, pane, view) >= 0.5);
    if (onScreen.length === 0) return false;
    const rects = onScreen.map(toRect);
    let pick = pickInitial(rects);
    if (dir === 'up') {
      // The lowest row, and its left-most control.
      pick = 0;
      rects.forEach((r, i) => {
        const b = rects[pick]!;
        if (r.top > b.top + 8 || (Math.abs(r.top - b.top) <= 8 && r.left < b.left)) pick = i;
      });
    }
    return this.focus(onScreen[pick] ?? null, { scroll: false });
  }

  /**
   * Puts the highlight and keyboard focus on `el` and brings it into view.
   * `scroll: false` leaves the page where it is. False when `el` is null.
   */
  focus(el: Element | null, how: { scroll?: boolean } = {}): boolean {
    if (!el) return false;
    this.current?.removeAttribute(FOCUS_ATTR);
    this.zoomed?.removeAttribute(ZOOM_ATTR);
    this.zoomed = null;
    this.current = el;
    const view = this.doc.defaultView;
    const row = view ? rowOf(el, view) : null;
    if (row) this.rowMemory.set(row, el);
    const group = this.groupOf(el);
    if (group) this.groupMemory.set(group.el, el);
    el.setAttribute(FOCUS_ATTR, '');
    if (view && shouldZoom(el, view, this.opts.growPicturesOnly)) {
      this.zoomed = zoomTarget(el);
      this.zoomed.setAttribute(ZOOM_ATTR, '');
    }
    if (el instanceof HTMLIFrameElement) {
      // Keyboard focus on a frame sends the keys into it, where nothing of
      // the layer's would hear them again. The highlight rests on it; the keys stay here.
      const active = this.doc.activeElement;
      if (active instanceof HTMLElement && active !== this.doc.body) active.blur();
    } else if (el instanceof HTMLElement || 'focus' in el) {
      this.focusing = true;
      try {
        (el as HTMLElement).focus({ preventScroll: true });
      } finally {
        this.focusing = false;
      }
    }
    // Anything on the first screenful (the bar and the banner under it) is
    // shown with the page at the very top, so the banner is seen whole and
    // not half under the bar. Further down, the focused row is centred.
    const top = view ? el.getBoundingClientRect().top + view.scrollY : Infinity;
    const bottom = view ? top + el.getBoundingClientRect().height : Infinity;
    if (view) {
      const r = el.getBoundingClientRect();
      this.lastBox = { left: r.left + view.scrollX, right: r.right + view.scrollX, top, bottom };
    }
    if (how.scroll === false) {
      // Already where the person is looking; the page stays put.
    } else if (view && bottom <= view.innerHeight) {
      // Only this: a second scroll request would replace it and stop short of the top.
      view.scrollTo({ top: 0, behavior: this.rapid ? 'instant' : 'smooth' });
      scrollWithinList(el, view);
    } else {
      // With a key held, a smooth scroll is restarted by every repeat and never arrives.
      const before = view ? { top: view.scrollY, left: view.scrollX } : null;
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: this.rapid ? 'instant' : 'smooth' });
      // A page that has shut its own scrolling off (an app of panes, a page
      // behind a prompt) is not moved: bringing something into view inside
      // a pane would otherwise push the whole app up off the screen.
      // Unless that leaves it cut off: such an app can be taller than the
      // screen, and then moving the page is the only way to show its last strip.
      if (view && before && !pageScrolls(this.doc, view)) {
        view.scrollTo({ ...before, behavior: 'instant' });
        const show = (): void => {
          if (this.current !== el) return;
          const r = el.getBoundingClientRect();
          const down = r.bottom > view.innerHeight ? r.bottom - view.innerHeight + 8 : r.top < 0 ? r.top - 8 : 0;
          if (down !== 0) view.scrollBy({ top: down, behavior: 'instant' });
        };
        if (this.rapid) show();
        else view.setTimeout(show, 350);
      }
    }
    this.opts.onFocusChange?.(el);
    return true;
  }

  /** Presses what has the highlight. False when nothing has it. */
  activate(): boolean {
    const el = this.focused;
    if (!el) return false;
    press(el);
    return true;
  }

  /** Takes the highlight away. Keyboard focus is left where it is. */
  clear(): void {
    this.lastBox = null;
    this.current?.removeAttribute(FOCUS_ATTR);
    this.zoomed?.removeAttribute(ZOOM_ATTR);
    this.zoomed = null;
    this.current = null;
    this.opts.onFocusChange?.(null);
  }
}
