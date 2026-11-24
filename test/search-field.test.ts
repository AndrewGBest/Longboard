// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isEmptyField, looksLikeSearch } from '../src/layer/search-field';

const el = (html: string): Element => {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  return holder.querySelector('input, textarea, [contenteditable], [role=searchbox]') as Element;
};

describe("a site's search box", () => {
  it('is known by its kind, its role or where it sits', () => {
    for (const html of [
      '<input type="search">',
      '<div role="searchbox" contenteditable></div>',
      '<form role="search"><input type="text"></form>',
      '<input enterkeyhint="search">',
    ])
      expect(looksLikeSearch(el(html))).toBe(true);
  });

  it('is known by the word in whatever attribute the site names it with', () => {
    for (const html of [
      '<input name="search_query">',
      '<input id="SearchBox">',
      '<input aria-label="Search titles">',
      '<input placeholder="Search">',
      '<input type="text" data-uia="navigation+actions+search+input">',
      '<input class="searchInput">',
    ])
      expect(looksLikeSearch(el(html))).toBe(true);
  });

  it('is not an ordinary field, whatever has been typed into it', () => {
    for (const html of [
      '<input type="text" name="email">',
      '<input type="password">',
      '<textarea name="notes"></textarea>',
      '<input type="text" value="search for this">',
      '<input placeholder="Titles, people, genres">',
    ])
      expect(looksLikeSearch(el(html))).toBe(false);
  });

  it('is empty until something is typed', () => {
    expect(isEmptyField(el('<input>'))).toBe(true);
    expect(isEmptyField(el('<input value="a">'))).toBe(false);
    expect(isEmptyField(el('<div role="searchbox" contenteditable> </div>'))).toBe(true);
    expect(isEmptyField(el('<div role="searchbox" contenteditable>a</div>'))).toBe(false);
  });
});
