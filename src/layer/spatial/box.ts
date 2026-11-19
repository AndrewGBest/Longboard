// The box a control is seen to occupy.
import type { Rect } from './geometry';

/** How deep into a link's contents the look goes. */
const DEPTH = 4;

/**
 * The box of a control as a person sees it. For most that is its own
 * rectangle. A link laid out as running text is different: the browser
 * reports the line of text it would have made, which is shorter than the
 * blocks set inside it. Seen on a search engine's results: each result's
 * link holds the site's name and the title as two blocks, and the box
 * reported cut through both. So an inline control's box also takes in what
 * it holds, except things placed elsewhere on the page (an arrow pinned to
 * the far end of the row).
 */
export function boxOf(el: Element, view: Window | null = el.ownerDocument.defaultView): Rect {
  const r = el.getBoundingClientRect();
  const box: Rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  if (!view || view.getComputedStyle(el).display !== 'inline') return box;
  const take = (parent: Element, depth: number): void => {
    for (const child of parent.children) {
      const style = view.getComputedStyle(child);
      if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'absolute' || style.position === 'fixed') continue;
      const c = child.getBoundingClientRect();
      if (c.width > 0 && c.height > 0) {
        box.left = Math.min(box.left, c.left);
        box.top = Math.min(box.top, c.top);
        box.right = Math.max(box.right, c.right);
        box.bottom = Math.max(box.bottom, c.bottom);
      }
      // A block's own box already holds what is in it; only running text needs looking into.
      if (style.display === 'inline' && depth < DEPTH) take(child, depth + 1);
    }
  };
  take(el, 1);
  return box;
}
