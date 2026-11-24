import { describe, expect, it } from 'vitest';
import { suggest } from '../src/shared/suggest';
import { addSaved, parseSaved, removeSaved } from '../src/shared/home';
import { blockReason } from '../src/main/navigation';

const known = [
  { url: 'https://video.example/watch', title: 'Films tonight' },
  { url: 'https://news.example/', title: 'The news' },
  { url: 'https://www.example.org/videos', title: 'Old videos' },
  { url: 'https://news.example/', title: 'again, from history' },
];

describe('address suggestions', () => {
  it('finds what was typed in the address or the title', () => {
    expect(suggest('news', known)).toEqual([{ url: 'https://news.example/', text: 'The news (news.example)' }]);
    expect(suggest('tonight', known).map((s) => s.url)).toEqual(['https://video.example/watch']);
  });
  it('wants every word, and puts a site whose name starts with the first word ahead', () => {
    expect(suggest('video', known).map((s) => s.url)).toEqual([
      'https://video.example/watch',
      'https://www.example.org/videos',
    ]);
    expect(suggest('old video', known).map((s) => s.url)).toEqual(['https://www.example.org/videos']);
    expect(suggest('video cooking', known)).toEqual([]);
  });
  it('says nothing for a letter or for nothing, and never more than five', () => {
    expect(suggest('', known)).toEqual([]);
    expect(suggest('n', known)).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => ({ url: `https://site${i}.example/`, title: '' }));
    expect(suggest('site', many).length).toBe(5);
    expect(suggest('site', many)[0]).toEqual({ url: 'https://site0.example/', text: 'site0.example' });
  });
});

describe('saved pages', () => {
  it('are kept once each, newest first, and can be taken away', () => {
    let list = addSaved([], 'https://a.example/page', 'A page');
    list = addSaved(list, 'https://b.example/', 'B');
    list = addSaved(list, 'https://a.example/page', 'A page, again');
    expect(list).toEqual([
      { url: 'https://a.example/page', title: 'A page, again' },
      { url: 'https://b.example/', title: 'B' },
    ]);
    expect(removeSaved(list, 'https://a.example/page')).toEqual([{ url: 'https://b.example/', title: 'B' }]);
  });
  it('take only web pages, and the saved file is read with care', () => {
    expect(addSaved([], 'data:text/html,x', 'x')).toEqual([]);
    expect(
      parseSaved({
        saved: [{ url: 'https://a.example/', title: 'A' }, { url: 'file:///x' }, 5, { url: 'https://a.example/' }],
      }),
    ).toEqual([{ url: 'https://a.example/', title: 'A' }]);
    expect(parseSaved(null)).toEqual([]);
  });
});

describe('opening only pages that are sent privately', () => {
  const on = { automation: false, httpsOnly: true };
  it('refuses a plain http address when the setting is on, and not otherwise', () => {
    expect(blockReason('http://news.example/', on)).toBe('not-secure');
    expect(blockReason('https://news.example/', on)).toBeNull();
    expect(blockReason('http://news.example/', { automation: false })).toBeNull();
  });
  it('leaves this machine alone, where there is nobody on the way', () => {
    expect(blockReason('http://127.0.0.1:8080/', on)).toBeNull();
    expect(blockReason('http://localhost/', on)).toBeNull();
  });
});
