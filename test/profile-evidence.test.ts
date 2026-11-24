// @vitest-environment jsdom
// Hard rule 8: every selector in a built-in profile must be shown by an
// outline from the live site. This test rebuilds each page from the profile's
// own outline file and checks every selector against it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rulesFrom } from '../src/layer/profile/rules';
import { validateProfile } from '../src/shared/profile';
import { isSpendControl } from '../src/layer/guard/purchase-guard';

const DIR = join(__dirname, '../profiles/primevideo.com');
const checked = validateProfile(JSON.parse(readFileSync(join(DIR, 'profile.json'), 'utf8')));
if (!checked.profile) throw new Error(`the built-in profile is not valid: ${checked.problems.join('; ')}`);
const adapter = rulesFrom(checked.profile);

/** The outline file holds several pages; a line starting with "####" begins one. */
const pages = new Map<string, string>();
{
  let name = '';
  for (const line of readFileSync(join(DIR, checked.profile.evidence.outline), 'utf8').split('\n')) {
    if (line.startsWith('#### ')) name = line.slice(5).trim();
    else if (name) pages.set(name, `${pages.get(name) ?? ''}${line}\n`);
  }
}

/** Rebuilds elements from outline lines: `tag#id.class[attr="v"][attr:len]{text:len}`. */
function fromOutline(name: string): HTMLElement {
  const root = document.createElement('div');
  const stack: Array<{ depth: number; el: Element }> = [{ depth: -1, el: root }];
  const text = pages.get(name);
  if (text === undefined) throw new Error(`no outline named ${name}`);
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const depth = (line.length - line.trimStart().length) / 2;
    const text = line.trim();
    const headEnd = text.search(/[[{]/);
    const head = headEnd < 0 ? text : text.slice(0, headEnd);
    const [tagAndId = '', ...classes] = head.split('.');
    const [tag = 'div', id] = tagAndId.split('#');
    const el = document.createElement(tag);
    if (id) el.id = id;
    if (classes.length) el.setAttribute('class', classes.join(' '));
    for (const m of text.matchAll(/\[([a-z-]+)(?:="([^"]*)"|:(\d+))\]/g)) {
      el.setAttribute(m[1]!, m[2] ?? 'x'.repeat(Number(m[3])));
    }
    const t = /\{text:(\d+)\}/.exec(text);
    if (t) el.textContent = 'x'.repeat(Number(t[1]));
    while (stack[stack.length - 1]!.depth >= depth) stack.pop();
    stack[stack.length - 1]!.el.append(el);
    stack.push({ depth, el });
  }
  return root;
}

describe('the built-in profile is backed by outlines', () => {
  it('the outlines carry structure only', () => {
    expect(pages.size).toBe(5);
    for (const body of pages.values()) {
      const lines = body.split('\n').filter((l) => !l.startsWith('#'));
      // No free text can survive: outline lines have no spaces except indentation.
      expect(lines.every((l) => !l.trim().includes(' '))).toBe(true);
      expect(body).not.toMatch(/https?:|profile-[A-Za-z]/);
    }
  });

  it('every selector in the profile matches something in the outlines', () => {
    const all = [...pages.keys()].map((name) => fromOutline(name));
    for (const [list, selectors] of Object.entries(adapter.selectors)) {
      for (const sel of selectors)
        expect(
          all.some((dom) => dom.querySelector(sel) !== null),
          `${list}: ${sel}`,
        ).toBe(true);
    }
  });

  it('search: the opener is the button next to the hidden dropdown, and the input is inside it', () => {
    const dom = fromOutline('home-search');
    const opener = dom.querySelectorAll(adapter.selectors.searchOpen[0]!);
    expect(opener).toHaveLength(1);
    expect(opener[0]!.tagName).toBe('BUTTON');
    const input = dom.querySelector(adapter.selectors.searchInput[0]!);
    expect(input?.getAttribute('type')).toBe('search');
    expect(input?.closest('[data-testid="pv-nav-search-dropdown"]')).not.toBeNull();
  });

  it('carousel arrows: the top carousel and each card row have one previous and one next button beside their list', () => {
    const dom = fromOutline('home-carousels');
    const prev = adapter.selectors.rowPrev[0]!;
    const next = adapter.selectors.rowNext[0]!;
    for (const strip of ['[data-testid="top-hero-wrapper"]', '[data-testid="standard-carousel"]']) {
      const el = dom.querySelector(strip)!;
      expect(el.querySelectorAll(prev)).toHaveLength(1);
      expect(el.querySelectorAll(next)).toHaveLength(1);
      expect(el.querySelector(next)!.parentElement!.querySelector('ul')).not.toBeNull();
    }
  });

  it('purchase controls: the Store banner button is guarded whatever its wording', () => {
    const dom = fromOutline('store-banner');
    document.body.replaceChildren(dom);
    const button = dom.querySelector(adapter.selectors.purchaseControls[1]!);
    expect(button?.tagName).toBe('BUTTON');
    // Judged by the selector alone: the fixture's text is only filler of the right length.
    expect(isSpendControl(button!.querySelector('strong')!, [])).toBe(false);
    expect(isSpendControl(button!.querySelector('strong')!, adapter.selectors.purchaseControls)).toBe(true);
  });

  it('player root: holds no video before playback and the player video during it; the trailer is outside', () => {
    const sel = adapter.selectors.playerRoot[0]!;
    const before = fromOutline('detail-before-play');
    expect(before.querySelectorAll(sel)).toHaveLength(1);
    expect(before.querySelector(`${sel} video`)).toBeNull();
    expect(before.querySelectorAll('video')).toHaveLength(1);

    const playing = fromOutline('detail-playing');
    expect(playing.querySelectorAll(`${sel} video`)).toHaveLength(1);
    expect(playing.querySelectorAll('video')).toHaveLength(2);
    expect(playing.querySelector('[data-testid="draper-player"] video')?.closest(sel)).toBeNull();
  });

  it('purchase controls: the upsell link is guarded and the play button is not', () => {
    const dom = fromOutline('detail-before-play');
    document.body.replaceChildren(dom);
    const upsell = dom.querySelector(adapter.selectors.purchaseControls[0]!);
    expect(upsell?.tagName).toBe('A');
    expect(isSpendControl(upsell!.firstElementChild!, adapter.selectors.purchaseControls)).toBe(true);
    const play = dom.querySelector('[data-testid="dp-atf-play-button"]')!;
    expect(isSpendControl(play, adapter.selectors.purchaseControls)).toBe(false);
  });
});
