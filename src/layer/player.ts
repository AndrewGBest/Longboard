// Finds the site's player. Observation only: nothing here controls the video
// element or touches the media pipeline or DRM. Control is sent as ordinary
// key presses (see shared/player-keys.ts).

function largestVideo(scope: ParentNode, skipMuted: boolean): { video: HTMLVideoElement; area: number } | null {
  let best: HTMLVideoElement | null = null;
  let bestArea = 0;
  for (const v of scope.querySelectorAll('video')) {
    // Background trailers on browse and title pages start muted; the player does not.
    if (skipMuted && v.muted) continue;
    const r = v.getBoundingClientRect();
    const area = r.width * r.height;
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

/** A slider at least half as wide as the screen: the player's progress bar, not a volume control. */
export function isSeekBar(el: Element, view: Window): boolean {
  const slider = el.getAttribute('role') === 'slider' || (el instanceof HTMLInputElement && el.type === 'range');
  return slider && el.getBoundingClientRect().width >= view.innerWidth / 2;
}
