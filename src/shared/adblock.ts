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

/** Where the switch starts for a site nobody has set it for: off on verified sites, on everywhere else. */
export function blockingStartsOn(site: string, verified: readonly string[]): boolean {
  return !isVerified(site, verified);
}

/**
 * Whether requests are filtered on a site now. The person's own choice for
 * the site always wins; without one it is where the switch starts. `site` is
 * null for anything that is not a website (a notice page), which is never filtered.
 */
export function blockingOn(site: string | null, chosen: boolean | undefined, verified: readonly string[]): boolean {
  if (!site) return false;
  return typeof chosen === 'boolean' ? chosen : blockingStartsOn(site, verified);
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
