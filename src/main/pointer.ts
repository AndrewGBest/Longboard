// Pointer mode: where the on-screen pointer goes as directions are held.
// Pure (time and sizes are passed in), so the feel is unit-tested; the shell
// turns the result into ordinary mouse events.
import type { Direction } from '../shared/actions';

/** The size of the view the pointer moves in, in pixels. */
export interface Size {
  width: number;
  height: number;
}

/** Speeds are shares of the view's height per second, so the feel is the same on any screen. */
export const POINTER = {
  /** One tap moves this far: small enough to land on a link's text. */
  tap: 0.012,
  /** Speed as a direction starts being held. */
  slow: 0.22,
  /** Speed once it has been held for `rampMs`: the screen's height in about half a second. */
  fast: 1.9,
  rampMs: 900,
  /** How close to an edge counts as pushing against it, in pixels. */
  edge: 2,
} as const;

/** Pixels per second after a direction has been held for `heldMs`. Eases in, so short holds stay precise. */
export function pointerSpeed(heldMs: number, size: Size): number {
  const t = Math.min(1, Math.max(0, heldMs) / POINTER.rampMs);
  return (POINTER.slow + (POINTER.fast - POINTER.slow) * t * t) * size.height;
}

const UNIT: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Where the pointer ends up after one movement. */
export interface PointerStep {
  x: number;
  y: number;
  /** What the pointer could not move because it is against an edge: the page is scrolled by this instead. */
  scrollX: number;
  scrollY: number;
}

/** Moves `from` by (dx, dy), kept inside the view; what does not fit becomes scrolling. */
function travel(from: { x: number; y: number }, dx: number, dy: number, size: Size): PointerStep {
  const maxX = Math.max(0, size.width - 1);
  const maxY = Math.max(0, size.height - 1);
  const x = Math.min(maxX, Math.max(0, from.x + dx));
  const y = Math.min(maxY, Math.max(0, from.y + dy));
  return { x, y, scrollX: from.x + dx - x, scrollY: from.y + dy - y };
}

/** The first movement of a press: one small step, whatever happens next. */
export function pointerTap(from: { x: number; y: number }, dir: Direction, size: Size): PointerStep {
  const d = POINTER.tap * size.height;
  return travel(from, UNIT[dir].x * d, UNIT[dir].y * d, size);
}

/**
 * Movement over `dtMs` with `held` directions, each held since the time
 * given (milliseconds, same clock as `now`). Opposite directions cancel;
 * a diagonal is no faster than a straight line.
 */
export function pointerGlide(
  from: { x: number; y: number },
  held: ReadonlyMap<Direction, number>,
  now: number,
  dtMs: number,
  size: Size,
): PointerStep {
  let dx = 0;
  let dy = 0;
  let longest = 0;
  for (const [dir, since] of held) {
    dx += UNIT[dir].x;
    dy += UNIT[dir].y;
    longest = Math.max(longest, now - since);
  }
  const length = Math.hypot(dx, dy);
  if (length === 0 || !(dtMs > 0)) return { x: from.x, y: from.y, scrollX: 0, scrollY: 0 };
  // A long gap between ticks (the app was busy) must not fling the pointer.
  const distance = (pointerSpeed(longest, size) * Math.min(dtMs, 100)) / 1000;
  return travel(from, (dx / length) * distance, (dy / length) * distance, size);
}

/** Validates a point a layer asked to start pointer mode at (CSS pixels) and converts it to view pixels. Null when unusable. */
export function startPoint(
  request: { x?: unknown; y?: unknown },
  zoom: number,
  size: Size,
): { x: number; y: number } | null {
  if (typeof request.x !== 'number' || typeof request.y !== 'number') return null;
  if (!Number.isFinite(request.x) || !Number.isFinite(request.y) || !(zoom > 0)) return null;
  const x = Math.round(request.x * zoom);
  const y = Math.round(request.y * zoom);
  if (x < 0 || y < 0 || x >= size.width || y >= size.height) return null;
  return { x, y };
}

/** A key repeat later than this after the last one means the key was let go. */
export const REPEAT_GRACE_MS = 160;
/** A press is forgotten this long after its last key event; a repeat after that counts as a new press. */
export const KEY_FORGET_MS = 1200;

/**
 * Which directions are held, worked out from what actually arrives.
 *
 * A game controller reports what is held, so that is kept as it is. A
 * keyboard or remote is different: the shell takes the arrow keys before the
 * page sees them, and the browser then never reports the key being let go
 * (measured with real key events, 2026-11-18; docs/DECISIONS.md). What does
 * arrive is the key repeating while it is held. So the first press is one
 * small step, the pointer starts to travel when the repeats start, and it
 * stops when they stop coming.
 */
export class PointerHolds {
  private readonly keys = new Map<Direction, { since: number; last: number; repeating: boolean }>();
  private readonly pad = new Map<Direction, number>();

  /** A direction key went down. Returns true for a new press (take one small step), false for a repeat. */
  keyDown(dir: Direction, isRepeat: boolean, now: number): boolean {
    const known = this.keys.get(dir);
    if (isRepeat && known && now - known.last <= KEY_FORGET_MS) {
      known.last = now;
      known.repeating = true;
      return false;
    }
    this.keys.set(dir, { since: now, last: now, repeating: false });
    return true;
  }

  /** What a controller holds now. Returns the directions newly pressed (each takes one small step). */
  setPad(dirs: readonly Direction[], now: number): Direction[] {
    for (const dir of [...this.pad.keys()]) if (!dirs.includes(dir)) this.pad.delete(dir);
    const fresh = dirs.filter((dir) => !this.pad.has(dir));
    for (const dir of fresh) this.pad.set(dir, now);
    return fresh;
  }

  /** The directions the pointer is travelling in at `now`, each with when its hold began. */
  held(now: number): Map<Direction, number> {
    const out = new Map<Direction, number>(this.pad);
    for (const [dir, key] of this.keys) {
      if (key.repeating && now - key.last <= REPEAT_GRACE_MS)
        out.set(dir, Math.min(key.since, out.get(dir) ?? Infinity));
    }
    return out;
  }

  /** True when nothing is held and no recent press could still turn into a hold: the timer can stop. */
  idle(now: number): boolean {
    for (const [dir, key] of [...this.keys]) if (now - key.last > KEY_FORGET_MS) this.keys.delete(dir);
    return this.keys.size === 0 && this.pad.size === 0;
  }

  clear(): void {
    this.keys.clear();
    this.pad.clear();
  }
}

/**
 * A point in the view's pixels as the DevTools input channel wants it: in
 * the page's own pixels, which are `zoom` times bigger on screen.
 */
export function cdpPoint(x: number, y: number, zoom: number): { x: number; y: number } {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return { x: x / z, y: y / z };
}
