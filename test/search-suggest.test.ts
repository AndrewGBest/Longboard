import { describe, expect, it } from 'vitest';
import { canSuggest, isSuggestTemplate, parseSearchSuggestions, suggestAddress } from '../src/shared/suggest';
import { parseConfig } from '../src/shared/config';

const DDG = 'https://duckduckgo.com/?q=%s';

describe('asking the search site for suggestions', () => {
  it('is off as shipped: nothing typed is sent anywhere', () => {
    expect(suggestAddress('weather tomorrow', undefined)).toBeNull();
    expect(suggestAddress('weather tomorrow', false)).toBeNull();
    expect(parseConfig({}).config.searchSuggestions).toBeUndefined();
  });
  it('on, asks the search site in use for the words typed', () => {
    expect(suggestAddress('weather tomorrow', true)).toBe(
      'https://www.google.com/complete/search?client=firefox&q=weather%20tomorrow',
    );
    expect(suggestAddress(' cats & dogs ', true, DDG)).toBe('https://duckduckgo.com/ac/?q=cats%20%26%20dogs&type=list');
  });
  it('never sends an address, only what would be searched for', () => {
    for (const typed of [
      'example.com',
      'https://bank.example/account?id=5',
      'intranet.example/secret/path',
      'localhost:8080',
      '192.168.1.20',
    ])
      expect(suggestAddress(typed, true)).toBeNull();
  });
  it('does not ask about one letter, something very long, or a search site it does not know', () => {
    expect(suggestAddress('a', true)).toBeNull();
    expect(suggestAddress('x'.repeat(101), true)).toBeNull();
    expect(suggestAddress('weather', true, 'https://search.example/?q=%s')).toBeNull();
    expect(canSuggest(true, 'https://search.example/?q=%s')).toBe(false);
    expect(canSuggest(true, DDG)).toBe(true);
  });
  it("asks at an address of the person's own when config.json gives one", () => {
    expect(suggestAddress('weather', 'https://search.example/suggest?q=%s', 'https://search.example/?q=%s')).toBe(
      'https://search.example/suggest?q=weather',
    );
    expect(canSuggest('https://search.example/suggest?q=%s', 'https://search.example/?q=%s')).toBe(true);
    expect(isSuggestTemplate('http://search.example/suggest?q=%s')).toBe(false);
    expect(isSuggestTemplate('https://search.example/suggest')).toBe(false);
    expect(isSuggestTemplate('http://127.0.0.1:9/s?q=%s')).toBe(true);
    expect(parseConfig({ searchSuggestions: 'ftp://x/%s' }).problems.join(' ')).toContain('searchSuggestions');
    expect(parseConfig({ searchSuggestions: true }).config.searchSuggestions).toBe(true);
  });
});

describe('what the search site answers', () => {
  it('is taken when it is the usual shape, a few of them, without what was typed', () => {
    expect(
      parseSearchSuggestions(
        [
          'wea',
          ['weather', 'wea', ' weather  tomorrow ', 'weather', 'wealth', 'weasel', 'weave'],
          ['extra'],
          { more: 1 },
        ],
        'wea',
      ),
    ).toEqual(['weather', 'weather tomorrow', 'wealth', 'weasel']);
  });
  it('is dropped when it is anything else', () => {
    for (const body of [null, 'text', {}, [], ['q'], ['q', 'not a list'], ['q', [5, null, {}, 'x'.repeat(101), '']]])
      expect(parseSearchSuggestions(body, 'q')).toEqual([]);
  });
});
