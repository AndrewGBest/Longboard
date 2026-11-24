// Suggestions under the address field: places the person already knows,
// found in what is kept on this machine (saved pages, apps, recently opened
// sites, history). Nothing typed is sent anywhere to get them. Pure.
import { DEFAULT_SEARCH, resolveAddress, searchUrl, siteName } from './address';

export interface Known {
  url: string;
  title: string;
}
export interface Suggestion {
  url: string;
  /** What the button says: the title and the site, or the site alone. */
  text: string;
  /** True for words the search site suggested, which are searched for. */
  search?: boolean;
}

export const MAX_SUGGESTIONS = 5;

/**
 * Up to MAX_SUGGESTIONS places matching what was typed. Every word typed
 * must be in the address or the title. `known` is in order of importance
 * (saved pages first, history last); each site's address appears once, and
 * a match at the start of the site's name comes before one in the middle.
 */
export function suggest(typed: string, known: readonly Known[]): Suggestion[] {
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  if (!words.length || words.join('').length < 2) return [];
  const seen = new Set<string>();
  const found: Array<{ s: Suggestion; rank: number }> = [];
  known.forEach((k, order) => {
    if (seen.has(k.url)) return;
    const site = siteName(k.url);
    const hay = `${k.url} ${k.title}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) return;
    seen.add(k.url);
    const starts = site.toLowerCase().startsWith(words[0]!) ? 0 : 1;
    found.push({
      s: { url: k.url, text: k.title ? `${k.title} (${site})` : site || k.url },
      rank: starts * 10_000 + order,
    });
  });
  return found
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_SUGGESTIONS)
    .map((f) => f.s);
}

// ---- Suggestions from the search site ---------------------------------------
// Off as shipped (DECISIONS.md, 2026-11-19). On, the words typed in the
// address field are sent to the search site as they are typed, and what it
// suggests is offered under the places already known. Addresses are never
// sent: only what would be searched for.

/** Where each search site answers with suggestions, by the site's search address. */
const SUGGEST_AT: Readonly<Record<string, string>> = {
  [DEFAULT_SEARCH]: 'https://www.google.com/complete/search?client=firefox&q=%s',
  'https://duckduckgo.com/?q=%s': 'https://duckduckgo.com/ac/?q=%s&type=list',
  'https://www.bing.com/search?q=%s': 'https://www.bing.com/osjson.aspx?query=%s',
  'https://search.brave.com/search?q=%s': 'https://search.brave.com/api/suggest?q=%s',
};

export const MAX_SEARCH_SUGGESTIONS = 4;

/** An address to ask for suggestions at, written by the person in config.json: https (or this machine), with %s once. */
export function isSuggestTemplate(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500 || value.split('%s').length !== 2) return false;
  try {
    const u = new URL(value.replace('%s', 'x'));
    return (
      u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost'))
    );
  } catch {
    return false;
  }
}

/** Whether the search site in use can be asked at all: one of the four by name, or an address the person gave. */
export function canSuggest(setting: boolean | string | undefined, searchTemplate: string = DEFAULT_SEARCH): boolean {
  return isSuggestTemplate(setting) || Object.hasOwn(SUGGEST_AT, searchTemplate);
}

/**
 * The address to ask for suggestions for what has been typed so far, or null
 * when nothing should be sent: the setting is off, the search site is not
 * one that is known, there is too little typed, or what is typed is an
 * address and not words to search for.
 */
export function suggestAddress(
  typed: string,
  setting: boolean | string | undefined,
  searchTemplate: string = DEFAULT_SEARCH,
): string | null {
  if (setting !== true && !isSuggestTemplate(setting)) return null;
  const text = typed.trim();
  if (text.length < 2 || text.length > 100) return null;
  // An address goes where it says; only words that would be searched for are sent.
  if (resolveAddress(text, searchTemplate) !== searchUrl(text, searchTemplate)) return null;
  const at = isSuggestTemplate(setting) ? setting : SUGGEST_AT[searchTemplate];
  return at ? at.replace('%s', encodeURIComponent(text)) : null;
}

/** What the search site answered, checked: ["typed", ["one", "two"]]. Anything else gives nothing. */
export function parseSearchSuggestions(body: unknown, typed: string): string[] {
  if (!Array.isArray(body) || !Array.isArray(body[1])) return [];
  const out: string[] = [];
  const same = typed.trim().toLowerCase();
  for (const item of body[1] as unknown[]) {
    if (typeof item !== 'string') continue;
    const text = item
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || text.length > 100 || text.toLowerCase() === same || out.includes(text)) continue;
    out.push(text);
    if (out.length >= MAX_SEARCH_SUGGESTIONS) break;
  }
  return out;
}
