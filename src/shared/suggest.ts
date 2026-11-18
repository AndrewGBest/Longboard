// Suggestions under the address field: places the person already knows,
// found in what is kept on this machine (saved pages, apps, recently opened
// sites, history). Nothing typed is sent anywhere to get them. Pure.
import { siteName } from './address';

export interface Known {
  url: string;
  title: string;
}
export interface Suggestion {
  url: string;
  /** What the button says: the title and the site, or the site alone. */
  text: string;
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
    found.push({ s: { url: k.url, text: k.title ? `${k.title} (${site})` : site || k.url }, rank: starts * 10_000 + order });
  });
  return found.sort((a, b) => a.rank - b.rank).slice(0, MAX_SUGGESTIONS).map((f) => f.s);
}
