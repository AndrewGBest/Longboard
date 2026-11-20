// @vitest-environment jsdom
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { genericRules, rulesFrom, rulesFromUntrusted, rulesReport } from '../src/layer/profile/rules';
import { SpatialNavigator } from '../src/layer/spatial/navigator';
import { ProfileStore, sourceLabel } from '../src/main/profiles';
import { canvasOf, wantsTv, chooseProfile, exportName, hostMatches, importKey, matchScore, validateProfile, type Profile, type StoredProfile } from '../src/shared/profile';

const base = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  longboard: 1,
  id: 'example-video',
  name: 'Example Video',
  version: '1.0.0',
  authors: ['someone'],
  licence: 'CC0-1.0',
  match: { hosts: ['example.com', '*.example.com'] },
  evidence: { outline: 'outline.txt' },
  ...extra,
});
const valid = (extra: Record<string, unknown> = {}): Profile => {
  const { profile, problems } = validateProfile(base(extra));
  if (!profile) throw new Error(problems.join('; '));
  return profile;
};
const problemsOf = (raw: unknown): string => validateProfile(raw).problems.join(' | ');

describe('validateProfile', () => {
  it('accepts the smallest profile and the fullest', () => {
    expect(validateProfile(base()).problems).toEqual([]);
    const full = base({
      match: { hosts: ['example.com'], paths: ['/', '/watch'] },
      view: { canvas: '960x540', safeMargin: 0.05 },
      focus: {
        include: ['a.card'],
        exclude: ['.cookie-banner'],
        initial: 'a.card',
        groups: [{ name: 'row', selector: '.carousel', axis: 'horizontal', remember: true }],
        scrollPrevious: ['button.prev'],
        scrollNext: ['button.next'],
      },
      player: { container: '.player', controls: '.player button', close: '.player .close', keys: { playPause: 'k', back: 'j', forward: 'l' } },
      text: { search: 'input[type=search]', searchOpen: 'button.search' },
      dismiss: ['.modal .close'],
      guard: { purchase: ['.buy'] },
    });
    const { profile, problems } = validateProfile(full);
    expect(problems).toEqual([]);
    expect(profile).toEqual(full);
  });

  it('accepts the built-in profile and the template', () => {
    for (const file of ['profiles/primevideo.com/profile.json', 'profiles/template.json']) {
      expect(validateProfile(JSON.parse(readFileSync(join(__dirname, '..', file), 'utf8'))).problems, file).toEqual([]);
    }
  });

  it('refuses scripts, in so many words', () => {
    expect(problemsOf(base({ scripts: ['x.js'] }))).toMatch(/cannot contain scripts/);
    expect(validateProfile(base({ scripts: [] })).profile).toBeNull();
  });

  it('refuses any key it does not know, at every level, and says which', () => {
    expect(problemsOf(base({ telemetry: true }))).toMatch(/unknown key "telemetry"/);
    expect(problemsOf(base({ match: { hosts: ['example.com'], ports: [1] } }))).toMatch(/unknown key "ports" in match/);
    expect(problemsOf(base({ focus: { run: 'x' } }))).toMatch(/unknown key "run" in focus/);
    expect(problemsOf(base({ focus: { groups: [{ name: 'r', selector: '.r', axis: 'grid', onEnter: 'x' }] } }))).toMatch(/unknown key "onEnter" in focus.groups\[0\]/);
    expect(problemsOf(base({ player: { keys: { playPause: 'k', mute: 'm' } } }))).toMatch(/unknown key "mute" in player.keys/);
    expect(problemsOf(base({ player: { src: 'x' } }))).toMatch(/unknown key "src" in player/);
    expect(problemsOf(base({ text: { password: 'x' } }))).toMatch(/unknown key "password" in text/);
    expect(problemsOf(base({ guard: { off: true } }))).toMatch(/unknown key "off" in guard/);
    expect(problemsOf(base({ view: { userAgent: 'x' } }))).toMatch(/unknown key "userAgent" in view/);
    expect(problemsOf(base({ evidence: { outline: 'outline.txt', url: 'x' } }))).toMatch(/unknown key "url" in evidence/);
  });

  it('gives nothing back when anything is wrong', () => {
    expect(validateProfile(base({ version: '1' })).profile).toBeNull();
    for (const raw of [null, 'text', 7, [], undefined]) expect(validateProfile(raw).profile).toBeNull();
  });

  it('checks the identity fields', () => {
    expect(problemsOf(base({ longboard: 2 }))).toMatch(/"longboard" must be 1/);
    expect(problemsOf(base({ id: 'Bad Id' }))).toMatch(/"id"/);
    expect(problemsOf(base({ name: '  ' }))).toMatch(/"name"/);
    expect(problemsOf(base({ version: 'v1' }))).toMatch(/"version"/);
    expect(problemsOf(base({ authors: [] }))).toMatch(/"authors"/);
    expect(problemsOf(base({ licence: 'MIT' }))).toMatch(/"licence"/);
  });

  it('accepts only plain host names, with at most a leading "*."', () => {
    for (const host of ['https://example.com', 'example.com/path', '*', '*.com.', 'ex*mple.com', 'EXAMPLE.com', 'a.*.example.com', '127.0.0.1', 'localhost']) {
      expect(validateProfile(base({ match: { hosts: [host] } })).profile, host).toBeNull();
    }
    expect(problemsOf(base({ match: { hosts: [] } }))).toMatch(/at least one host/);
    expect(problemsOf(base({ match: { hosts: ['example.com'], paths: ['watch'] } }))).toMatch(/start with "\/"/);
    expect(problemsOf(base({ match: undefined }))).toMatch(/"match" is required/);
  });

  it('checks shapes and limits', () => {
    expect(problemsOf(base({ view: { canvas: 'big' } }))).toMatch(/960x540/);
    expect(problemsOf(base({ view: { safeMargin: 0.5 } }))).toMatch(/between 0 and 0.15/);
    expect(problemsOf(base({ focus: { include: 'a' } }))).toMatch(/list of at most/);
    expect(problemsOf(base({ focus: { include: ['a'.repeat(301)] } }))).toMatch(/list of at most/);
    expect(problemsOf(base({ focus: { include: new Array(51).fill('a') } }))).toMatch(/list of at most/);
    expect(problemsOf(base({ focus: { initial: 7 } }))).toMatch(/must be a selector/);
    expect(problemsOf(base({ focus: { groups: [{ name: 'r', selector: '.r', axis: 'diagonal' }] } }))).toMatch(/horizontal, vertical or grid/);
    expect(problemsOf(base({ focus: { groups: [{ name: 'r', axis: 'grid' }] } }))).toMatch(/selector" is required/);
    expect(problemsOf(base({ player: { keys: { playPause: 'F5' } } }))).toMatch(/must be one of/);
    expect(problemsOf(base({ player: { keys: { playPause: 'Meta+q' } } }))).toMatch(/must be one of/);
    expect(problemsOf(base({ dismiss: [7] }))).toMatch(/list of at most/);
    expect(problemsOf(base({ focus: [] }))).toMatch(/"focus" must be an object/);
  });

  it('needs evidence, named by a plain relative path', () => {
    expect(problemsOf(base({ evidence: undefined }))).toMatch(/"evidence" is required/);
    for (const outline of ['', '../../etc/passwd', '/etc/passwd', 'a\\b']) expect(validateProfile(base({ evidence: { outline } })).profile, outline).toBeNull();
  });
});

describe('matching', () => {
  it('matches a host exactly, or anything under it with "*."', () => {
    expect(hostMatches('example.com', 'example.com')).toBe(true);
    expect(hostMatches('example.com', 'EXAMPLE.com')).toBe(true);
    expect(hostMatches('example.com', 'www.example.com')).toBe(false);
    expect(hostMatches('*.example.com', 'www.example.com')).toBe(true);
    expect(hostMatches('*.example.com', 'a.b.example.com')).toBe(true);
    expect(hostMatches('*.example.com', 'example.com')).toBe(false);
    expect(hostMatches('*.example.com', 'evilexample.com')).toBe(false);
    expect(hostMatches('example.com', 'example.com.evil.test')).toBe(false);
  });

  it('applies to web addresses on its hosts and nothing else', () => {
    const p = valid();
    expect(matchScore(p, 'https://www.example.com/anything?x=1')).toBeGreaterThanOrEqual(0);
    expect(matchScore(p, 'http://example.com/')).toBeGreaterThanOrEqual(0);
    expect(matchScore(p, 'https://example.org/')).toBe(-1);
    expect(matchScore(p, 'file:///example.com/')).toBe(-1);
    expect(matchScore(p, 'not an address')).toBe(-1);
  });

  it('respects paths, by whole segments, and prefers the longest', () => {
    const watch = valid({ id: 'watch', match: { hosts: ['example.com'], paths: ['/watch'] } });
    expect(matchScore(watch, 'https://example.com/watch')).toBe(6);
    expect(matchScore(watch, 'https://example.com/watch/123')).toBe(6);
    expect(matchScore(watch, 'https://example.com/watching')).toBe(-1);
    expect(matchScore(watch, 'https://example.com/')).toBe(-1);
    const both = valid({ match: { hosts: ['example.com'], paths: ['/', '/watch'] } });
    expect(matchScore(both, 'https://example.com/watch/1')).toBe(6);
    expect(matchScore(both, 'https://example.com/browse')).toBe(1);
  });
});

describe('chooseProfile', () => {
  const p = (id: string, extra: Record<string, unknown> = {}): Profile => valid({ id, name: id, ...extra });
  const url = 'https://www.example.com/watch/1';
  const all: StoredProfile[] = [
    { profile: p('built'), source: 'builtin' },
    { profile: p('cat'), source: 'catalogue' },
    { profile: p('imp'), source: 'imported' },
    { profile: p('mine'), source: 'local' },
  ];
  const without = (...sources: string[]): StoredProfile[] => all.filter((s) => !sources.includes(s.source));

  it("uses the person's own profile first", () => {
    expect(chooseProfile(url, all, {})).toMatchObject({ kind: 'use', source: 'local' });
  });

  it('never uses an imported profile silently: it asks, and falls back to a reviewed one meanwhile', () => {
    const choice = chooseProfile(url, without('local'), {});
    expect(choice.kind).toBe('ask');
    expect(choice).toMatchObject({ profile: { id: 'imp' }, fallback: { source: 'catalogue' } });
    expect(chooseProfile(url, without('local', 'catalogue', 'builtin'), {})).toMatchObject({ kind: 'ask', fallback: null });
  });

  it('uses an imported profile once agreed to, and passes over one that was refused', () => {
    expect(chooseProfile(url, without('local'), { 'imp@1.0.0': 'yes' })).toMatchObject({ kind: 'use', source: 'imported' });
    expect(chooseProfile(url, without('local'), { 'imp@1.0.0': 'no' })).toMatchObject({ kind: 'use', source: 'catalogue' });
  });

  it('asks again when an imported profile changes version', () => {
    const newer: StoredProfile[] = [{ profile: p('imp', { version: '1.1.0' }), source: 'imported' }];
    expect(chooseProfile(url, newer, { 'imp@1.0.0': 'yes' }).kind).toBe('ask');
    expect(importKey(newer[0]!.profile)).toBe('imp@1.1.0');
  });

  it('prefers the catalogue to what is built in, and has nothing for other sites', () => {
    expect(chooseProfile(url, without('local', 'imported'), {})).toMatchObject({ kind: 'use', source: 'catalogue' });
    expect(chooseProfile(url, without('local', 'imported', 'catalogue'), {})).toMatchObject({ kind: 'use', source: 'builtin' });
    expect(chooseProfile('https://other.test/', all, {})).toEqual({ kind: 'none' });
  });

  it('within one source, takes the profile whose path fits best', () => {
    const two: StoredProfile[] = [
      { profile: p('whole'), source: 'catalogue' },
      { profile: p('watch-page', { match: { hosts: ['*.example.com'], paths: ['/watch'] } }), source: 'catalogue' },
    ];
    expect(chooseProfile(url, two, {})).toMatchObject({ profile: { id: 'watch-page' } });
    expect(chooseProfile('https://www.example.com/', two, {})).toMatchObject({ profile: { id: 'whole' } });
  });
});

describe('small helpers', () => {
  it('reads the canvas and names the export file', () => {
    expect(canvasOf(valid({ view: { canvas: '1280x720' } }))).toEqual({ width: 1280, height: 720 });
    expect(canvasOf(valid())).toBeNull();
    expect(canvasOf(null)).toBeNull();
    expect(exportName(valid())).toBe('example-video.longboard-profile.json');
    expect(sourceLabel('catalogue')).toBe('reviewed');
  });
});

describe('the interpreter', () => {
  it('gives empty rules with no profile, or with something that is not one', () => {
    expect(rulesFromUntrusted(null).generic).toBe(true);
    expect(rulesFromUntrusted({ longboard: 1, id: 'x' }).generic).toBe(true);
    expect(rulesFromUntrusted(base({ scripts: ['x'] })).generic).toBe(true);
    expect(genericRules().playerKeys).toEqual({ playPause: 'Space', back: 'ArrowLeft', forward: 'ArrowRight' });
  });

  it('turns a profile into what the layer works from', () => {
    const rules = rulesFromUntrusted(
      base({
        focus: { include: ['a.card'], exclude: ['.banner'], initial: 'a.card', scrollPrevious: ['.prev'], scrollNext: ['.next'], groups: [{ name: 'r', selector: '.row', axis: 'horizontal' }] },
        player: { container: '.player', controls: '.player button', close: '.x', keys: { playPause: 'k' } },
        text: { search: 'input.q', searchOpen: 'button.q' },
        dismiss: ['.close'],
        guard: { purchase: ['.buy'] },
      }),
      document,
    );
    expect(rules).toMatchObject({ id: 'example-video', generic: false, initial: 'a.card' });
    expect(rules.selectors).toEqual({
      extraFocusable: ['a.card', '.player button'],
      exclude: ['.banner'],
      searchInput: ['input.q'],
      searchOpen: ['button.q'],
      rowPrev: ['.prev'],
      rowNext: ['.next'],
      playerRoot: ['.player'],
      playerClose: ['.x'],
      purchaseControls: ['.buy'],
      dismiss: ['.close'],
    });
    expect(rules.playerKeys).toEqual({ playPause: 'k', back: 'ArrowLeft', forward: 'ArrowRight' });
    expect(rules.groups).toHaveLength(1);
  });

  it('drops selectors the browser cannot parse instead of failing', () => {
    const rules = rulesFrom(valid({ focus: { include: ['a.ok', '>>bad<<'], initial: ':::', groups: [{ name: 'r', selector: '((', axis: 'grid' }] } }), document);
    expect(rules.selectors.extraFocusable).toEqual(['a.ok']);
    expect(rules.initial).toBeNull();
    expect(rules.groups).toEqual([]);
  });

  it('reports how much of a profile still matches the page', () => {
    document.body.innerHTML = '<button class="next"></button><button class="next"></button>';
    const rules = rulesFrom(valid({ focus: { scrollNext: ['.next'], scrollPrevious: ['.gone'] } }), document);
    expect(rulesReport(rules, document)).toBe('profile example-video 1.0.0: rowPrev=0 rowNext=2');
    expect(rulesReport(genericRules(), document)).toBe('no profile (generic mode)');
  });
});

describe('groups and the starting point', () => {
  const at = (id: string, x: number, y: number): string => `<a href="#" id="${id}" data-rect="${x},${y},100,60">x</a>`;
  beforeEach(() => {
    Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
      const [left = 0, top = 0, width = 0, height = 0] = (this.getAttribute('data-rect') ?? '').split(',').map(Number);
      return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
    };
    Element.prototype.scrollIntoView = () => undefined;
    window.scrollTo = (() => undefined) as typeof window.scrollTo;
    // A menu down the left, and two rows beside it; the second row sits a little lower than the first's last card.
    document.body.innerHTML = `
      <nav class="menu">${at('m1', 0, 0)}${at('m2', 0, 80)}${at('m3', 0, 160)}</nav>
      <div class="row" id="r1">${at('a1', 200, 0)}${at('a2', 320, 0)}${at('a3', 440, 0)}</div>
      ${at('stray', 560, 20)}
      <div class="row" id="r2">${at('b1', 200, 100)}${at('b2', 320, 100)}</div>`;
  });
  const groups = [
    { name: 'row', selector: '.row', axis: 'horizontal' as const, remember: true },
    { name: 'menu', selector: '.menu', axis: 'vertical' as const },
  ];
  const el = (id: string): Element => document.getElementById(id)!;

  it('starts where the profile says', () => {
    const nav = new SpatialNavigator(document, { initial: '#b2' });
    nav.move('down');
    expect(nav.focused?.id).toBe('b2');
    const bad = new SpatialNavigator(document, { initial: '#missing' });
    bad.move('down');
    expect(bad.focused?.id).toBe('m1');
  });

  it("left and right never leave a row the profile names; without the group they would", () => {
    const plain = new SpatialNavigator(document);
    plain.focus(el('a3'));
    plain.move('right');
    expect(plain.focused?.id).toBe('stray');
    const nav = new SpatialNavigator(document, { groups });
    nav.focus(el('a3'));
    expect(nav.move('right')).toBe(false);
    expect(nav.focused?.id).toBe('a3');
    nav.focus(el('a1'));
    expect(nav.move('left')).toBe(false);
  });

  it('up and down leave a row, and coming back returns to where the highlight was', () => {
    const nav = new SpatialNavigator(document, { groups });
    nav.focus(el('a3'));
    nav.move('down');
    expect(nav.focused?.id).toBe('b2');
    nav.move('left');
    expect(nav.focused?.id).toBe('b1');
    nav.move('up');
    expect(nav.focused?.id).toBe('a3');
  });

  it('up and down stay in a column while it has more that way', () => {
    const nav = new SpatialNavigator(document, { groups });
    nav.focus(el('m1'));
    nav.move('down');
    nav.move('down');
    expect(nav.focused?.id).toBe('m3');
    nav.move('up');
    expect(nav.focused?.id).toBe('m2');
    // Across the column, movement leaves it as usual.
    nav.move('right');
    expect(nav.focused?.id).toBe('b1');
  });
});

describe('the profile store', () => {
  let dir: string;
  const folders = () => ({
    builtin: join(dir, 'builtin'),
    catalogue: join(dir, 'catalogue'),
    local: join(dir, 'profiles'),
    imported: join(dir, 'imported'),
    exports: join(dir, 'exports'),
    answers: join(dir, 'answers.json'),
  });
  const put = (file: string, raw: unknown): void => {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, typeof raw === 'string' ? raw : JSON.stringify(raw));
  };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'longboard-profiles-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads every source, leaves out anything invalid and says why', () => {
    put(join(dir, 'builtin/example.com/profile.json'), base({ id: 'built' }));
    put(join(dir, 'catalogue/profiles/example.com/profile.json'), base({ id: 'cat' }));
    put(join(dir, 'profiles/mine.json'), base({ id: 'mine', match: { hosts: ['other.test'] } }));
    put(join(dir, 'profiles/broken.json'), '{ not json');
    put(join(dir, 'profiles/scripted.json'), base({ id: 'scripted', scripts: ['x'] }));
    put(join(dir, 'profiles/huge.json'), JSON.stringify(base({ name: 'x'.repeat(300_000) })));
    const notes: string[] = [];
    const store = new ProfileStore(folders(), (line) => notes.push(line));
    expect(store.count).toBe(3);
    expect(notes.join('\n')).toMatch(/broken\.json could not be read/);
    expect(notes.join('\n')).toMatch(/scripted\.json is not a usable profile: profiles cannot contain scripts/);
    expect(notes.join('\n')).toMatch(/huge\.json: too large/);
    expect(store.choose('https://example.com/')).toMatchObject({ kind: 'use', source: 'catalogue' });
    expect(store.choose('https://other.test/')).toMatchObject({ kind: 'use', source: 'local' });
  });

  it('imports only files with the profile file name, asks before use, and remembers the answer', () => {
    const usb = join(dir, 'usb');
    put(join(usb, 'given.longboard-profile.json'), base({ id: 'given' }));
    put(join(usb, 'bad.longboard-profile.json'), base({ id: 'bad', scripts: [] }));
    put(join(usb, 'notes.json'), base({ id: 'not-a-profile-file' }));
    const store = new ProfileStore(folders(), () => undefined);
    expect(store.importFrom([usb, join(dir, 'missing')])).toEqual(['Example Video']);
    expect(existsSync(join(dir, 'imported/given.json'))).toBe(true);
    const choice = store.choose('https://example.com/');
    expect(choice.kind).toBe('ask');
    if (choice.kind !== 'ask') return;
    // "Not now" lasts for this run only.
    store.answer(choice.profile, false, false);
    expect(store.choose('https://example.com/')).toEqual({ kind: 'none' });
    expect(new ProfileStore(folders(), () => undefined).choose('https://example.com/').kind).toBe('ask');
    // A real answer is kept.
    store.answer(choice.profile, true, true);
    expect(new ProfileStore(folders(), () => undefined).choose('https://example.com/')).toMatchObject({ kind: 'use', source: 'imported' });
    // Another file under the same name and version, saying something else, was not what was agreed to.
    put(join(usb, 'given.longboard-profile.json'), base({ id: 'given', focus: { include: ['.something-else'] } }));
    const again = new ProfileStore(folders(), () => undefined);
    again.importFrom([usb]);
    expect(again.choose('https://example.com/').kind).toBe('ask');
  });

  it('exports a profile as one file that validates', () => {
    const store = new ProfileStore(folders(), () => undefined);
    const file = store.exportProfile(valid());
    expect(file).toBe(join(dir, 'exports/example-video.longboard-profile.json'));
    expect(validateProfile(JSON.parse(readFileSync(file!, 'utf8'))).problems).toEqual([]);
  });
});

describe('a site with an interface for TVs', () => {
  it('is named by one word, and nothing else is accepted there', () => {
    expect(wantsTv(valid({ view: { device: 'tv' } }))).toBe(true);
    expect(wantsTv(valid())).toBe(false);
    expect(wantsTv(null)).toBe(false);
    for (const device of ['console', 'TV', 'phone', 'Mozilla/5.0 (Another Browser)', true, { tv: true }]) {
      expect(validateProfile(base({ view: { device } })).problems.join()).toContain('"view.device" can only be "tv"');
    }
    // No way to hand over a user agent of the profile's own.
    expect(validateProfile(base({ view: { userAgent: 'x' } })).profile).toBeNull();
    expect(validateProfile(base({ identity: 'x' })).profile).toBeNull();
  });

  it('leaves the remote to the site', () => {
    expect(rulesFrom(valid({ view: { device: 'tv' } })).ownRemote).toBe(true);
    expect(rulesFrom(valid()).ownRemote).toBe(false);
    expect(genericRules().ownRemote).toBe(false);
  });
});
