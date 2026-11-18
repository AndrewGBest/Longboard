// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { pickChain, selectorLike } from '../src/layer/edit/selector';
import { hasContent, hasMark, localProfileId, marksOf, nextVersion, parsePicked, startDraft, toggleMark } from '../src/shared/editor';
import { validateProfile, type Profile } from '../src/shared/profile';

const page = (html: string): void => void (document.body.innerHTML = html);
const $ = (sel: string): Element => document.querySelector(sel)!;

describe('writing a selector for what was pointed at', () => {
  it('names the kind of thing, not the one thing', () => {
    page('<div class="row"><div class="tile big" id="t1"></div><div class="tile" id="t2"></div></div>');
    expect(selectorLike($('#t2'))).toBe('div.tile');
    expect(selectorLike($('#t1'))).toBe('div.tile.big');
  });

  it('uses structural attributes when there are no usable classes', () => {
    page('<button data-testid="play-button" class="x9Fq2LmZ">x</button><div role="tab">x</div>');
    expect(selectorLike($('button'))).toBe('button[data-testid="play-button"]');
    expect(selectorLike($('[role=tab]'))).toBe('div[role="tab"]');
  });

  it('passes over generated-looking classes and ids, which change with every build of a site', () => {
    page('<a class="UEsHTy css-1a2b3c4 nav-link" id="item-48213">x</a>');
    expect(selectorLike($('a'))).toBe('a.nav-link');
    page('<ul class="menu"><li id="r1"><a id="a8f3k2Lq" href="#">x</a></li></ul>');
    expect(selectorLike($('a'))).toBe('a');
    expect(selectorLike($('li'))).toBe('li#r1');
  });

  it('falls back to "directly inside its container"', () => {
    page('<nav class="main"><a href="#">one</a><a href="#">two</a></nav>');
    expect(selectorLike($('a'))).toBe('nav.main > a');
  });

  it('never reads text into a selector', () => {
    page('<div class="card" title="A Secret Title" aria-label="Secret"><span>Secret words</span></div>');
    expect(pickChain($('span')).map((s) => s.selector).join(' ')).not.toMatch(/Secret/i);
  });

  it('gives the chain outward, with how many each step matches', () => {
    page('<main class="page"><div class="row"><div class="tile"><span class="label">x</span></div><div class="tile"></div></div><div class="row"></div></main>');
    expect(pickChain($('.label'))).toEqual([
      { selector: 'span.label', matches: 1 },
      { selector: 'div.tile', matches: 2 },
      { selector: 'div.row', matches: 2 },
      { selector: 'main.page', matches: 1 },
    ]);
  });
});

describe('the draft profile', () => {
  const url = 'https://www.example.com/watch/1';
  const fresh = (): Profile => startDraft(url, null)!;

  it('starts empty for a site with no profile, named after the site', () => {
    const draft = fresh();
    expect(draft).toMatchObject({ id: 'example-com', name: 'example.com', version: '1.0.0', match: { hosts: ['example.com', '*.example.com'] }, evidence: { outline: 'example-com.outline.txt' } });
    expect(validateProfile(draft).problems).toEqual([]);
    expect(hasContent(draft)).toBe(false);
  });

  it('starts from the profile in use, with its version raised', () => {
    const current = validateProfile({ ...fresh(), id: 'reviewed-one', version: '2.4.9', focus: { include: ['a.card'] } }).profile!;
    const draft = startDraft(url, current)!;
    expect(draft).toMatchObject({ id: 'reviewed-one', version: '2.4.10', focus: { include: ['a.card'] }, evidence: { outline: 'reviewed-one.outline.txt' } });
    expect(current.version).toBe('2.4.9');
    expect(nextVersion('nonsense')).toBe('1.0.0');
  });

  it('cannot be made for a site a profile cannot name', () => {
    expect(startDraft('http://127.0.0.1:8080/', null)).toBeNull();
    expect(startDraft('file:///x', null)).toBeNull();
    expect(localProfileId('https://Sub.Example.co.uk/')).toBe('sub-example-co-uk');
  });

  it('puts a mark on and takes it off again', () => {
    let draft = toggleMark(fresh(), 'include', 'div.tile');
    expect(draft.focus).toEqual({ include: ['div.tile'] });
    expect(hasMark(draft, 'include', 'div.tile')).toBe(true);
    expect(hasContent(draft)).toBe(true);
    draft = toggleMark(draft, 'include', 'div.tile');
    expect(draft.focus).toBeUndefined();
    expect(hasContent(draft)).toBe(false);
  });

  it('never lets one selector be both selectable and never selected', () => {
    let draft = toggleMark(fresh(), 'include', '.banner a');
    draft = toggleMark(draft, 'exclude', '.banner a');
    expect(draft.focus).toEqual({ exclude: ['.banner a'] });
    draft = toggleMark(draft, 'include', '.banner a');
    expect(draft.focus).toEqual({ include: ['.banner a'] });
  });

  it('marks rows and the player, and lists every mark for drawing', () => {
    let draft = toggleMark(fresh(), 'row', 'div.strip');
    draft = toggleMark(draft, 'row', 'ul.list');
    draft = toggleMark(draft, 'player', 'div.player');
    draft = toggleMark(draft, 'exclude', 'div.banner');
    expect(draft.focus?.groups).toEqual([
      { name: 'row-1', selector: 'div.strip', axis: 'horizontal', remember: true },
      { name: 'row-2', selector: 'ul.list', axis: 'horizontal', remember: true },
    ]);
    expect(marksOf(draft)).toEqual({ include: [], exclude: ['div.banner'], row: ['div.strip', 'ul.list'], player: ['div.player'] });
    draft = toggleMark(draft, 'row', 'div.strip');
    draft = toggleMark(draft, 'player', 'div.player');
    expect(draft.focus?.groups).toHaveLength(1);
    expect(draft.player).toBeUndefined();
    expect(validateProfile(draft).problems).toEqual([]);
  });

  it('stays a valid profile whatever is asked of it', () => {
    const draft = toggleMark(fresh(), 'include', 'x'.repeat(400));
    expect(draft).toEqual(fresh());
    let many = fresh();
    for (let i = 0; i < 60; i++) many = toggleMark(many, 'include', `a.kind-${i}`);
    expect(many.focus?.include).toHaveLength(50);
    expect(validateProfile(many).problems).toEqual([]);
  });
});

describe('what the layer says was picked', () => {
  it('is checked before it is believed', () => {
    expect(parsePicked([{ selector: 'div.tile', matches: 5 }, { selector: '', matches: 1 }, { selector: 'a', matches: 'many' }, 'text', { selector: 'x'.repeat(301) }])).toEqual([
      { selector: 'div.tile', matches: 5 },
      { selector: 'a', matches: 0 },
    ]);
    expect(parsePicked('nonsense')).toEqual([]);
    expect(parsePicked(new Array(20).fill({ selector: 'a', matches: 1 }))).toHaveLength(8);
  });
});
