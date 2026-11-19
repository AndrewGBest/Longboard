import { describe, expect, it } from 'vitest';
import { listsInUse, SIGNAL_HEADERS, TRACKER_LIST, withSignals } from '../src/shared/privacy';
import { parseConfig } from '../src/shared/config';
import { changeSetting } from '../src/shared/settings';
import { desktopZoom, tvZoom } from '../src/main/zoom';
import { parseSites } from '../src/shared/sites';

describe('"ask sites not to track"', () => {
  it('sends exactly the two standard signals', () => {
    expect(SIGNAL_HEADERS).toEqual({ DNT: '1', 'Sec-GPC': '1' });
  });
  it('adds them and passes every other header on untouched', () => {
    const before = { Accept: 'text/html', Cookie: 'a=b', Referer: 'https://news.example/', 'X-Site-Own': 'kept' };
    const after = withSignals(before);
    expect(after).toEqual({ ...before, DNT: '1', 'Sec-GPC': '1' });
    expect(before).toEqual({ Accept: 'text/html', Cookie: 'a=b', Referer: 'https://news.example/', 'X-Site-Own': 'kept' });
  });
  it('does not send a signal twice when a page set one itself', () => {
    expect(withSignals({ dnt: '0', 'sec-gpc': '0', Accept: '*/*' })).toEqual({ Accept: '*/*', DNT: '1', 'Sec-GPC': '1' });
  });
  it('is off unless asked for, and is a yes or a no', () => {
    expect(parseConfig({}).config.doNotTrack).toBeUndefined();
    expect(parseConfig({ doNotTrack: true, blockTrackers: true, hideLocalAddress: true }).problems).toEqual([]);
    expect(parseConfig({ doNotTrack: 'yes' }).problems.length).toBe(1);
    expect(changeSetting({}, 'doNotTrack', true)).toEqual({ doNotTrack: true });
    expect(changeSetting({}, 'blockTrackers', 'all')).toBeNull();
  });
});

describe('the filter lists in use', () => {
  const usual = ['https://lists.example/ads.txt'];
  it('are the usual one, or the person\'s own', () => {
    expect(listsInUse(usual, undefined, false)).toEqual(usual);
    expect(listsInUse(usual, ['https://mine.example/l.txt'], false)).toEqual(['https://mine.example/l.txt']);
  });
  it('have the tracker list added when asked for, once', () => {
    expect(listsInUse(usual, undefined, true)).toEqual([...usual, TRACKER_LIST]);
    expect(listsInUse(usual, [TRACKER_LIST], true)).toEqual([TRACKER_LIST]);
  });
});

describe('desktop site', () => {
  it('gives the site the width of a desk screen', () => {
    const tv = { width: 1920, height: 1080 };
    expect(tvZoom(tv)).toBe(2);
    expect(desktopZoom(tv, tvZoom(tv))).toBe(1.5);
    expect(desktopZoom({ width: 3840, height: 2160 }, 4)).toBe(3);
  });
  it('never makes a page bigger than it would be anyway', () => {
    expect(desktopZoom({ width: 1280, height: 720 }, 1.33)).toBe(1);
    expect(desktopZoom({ width: 1920, height: 1080 }, 1)).toBe(1);
  });
  it('is kept with the site, and only a yes is kept', () => {
    expect(parseSites({ 'news.example': { desktop: true }, 'b.example': { desktop: false }, 'c.example': { desktop: 'yes' } })).toEqual({ 'news.example': { desktop: true } });
  });
});
