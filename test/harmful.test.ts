import { describe, expect, it } from 'vitest';
import { harmKey, HARMFUL_KEPT_MS, HARMFUL_LISTS, HARMFUL_WORDS, warnsOfHarm } from '../src/shared/harmful';
import { listsDue } from '../src/shared/adblock';
import { parseConfig } from '../src/shared/config';
import { changeSetting } from '../src/shared/settings';
import { FilterSet } from '../src/main/adblock';
import { blockedMessage, blockReason, noticePageUrl } from '../src/main/navigation';

// A made-up list in the three shapes the real ones use: a whole site, one
// part of a site, and a bare address.
const LIST = ['! Title: made up', '||bad.example^', '||mixed.example/downloads/$doc', '203.0.113.7'].join('\n');

describe('the warning before a site on a list of harmful sites', () => {
  const set = FilterSet.parse(LIST);

  it('knows a listed page when it is the page being opened', () => {
    expect(set.listsPage('https://bad.example/')).toBe(true);
    expect(set.listsPage('https://www.bad.example/any/page?x=1')).toBe(true);
    expect(set.listsPage('https://mixed.example/downloads/setup')).toBe(true);
    expect(set.listsPage('http://203.0.113.7/a.sh')).toBe(true);
  });

  it('leaves alone what the lists do not name', () => {
    expect(set.listsPage('https://mixed.example/')).toBe(false);
    expect(set.listsPage('https://good.example/')).toBe(false);
    expect(set.listsPage('https://notbad.example.org/')).toBe(false);
    expect(set.listsPage('not an address')).toBe(false);
  });

  it('is the last reason an address is not opened, so nothing refused outright is offered as "open anyway"', () => {
    const harmful = (url: string): boolean => set.listsPage(url);
    const rules = { automation: false, harmful };
    expect(blockReason('https://bad.example/', rules)).toBe('harmful');
    expect(blockReason('https://good.example/', rules)).toBeNull();
    expect(blockReason('https://user:pw@bad.example/', rules)).toBe('credentials');
    expect(blockReason('file:///bad.example', rules)).toBe('not-web');
    expect(blockReason('http://bad.example/', { ...rules, httpsOnly: true })).toBe('not-secure');
    expect(blockReason('https://bad.example/', { ...rules, onlySites: ['good.example'] })).toBe('locked');
    // Without the lists (not fetched yet, or switched off) nothing is held back.
    expect(blockReason('https://bad.example/', { automation: false })).toBeNull();
  });

  it('says what happened in words that do not claim certainty', () => {
    expect(blockedMessage('harmful')).toContain('may be harmful');
    expect(decodeURIComponent(noticePageUrl('harmful', 'https://bad.example/x?token=1'))).toContain('may be harmful');
    expect(decodeURIComponent(noticePageUrl('harmful', 'https://bad.example/x?token=1'))).not.toContain('token');
    expect(HARMFUL_WORDS.title).toContain('may');
    expect(HARMFUL_WORDS.lead('bad.example')).toContain('bad.example');
  });

  it('lets "open it anyway" cover a site, not one page of it', () => {
    expect(harmKey('https://Bad.Example/one')).toBe('bad.example');
    expect(harmKey('https://bad.example/two?x=1')).toBe('bad.example');
    expect(harmKey('https://bad.example:8443/')).toBe('bad.example:8443');
    expect(harmKey('nonsense')).toBeNull();
  });

  it('is on as shipped and is a setting like the others', () => {
    expect(warnsOfHarm({})).toBe(true);
    expect(warnsOfHarm({ harmfulSites: false })).toBe(false);
    expect(parseConfig({ harmfulSites: false }).config.harmfulSites).toBe(false);
    expect(parseConfig({ harmfulSites: 1 }).problems.join()).toContain('"harmfulSites" must be true or false');
    expect(changeSetting({}, 'harmfulSites', false)).toEqual({ harmfulSites: false });
    expect(changeSetting({}, 'harmfulSites', 'off')).toBeNull();
  });

  it('fetches its lists from their publishers over https, and again after half a day', () => {
    for (const list of HARMFUL_LISTS) {
      expect(new URL(list.url).protocol).toBe('https:');
      expect(list.credit.length).toBeGreaterThan(10);
    }
    const now = 1_000_000_000_000;
    expect(listsDue(now - HARMFUL_KEPT_MS + 1000, now, HARMFUL_KEPT_MS)).toBe(false);
    expect(listsDue(now - HARMFUL_KEPT_MS, now, HARMFUL_KEPT_MS)).toBe(true);
    // The filter lists keep their own, longer time.
    expect(listsDue(now - HARMFUL_KEPT_MS, now)).toBe(false);
  });
});
