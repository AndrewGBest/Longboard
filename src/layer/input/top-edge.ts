// Up, pressed again at the top of a page, opens the menu: the way to it for a
// remote that has no menu key. Pure (time is passed in) so it is unit-tested.

/** A second press sooner than this is the same press held down, or a slip. */
export const SECOND_PRESS_MIN_MS = 250;
/** A second press later than this is a new thought; the hint is shown again. */
export const SECOND_PRESS_MAX_MS = 4000;

export class TopEdge {
  private last = Number.NEGATIVE_INFINITY;

  /** Up had nowhere to go. 'hint': say that Up again opens the menu. 'menu': open it. 'wait': a held key, nothing to do. */
  up(now: number): 'hint' | 'menu' | 'wait' {
    const since = now - this.last;
    if (since < SECOND_PRESS_MIN_MS) {
      // A held key keeps arriving; it must not count as the second press when it is let go late.
      this.last = now;
      return 'wait';
    }
    if (since <= SECOND_PRESS_MAX_MS) {
      this.last = Number.NEGATIVE_INFINITY;
      return 'menu';
    }
    this.last = now;
    return 'hint';
  }

  /** Anything else happened: the next Up at the top starts over. */
  reset(): void {
    this.last = Number.NEGATIVE_INFINITY;
  }
}
