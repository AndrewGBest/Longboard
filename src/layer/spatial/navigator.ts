// DOM side of directional focus: finds candidates, moves focus, activates.
import type { Direction } from '../../shared/actions';
import { composedParent, deepClosest, deepContains, deepQueryAll } from './deep';
import { scrollBy } from '../generic/scroll';
import { boxOf } from './box';
import { pickInitial, pickNext, type Rect } from './geometry';
import type { ProfileGroup } from '../../shared/profile';

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
  // and OK on it hands over to pointer mode (see the layer).
  'iframe',
].join(',');

/** Elements that are often made clickable with a script and nothing in the markup to say so. */
const MAYBE_CLICKABLE = 'div, span, li, img, svg, td, article, section, figure, picture, p, h1, h2, h3, h4, h5, h6, i, b, em, strong';
/** How many such elements are looked at in one pass: the look costs a style lookup each. */
const MAX_STYLE_LOOKS = 2500;

/** For a `label[for]`: the checkbox or radio it stands for, or null when it labels something else. */
function labelledToggle(label: Element): HTMLInputElement | null {
  const id = label.getAttribute('for');
  const target = id ? label.ownerDocument.getElementById(id) : null;
  return target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio') ? target : null;
}

export const FOCUS_ATTR = 'data-longboard-focus';
/** Set on a focused element small enough to grow, as focused cards do on a TV. */
export const ZOOM_ATTR = 'data-longboard-zoom';

/** What makes a link a card: a picture in it. */
const PICTURE = 'img, picture, video, canvas, svg';

/**
 * A focused card grows; a banner, a text field or a slider does not. Nor
 * does a link in running text: an inline box cannot be scaled at all, and
 * marking it moved what was placed inside it (seen on a search engine's
 * results: each sub-link's arrow jumped under its words). With
 * `picturesOnly`, for sites with no profile, only something holding a
 * picture counts as a card: grown text lies over its neighbours.
 */
export function shouldZoom(el: Element, view: Window, picturesOnly = false): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return false;
  if (view.getComputedStyle(el).display === 'inline') return false;
  const r = el.getBoundingClientRect();
  if (picturesOnly) {
    const picture = el.matches(PICTURE) ? el : el.querySelector(PICTURE);
    const p = picture?.getBoundingClientRect();
    // A picture that is most of the control, not an icon beside its words.
    if (!p || p.width * p.height < r.width * r.height * 0.4) return false;
  }
  const viewport = view.innerWidth * view.innerHeight;
  return viewport > 0 && (r.width * r.height) / viewport <= 0.2;
}

/**
 * The element to grow for a focused control: the outermost ancestor that
 * occupies the same box. On the live site a card's link is a transparent
 * layer over its picture, so growing the link alone left the picture behind.
 */
export function zoomTarget(el: Element): Element {
  const box = el.getBoundingClientRect();
  const same = (r: DOMRect): boolean =>
    Math.abs(r.left - box.left) <= 6 && Math.abs(r.top - box.top) <= 6 && Math.abs(r.right - box.right) <= 6 && Math.abs(r.bottom - box.bottom) <= 6;
  let target = el;
  for (let node = el.parentElement, i = 0; node && i < 6 && same(node.getBoundingClientRect()); node = node.parentElement, i++) {
    target = node;
  }
  return target;
}

/**
 * Presses something as a click would. Most elements can be asked to click
 * themselves; a drawing (SVG) cannot, and is sent the click it would have got.
 */
export function press(el: Element): void {
  if (typeof (el as HTMLElement).click === 'function') (el as HTMLElement).click();
  else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: el.ownerDocument.defaultView }));
}

export interface NavigatorOptions {
  /** Extra selectors from the site adapter. */
  extraFocusable?: string[];
  /** Elements the layer itself owns; never candidates. */
  ignoreWithin?: string;
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

/**
 * `faded` remembers, for one pass over many controls, whether each ancestor
 * is transparent or sits inside something that is: siblings share almost all
 * of their ancestors, and asking for each one's style again is most of the
 * cost of a move on a long page. With it the search goes all the way up;
 * without it, twelve levels.
 */
export function isVisible(el: Element, view: Window, faded?: Map<Element, boolean>): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const style = view.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  if (style.opacity === '0') {
    // A transparent link or button laid over a picture is a hit area, not a
    // hidden control. Seen on the live site: each episode's play link is
    // invisible over its thumbnail, and ignores the pointer, until the
    // thumbnail is hovered; activating it directly still works. Only
    // picture-sized ones count; small transparent controls stay hidden.
    const hitArea = el.matches('a[href], button, [role="button"], [role="link"]');
    if (!hitArea || r.width < 48 || r.height < 48) return false;
  }
  if (deepClosest(el, '[aria-hidden="true"], [inert]')) return false;
  // Opacity is not inherited in the computed style, but a transparent ancestor
  // hides everything in it. Seen on the live site: the slides of a carousel
  // are stacked in one place and all but one sit in a fully transparent wrapper.
  const walked: Element[] = [];
  let hidden = false;
  let node = composedParent(el);
  for (let i = 0; node && (faded || i < 12); i++, node = composedParent(node)) {
    const known = faded?.get(node);
    if (known !== undefined) {
      hidden = known;
      break;
    }
    walked.push(node);
    const around = view.getComputedStyle(node);
    if (around.opacity === '0' || collapsed(node, around)) {
      hidden = true;
      break;
    }
  }
  // Everything walked lies under where the search ended, so it shares the answer.
  if (faded) for (const n of walked) faded.set(n, hidden);
  return !hidden;
}

/**
 * True for a box closed up to nothing that cuts off what is in it: its
 * contents keep their sizes and places but none of them shows. (Seen on a
 * music site: the player's bar is shut to no height until something plays,
 * and Down went to a button in it that nobody could see.)
 */
function collapsed(node: Element, style: CSSStyleDeclaration): boolean {
  const cuts = (o: string): boolean => o === 'hidden' || o === 'clip';
  if (!cuts(style.overflowY) && !cuts(style.overflowX)) return false;
  if (style.display === 'contents' || style.display.startsWith('inline')) return false;
  const box = node.getBoundingClientRect();
  return (cuts(style.overflowY) && box.height < 1) || (cuts(style.overflowX) && box.width < 1);
}

/**
 * The sideways-scrolling strip an element sits in, if any: the nearest
 * ancestor that is wider inside than outside and clips or scrolls. Plain
 * grids have none and keep purely geometric movement.
 */
/**
 * The carousel arrow to press when sideways movement runs out: a match for
 * `selectors` in the nearest ancestor of `from` that has one. That ancestor
 * must be no taller than the viewport, so a press in one strip never turns
 * another strip. The arrow only needs to be laid out: on the live site the
 * arrows are transparent until the pointer hovers, and still work.
 */
export function edgeControl(from: Element, selectors: readonly string[], view: Window): { control: Element; container: Element } | null {
  const maxHeight = view.innerHeight * 1.2;
  let node = from.parentElement;
  for (let i = 0; node && i < 14; i++, node = node.parentElement) {
    for (const sel of selectors) {
      try {
        for (const control of node.querySelectorAll(sel)) {
          const r = control.getBoundingClientRect();
          if (r.width < 4 || r.height < 4 || (control as HTMLButtonElement).disabled) continue;
          return node.getBoundingClientRect().height > maxHeight ? null : { control, container: node };
        }
      } catch {
        // A bad selector must never break navigation.
      }
    }
  }
  return null;
}

export function rowOf(el: Element, view: Window): Element | null {
  let node = composedParent(el);
  for (let i = 0; node && i < 8; i++, node = composedParent(node)) {
    // A strip, not a page: on the live site a page-sized container also
    // clips sideways, and taking it for a row sent focus to the top of the page.
    if (node.clientHeight > view.innerHeight * 0.9) return null;
    if (node.scrollWidth > node.clientWidth + 8 && view.getComputedStyle(node).overflowX !== 'visible') return node;
  }
  return null;
}

/** How far a pane must still be able to scroll for a key to scroll it and not leave it. */
const PANE_ROOM = 8;

/**
 * The nearest pane around `el` that scrolls up and down by itself (not the
 * page) and has more to show in `dir`. Null when there is none.
 */
export function paneWithMore(el: Element, doc: Document, view: Window, dir: 'up' | 'down'): Element | null {
  const page = doc.scrollingElement ?? doc.documentElement;
  for (let node = composedParent(el), i = 0; node && node !== page && node !== doc.body && node !== doc.documentElement && i < 40; node = composedParent(node), i++) {
    const room = dir === 'down' ? node.scrollHeight - node.clientHeight - node.scrollTop : node.scrollTop;
    if (room <= PANE_ROOM) continue;
    const overflow = view.getComputedStyle(node).overflowY;
    if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') return node;
  }
  return null;
}

/** The share of `el`'s box that shows inside `pane` and the screen, 0 to 1. */
export function shownIn(el: Element, pane: Element, view: Window): number {
  const r = el.getBoundingClientRect();
  const p = pane.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return 0;
  const w = Math.min(r.right, p.right, view.innerWidth) - Math.max(r.left, p.left, 0);
  const h = Math.min(r.bottom, p.bottom, view.innerHeight) - Math.max(r.top, p.top, 0);
  return w <= 0 || h <= 0 ? 0 : (w * h) / (r.width * r.height);
}

/**
 * The pop-up the page has put in front of everything, if any: the last
 * laid-out modal dialog. While one is open, only its controls can be reached.
 */
export function openDialog(doc: Document): Element | null {
  let found: Element | null = null;
  for (const el of doc.querySelectorAll('[role="dialog"][aria-modal="true"], dialog[open]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const view = doc.defaultView;
    if (view && view.innerWidth > 0 && view.innerHeight > 0) {
      // Parked off the screen: not open, whatever it says. (Seen on a shop:
      // its side menu is built when its button gets the cursor, sits off the
      // left edge until asked for, and already calls itself a modal dialog.
      // Taken at its word, nothing on the page could be reached.)
      if (r.right <= 0 || r.bottom <= 0 || r.left >= view.innerWidth || r.top >= view.innerHeight) continue;
      // A small notice in a corner that calls itself modal does not keep the
      // page from being used, so it does not keep the highlight either.
      // (Seen on a mail site: a 420 by 300 notice at the bottom right.)
      const share = ((Math.min(r.right, view.innerWidth) - Math.max(r.left, 0)) * (Math.min(r.bottom, view.innerHeight) - Math.max(r.top, 0))) / (view.innerWidth * view.innerHeight);
      const overMiddle = r.left <= view.innerWidth / 2 && r.right >= view.innerWidth / 2 && r.top <= view.innerHeight / 2 && r.bottom >= view.innerHeight / 2;
      if (!overMiddle && share < 0.3) continue;
    }
    // It must really be in front. Seen on the live site: a station's pop-up
    // stays open underneath the player it started. Where the browser cannot
    // say what is on top (no layout), the dialog is taken at its word.
    const top = typeof doc.elementFromPoint === 'function' ? doc.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2) : null;
    if (top && !el.contains(top) && !top.contains(el)) continue;
    found = el;
  }
  return found;
}

/**
 * A layer fixed over the whole screen that takes the pointer everywhere, with
 * something in it to press: a gate or a notice the page has put in front of
 * itself without saying so in its markup. (Seen on a site for adults: its
 * age question is such a layer over a page that is locked from scrolling,
 * and the highlight wandered among the links hidden behind it.) A web app
 * whose whole page lives in one fixed box is also this, and loses nothing.
 *
 * It only says where the highlight may go. Back is not turned into the
 * page's "close" key for it, as it is for a real dialog: Back at a gate has
 * to leave the site.
 */
export function coveringLayer(doc: Document): Element | null {
  const view = doc.defaultView;
  if (!view || typeof doc.elementFromPoint !== 'function' || view.innerWidth < 1 || view.innerHeight < 1) return null;
  let layer: Element | null = null;
  for (const [x, y] of [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]] as const) {
    let over: Element | null = null;
    for (let node = doc.elementFromPoint(view.innerWidth * x, view.innerHeight * y), i = 0; node && node !== doc.body && node !== doc.documentElement && i < 60; node = composedParent(node), i++) {
      if (view.getComputedStyle(node).position !== 'fixed') continue;
      const r = node.getBoundingClientRect();
      if (r.left <= 2 && r.top <= 2 && r.right >= view.innerWidth - 2 && r.bottom >= view.innerHeight - 2) over = node;
    }
    if (!over || (layer && over !== layer)) return null;
    layer = over;
  }
  return layer?.querySelector('a[href], button, input, select, textarea, [role="button"], [role="link"], [tabindex]') ? layer : null;
}

/**
 * True for controls in a bar that stays put while the page scrolls (a fixed
 * or sticky header, a pinned tab strip). `cache` avoids restyling shared ancestors.
 */
export function isPinned(el: Element, view: Window, cache: Map<Element, boolean> = new Map()): boolean {
  const path: Element[] = [];
  let pinned = false;
  for (let node: Element | null = el; node && node !== el.ownerDocument.body; node = composedParent(node)) {
    const known = cache.get(node);
    if (known !== undefined) {
      pinned = known;
      break;
    }
    path.push(node);
    const position = view.getComputedStyle(node).position;
    if (position === 'fixed' || position === 'sticky') {
      pinned = true;
      break;
    }
  }
  for (const node of path) cache.set(node, pinned);
  return pinned;
}

/** False for an element the page has put away: no box, or not displayed. */
function isLaidOut(el: Element, view: Window): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const style = view.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

/** False for something parked far outside the page, a common way to hide a real input. */
export function onScreenish(el: Element, view: Window): boolean {
  const r = el.getBoundingClientRect();
  return r.right > -2000 && r.left < view.innerWidth + 2000;
}

/**
 * True for something that no scrolling can bring into view.
 *
 * Parked above the top of the page: a "skip to content" link that shows
 * itself only when Tab reaches it. (Seen on a video site: Up at the top went
 * to one, it came into view beside the search field, and Up never ran out.)
 *
 * Off the screen inside something fixed to the screen: a banner taller than
 * the screen, whose lower links are cut off. (Seen on an encyclopedia's front
 * page: Down at the foot of the page went to one, could not show it, and
 * started again from the top of the screen, round and round.)
 *
 * Something scrolled out of a list of its own is neither.
 */
function outOfReach(el: Element, view: Window): boolean {
  const r = el.getBoundingClientRect();
  const above = r.bottom + view.scrollY <= 0;
  const off = r.bottom <= 0 || r.top >= view.innerHeight || r.right <= 0 || r.left >= view.innerWidth;
  if (!off) return false;
  for (let node = composedParent(el), i = 0; node && i < 40; node = composedParent(node), i++) {
    if (node.scrollTop > 0 || node.scrollLeft > 0) return false;
    const style = view.getComputedStyle(node);
    const scrolls = (style.overflowY !== 'visible' && node.scrollHeight > node.clientHeight + 1) || (style.overflowX !== 'visible' && node.scrollWidth > node.clientWidth + 1);
    if (scrolls && node !== el.ownerDocument.documentElement && node !== el.ownerDocument.body) return false;
    if (style.position === 'fixed') return true;
  }
  return above;
}

/** True when `el` lies wholly outside the box of something that clips it, along the way pressed, and `from` is not inside that same thing. */
function clippedAwayFrom(el: Element, from: Element, view: Window, vertical: boolean): boolean {
  const r = el.getBoundingClientRect();
  for (let node = composedParent(el), i = 0; node && i < 40; node = composedParent(node), i++) {
    if (deepContains(node, from)) return false;
    const style = view.getComputedStyle(node);
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
    const box = node.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;
    // Along the way pressed only: a row scrolled sideways is still entered from above, at what it shows.
    if (vertical ? r.bottom <= box.top || r.top >= box.bottom : r.right <= box.left || r.left >= box.right) return true;
  }
  return false;
}

/** True when `outer` wholly contains `inner` and is at least four times its area. */
function covers(outer: Rect, inner: Rect): boolean {
  if (inner.left < outer.left || inner.right > outer.right || inner.top < outer.top || inner.bottom > outer.bottom) return false;
  const area = (r: Rect): number => (r.right - r.left) * (r.bottom - r.top);
  return area(outer) >= 4 * area(inner);
}

/**
 * A link over this share of the screen, with a control on top of it, is a
 * backdrop. A large card is not: seen on a search engine, a news card a
 * fifth of the screen with one small menu button on it.
 */
const BACKDROP_SHARE = 0.4;

function toRect(el: Element): Rect {
  return boxOf(el);
}

/**
 * True when something the size of the screen has come up in front of `el`
 * (a player opening over the page, say): what the user selected is no longer
 * what they are looking at.
 */
export function coveredByScreen(el: Element, view: Window): boolean {
  const r = el.getBoundingClientRect();
  const top = el.ownerDocument.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
  // For a control inside a shadow root the browser names its outermost host.
  if (!top || deepContains(el, top) || deepContains(top, el)) return false;
  for (let c: Element | null = top; c && !deepContains(c, el); c = composedParent(c)) {
    const b = c.getBoundingClientRect();
    if (b.width >= view.innerWidth * 0.9 && b.height >= view.innerHeight * 0.9) return true;
  }
  return false;
}

/**
 * Brings `el` into view inside the nearest list that scrolls by itself, when
 * that list has it out of sight. Only that list moves. Seen on Steamboat's service:
 * the player's subtitle menu is a list taller than its box, and entries past
 * the box could be focused but not seen.
 */
export function scrollWithinList(el: Element, view: Window): void {
  const body = el.ownerDocument.body;
  for (let node = composedParent(el), i = 0; node && node !== body && node !== el.ownerDocument.documentElement && i < 12; node = composedParent(node), i++) {
    if (node.scrollHeight <= node.clientHeight + 8) continue;
    const overflow = view.getComputedStyle(node).overflowY;
    if (overflow !== 'auto' && overflow !== 'scroll') continue;
    const box = node.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) node.scrollTop += (r.top + r.bottom) / 2 - (box.top + box.bottom) / 2;
    return;
  }
}

const FOOTER = 'footer, [role="contentinfo"]';

/** What a menu's entries are. */
export const MENU_ENTRY = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="radio"]';

/** How far past the screen's edge a target may be, in screens, and still be jumped to while reading. */
export const READING_REACH = 0.35;

/** Moves closer together than this are a held key (or a very quick thumb). */
const RAPID_MS = 220;

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
  private lookWaiting = false;
  /** When the last move was made, to tell a held key from single presses. */
  private lastMoveAt = 0;
  private rapid = false;

  constructor(
    private readonly doc: Document,
    private readonly opts: NavigatorOptions = {},
  ) {}

  get focused(): Element | null {
    if (this.current && !this.current.isConnected) this.current = null;
    return this.current;
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
    if (this.opts.looksClickable) found.push(...this.handCursorTargets(scope ?? this.doc, near ? { above, below } : null));
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
      const size = el.getBoundingClientRect();
      if (Math.min(size.width, size.height) < 10) continue;
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
        if (r.width >= 4 && r.height >= 4 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0') seen.add(label);
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
      const mine = rects[i]!;
      const onTop = rects.filter((other, j) => j !== i && covers(mine, other)).length;
      if (onTop === 0) return true;
      return onTop < 2 && (mine.right - mine.left) * (mine.bottom - mine.top) < screen * BACKDROP_SHARE;
    });
    // One target per spot: when several controls occupy the same box (a card's
    // link and a transparent button over it), keep the one that can be seen,
    // and a link before anything else.
    const bySpot = new Map<string, Element>();
    const rank = (el: Element): number => (view.getComputedStyle(el).opacity === '0' ? 0 : 2) + (el.matches('a[href]') ? 1 : 0);
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
      this.lookWaiting = false;
      this.lookForHands();
    };
    if (typeof view.requestIdleCallback === 'function') view.requestIdleCallback(run, { timeout: 400 });
    else view.setTimeout(run, 120);
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

  move(dir: Direction): boolean {
    // Measured from the end of the last move: on a long page a move takes
    // time itself, and that must not make a held key look like single presses.
    this.rapid = Date.now() - this.lastMoveAt < RAPID_MS;
    // First among what is near the screen, which is quick; the whole page
    // only when nothing near lies that way.
    const moved = this.step(dir, this.candidates(true)) ?? this.step(dir, this.candidates()) ?? false;
    this.lastMoveAt = Date.now();
    return moved;
  }

  /** One attempt at a move among `all`. Null when nothing lies in that direction. */
  private step(dir: Direction, all: Element[]): boolean | null {
    const view = this.doc.defaultView;
    // What had focus may have been put away without being removed (an entry
    // of a menu that has closed). It is then nowhere, and moving "from" it
    // lands somewhere arbitrary; carry on as if nothing had focus.
    const held = this.focused;
    if (held && view && !isLaidOut(held, view)) this.clear();
    const from = this.focused;
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
      const whole = others.filter((_, i) => !covers(rects[i]!, mine) && !covers(mine, rects[i]!) && !rects.some((outer, j) => j !== i && covers(outer, rects[i]!)));
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
    if (i === -1) return null;
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
    // A pane that scrolls by itself is not left by the key that scrolls it
    // while it has more to show that way: the pane moves on and the
    // highlight takes up what comes into view. (Seen on a film service and a
    // music one: a notice lay under the pane, Down from the last card in
    // view went to the notice, and the rest of the pane was never reached.)
    if (target && view && (dir === 'up' || dir === 'down')) {
      const pane = paneWithMore(from, this.doc, view, dir);
      if (pane && !deepContains(pane, target)) {
        pane.scrollBy({ top: (dir === 'down' ? 0.8 : -0.8) * pane.clientHeight, behavior: 'instant' });
        const inside = this.candidates(true).filter((el) => el !== from && deepContains(pane, el) && shownIn(el, pane, view) >= 0.99);
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
    if (target && view && (this.rapid || this.opts.readingScroll) && (dir === 'up' || dir === 'down')) {
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
    const pane = within && within !== this.doc.scrollingElement && within !== this.doc.documentElement && within !== this.doc.body ? within : null;
    const inPane = this.candidates(true).filter((el) => (!pane || deepContains(pane, el)) && !isPinned(el, view, cache));
    let onScreen = inPane.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= view.innerHeight && r.left >= 0 && r.right <= view.innerWidth && (!pane || shownIn(el, pane, view) >= 0.99);
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
      // ours would hear them again. The highlight rests on it; the keys stay here.
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
    if (how.scroll === false) {
      // Already where the person is looking; the page stays put.
    } else if (view && bottom <= view.innerHeight) {
      // Only this: a second scroll request would replace it and stop short of the top.
      view.scrollTo({ top: 0, behavior: this.rapid ? 'instant' : 'smooth' });
      scrollWithinList(el, view);
    } else {
      // With a key held, a smooth scroll is restarted by every repeat and never arrives.
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: this.rapid ? 'instant' : 'smooth' });
    }
    this.opts.onFocusChange?.(el);
    return true;
  }

  activate(): boolean {
    const el = this.focused;
    if (!el) return false;
    press(el);
    return true;
  }

  clear(): void {
    this.current?.removeAttribute(FOCUS_ATTR);
    this.zoomed?.removeAttribute(ZOOM_ATTR);
    this.zoomed = null;
    this.current = null;
    this.opts.onFocusChange?.(null);
  }
}
