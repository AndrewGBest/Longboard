// What Home remembers: the sites the person opened lately. Pure, so the
// rules are unit-tested; the shell reads and writes the file.
import { siteKey } from './address';

export interface RecentSite {
  /** The address the person opened. */
  url: string;
  /** The page's own title when it had one; shown under the site's name. */
  title: string;
  /** When it was last opened, milliseconds since 1970. */
  at: number;
}

export const MAX_RECENTS = 12;

const clean = (text: unknown, max: number): string => (typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Validates the saved list. Anything unusable is dropped, never thrown on. */
export function parseRecents(raw: unknown): RecentSite[] {
  const list = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)['recents'] : null;
  if (!Array.isArray(list)) return [];
  const out: RecentSite[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r['url'] !== 'string' || r['url'].length > 2000 || !siteKey(r['url'])) continue;
    if (out.some((o) => siteKey(o.url) === siteKey(r['url'] as string))) continue;
    out.push({ url: r['url'], title: clean(r['title'], 120), at: typeof r['at'] === 'number' && Number.isFinite(r['at']) ? r['at'] : 0 });
    if (out.length >= MAX_RECENTS) break;
  }
  return out;
}

/** The list with `url` at the front: one entry per site, newest first, at most MAX_RECENTS. */
export function addRecent(list: readonly RecentSite[], url: string, now: number): RecentSite[] {
  const key = siteKey(url);
  if (!key) return [...list];
  const old = list.find((r) => siteKey(r.url) === key);
  // The same address again keeps its title; a different page of the site starts without one.
  const entry: RecentSite = { url, title: old && old.url === url ? old.title : '', at: now };
  return [entry, ...list.filter((r) => siteKey(r.url) !== key)].slice(0, MAX_RECENTS);
}

/** The list with the title of the entry for `url`'s site set, when that entry is for exactly `url`'s site. */
export function titleRecent(list: readonly RecentSite[], url: string, title: string): RecentSite[] {
  const key = siteKey(url);
  return list.map((r) => (key && siteKey(r.url) === key ? { ...r, title: clean(title, 120) } : r));
}

export function removeRecent(list: readonly RecentSite[], url: string): RecentSite[] {
  const key = siteKey(url);
  return list.filter((r) => siteKey(r.url) !== key);
}
