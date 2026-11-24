// Whether an element can be seen and reached: drawn at all, on the screen,
// cut off by something that clips it, or pinned to the window. The navigator
// asks these of every candidate, so the costly ones take a cache.
import { isLongSlider } from './controls';
import { composedParent, deepClosest, deepContains } from './deep';

/**
 * True when `el` is drawn where someone could see it or, for a transparent
 * link over a picture, press it.
 *
 * `faded` remembers, for one pass over many controls, whether each ancestor
 * is transparent or sits inside something that is: siblings share almost all
 * of their ancestors, and asking for each one's style again is most of the
 * cost of a move on a long page. With it the search goes all the way up;
 * without it, twelve levels.
 */
export function isVisible(el: Element, view: Window, faded?: Map<Element, boolean>): boolean {
  const r = el.getBoundingClientRect();
  // A slider's track is the one thing drawn thinner than that and still meant to be used.
  if ((r.width < 4 || r.height < 4) && !isLongSlider(el)) return false;
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
    // Not one put behind the page as well: that is a link kept out of sight
    // until a keyboard's Tab reaches it ("skip to main content"), not
    // something laid over a picture. (Seen on a sports network's site.)
    if (Number(style.zIndex) < 0) return false;
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
  // Not the page itself: clipping set on the body or the root is the
  // window's, and a body with nothing in the flow is no height at all while
  // everything pinned inside it shows. (Seen in a player made for a frame:
  // the body clipped, the player pinned to the window, and every control of
  // it taken for hidden.)
  const page = node.ownerDocument;
  if (node === page.body || node === page.documentElement) return false;
  const cuts = (o: string): boolean => o === 'hidden' || o === 'clip';
  if (!cuts(style.overflowY) && !cuts(style.overflowX)) return false;
  if (style.display === 'contents' || style.display.startsWith('inline')) return false;
  const box = node.getBoundingClientRect();
  return (cuts(style.overflowY) && box.height < 1) || (cuts(style.overflowX) && box.width < 1);
}

/** True when some of `el` shows on the screen. */
export function isOnScreen(el: Element, view: Window): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < view.innerHeight && r.right > 0 && r.left < view.innerWidth;
}

/** False for an element the page has put away: no box, or not displayed. */
export function isLaidOut(el: Element, view: Window): boolean {
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
export function outOfReach(el: Element, view: Window): boolean {
  const r = el.getBoundingClientRect();
  const above = r.bottom + view.scrollY <= 0;
  const off = r.bottom <= 0 || r.top >= view.innerHeight || r.right <= 0 || r.left >= view.innerWidth;
  if (!off) return false;
  for (let node = composedParent(el), i = 0; node && i < 40; node = composedParent(node), i++) {
    if (node.scrollTop > 0 || node.scrollLeft > 0) return false;
    const style = view.getComputedStyle(node);
    const scrolls =
      (style.overflowY !== 'visible' && node.scrollHeight > node.clientHeight + 1) ||
      (style.overflowX !== 'visible' && node.scrollWidth > node.clientWidth + 1);
    if (scrolls && node !== el.ownerDocument.documentElement && node !== el.ownerDocument.body) return false;
    if (style.position === 'fixed') return true;
  }
  return above;
}

/** True when `el` lies wholly outside the box of something that clips it, along the way pressed, and `from` is not inside that same thing. */
export function clippedAwayFrom(el: Element, from: Element, view: Window, vertical: boolean): boolean {
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

/** True when `el` sits in something pinned to the window that is at least three fifths of its width: a notice bar, not a corner panel. */
export function acrossTheWindow(el: Element, view: Window): boolean {
  for (let node: Element | null = el; node && node !== el.ownerDocument.body; node = composedParent(node)) {
    const position = view.getComputedStyle(node).position;
    if (position !== 'fixed' && position !== 'sticky') continue;
    if (node.getBoundingClientRect().width >= view.innerWidth * 0.6) return true;
  }
  return false;
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
