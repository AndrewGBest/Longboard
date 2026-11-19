import { describe, expect, it } from 'vitest';
import { addVisit, dayHeading, MAX_HISTORY, parseHistory, titleVisit, visitLine, whenText } from '../src/shared/history';

describe('history', () => {
  it('puts each page at the front once, newest first', () => {
    let list = addVisit([], 'https://a.example/one', 1);
    list = addVisit(list, 'https://b.example/', 2);
    list = addVisit(list, 'https://a.example/one', 3);
    expect(list.map((v) => [v.url, v.at])).toEqual([['https://a.example/one', 3], ['https://b.example/', 2]]);
  });
  it('keeps a title through a second visit, and sets one', () => {
    let list = titleVisit(addVisit([], 'https://a.example/', 1), 'https://a.example/', '  A   page ');
    list = addVisit(list, 'https://a.example/', 2);
    expect(list).toEqual([{ url: 'https://a.example/', title: 'A page', at: 2 }]);
  });
  it('takes only web pages, and never grows without end', () => {
    expect(addVisit([], 'data:text/html,x', 1)).toEqual([]);
    expect(addVisit([], 'file:///etc/passwd', 1)).toEqual([]);
    let list: ReturnType<typeof addVisit> = [];
    for (let i = 0; i < MAX_HISTORY + 20; i++) list = addVisit(list, `https://a.example/${i}`, i);
    expect(list.length).toBe(MAX_HISTORY);
    expect(list[0]!.url).toBe(`https://a.example/${MAX_HISTORY + 19}`);
  });
  it('reads the saved file, dropping what is unusable', () => {
    expect(parseHistory({ visits: [{ url: 'https://a.example/', title: 'A', at: 5 }, { url: 'javascript:alert(1)' }, null, { url: 'https://a.example/' }, { url: 'https://b.example/', title: 7, at: 'x' }] })).toEqual([
      { url: 'https://a.example/', title: 'A', at: 5 },
      { url: 'https://b.example/', title: '', at: 0 },
    ]);
    for (const bad of [null, undefined, 5, [], { visits: 'all' }]) expect(parseHistory(bad)).toEqual([]);
  });
  it('says when in plain words', () => {
    const noon = new Date(2026, 10, 18, 12).getTime();
    expect(whenText(noon - 3_600_000, noon)).toBe('today');
    expect(whenText(new Date(2026, 10, 17, 23).getTime(), noon)).toBe('yesterday');
    expect(whenText(new Date(2026, 10, 2, 9).getTime(), noon)).toBe('2026-11-02');
    expect(visitLine({ url: 'https://www.a.example/x', title: 'A page', at: noon }, noon)).toMatchObject({ url: 'https://www.a.example/x', text: 'A page (a.example), today', title: 'A page', site: 'a.example', day: 'Today' });
    expect(dayHeading(new Date(2026, 10, 17, 23).getTime(), noon)).toBe('Yesterday');
    expect(dayHeading(new Date(2026, 10, 2, 9).getTime(), noon)).toContain('2026');
    expect(visitLine({ url: 'https://a.example/x', title: '', at: noon }, noon).text).toBe('a.example, today');
  });
});
