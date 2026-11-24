// The profile format, version 1: what a profile may say, the check every
// profile goes through before it is used, and which profile applies to an
// address. Pure, so every rule is unit-tested. docs/PROFILES.md describes the
// format for people; this file is what is enforced.
//
// A profile is data (Hard rule 7). Nothing here runs anything from a profile:
// it holds selectors, names and numbers. A file with a key this does not know
// is refused whole, so nothing can be smuggled in under a new name.

export const PROFILE_FORMAT = 1;

export type Axis = 'horizontal' | 'vertical' | 'grid';

export interface ProfileGroup {
  name: string;
  /** The container. */
  selector: string;
  /** Which way its members run. */
  axis: Axis;
  /** Coming back to the group returns to the member last used. */
  remember?: boolean;
}

/** The ordinary keys a site's own player may be told about. Nothing else can be named. */
export const PLAYER_KEY_NAMES = [
  'Space',
  'Enter',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'k',
  'j',
  'l',
  'f',
  'm',
] as const;
export type PlayerKeyName = (typeof PLAYER_KEY_NAMES)[number];

export interface Profile {
  longboard: 1;
  id: string;
  name: string;
  version: string;
  authors: string[];
  licence: string;
  /** The sites the profile is for ("example.com", "*.example.com") and, optionally, the paths on them. */
  match: { hosts: string[]; paths?: string[] };
  view?: {
    /** The size the site is drawn at before being scaled to the screen, such as "960x540". */
    canvas?: string;
    /** The share of the screen kept clear at every edge, 0 to 0.15. */
    safeMargin?: number;
    /** The site has a layout for TVs and gives it to what says it is one (`wantsTv`, `deviceOf`). */
    device?: 'tv' | 'tv-browser';
    /** The path on the site where that layout lives (`entryFor`). */
    entry?: string;
    /** The query parameters copied across when an address is opened at `entry` instead. */
    carry?: string[];
  };
  focus?: {
    /** Elements that can take the highlight, added to what generic mode finds. */
    include?: string[];
    /** Elements (and everything inside them) that never take it. */
    exclude?: string[];
    /** Where the highlight starts. */
    initial?: string;
    groups?: ProfileGroup[];
    /** A row's own "previous" and "next" arrows: pressed when left or right runs out, never highlighted. */
    scrollPrevious?: string[];
    scrollNext?: string[];
  };
  player?: {
    /** What the site's player lives in. */
    container?: string;
    /** The player's own controls, when generic mode does not find them. */
    controls?: string;
    /** The player's own close button, pressed by Back. */
    close?: string;
    /** The ordinary keys the site's player answers to. */
    keys?: { playPause?: PlayerKeyName; back?: PlayerKeyName; forward?: PlayerKeyName };
  };
  text?: {
    /** The search field. */
    search?: string;
    /** A control that reveals the search field when it is hidden. */
    searchOpen?: string;
  };
  /** Close buttons that Back presses first. */
  dismiss?: string[];
  /** What a scripted run must never press, beyond what the guard recognises by its words. */
  guard?: { purchase?: string[] };
  /** The outline file that shows the selectors exist. */
  evidence: { outline: string };
}

const HOST = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const CANVAS = /^(\d{3,4})x(\d{3,4})$/;
const MAX_SELECTOR = 300;
const MAX_LIST = 50;
/** Licences a profile may carry. The catalogue only takes the first. */
export const PROFILE_LICENCES = ['CC0-1.0'] as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/**
 * Checks untrusted data against the format. Returns the profile, rebuilt from
 * only the keys the format has, or the list of everything wrong with it.
 * A profile with any problem is not used at all.
 */
export function validateProfile(raw: unknown): { profile: Profile | null; problems: string[] } {
  const problems: string[] = [];
  const bad = (what: string): void => void problems.push(what);
  if (!isObject(raw)) return { profile: null, problems: ['a profile must be a JSON object'] };

  const only = (obj: Record<string, unknown>, allowed: readonly string[], where: string): void => {
    for (const key of Object.keys(obj))
      if (!allowed.includes(key)) bad(`unknown key "${key.slice(0, 40)}"${where ? ` in ${where}` : ''}`);
  };
  const selector = (v: unknown, where: string): string | undefined => {
    if (v === undefined) return undefined;
    if (!isText(v, MAX_SELECTOR)) {
      bad(`"${where}" must be a selector (text, at most ${MAX_SELECTOR} characters)`);
      return undefined;
    }
    return v;
  };
  const selectors = (v: unknown, where: string): string[] | undefined => {
    if (v === undefined) return undefined;
    if (!Array.isArray(v) || v.length > MAX_LIST || !v.every((s) => isText(s, MAX_SELECTOR))) {
      bad(`"${where}" must be a list of at most ${MAX_LIST} selectors`);
      return undefined;
    }
    return [...v];
  };
  const section = (key: string): Record<string, unknown> | undefined => {
    const v = raw[key];
    if (v === undefined) return undefined;
    if (!isObject(v)) {
      bad(`"${key}" must be an object`);
      return undefined;
    }
    return v;
  };

  if ('scripts' in raw) bad('profiles cannot contain scripts in format version 1');
  only(
    raw,
    [
      'longboard',
      'id',
      'name',
      'version',
      'authors',
      'licence',
      'match',
      'view',
      'focus',
      'player',
      'text',
      'dismiss',
      'guard',
      'evidence',
      'scripts',
    ],
    '',
  );

  if (raw['longboard'] !== PROFILE_FORMAT) bad(`"longboard" must be ${PROFILE_FORMAT}`);
  if (!isText(raw['id'], 60) || !ID.test(raw['id'])) bad('"id" must be lower-case words joined by hyphens');
  if (!isText(raw['name'], 80)) bad('"name" is required');
  if (!isText(raw['version'], 20) || !SEMVER.test(raw['version'])) bad('"version" must look like 1.0.0');
  const authors = raw['authors'];
  if (!Array.isArray(authors) || authors.length === 0 || authors.length > 20 || !authors.every((a) => isText(a, 80)))
    bad('"authors" must list at least one name');
  if (!(PROFILE_LICENCES as readonly unknown[]).includes(raw['licence']))
    bad(`"licence" must be ${PROFILE_LICENCES.join(' or ')}`);

  const profile: Profile = {
    longboard: 1,
    id: String(raw['id']),
    name: String(raw['name']),
    version: String(raw['version']),
    authors: Array.isArray(authors) ? authors.map(String) : [],
    licence: String(raw['licence']),
    match: { hosts: [] },
    evidence: { outline: '' },
  };

  const match = section('match');
  if (!match) bad('"match" is required');
  else {
    only(match, ['hosts', 'paths'], 'match');
    const hosts = match['hosts'];
    if (!Array.isArray(hosts) || hosts.length === 0 || hosts.length > MAX_LIST)
      bad('"match.hosts" must list at least one host');
    else {
      for (const h of hosts)
        if (typeof h !== 'string' || !HOST.test(h))
          bad(`host "${String(h).slice(0, 60)}" must be a lower-case domain, optionally starting with "*."`);
      profile.match.hosts = hosts.map(String);
    }
    const paths = match['paths'];
    if (paths !== undefined) {
      if (!Array.isArray(paths) || paths.length > MAX_LIST || !paths.every((p) => isText(p, 200) && p.startsWith('/')))
        bad('"match.paths" must be a list of paths that start with "/"');
      else profile.match.paths = paths.map(String);
    }
  }

  const view = section('view');
  if (view) {
    only(view, ['canvas', 'safeMargin', 'device', 'entry', 'carry'], 'view');
    profile.view = {};
    if (view['canvas'] !== undefined) {
      if (typeof view['canvas'] !== 'string' || !CANVAS.test(view['canvas']))
        bad('"view.canvas" must look like 960x540');
      else profile.view.canvas = view['canvas'];
    }
    if (view['device'] !== undefined) {
      // One of two words and nothing else: a profile cannot say what Longboard calls itself (Hard rule 3).
      if (view['device'] !== 'tv' && view['device'] !== 'tv-browser')
        bad('"view.device" can only be "tv" or "tv-browser"');
      else profile.view.device = view['device'];
    }
    if (view['entry'] !== undefined) {
      // A path on the site itself and nothing more: never another site, never an address with a question in it.
      const entry = view['entry'];
      if (!isText(entry, 200) || !/^\/[A-Za-z0-9._~\-/]*$/.test(entry) || entry.startsWith('//') || entry === '/')
        bad('"view.entry" must be a plain path on the site, such as "/tv"');
      else profile.view.entry = entry;
    }
    if (view['carry'] !== undefined) {
      const carry = view['carry'];
      if (
        !Array.isArray(carry) ||
        carry.length === 0 ||
        carry.length > 10 ||
        !carry.every((n) => typeof n === 'string' && /^[A-Za-z0-9_-]{1,30}$/.test(n))
      )
        bad('"view.carry" must be a short list of plain parameter names, such as ["v"]');
      else if (view['entry'] === undefined) bad('"view.carry" needs "view.entry"');
      else profile.view.carry = carry.map(String);
    }
    const margin = view['safeMargin'];
    if (margin !== undefined) {
      if (typeof margin !== 'number' || !(margin >= 0 && margin <= 0.15))
        bad('"view.safeMargin" must be between 0 and 0.15');
      else profile.view.safeMargin = margin;
    }
  }

  const focus = section('focus');
  if (focus) {
    only(focus, ['include', 'exclude', 'initial', 'groups', 'scrollPrevious', 'scrollNext'], 'focus');
    profile.focus = {};
    for (const key of ['include', 'exclude', 'scrollPrevious', 'scrollNext'] as const) {
      const list = selectors(focus[key], `focus.${key}`);
      if (list) profile.focus[key] = list;
    }
    const initial = selector(focus['initial'], 'focus.initial');
    if (initial) profile.focus.initial = initial;
    const groups = focus['groups'];
    if (groups !== undefined) {
      if (!Array.isArray(groups) || groups.length > MAX_LIST) bad('"focus.groups" must be a list');
      else {
        profile.focus.groups = [];
        groups.forEach((g, i) => {
          const where = `focus.groups[${i}]`;
          if (!isObject(g)) return bad(`"${where}" must be an object`);
          only(g, ['name', 'selector', 'axis', 'remember'], where);
          const sel = selector(g['selector'], `${where}.selector`);
          if (!isText(g['name'], 60)) bad(`"${where}.name" is required`);
          if (g['selector'] === undefined) bad(`"${where}.selector" is required`);
          if (g['axis'] !== 'horizontal' && g['axis'] !== 'vertical' && g['axis'] !== 'grid')
            bad(`"${where}.axis" must be horizontal, vertical or grid`);
          if (g['remember'] !== undefined && typeof g['remember'] !== 'boolean')
            bad(`"${where}.remember" must be true or false`);
          if (
            sel &&
            isText(g['name'], 60) &&
            (g['axis'] === 'horizontal' || g['axis'] === 'vertical' || g['axis'] === 'grid')
          ) {
            profile.focus!.groups!.push({
              name: g['name'],
              selector: sel,
              axis: g['axis'],
              ...(g['remember'] === true ? { remember: true } : {}),
            });
          }
        });
      }
    }
  }

  const player = section('player');
  if (player) {
    only(player, ['container', 'controls', 'close', 'keys'], 'player');
    profile.player = {};
    for (const key of ['container', 'controls', 'close'] as const) {
      const sel = selector(player[key], `player.${key}`);
      if (sel) profile.player[key] = sel;
    }
    if (player['keys'] !== undefined) {
      if (!isObject(player['keys'])) bad('"player.keys" must be an object');
      else {
        only(player['keys'], ['playPause', 'back', 'forward'], 'player.keys');
        profile.player.keys = {};
        for (const key of ['playPause', 'back', 'forward'] as const) {
          const name = player['keys'][key];
          if (name === undefined) continue;
          if (!(PLAYER_KEY_NAMES as readonly unknown[]).includes(name))
            bad(`"player.keys.${key}" must be one of ${PLAYER_KEY_NAMES.join(', ')}`);
          else profile.player.keys[key] = name as PlayerKeyName;
        }
      }
    }
  }

  const text = section('text');
  if (text) {
    only(text, ['search', 'searchOpen'], 'text');
    profile.text = {};
    for (const key of ['search', 'searchOpen'] as const) {
      const sel = selector(text[key], `text.${key}`);
      if (sel) profile.text[key] = sel;
    }
  }

  const dismiss = selectors(raw['dismiss'], 'dismiss');
  if (dismiss) profile.dismiss = dismiss;

  const guard = section('guard');
  if (guard) {
    only(guard, ['purchase'], 'guard');
    const purchase = selectors(guard['purchase'], 'guard.purchase');
    profile.guard = purchase ? { purchase } : {};
  }

  const evidence = section('evidence');
  if (!evidence) bad('"evidence" is required: it names the outline that shows the selectors');
  else {
    only(evidence, ['outline'], 'evidence');
    if (!isText(evidence['outline'], 200) || /[\\]|\.\.|^\//.test(String(evidence['outline'])))
      bad('"evidence.outline" must name the outline file, by a plain relative path');
    else profile.evidence.outline = evidence['outline'];
  }

  return problems.length ? { profile: null, problems } : { profile, problems };
}

/** True when `host` is covered by a profile's host entry: the name itself, or with "*." anything under it. */
export function hostMatches(pattern: string, host: string): boolean {
  const h = host.toLowerCase();
  if (pattern.startsWith('*.')) return h.endsWith(pattern.slice(1)) && h.length > pattern.length - 1;
  return h === pattern;
}

/**
 * How well a profile fits an address: -1 when it does not apply, otherwise
 * the length of the longest path it lists that the address starts with (so a
 * profile for "/watch" beats one for "/" on a watch page). Only https and
 * http addresses are ever matched.
 */
export function matchScore(profile: Profile, url: string): number {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return -1;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return -1;
  if (!profile.match.hosts.some((p) => hostMatches(p, u.hostname))) return -1;
  const paths = profile.match.paths ?? ['/'];
  let best = -1;
  for (const p of paths) {
    const prefix = p.endsWith('/') ? p : `${p}/`;
    if (u.pathname === p || `${u.pathname}/`.startsWith(prefix) || p === '/') best = Math.max(best, p.length);
  }
  return best;
}

/** Where a profile came from, highest priority first (docs/PROFILES.md section 3). */
export const PROFILE_SOURCES = ['local', 'imported', 'catalogue', 'builtin'] as const;
export type ProfileSource = (typeof PROFILE_SOURCES)[number];

/** A validated profile and where it came from. */
export interface StoredProfile {
  profile: Profile;
  source: ProfileSource;
}

/** What `chooseProfile` decides for an address. */
export type ProfileChoice =
  | { kind: 'use'; profile: Profile; source: ProfileSource }
  /** An imported profile nobody has said yes or no to yet: ask once before using it. */
  | { kind: 'ask'; profile: Profile; fallback: { profile: Profile; source: ProfileSource } | null }
  | { kind: 'none' };

/**
 * Which profile applies to an address. The person's own first, then an
 * imported one they have agreed to, then the reviewed catalogue's, then the
 * built-in ones; within a source, the one whose path fits best. An imported
 * profile is never used silently: until it has an answer the choice is "ask",
 * and one that was refused is passed over.
 */
export function chooseProfile(
  url: string,
  stored: readonly StoredProfile[],
  answers: Readonly<Record<string, 'yes' | 'no'>>,
  keyOf: (profile: Profile) => string = importKey,
): ProfileChoice {
  const best = (source: ProfileSource, allow: (p: Profile) => boolean): Profile | null => {
    let pick: Profile | null = null;
    let score = -1;
    for (const s of stored) {
      if (s.source !== source || !allow(s.profile)) continue;
      const fit = matchScore(s.profile, url);
      if (fit > score) {
        pick = s.profile;
        score = fit;
      }
    }
    return pick;
  };
  const reviewed = (): { profile: Profile; source: ProfileSource } | null => {
    for (const source of ['catalogue', 'builtin'] as const) {
      const p = best(source, () => true);
      if (p) return { profile: p, source };
    }
    return null;
  };
  const local = best('local', () => true);
  if (local) return { kind: 'use', profile: local, source: 'local' };
  const agreed = best('imported', (p) => answers[keyOf(p)] === 'yes');
  if (agreed) return { kind: 'use', profile: agreed, source: 'imported' };
  const pending = best('imported', (p) => answers[keyOf(p)] === undefined);
  if (pending) return { kind: 'ask', profile: pending, fallback: reviewed() };
  const fallback = reviewed();
  return fallback ? { kind: 'use', ...fallback } : { kind: 'none' };
}

/**
 * The name an imported profile goes by: a new version is a new question.
 * The shell adds a fingerprint of the whole profile to this (main/profiles.ts),
 * so a different file under the same name and version is a new question too.
 */
export function importKey(profile: Profile): string {
  return `${profile.id}@${profile.version}`;
}

/** The logical canvas a profile asks for, or null. */
export function canvasOf(profile: Profile | null): { width: number; height: number } | null {
  const m = CANVAS.exec(profile?.view?.canvas ?? '');
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/**
 * True when a profile says its site has an interface made for TVs, which the
 * site gives to devices that say they are one. Longboard then says so to
 * that site (main/useragent.ts) and leaves the remote's keys to it.
 */
export function wantsTv(profile: Profile | null): boolean {
  return profile?.view?.device === 'tv';
}

/**
 * Which of the two things a profile can ask Longboard to say it is, or
 * null for neither. "tv" is the one above. "tv-browser" is for a site that
 * gives browsers on TVs a larger layout of its ordinary pages: Longboard
 * says what it always says and adds that it is on a TV, and goes on
 * driving the page itself.
 */
export function deviceOf(profile: Profile | null): 'tv' | 'tv-browser' | null {
  return profile?.view?.device ?? null;
}

/**
 * Where an address of a site is opened instead, when a profile says the
 * site's interface for this kind of device lives somewhere else
 * (`view.entry`). Every address of the profile's hosts that is not already
 * inside the profile's own pages goes there: the person asked for the site
 * and gets it in the form the profile is for, never the other one. What
 * the address pointed at is kept only as far as the profile says the other
 * interface understands it: the parameters named in `view.carry` are
 * copied across as they are, and nothing else is.
 *
 * `use` is the profile that would be used for an address (the usual choice,
 * with its order of sources and the person's answers); the profile must be
 * the one in use at its own entry, so one that is passed over or was
 * refused sends nobody anywhere.
 */
export function entryFor(
  url: string,
  stored: readonly StoredProfile[],
  use: (url: string) => Profile | null,
): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  for (const { profile } of stored) {
    const entry = profile.view?.entry;
    if (!entry || !profile.match.hosts.some((p) => hostMatches(p, u.hostname))) continue;
    // Already inside the profile's own pages.
    if (matchScore(profile, url) >= 0) continue;
    const there = new URL(`${u.origin}${entry}`);
    for (const name of profile.view?.carry ?? []) {
      const value = u.searchParams.get(name);
      if (value !== null) there.searchParams.set(name, value);
    }
    if (use(there.href) === profile) return there.href;
  }
  return null;
}

/** The file name a profile is exported under. */
export function exportName(profile: Profile): string {
  return `${profile.id}.longboard-profile.json`;
}
