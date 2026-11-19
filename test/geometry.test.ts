import { describe, expect, it } from 'vitest';
import { pickInitial, pickNext, score, type Rect } from '../src/layer/spatial/geometry';

const box = (left: number, top: number, w = 100, h = 60): Rect => ({ left, top, right: left + w, bottom: top + h });

// Two rows of three cards, like a streaming home screen.
const grid = [box(0, 0), box(120, 0), box(240, 0), box(0, 100), box(120, 100), box(240, 100)];
const others = (i: number): Rect[] => grid.filter((_, j) => j !== i);
const indexIn = (from: number, picked: number): number => grid.indexOf(others(from)[picked]!);

describe('pickNext', () => {
  it('moves along a row', () => {
    expect(indexIn(0, pickNext(grid[0]!, others(0), 'right'))).toBe(1);
    expect(indexIn(2, pickNext(grid[2]!, others(2), 'left'))).toBe(1);
  });

  it('moves between rows in the same column', () => {
    expect(indexIn(1, pickNext(grid[1]!, others(1), 'down'))).toBe(4);
    expect(indexIn(5, pickNext(grid[5]!, others(5), 'up'))).toBe(2);
  });

  it('returns -1 at an edge', () => {
    expect(pickNext(grid[0]!, others(0), 'left')).toBe(-1);
    expect(pickNext(grid[0]!, others(0), 'up')).toBe(-1);
    expect(pickNext(grid[5]!, others(5), 'right')).toBe(-1);
  });

  it('prefers the same row over a nearer item in another row', () => {
    const from = box(0, 0);
    const sameRowFar = box(400, 0);
    const otherRowNear = box(130, 90);
    expect(pickNext(from, [otherRowNear, sameRowFar], 'right')).toBe(1);
  });

  it('reaches a wide element below a narrow one', () => {
    const tab = box(500, 0, 80, 30);
    const hero = box(0, 60, 1200, 300);
    expect(pickNext(tab, [hero], 'down')).toBe(0);
  });

  it('ignores candidates that are mostly sideways', () => {
    expect(score(box(0, 0), box(1000, 20), 'down')).toBeNull();
  });

  it('never leaves the row on left/right', () => {
    const from = box(0, 100);
    expect(pickNext(from, [box(200, 0), box(200, 220)], 'right')).toBe(-1);
  });

  it('does not treat a sliver of overlap as alignment', () => {
    const from = box(248, 0, 200, 60);
    const sliver = box(150, 180, 100, 40); // overlaps the origin by 2px, and starts a little higher
    const under = box(260, 200, 100, 40); // directly underneath
    expect(pickNext(from, [sliver, under], 'down')).toBe(1);
  });

  it('going down takes what starts first, not a small thing beside its top', () => {
    const from = box(84, 0, 520, 24);
    const title = box(84, 100, 237, 71);
    const dots = box(329, 118, 34, 20);
    expect(pickNext(from, [dots, title], 'down')).toBe(1);
    expect(pickNext(box(84, 300, 520, 24), [dots, title], 'up')).toBe(1);
  });

  it('of two cards that start level, going down takes the left one whatever their heights', () => {
    const from = box(84, 0, 520, 24);
    const tall = box(84, 63, 316, 332);
    const short = box(421, 63, 316, 148);
    expect(pickNext(from, [short, tall], 'down')).toBe(1);
  });

  it('stops at a row in between that is not in line, when it is near sideways', () => {
    const from = box(200, 0, 30, 18);
    const shortLink = box(40, 60, 40, 22);
    const wide = box(40, 200, 520, 70);
    expect(pickNext(from, [wide, shortLink], 'down')).toBe(1);
    expect(pickNext(box(200, 300, 30, 18), [box(40, -100, 520, 70), shortLink], 'up')).toBe(1);
    // Of two things in between, the one that starts first, not the smaller.
    const title = box(84, 100, 237, 71);
    const dots = box(329, 118, 34, 20);
    expect(pickNext(box(452, 0, 69, 16), [box(452, 400, 69, 16), dots, title], 'down')).toBe(2);
    // Far across the screen it is passed over, as before.
    expect(pickNext(box(900, 0, 30, 18), [box(600, 200, 520, 70), shortLink], 'down')).toBe(0);
    // And something beside the aligned one, not before it, changes nothing.
    expect(pickNext(from, [wide, box(600, 190, 40, 22)], 'down')).toBe(0);
  });

  it('falls back to an off-axis row when nothing is directly below', () => {
    const from = box(600, 0);
    expect(pickNext(from, [box(0, 100), box(120, 100)], 'down')).toBe(1);
  });
});

describe('pickInitial', () => {
  it('chooses the top-left item', () => {
    expect(pickInitial([box(240, 100), box(120, 0), box(0, 4), box(0, 100)])).toBe(2);
  });
  it('handles an empty list', () => {
    expect(pickInitial([])).toBe(-1);
  });
});
