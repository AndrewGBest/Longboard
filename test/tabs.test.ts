import { describe, expect, it } from 'vitest';
import { keepsTabs, MAX_KEPT_TABS, parseTabs, tabsToKeep } from '../src/shared/tabs';
import { parseConfig } from '../src/shared/config';
import { changeSetting, resetSettings } from '../src/shared/settings';

describe('the tabs kept for the next start', () => {
  it('writes down web pages only, in order, with their titles tidied', () => {
    const kept = tabsToKeep([
      { url: 'https://news.example/today', title: '  Today \n in  the news ' },
      { url: 'about:blank', title: '' },
      { url: 'data:text/html,notice', title: 'Starting' },
      { url: 'file:///etc/passwd', title: 'x' },
      { url: 'http://plain.example/', title: '' },
    ]);
    expect(kept).toEqual({
      tabs: [
        { url: 'https://news.example/today', title: 'Today in the news' },
        { url: 'http://plain.example/', title: '' },
      ],
    });
  });

  it('keeps no more than can be offered again behind the tab Longboard starts in', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ url: `https://site${i}.example/`, title: `${i}` }));
    expect(tabsToKeep(many).tabs).toHaveLength(MAX_KEPT_TABS);
    expect(parseTabs({ tabs: many })).toHaveLength(MAX_KEPT_TABS);
    expect(tabsToKeep(many).tabs[0]?.url).toBe('https://site0.example/');
  });

  it('reads back what it wrote', () => {
    const kept = tabsToKeep([{ url: 'https://a.example/', title: 'A' }]);
    expect(parseTabs(JSON.parse(JSON.stringify(kept)))).toEqual(kept.tabs);
  });

  it('drops anything in the file that is not a web page, and never throws', () => {
    for (const raw of [undefined, null, 7, 'x', [], {}, { tabs: 'x' }, { tabs: [null, 3, {}, { url: 5 }] }]) {
      expect(parseTabs(raw)).toEqual([]);
    }
    expect(
      parseTabs({
        tabs: [
          { url: 'javascript:alert(1)', title: 'no' },
          { url: 'file:///home', title: 'no' },
          { url: `https://long.example/${'a'.repeat(2100)}`, title: 'no' },
          { url: 'https://ok.example/', title: 9 },
        ],
      }),
    ).toEqual([{ url: 'https://ok.example/', title: '' }]);
  });

  it('is on as shipped, off when switched off, and off when everything is cleared at closing', () => {
    expect(keepsTabs({})).toBe(true);
    expect(keepsTabs({ keepTabs: true })).toBe(true);
    expect(keepsTabs({ keepTabs: false })).toBe(false);
    expect(keepsTabs({ clearOnExit: true })).toBe(false);
  });

  it('is a setting like the others', () => {
    expect(parseConfig({ keepTabs: false }).config.keepTabs).toBe(false);
    expect(parseConfig({ keepTabs: 'no' }).problems.join()).toContain('"keepTabs" must be true or false');
    expect(changeSetting({}, 'keepTabs', false)).toEqual({ keepTabs: false });
    expect(changeSetting({ keepTabs: false }, 'keepTabs', null)).toEqual({});
    expect(changeSetting({}, 'keepTabs', 'x')).toBeNull();
    expect(resetSettings({ keepTabs: false })).toEqual({});
  });
});
