// Questions about one control: whether it is a slider and which way it lies,
// whether it grows when the highlight lands on it, and how it is pressed.

/** A control with a value on a track: the page's own slider or the browser's. */
export function isSlider(el: Element): boolean {
  return el.getAttribute('role') === 'slider' || (el instanceof HTMLInputElement && el.type === 'range');
}

/** How long a slider's track must be to be worth landing on however thin it is drawn. */
export const LONG_SLIDER_PX = 100;

/** A slider with a real track: long one way, and at least a line the other. */
export function isLongSlider(el: Element): boolean {
  if (!isSlider(el)) return false;
  const r = el.getBoundingClientRect();
  return Math.max(r.width, r.height) >= LONG_SLIDER_PX && Math.min(r.width, r.height) >= 1;
}

/** A slider that lies across the screen: left and right are its own keys. */
export function isSidewaysSlider(el: Element): boolean {
  if (!isSlider(el)) return false;
  const r = el.getBoundingClientRect();
  return r.width > r.height;
}

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
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)
    return false;
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
    Math.abs(r.left - box.left) <= 6 &&
    Math.abs(r.top - box.top) <= 6 &&
    Math.abs(r.right - box.right) <= 6 &&
    Math.abs(r.bottom - box.bottom) <= 6;
  let target = el;
  for (
    let node = el.parentElement, i = 0;
    node && i < 6 && same(node.getBoundingClientRect());
    node = node.parentElement, i++
  ) {
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
  else
    el.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: el.ownerDocument.defaultView }),
    );
}
