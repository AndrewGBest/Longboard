// Scrolling for pages where there is nothing to move the highlight to: a
// long article, or the stretch between two links. The page is scrolled by
// most of a screen, the way Page Down would, and never past its end.
import type { Direction } from '../../shared/actions';
import { composedParent } from '../spatial/deep';

/** Share of the visible height (or width) moved by one press, so a line or two stays as context. */
export const SCROLL_SHARE = 0.8;

type Axis = 'x' | 'y';
const axisOf = (dir: Direction): Axis => (dir === 'up' || dir === 'down' ? 'y' : 'x');
const forward = (dir: Direction): boolean => dir === 'down' || dir === 'right';

/** How far `el` can still scroll in `dir`, in pixels. */
function room(el: Element, dir: Direction): number {
  if (axisOf(dir) === 'y') return forward(dir) ? el.scrollHeight - el.clientHeight - el.scrollTop : el.scrollTop;
  return forward(dir) ? el.scrollWidth - el.clientWidth - el.scrollLeft : el.scrollLeft;
}

function scrollsItself(el: Element, view: Window, axis: Axis): boolean {
  const style = view.getComputedStyle(el);
  const overflow = axis === 'y' ? style.overflowY : style.overflowX;
  return overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay';
}

/**
 * What to scroll for a press of `dir`: the nearest thing around `from` that
 * scrolls that way and has room left, ending with the page itself. Without
 * `from`, the search starts from whatever is in the middle of the screen, so
 * a web app whose content lives in one scrolling pane still scrolls.
 * Null when nothing can scroll that way. With `within` (a layer laid over
 * the page), only something inside it is scrolled: never the page behind.
 */
export function scrollerFor(
  doc: Document,
  from: Element | null,
  dir: Direction,
  within: Element | null = null,
): Element | null {
  const view = doc.defaultView;
  if (!view) return null;
  const page = doc.scrollingElement ?? doc.documentElement;
  const start =
    from ??
    (typeof doc.elementFromPoint === 'function'
      ? doc.elementFromPoint(view.innerWidth / 2, view.innerHeight / 2)
      : null);
  for (
    let node = start, i = 0;
    node && node !== page && node !== doc.body && i < 40;
    node = composedParent(node), i++
  ) {
    if (room(node, dir) > 1 && scrollsItself(node, view, axisOf(dir)) && (!within || within.contains(node)))
      return node;
  }
  if (within) return null;
  return room(page, dir) > 1 ? page : null;
}

/**
 * Scrolls by most of a screen in `dir`: what `from` sits in, or failing that
 * whatever is in the middle of the screen (the highlight may be on a bar
 * while the pane beside it is what has more to show). Returns what was
 * scrolled, or null when there was nowhere to scroll.
 */
export function scrollBy(
  doc: Document,
  from: Element | null,
  dir: Direction,
  instant: boolean,
  within: Element | null = null,
): Element | null {
  const target = scrollerFor(doc, from, dir, within) ?? (from ? scrollerFor(doc, null, dir, within) : null);
  if (!target) return null;
  const vertical = axisOf(dir) === 'y';
  const amount = (forward(dir) ? 1 : -1) * SCROLL_SHARE * (vertical ? target.clientHeight : target.clientWidth);
  target.scrollBy({
    top: vertical ? amount : 0,
    left: vertical ? 0 : amount,
    behavior: instant ? 'instant' : 'smooth',
  });
  return target;
}
