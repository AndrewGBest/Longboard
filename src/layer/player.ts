// Finds the site's player. Observation only: nothing here controls the video
// element or touches the media pipeline or DRM. Control is sent as ordinary
// key presses (see shared/player-keys.ts).

/** The part of an element's box that lies inside the window, in square pixels. */
function shownArea(el: Element): number {
  const view = el.ownerDocument.defaultView;
  const r = el.getBoundingClientRect();
  if (!view) return r.width * r.height;
  const w = Math.min(r.right, view.innerWidth) - Math.max(r.left, 0);
  const h = Math.min(r.bottom, view.innerHeight) - Math.max(r.top, 0);
  return Math.max(0, w) * Math.max(0, h);
}

/**
 * The big video of a page that is longer than the screen: the largest
 * unmuted one whose whole box, on screen or scrolled away, is at least
 * `minShare` of the window. Null when there is none. For a page where the
 * player is one stop among others (a row of channels below it, the site's
 * tabs above), so that the arrows can come back to the picture.
 */
export function pageVideo(doc: Document, minShare = 0.5): HTMLVideoElement | null {
  const view = doc.defaultView;
  if (!view) return null;
  let best: HTMLVideoElement | null = null;
  let bestArea = 0;
  for (const v of doc.querySelectorAll('video')) {
    if (v.muted) continue;
    const r = v.getBoundingClientRect();
    const area = r.width * r.height;
    if (area > bestArea) {
      best = v;
      bestArea = area;
    }
  }
  return best && bestArea >= minShare * view.innerWidth * view.innerHeight ? best : null;
}

/**
 * True when a move up or down went from one side of a box to the other
 * without stopping in it: `from` and `to` are where the highlight was and
 * is, `box` is the picture's. All in the same coordinates.
 */
export function passedOver(from: { top: number; bottom: number }, to: { top: number; bottom: number }, box: { top: number; bottom: number }, dir: 'up' | 'down'): boolean {
  const slack = 4;
  return dir === 'up' ? from.top >= box.bottom - slack && to.bottom <= box.top + slack : from.bottom <= box.top + slack && to.top >= box.bottom - slack;
}

function largestVideo(scope: ParentNode, skipMuted: boolean): { video: HTMLVideoElement; area: number } | null {
  let best: HTMLVideoElement | null = null;
  let bestArea = 0;
  for (const v of scope.querySelectorAll('video')) {
    // Background trailers on browse and title pages start muted; the player does not.
    if (skipMuted && v.muted) continue;
    // What of it is on screen: a video the page has scrolled half away is
    // not "being watched" over the page that is now showing beside it.
    const area = shownArea(v);
    if (area > bestArea) {
      best = v;
      bestArea = area;
    }
  }
  return best ? { video: best, area: bestArea } : null;
}

/**
 * The video the user is watching, or null on a browse page.
 *
 * `playerRoots` are adapter selectors for the element the site's player lives
 * in. When any of them matches, only videos inside it count, which keeps a
 * full-width background trailer from being mistaken for the player. When none
 * matches (empty or stale adapter) the generic rule applies: the largest
 * unmuted video, if it covers at least `minShare` of the viewport.
 */
export function findMainVideo(doc: Document, playerRoots: readonly string[] = [], minShare = 0.5): HTMLVideoElement | null {
  const view = doc.defaultView;
  if (!view) return null;
  const viewport = view.innerWidth * view.innerHeight;
  if (viewport <= 0) return null;

  const roots: Element[] = [];
  for (const sel of playerRoots) {
    try {
      roots.push(...doc.querySelectorAll(sel));
    } catch {
      // A bad selector must never break playback detection.
    }
  }

  let found: { video: HTMLVideoElement; area: number } | null = null;
  if (roots.length > 0) {
    for (const root of roots) {
      const hit = largestVideo(root, false);
      if (hit && (!found || hit.area > found.area)) found = hit;
    }
  } else {
    found = largestVideo(doc, true);
  }
  if (!found) return null;
  // A video the page has put in full screen is being watched, whatever its box says.
  const full = doc.fullscreenElement;
  if (full && (full === found.video || full.contains(found.video))) return found.video;
  return found.area / viewport >= minShare ? found.video : null;
}

/**
 * How much of the screen a video must fill to count as "being watched" on a
 * site with no profile: all of it, near enough. A video that only takes up
 * most of a page still has a page around it that the arrows must reach.
 */
export const GENERIC_PLAYER_SHARE = 0.85;

export function isPlayerActive(doc: Document, playerRoots: readonly string[] = [], minShare = 0.5): boolean {
  const v = findMainVideo(doc, playerRoots, minShare);
  return !!v && (!v.paused || v.currentTime > 0) && v.readyState > 0;
}

/**
 * The element holding the player and its controls: the adapter's root when it
 * contains the video, otherwise the highest ancestor that is no bigger than
 * the viewport (the page behind a full-window player is taller or absent).
 */
export function playerScope(video: HTMLVideoElement, playerRoots: readonly string[] = []): Element {
  for (const sel of playerRoots) {
    try {
      const root = video.closest(sel);
      if (root) return root;
    } catch {
      // ignore a bad selector
    }
  }
  const view = video.ownerDocument.defaultView;
  const maxW = (view?.innerWidth ?? 0) + 2;
  const maxH = (view?.innerHeight ?? 0) + 2;
  // Never the page itself: a video placed straight in the body has no
  // player around it, and its "controls" would be everything on the page.
  const page = (el: Element | null): boolean => !el || el === video.ownerDocument.body || el === video.ownerDocument.documentElement;
  if (page(video.parentElement)) return video;
  let scope: Element = video.parentElement ?? video;
  for (let el = scope.parentElement; !page(el) && el; el = el.parentElement) {
    const r = el.getBoundingClientRect();
    if (r.width > maxW || r.height > maxH) break;
    scope = el;
  }
  return scope;
}

/**
 * True when the site's player is a page of its own: the address now is not
 * the address the user was browsing at when they started it. Such a player is
 * left the way any page is, by going back. (Seen on Steamboat's service: the player
 * lives at its own path and ignores Escape.) A player laid over the page it
 * was started from has the same address and is closed with the site's key.
 */
export function playerIsOwnPage(browseUrl: string | null, currentUrl: string): boolean {
  if (!browseUrl) return false;
  try {
    const a = new URL(browseUrl);
    const b = new URL(currentUrl);
    return a.origin !== b.origin || a.pathname !== b.pathname;
  } catch {
    return false;
  }
}

/**
 * The player's progress bar, not a volume control: a slider at least half as
 * wide as the screen. Many players draw the bar from plain boxes and never
 * say it is a slider (seen on an open-source player a video site embeds), so
 * inside a player a thin strip across most of the screen counts as well,
 * unless it is plainly something else.
 */
export function isSeekBar(el: Element, view: Window): boolean {
  const r = el.getBoundingClientRect();
  const slider = el.getAttribute('role') === 'slider' || (el instanceof HTMLInputElement && el.type === 'range');
  if (slider) return r.width >= view.innerWidth / 2;
  if (el.matches('a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"]')) return false;
  return r.width >= view.innerWidth * 0.6 && r.height > 0 && r.height <= 48;
}

/**
 * A full-picture hit area: something pressable laid over the whole player so
 * that a click anywhere on the picture plays or pauses. It is not a control
 * to land on (OK on the bare picture already plays and pauses), and a ring
 * round the whole screen says nothing.
 */
export function coversPicture(el: Element, view: Window): boolean {
  if (el instanceof HTMLMediaElement) return false;
  const r = el.getBoundingClientRect();
  return r.width >= view.innerWidth * 0.8 && r.height >= view.innerHeight * 0.7;
}

const PLAY_WORD = /^\s*(play|pause)\b/i;
const NOT_PLAY = /next|previous|speed|rate|list|episode|trailer|from|all/i;

/**
 * The control to land on when the controls are brought up from the bare
 * picture: the play button. By its name where the player gives one in
 * English; otherwise by where players put it, first in the lowest row of
 * buttons. Null when the lower part of the screen has no buttons.
 */
export function playControl(controls: readonly Element[], view: Window): Element | null {
  const low = controls.filter((el) => {
    if (el.getAttribute('role') === 'slider' || el instanceof HTMLInputElement) return false;
    const r = el.getBoundingClientRect();
    return (r.top + r.bottom) / 2 >= view.innerHeight * 0.6;
  });
  if (low.length === 0) return null;
  const named = low.find((el) => {
    const name = el.getAttribute('aria-label') ?? el.getAttribute('title') ?? '';
    return PLAY_WORD.test(name) && !NOT_PLAY.test(name);
  });
  if (named) return named;
  const mid = (el: Element): number => (el.getBoundingClientRect().top + el.getBoundingClientRect().bottom) / 2;
  const lowest = Math.max(...low.map(mid));
  const row = low.filter((el) => lowest - mid(el) <= 24);
  return row.reduce((a, b) => (b.getBoundingClientRect().left < a.getBoundingClientRect().left ? b : a));
}
