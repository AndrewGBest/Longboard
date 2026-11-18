// Ad blocking: the decisions, kept pure so they are unit-tested (Hard rule
// 5). The switch is per site and the person's; only where it starts differs:
// off on verified sites, on everywhere else. Nothing here or anywhere else
// changes the switch for the person.

/** The public filter lists fetched when the person has not named their own. */
export const DEFAULT_FILTER_LISTS: readonly string[] = ['https://easylist.to/easylist/easylist.txt'];
/** The lists are fetched again when the copy on disk is older than this. */
export const LISTS_KEPT_MS = 4 * 24 * 60 * 60 * 1000;
export const MAX_LISTS = 8;

const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** The domains in a verified-sites file: `{ "sites": ["example.com", ...] }`, or the repository's own form with `domain` fields. */
export function parseVerified(raw: unknown): string[] {
  const list = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)['sites'] : null;
  if (!Array.isArray(list)) return [];
  const out = new Set<string>();
  for (const item of list.slice(0, 5000)) {
    const domain = typeof item === 'string' ? item : item && typeof item === 'object' ? (item as Record<string, unknown>)['domain'] : null;
    if (typeof domain === 'string' && DOMAIN.test(domain)) out.add(domain);
  }
  return [...out];
}

/** True when `site` (a host name) is a verified domain or lies under one. */
export function isVerified(site: string, verified: readonly string[]): boolean {
  const host = site.toLowerCase();
  return verified.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** The setting over all sites: each site's own switch, on everywhere, or nothing refused anywhere. */
export type BlockingMode = 'sites' | 'everywhere' | 'off';
export const BLOCKING_MODES: readonly BlockingMode[] = ['sites', 'everywhere', 'off'];

/** The mode config.json asks for. `false` was the first way of saying "off" and still means it. */
export function blockingMode(setting: unknown): BlockingMode {
  if (setting === false) return 'off';
  return typeof setting === 'string' && (BLOCKING_MODES as readonly string[]).includes(setting) ? (setting as BlockingMode) : 'sites';
}

/** A domain as a person might type it ("www.Example.com", "https://example.com/page"), or null when it is not one. */
export function cleanDomain(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let text = input.trim().toLowerCase();
  if (!text || text.length > 300) return null;
  text = text.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
  return DOMAIN.test(text) ? text : null;
}

/** One line of the "starts off" list as the person sees it. */
export interface StartsOffEntry {
  domain: string;
  /** Where it comes from: the reviewed list, or the person's own addition. */
  from: 'reviewed' | 'you';
  /** False for a reviewed site the person has taken off the list. */
  off: boolean;
}

/** The list for the Settings screen: the reviewed sites and the person's own, in name order. */
export function startsOffEntries(reviewed: readonly string[], added: readonly string[] = [], removed: readonly string[] = []): StartsOffEntry[] {
  const out: StartsOffEntry[] = reviewed.map((domain) => ({ domain, from: 'reviewed' as const, off: !removed.includes(domain) }));
  for (const domain of added) if (!reviewed.includes(domain)) out.push({ domain, from: 'you', off: true });
  return out.sort((a, b) => a.domain.localeCompare(b.domain));
}

/** The sites where blocking starts off, after the person's own changes to the reviewed list. */
export function effectiveVerified(reviewed: readonly string[], added: readonly string[] = [], removed: readonly string[] = []): string[] {
  return startsOffEntries(reviewed, added, removed).filter((e) => e.off).map((e) => e.domain);
}

/**
 * The person's changes after adding a site to the list, or pressing an entry
 * (which takes their own addition away, takes a reviewed site off, or puts a
 * reviewed site back). Returns the two lists config.json keeps.
 */
export function editStartsOff(
  reviewed: readonly string[],
  added: readonly string[],
  removed: readonly string[],
  op: 'add' | 'toggle',
  domain: string,
): { added: string[]; removed: string[] } {
  const a = new Set(added);
  const r = new Set(removed);
  if (reviewed.includes(domain)) {
    a.delete(domain);
    if (op === 'add' || r.has(domain)) r.delete(domain);
    else r.add(domain);
  } else if (op === 'add') a.add(domain);
  else a.delete(domain);
  return { added: [...a].sort(), removed: [...r].sort() };
}

/** Where the switch starts for a site nobody has set it for: off on verified sites, on everywhere else. */
export function blockingStartsOn(site: string, verified: readonly string[]): boolean {
  return !isVerified(site, verified);
}

/**
 * Whether requests are filtered on a site now. The person's own choice for
 * the site always wins; without one it is where the switch starts. `site` is
 * null for anything that is not a website (a notice page), which is never filtered.
 *
 * `mode` is the person's setting over all sites. "off" refuses nothing
 * anywhere. "everywhere" ignores the list of sites where blocking starts
 * off; a site the person has switched off themselves stays off.
 */
export function blockingOn(site: string | null, chosen: boolean | undefined, verified: readonly string[], mode: BlockingMode = 'sites'): boolean {
  if (!site || mode === 'off') return false;
  if (typeof chosen === 'boolean') return chosen;
  return mode === 'everywhere' ? true : blockingStartsOn(site, verified);
}

/** A list of domains from config.json: each must be a plain domain. Null when it is not such a list. */
export function parseDomains(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length > 500) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !DOMAIN.test(item)) return null;
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

/** True when the lists should be fetched again. `last` is when they last were, or undefined. */
export function listsDue(last: unknown, now: number): boolean {
  return typeof last !== 'number' || !Number.isFinite(last) || now - last >= LISTS_KEPT_MS || last > now;
}

/**
 * A rough check that what was downloaded is a filter list and not an error
 * page: text, not a web page or JSON, with at least one line that is not a comment.
 */
export function looksLikeFilterList(text: string): boolean {
  if (text.length < 8 || text.includes('\u0000')) return false;
  const head = text.slice(0, 400).trimStart().toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<?xml') || head.startsWith('{')) return false;
  return text.split('\n').some((line) => {
    const t = line.trim();
    return t !== '' && !t.startsWith('!') && !t.startsWith('[');
  });
}

/** The addresses in config.json's "filterLists": https only, at most MAX_LISTS. Null when the value is not a usable list of addresses. */
export function parseFilterLists(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || item.length > 500) return null;
    try {
      if (new URL(item).protocol !== 'https:') return null;
    } catch {
      return null;
    }
    if (!out.includes(item)) out.push(item);
  }
  return out.length > 0 && out.length <= MAX_LISTS ? out : null;
}
