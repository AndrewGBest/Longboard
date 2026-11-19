// History: the pages the person opened, newest first. Kept on this machine
// only, in history.json, and only while the "keep a history" setting is on.
// Pure, so the rules are unit-tested; the shell reads and writes the file.
import { siteName } from './address';

export interface Visit {
  url: string;
  /** The page's own title when it had one. */
  title: string;
  /** When it was opened, milliseconds since 1970. */
  at: number;
}

export const MAX_HISTORY = 300;

const clean = (text: unknown, max: number): string => (typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const isWeb = (url: unknown): url is string => typeof url === 'string' && url.length <= 2000 && /^https?:\/\//i.test(url);

/** Validates the saved file. Anything unusable is dropped, never thrown on. */
export function parseHistory(raw: unknown): Visit[] {
  const list = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)['visits'] : null;
  if (!Array.isArray(list)) return [];
  const out: Visit[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const v = item as Record<string, unknown>;
    if (!isWeb(v['url']) || out.some((o) => o.url === v['url'])) continue;
    out.push({ url: v['url'], title: clean(v['title'], 120), at: typeof v['at'] === 'number' && Number.isFinite(v['at']) ? v['at'] : 0 });
    if (out.length >= MAX_HISTORY) break;
  }
  return out;
}

/** The history with a page at the front: each address once, newest first, at most MAX_HISTORY. */
export function addVisit(list: readonly Visit[], url: string, now: number): Visit[] {
  if (!isWeb(url)) return [...list];
  const old = list.find((v) => v.url === url);
  return [{ url, title: old?.title ?? '', at: now }, ...list.filter((v) => v.url !== url)].slice(0, MAX_HISTORY);
}

/** The history with the title of `url` set. */
export function titleVisit(list: readonly Visit[], url: string, title: string): Visit[] {
  return list.map((v) => (v.url === url ? { ...v, title: clean(title, 120) } : v));
}

/** "today", "yesterday", or the date: when a page was opened, as the list says it. */
export function whenText(at: number, now: number): string {
  const day = (t: number): number => {
    const d = new Date(t);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  };
  const ago = day(now) - day(at);
  if (ago <= 0) return 'today';
  if (ago === 1) return 'yesterday';
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The day a page was opened, as the heading over that day's pages: "Today", "Yesterday", or the day in words. */
export function dayHeading(at: number, now: number): string {
  const when = whenText(at, now);
  if (when === 'today') return 'Today';
  if (when === 'yesterday') return 'Yesterday';
  return new Date(at).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** One line of the list on screen: in one sentence (`text`), and in the parts the screen lays out. */
export function visitLine(v: Visit, now: number): { url: string; text: string; title: string; site: string; day: string; time: string } {
  const site = siteName(v.url) || 'a page';
  return {
    url: v.url,
    text: `${v.title ? `${v.title} (${site})` : site}, ${whenText(v.at, now)}`,
    title: v.title,
    site,
    day: dayHeading(v.at, now),
    time: new Date(v.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}
