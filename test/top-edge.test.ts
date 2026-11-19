import { describe, expect, it } from 'vitest';
import { TopEdge } from '../src/layer/input/top-edge';

describe('Up again at the top of a page opens the menu', () => {
  it('hints on the first press and opens on the second', () => {
    const edge = new TopEdge();
    expect(edge.up(1000)).toBe('hint');
    expect(edge.up(1600)).toBe('menu');
    // and starts over afterwards
    expect(edge.up(2200)).toBe('hint');
  });

  it('does not take a held key for a second press', () => {
    const edge = new TopEdge();
    expect(edge.up(1000)).toBe('hint');
    for (let t = 1033; t < 3000; t += 33) expect(edge.up(t)).toBe('wait');
    // let go, then a deliberate press
    expect(edge.up(3500)).toBe('menu');
  });

  it('forgets after a while, and when something else was pressed', () => {
    const edge = new TopEdge();
    expect(edge.up(1000)).toBe('hint');
    expect(edge.up(6000)).toBe('hint');
    edge.reset();
    expect(edge.up(6500)).toBe('hint');
  });
});
