// The things on a page that scroll by themselves: a row that scrolls
// sideways and its arrows, a pane or list that scrolls up and down, and the
// page when it has turned its own scrolling off.
import { composedParent } from './deep';

/**
 * The sideways-scrolling strip an element sits in, if any: the nearest
 * ancestor that is wider inside than outside and clips or scrolls. Plain
 * grids have none and keep purely geometric movement.
 */
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

/**
 * The carousel arrow to press when sideways movement runs out: a match for
 * `selectors` in the nearest ancestor of `from` that has one. That ancestor
 * must be no taller than the viewport, so a press in one strip never turns
 * another strip. The arrow only needs to be laid out: on the live site the
 * arrows are transparent until the pointer hovers, and still work.
 */
export function edgeControl(
  from: Element,
  selectors: readonly string[],
  view: Window,
): { control: Element; container: Element } | null {
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

/** How far a pane must still be able to scroll for a key to scroll it and not leave it. */
const PANE_ROOM = 8;

/**
 * The nearest pane around `el` that scrolls up and down by itself (not the
 * page) and has more to show in `dir`. Null when there is none.
 */
export function paneWithMore(el: Element, doc: Document, view: Window, dir: 'up' | 'down'): Element | null {
  const page = doc.scrollingElement ?? doc.documentElement;
  for (
    let node = composedParent(el), i = 0;
    node && node !== page && node !== doc.body && node !== doc.documentElement && i < 40;
    node = composedParent(node), i++
  ) {
    const room = dir === 'down' ? node.scrollHeight - node.clientHeight - node.scrollTop : node.scrollTop;
    if (room <= PANE_ROOM) continue;
    const overflow = view.getComputedStyle(node).overflowY;
    if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') return node;
  }
  return null;
}

/**
 * Brings `el` into view inside the nearest list that scrolls by itself, when
 * that list has it out of sight. Only that list moves. Seen on Steamboat's service:
 * the player's subtitle menu is a list taller than its box, and entries past
 * the box could be focused but not seen.
 */
export function scrollWithinList(el: Element, view: Window): void {
  const body = el.ownerDocument.body;
  for (
    let node = composedParent(el), i = 0;
    node && node !== body && node !== el.ownerDocument.documentElement && i < 12;
    node = composedParent(node), i++
  ) {
    if (node.scrollHeight <= node.clientHeight + 8) continue;
    const overflow = view.getComputedStyle(node).overflowY;
    if (overflow !== 'auto' && overflow !== 'scroll') continue;
    const box = node.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) node.scrollTop += (r.top + r.bottom) / 2 - (box.top + box.bottom) / 2;
    return;
  }
}

/** False when the page has turned the window's own scrolling off (an app of panes, a page behind a prompt). */
export function pageScrolls(doc: Document, view: Window): boolean {
  const root = view.getComputedStyle(doc.documentElement).overflowY;
  const used = root && root !== 'visible' ? root : doc.body ? view.getComputedStyle(doc.body).overflowY : root;
  return used !== 'hidden' && used !== 'clip';
}
