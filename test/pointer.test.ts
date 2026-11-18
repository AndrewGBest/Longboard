import { describe, expect, it } from 'vitest';
import { KEY_FORGET_MS, POINTER, PointerHolds, pointerGlide, pointerSpeed, pointerTap, REPEAT_GRACE_MS, startPoint } from '../src/main/pointer';
import type { Direction } from '../src/shared/actions';

const tv = { width: 1920, height: 1080 };
const held = (...dirs: Direction[]): Map<Direction, number> => new Map(dirs.map((d) => [d, 0]));

describe('pointer speed', () => {
  it('starts slow, ends fast and never goes backwards', () => {
    const samples = [0, 100, 300, 600, 900, 5000].map((ms) => pointerSpeed(ms, tv));
    expect(samples[0]).toBeCloseTo(POINTER.slow * 1080);
    expect(samples.at(-1)).toBeCloseTo(POINTER.fast * 1080);
    for (let i = 1; i < samples.length; i++) expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!);
  });

  it('stays precise for a short hold', () => {
    expect(pointerSpeed(150, tv)).toBeLessThan(POINTER.slow * 1080 * 1.3);
  });

  it('scales with the screen', () => {
    expect(pointerSpeed(400, { width: 1280, height: 720 })).toBeCloseTo((pointerSpeed(400, tv) * 720) / 1080);
  });

  it('crosses the screen in a second or two when held', () => {
    let pos = { x: 0, y: 540 };
    let t = 0;
    while (pos.x < 1900 && t < 5000) {
      const step = pointerGlide(pos, held('right'), t, 16, tv);
      pos = { x: step.x, y: step.y };
      t += 16;
    }
    expect(t).toBeGreaterThan(700);
    expect(t).toBeLessThan(2200);
  });
});

describe('pointer movement', () => {
  it('moves one small step on a tap', () => {
    const step = pointerTap({ x: 100, y: 100 }, 'right', tv);
    expect(step.x - 100).toBeCloseTo(POINTER.tap * 1080);
    expect(step.y).toBe(100);
    expect(step.x - 100).toBeLessThan(20);
  });

  it('goes diagonally no faster than straight', () => {
    const straight = pointerGlide({ x: 500, y: 500 }, held('right'), 400, 16, tv);
    const diagonal = pointerGlide({ x: 500, y: 500 }, held('right', 'down'), 400, 16, tv);
    expect(Math.hypot(diagonal.x - 500, diagonal.y - 500)).toBeCloseTo(straight.x - 500);
    expect(diagonal.x - 500).toBeCloseTo(diagonal.y - 500);
  });

  it('stands still when opposite directions are held, or none', () => {
    expect(pointerGlide({ x: 5, y: 5 }, held('left', 'right'), 400, 16, tv)).toEqual({ x: 5, y: 5, scrollX: 0, scrollY: 0 });
    expect(pointerGlide({ x: 5, y: 5 }, held(), 400, 16, tv)).toEqual({ x: 5, y: 5, scrollX: 0, scrollY: 0 });
  });

  it('never leaves the view, and turns the rest into scrolling', () => {
    const down = pointerGlide({ x: 100, y: 1078 }, held('down'), 2000, 16, tv);
    expect(down.y).toBe(1079);
    expect(down.scrollY).toBeGreaterThan(10);
    expect(down.scrollX).toBe(0);
    const up = pointerTap({ x: 100, y: 0 }, 'up', tv);
    expect(up.y).toBe(0);
    expect(up.scrollY).toBeLessThan(0);
    const left = pointerTap({ x: 3, y: 50 }, 'left', tv);
    expect(left.x).toBe(0);
    expect(left.scrollX).toBeLessThan(0);
  });

  it('is not flung by a long gap between ticks', () => {
    const late = pointerGlide({ x: 0, y: 0 }, held('right'), 5000, 3000, tv);
    expect(late.x).toBeLessThanOrEqual((POINTER.fast * 1080 * 100) / 1000 + 1);
  });
});

describe('startPoint', () => {
  it('converts page pixels to view pixels', () => {
    expect(startPoint({ x: 100, y: 50 }, 2, tv)).toEqual({ x: 200, y: 100 });
  });

  it('refuses anything that is not a point inside the view', () => {
    expect(startPoint({ x: 'a', y: 1 }, 1, tv)).toBeNull();
    expect(startPoint({ x: NaN, y: 1 }, 1, tv)).toBeNull();
    expect(startPoint({ x: 5000, y: 1 }, 1, tv)).toBeNull();
    expect(startPoint({ x: -1, y: 1 }, 1, tv)).toBeNull();
    expect(startPoint({ x: 1, y: 1 }, 0, tv)).toBeNull();
    expect(startPoint({}, 1, tv)).toBeNull();
  });
});

describe('what is held', () => {
  it('takes a single key press as one step and no travel', () => {
    const holds = new PointerHolds();
    expect(holds.keyDown('right', false, 1000)).toBe(true);
    expect(holds.held(1000).size).toBe(0);
    expect(holds.held(1500).size).toBe(0);
    expect(holds.idle(1500)).toBe(false);
    expect(holds.idle(1000 + KEY_FORGET_MS + 1)).toBe(true);
  });

  it('travels while the key repeats, timed from the first press, and stops when the repeats stop', () => {
    const holds = new PointerHolds();
    holds.keyDown('right', false, 1000);
    expect(holds.keyDown('right', true, 1500)).toBe(false);
    expect([...holds.held(1510)]).toEqual([['right', 1000]]);
    holds.keyDown('right', true, 1540);
    expect(holds.held(1540 + REPEAT_GRACE_MS).size).toBe(1);
    expect(holds.held(1540 + REPEAT_GRACE_MS + 1).size).toBe(0);
  });

  it('treats a repeat with no press before it, or long after one, as a new press', () => {
    const holds = new PointerHolds();
    expect(holds.keyDown('up', true, 0)).toBe(true);
    expect(holds.keyDown('up', true, KEY_FORGET_MS + 5)).toBe(true);
    expect(holds.held(KEY_FORGET_MS + 5).size).toBe(0);
  });

  it('a fresh press after a hold starts slow again', () => {
    const holds = new PointerHolds();
    holds.keyDown('down', false, 0);
    holds.keyDown('down', true, 500);
    expect(holds.keyDown('down', false, 900)).toBe(true);
    holds.keyDown('down', true, 1400);
    expect([...holds.held(1400)]).toEqual([['down', 900]]);
  });

  it('keeps what a controller holds until the controller lets go', () => {
    const holds = new PointerHolds();
    expect(holds.setPad(['left', 'up'], 100)).toEqual(['left', 'up']);
    expect(holds.setPad(['left'], 300)).toEqual([]);
    expect([...holds.held(99_999)]).toEqual([['left', 100]]);
    expect(holds.idle(99_999)).toBe(false);
    holds.setPad([], 100_000);
    expect(holds.idle(100_000)).toBe(true);
  });

  it('forgets everything when cleared', () => {
    const holds = new PointerHolds();
    holds.setPad(['left'], 0);
    holds.keyDown('up', false, 0);
    holds.clear();
    expect(holds.idle(1)).toBe(true);
  });
});
