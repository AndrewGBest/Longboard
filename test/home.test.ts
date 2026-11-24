import { describe, expect, it } from 'vitest';
import { addRecent, MAX_RECENTS, parseRecents, removeRecent, titleRecent } from '../src/shared/home';
import { parseSites, zoomStep, ZOOM_STEPS } from '../src/shared/sites';

describe('recently opened sites', () => {
  it('puts the newest first and keeps one entry per site', () => {
    let list = addRecent([], 'https://a.example/', 1);
    list = addRecent(list, 'https://b.example/', 2);
    list = addRecent(list, 'https://www.a.example/page', 3);
    expect(list.map((r) => r.url)).toEqual(['https://www.a.example/page', 'https://b.example/']);
  });

  it('keeps the title when the same address is opened again, and drops it for another page', () => {
    const list = titleRecent(addRecent([], 'https://a.example/', 1), 'https://a.example/', '  A   Site ');
    expect(list[0]!.title).toBe('A Site');
    expect(addRecent(list, 'https://a.example/', 2)[0]!.title).toBe('A Site');
    expect(addRecent(list, 'https://a.example/other', 2)[0]!.title).toBe('');
  });

  it('never grows past the limit', () => {
    let list = addRecent([], 'https://first.example/', 0);
    for (let i = 0; i < 30; i++) list = addRecent(list, `https://site${i}.example/`, i + 1);
    expect(list).toHaveLength(MAX_RECENTS);
    expect(list[0]!.url).toBe('https://site29.example/');
  });

  it('ignores what is not a web address', () => {
    expect(addRecent([], 'file:///etc/passwd', 1)).toEqual([]);
    expect(addRecent([], 'data:text/html,x', 1)).toEqual([]);
  });

  it('removes a site', () => {
    const list = addRecent(addRecent([], 'https://a.example/', 1), 'https://b.example/', 2);
    expect(removeRecent(list, 'https://www.a.example/x').map((r) => r.url)).toEqual(['https://b.example/']);
  });

  it('reads a saved file and drops what it cannot use', () => {
    const list = parseRecents({
      recents: [
        { url: 'https://a.example/', title: 'A', at: 5 },
        { url: 'javascript:alert(1)', title: 'bad' },
        { url: 'https://a.example/again', title: 'duplicate site' },
        'nonsense',
        { url: 'https://b.example/', title: 7 },
      ],
    });
    expect(list).toEqual([
      { url: 'https://a.example/', title: 'A', at: 5 },
      { url: 'https://b.example/', title: '', at: 0 },
    ]);
    expect(parseRecents(undefined)).toEqual([]);
    expect(parseRecents({ recents: 'x' })).toEqual([]);
  });
});

describe('per-site settings', () => {
  it('steps zoom up and down and stops at the ends', () => {
    expect(zoomStep(1, 1)).toBe(1.1);
    expect(zoomStep(1, -1)).toBe(0.9);
    expect(zoomStep(ZOOM_STEPS[0], -1)).toBe(ZOOM_STEPS[0]);
    expect(zoomStep(2, 1)).toBe(2);
    expect(zoomStep(1.27, 1)).toBe(1.5);
  });

  it('reads a saved file and drops what it cannot use', () => {
    expect(
      parseSites({
        'example.com': {
          answers: { camera: 'granted', location: 'denied', teleport: 'granted', midi: 'maybe' },
          zoom: 1.25,
          extra: true,
        },
        'b.example': { answers: { camera: 'maybe' }, zoom: 40 },
        'Bad Host': { zoom: 1.1 },
        'c.example': 'x',
      }),
    ).toEqual({ 'example.com': { answers: { camera: 'granted', location: 'denied' }, zoom: 1.25 } });
    expect(parseSites([1])).toEqual({});
    expect(parseSites(null)).toEqual({});
  });
});
