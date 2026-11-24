// What a page puts in front of itself: a modal dialog, an unmarked layer
// over the whole screen, a notice pinned to an edge, a menu's entries. A
// dialog or a covering layer holds the highlight; a pinned notice does not.
import { composedParent, deepContains } from './deep';
import { isPinned, isVisible } from './visibility';

/** What a menu's entries are. */
export const MENU_ENTRY =
  '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="radio"]';

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
      const share =
        ((Math.min(r.right, view.innerWidth) - Math.max(r.left, 0)) *
          (Math.min(r.bottom, view.innerHeight) - Math.max(r.top, 0))) /
        (view.innerWidth * view.innerHeight);
      const overMiddle =
        r.left <= view.innerWidth / 2 &&
        r.right >= view.innerWidth / 2 &&
        r.top <= view.innerHeight / 2 &&
        r.bottom >= view.innerHeight / 2;
      if (!overMiddle && share < 0.3) continue;
    }
    // It must really be in front. Seen on the live site: a station's pop-up
    // stays open underneath the player it started. Where the browser cannot
    // say what is on top (no layout), the dialog is taken at its word.
    const top =
      typeof doc.elementFromPoint === 'function'
        ? doc.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)
        : null;
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
  for (const [x, y] of [
    [0.5, 0.5],
    [0.2, 0.2],
    [0.8, 0.2],
    [0.2, 0.8],
    [0.8, 0.8],
  ] as const) {
    let over: Element | null = null;
    for (
      let node = doc.elementFromPoint(view.innerWidth * x, view.innerHeight * y), i = 0;
      node && node !== doc.body && node !== doc.documentElement && i < 60;
      node = composedParent(node), i++
    ) {
      if (view.getComputedStyle(node).position !== 'fixed') continue;
      const r = node.getBoundingClientRect();
      if (r.left <= 2 && r.top <= 2 && r.right >= view.innerWidth - 2 && r.bottom >= view.innerHeight - 2) over = node;
    }
    if (!over || (layer && over !== layer)) return null;
    layer = over;
  }
  return layer?.querySelector('a[href], button, input, select, textarea, [role="button"], [role="link"], [tabindex]')
    ? layer
    : null;
}

/**
 * Notices on screen that call themselves dialogs and are pinned to it: a
 * cookie notice across the bottom, a sign-up prompt in a corner. Not what
 * `openDialog` or `coveringLayer` answer for; those hold the highlight.
 */
export function pinnedNotices(doc: Document, view: Window): Element[] {
  const out: Element[] = [];
  for (const el of doc.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= view.innerWidth || r.top >= view.innerHeight) continue;
    if (!isPinned(el, view) || !isVisible(el, view)) continue;
    out.push(el);
  }
  return out;
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
