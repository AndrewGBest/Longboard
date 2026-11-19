// Pure geometry for directional focus. No DOM here so it can be tested exhaustively.
import type { Direction } from '../../shared/actions';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function center(r: Rect): { x: number; y: number } {
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}

/** How far `to` lies beyond `from` along `dir`. Zero or less means it is not in that direction. */
function advance(from: Rect, to: Rect, dir: Direction): number {
  const a = center(from);
  const b = center(to);
  switch (dir) {
    case 'left':
      return a.x - b.x;
    case 'right':
      return b.x - a.x;
    case 'up':
      return a.y - b.y;
    case 'down':
      return b.y - a.y;
  }
}

/** Gap between the two rects on the axis perpendicular to `dir`. Zero when they overlap on it. */
function crossGap(from: Rect, to: Rect, dir: Direction): number {
  if (dir === 'left' || dir === 'right') {
    if (to.bottom < from.top) return from.top - to.bottom;
    if (to.top > from.bottom) return to.top - from.bottom;
    return 0;
  }
  if (to.right < from.left) return from.left - to.right;
  if (to.left > from.right) return to.left - from.right;
  return 0;
}

/** Bias added to every off-axis candidate so that any aligned one always wins. */
const OFF_AXIS = 1e7;
/** How far sideways a row in between may be and still be stopped at. */
const NEAR_SIDE = 300;
/** Candidates whose near edges are within this many pixels start level. */
const LEVEL = 8;
/** Share of the smaller element that must overlap before two rects count as aligned. */
const MIN_OVERLAP = 0.25;

/** True when the rects share enough of the axis perpendicular to `dir` to be in one row or column. */
export function aligned(from: Rect, to: Rect, dir: Direction): boolean {
  const horizontal = dir === 'left' || dir === 'right';
  const a0 = horizontal ? from.top : from.left;
  const a1 = horizontal ? from.bottom : from.right;
  const b0 = horizontal ? to.top : to.left;
  const b1 = horizontal ? to.bottom : to.right;
  const overlap = Math.min(a1, b1) - Math.max(a0, b0);
  const smaller = Math.min(a1 - a0, b1 - b0);
  return smaller > 0 && overlap >= smaller * MIN_OVERLAP;
}

/**
 * Lower is better, null means "not a candidate". A candidate that shares the
 * origin's row (for left/right) or column (for up/down) always beats one that
 * does not, however near the other is.
 *
 * Left and right never leave the row: on a TV, pressing right at the end of a
 * row does nothing. Up and down may fall back to an off-axis candidate, because
 * neighbouring rows often start and end at different places.
 */
export function score(from: Rect, to: Rect, dir: Direction): number | null {
  const along = advance(from, to, dir);
  if (along <= 1) return null;
  if (dir === 'left' || dir === 'right') return aligned(from, to, dir) ? along : null;
  // Up and down are measured to the near edge of the candidate, not to its
  // middle: what starts first is next. By the middle, a small control lying
  // beside the top of a larger one was "nearer" than the larger one (seen on
  // a search engine: a result's small menu button, and a short news card
  // beside a tall one).
  // What lies within the origin's own height is beside it, not above or
  // below it. (Seen on a video site: a button and the search field next to
  // it in the top bar were each "up" from the other, without end.)
  // "Below" starts lower and ends lower; "above" starts higher and ends higher.
  const beside = dir === 'down' ? to.top <= from.top + 1 || to.bottom <= from.bottom + 1 : to.bottom >= from.bottom - 1 || to.top >= from.top - 1;
  if (aligned(from, to, dir) && beside) return null;
  if (aligned(from, to, dir)) return Math.max(dir === 'down' ? to.top - from.top : from.bottom - to.bottom, 0);
  // Off-axis fallback for up/down. The candidate must sit wholly beyond the
  // origin's edge, so something merely further along the same row is not "below".
  const beyond = dir === 'down' ? to.top >= from.bottom - 2 : to.bottom <= from.top + 2;
  if (!beyond) return null;
  // Nearest row first, then nearest sideways within that row.
  return OFF_AXIS + along * 4 + crossGap(from, to, dir);
}

/** Index of the best candidate in `dir`, or -1 when there is nowhere to go. */
export function pickNext(from: Rect, candidates: readonly Rect[], dir: Direction): number {
  let best = -1;
  let bestScore = Infinity;
  const scores = candidates.map((c) => score(from, c, dir));
  scores.forEach((s, i) => {
    if (s !== null && s < bestScore) {
      bestScore = s;
      best = i;
    }
  });
  // Up and down: of the aligned candidates that start level with the best
  // one, the left-most, as in reading.
  if (best !== -1 && bestScore < OFF_AXIS && (dir === 'up' || dir === 'down')) {
    scores.forEach((s, i) => {
      if (s !== null && s <= bestScore + LEVEL && candidates[i]!.left < candidates[best]!.left - 1) best = i;
    });
  }
  // A row lying wholly between here and the aligned candidate is not passed
  // over because nothing in it is in line: from a narrow control, short
  // links at the start of the rows below were skipped for a wide one further
  // down. Only when it is near sideways, so the highlight does not fly
  // across the screen.
  if (best !== -1 && bestScore < OFF_AXIS && (dir === 'up' || dir === 'down')) {
    const far = candidates[best]!;
    // Of what lies in between, the one that starts first; of those that
    // start level, the left-most. (By the middle, a result's small menu
    // button was taken before the result.)
    const lead = (c: Rect): number => (dir === 'down' ? c.top - from.bottom : from.top - c.bottom);
    let nearer = -1;
    scores.forEach((s, i) => {
      if (s === null || s < OFF_AXIS) return;
      const c = candidates[i]!;
      const between = dir === 'down' ? c.bottom <= far.top + 2 : c.top >= far.bottom - 2;
      if (!between || crossGap(from, c, dir) > NEAR_SIDE) return;
      const held = nearer === -1 ? null : candidates[nearer]!;
      if (!held || lead(c) < lead(held) - LEVEL || (Math.abs(lead(c) - lead(held)) <= LEVEL && c.left < held.left - 1)) nearer = i;
    });
    if (nearer !== -1) best = nearer;
  }
  return best;
}

/** First focus target when nothing is focused: the top-most, then left-most rect. */
export function pickInitial(candidates: readonly Rect[]): number {
  let best = -1;
  candidates.forEach((c, i) => {
    const b = best === -1 ? undefined : candidates[best];
    if (!b || c.top < b.top - 8 || (Math.abs(c.top - b.top) <= 8 && c.left < b.left)) best = i;
  });
  return best;
}
