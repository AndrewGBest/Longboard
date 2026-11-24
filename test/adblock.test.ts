import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  blockingOn,
  blockingStartsOn,
  isVerified,
  listsDue,
  LISTS_KEPT_MS,
  looksLikeFilterList,
  parseFilterLists,
  parseVerified,
} from '../src/shared/adblock';
import { FilterSet, FilterStore } from '../src/main/adblock';
import { parseSites } from '../src/shared/sites';

const verified = ['video.example', 'clips.example.org'];

describe('where the ad-blocking switch starts (Hard rule 5)', () => {
  it('is off on a verified site and anything under it', () => {
    expect(blockingStartsOn('video.example', verified)).toBe(false);
    expect(blockingStartsOn('www.video.example', verified)).toBe(false);
    expect(blockingStartsOn('Player.Video.Example', verified)).toBe(false);
  });
  it('is on everywhere else, including names that only look alike', () => {
    expect(blockingStartsOn('news.example', verified)).toBe(true);
    expect(blockingStartsOn('notvideo.example', verified)).toBe(true);
    expect(blockingStartsOn('video.example.evil.test', verified)).toBe(true);
    expect(blockingStartsOn('example.org', verified)).toBe(true);
    expect(blockingStartsOn('anything.test', [])).toBe(true);
  });
  it('knows a verified site', () => {
    expect(isVerified('clips.example.org', verified)).toBe(true);
    expect(isVerified('example.org', verified)).toBe(false);
  });
});

describe('whether blocking is on for a site now', () => {
  it("is the person's choice whenever they have made one", () => {
    expect(blockingOn('video.example', true, verified)).toBe(true);
    expect(blockingOn('video.example', false, verified)).toBe(false);
    expect(blockingOn('news.example', false, verified)).toBe(false);
    expect(blockingOn('news.example', true, verified)).toBe(true);
  });
  it('is where the switch starts when they have not', () => {
    expect(blockingOn('video.example', undefined, verified)).toBe(false);
    expect(blockingOn('news.example', undefined, verified)).toBe(true);
  });
  it('is never on for something that is not a website', () => {
    expect(blockingOn(null, undefined, verified)).toBe(false);
    expect(blockingOn(null, true, verified)).toBe(false);
  });
  it('the choice is kept with the site, and only a yes or a no is kept', () => {
    expect(
      parseSites({
        'news.example': { adBlocking: false },
        'video.example': { adBlocking: true },
        'x.example': { adBlocking: 'yes' },
      }),
    ).toEqual({
      'news.example': { adBlocking: false },
      'video.example': { adBlocking: true },
    });
  });
});

describe('the verified-sites file', () => {
  it('is read in the form Longboard saves and the form the repository keeps', () => {
    expect(parseVerified({ sites: ['video.example', 'clips.example.org'] })).toEqual(verified);
    expect(
      parseVerified({ 'longboard-verified': 1, sites: [{ domain: 'video.example', reviewedBy: 'someone' }] }),
    ).toEqual(['video.example']);
  });
  it('drops what is not a domain, and never throws', () => {
    expect(
      parseVerified({ sites: ['video.example', 'HTTP://x', '*', 5, null, { domain: 'a b' }, 'video.example'] }),
    ).toEqual(['video.example']);
    for (const bad of [null, undefined, 5, 'x', [], { sites: 'all' }]) expect(parseVerified(bad)).toEqual([]);
  });
  it('the copy that ships with Longboard is valid and names sites', () => {
    const shipped = parseVerified(JSON.parse(readFileSync('profiles/verified-sites.json', 'utf8')));
    expect(shipped.length).toBeGreaterThan(0);
  });
});

describe('fetching the lists', () => {
  it('is due when never done, when old, and when the clock went backwards', () => {
    expect(listsDue(undefined, 1000)).toBe(true);
    expect(listsDue(1000, 1000 + LISTS_KEPT_MS)).toBe(true);
    expect(listsDue(1000, 1000 + LISTS_KEPT_MS - 1)).toBe(false);
    expect(listsDue(5000, 1000)).toBe(true);
  });
  it('tells a filter list from an error page', () => {
    expect(looksLikeFilterList('[Adblock Plus 2.0]\n! Title: x\n||ads.example^\n')).toBe(true);
    expect(looksLikeFilterList('<!DOCTYPE html><html><body>Not found</body></html>')).toBe(false);
    expect(looksLikeFilterList('{"error":"nope", "more": "text here"}')).toBe(false);
    expect(looksLikeFilterList('')).toBe(false);
    expect(looksLikeFilterList('[Adblock Plus 2.0]\n! only comments\n! here and nothing else\n')).toBe(false);
  });
  it('takes only https addresses from config.json', () => {
    expect(parseFilterLists(['https://lists.example/a.txt', 'https://lists.example/a.txt'])).toEqual([
      'https://lists.example/a.txt',
    ]);
    const tooMany = Array.from({ length: 9 }, (_, i) => `https://l.example/${i}`);
    for (const bad of [
      [],
      ['http://lists.example/a.txt'],
      ['file:///etc/passwd'],
      ['nonsense'],
      'https://x.example/a.txt',
      [5],
      tooMany,
    ]) {
      expect(parseFilterLists(bad)).toBeNull();
    }
  });
});

const LIST = `[Adblock Plus 2.0]
! Title: made-up test list
||ads.example^
||tracker.example^$third-party
/banner/*$image
@@||ads.example/allowed.js
||swap.example^$script,redirect=noopjs
||frames.example^$subdocument
news.example##.advert
news.example##+js(abort-on-property-read, adsBlocked)
||inline.example^$csp=script-src 'none'
`;

describe('the request filter', () => {
  const set = FilterSet.parse(LIST);
  const page = 'https://news.example/story';

  it('refuses a request the lists name', () => {
    expect(set.refuses('https://ads.example/a.js', page, 'script')).toBe(true);
    expect(set.refuses('https://cdn.example/banner/top.png', page, 'image')).toBe(true);
    expect(set.refuses('https://frames.example/ad.html', page, 'subFrame')).toBe(true);
  });
  it('lets through what the lists do not name, and what they make an exception for', () => {
    expect(set.refuses('https://news.example/app.js', page, 'script')).toBe(false);
    expect(set.refuses('https://cdn.example/banner/top.js', page, 'script')).toBe(false);
    expect(set.refuses('https://ads.example/allowed.js', page, 'script')).toBe(false);
  });
  it('tells a request to another site from one to the same site', () => {
    expect(set.refuses('https://tracker.example/t.gif', page, 'image')).toBe(true);
    expect(set.refuses('https://tracker.example/t.gif', 'https://tracker.example/', 'image')).toBe(false);
  });
  it('never refuses the page the person asked for', () => {
    expect(set.refuses('https://ads.example/', 'https://ads.example/', 'mainFrame')).toBe(false);
    expect(set.refuses('https://inline.example/', 'https://inline.example/', 'mainFrame')).toBe(false);
  });
  it('refuses where a list would serve a stand-in, and serves nothing', () => {
    expect(set.refuses('https://swap.example/lib.js', page, 'script')).toBe(true);
  });
  it('survives nonsense', () => {
    expect(set.refuses('not an address', page, 'script')).toBe(false);
  });
  it('can be saved and read back', () => {
    const again = FilterSet.load(set.save());
    expect(again.refuses('https://ads.example/a.js', page, 'script')).toBe(true);
    expect(again.refuses('https://news.example/app.js', page, 'script')).toBe(false);
  });
});

describe('the filters on this machine', () => {
  const make = () => {
    const folder = join(mkdtempSync(join(tmpdir(), 'longboard-filters-')), 'filters');
    const notes: string[] = [];
    const asked: string[] = [];
    let clock = 1_000_000;
    const store = new FilterStore({
      folder,
      lists: ['https://lists.example/one.txt'],
      fetchBytes: async (url) => {
        asked.push(url);
        return Buffer.from(LIST);
      },
      now: () => clock,
      note: (line) => notes.push(line),
    });
    return { store, folder, notes, asked, tick: (ms: number) => (clock += ms) };
  };
  const reader = (folder: string, body = '', notes: string[] = []) =>
    new FilterStore({
      folder,
      lists: ['https://lists.example/one.txt'],
      fetchBytes: async () => Buffer.from(body),
      now: () => 9e15,
      note: (l) => notes.push(l),
    });
  const ad = (store: FilterStore) =>
    store.filters?.refuses('https://ads.example/a.js', 'https://news.example/', 'script');

  it('has nothing before the lists are fetched, and says nothing about it', () => {
    const { store, notes } = make();
    store.load();
    expect(store.filters).toBeNull();
    expect(notes).toEqual([]);
  });
  it('fetches, keeps and uses the lists', async () => {
    const { store, folder, asked } = make();
    expect(await store.refresh()).toBe(true);
    expect(asked).toEqual(['https://lists.example/one.txt']);
    expect(ad(store)).toBe(true);
    expect(existsSync(join(folder, 'filters.bin'))).toBe(true);
  });
  it('does not fetch again until the copy is old', async () => {
    const { store, asked, tick } = make();
    await store.refresh();
    tick(LISTS_KEPT_MS - 1);
    expect(await store.refresh()).toBe(false);
    tick(1);
    expect(await store.refresh()).toBe(true);
    expect(asked.length).toBe(2);
  });
  it('reads them back at the next start, and from the list text when the prepared copy is unusable', async () => {
    const first = make();
    await first.store.refresh();
    const second = reader(first.folder);
    second.load();
    expect(ad(second)).toBe(true);
    writeFileSync(join(first.folder, 'filters.bin'), 'not filters');
    const third = reader(first.folder);
    third.load();
    expect(ad(third)).toBe(true);
  });
  it('keeps what it had when a fetch sends something else', async () => {
    const good = make();
    await good.store.refresh();
    const notes: string[] = [];
    const failing = reader(good.folder, '<html>busy</html>', notes);
    failing.load();
    expect(await failing.refresh()).toBe(false);
    expect(ad(failing)).toBe(true);
    expect(notes.at(-1)).toMatch(/lists not updated .*did not send a filter list/);
  });
});
