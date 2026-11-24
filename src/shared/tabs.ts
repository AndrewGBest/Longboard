// The tabs that were open when Longboard closed, so they can be offered again
// at the next start. Kept on this machine only, in tabs.json, and only while
// the "keep tabs" setting is on. A private tab is never written down. Pure,
// so the rules are unit-tested; the shell reads and writes the file.

/** One tab as it is written down: where it was, and what the page called itself. */
export interface KeptTab {
  url: string;
  title: string;
}

/** A tab from the last run goes behind the one Longboard starts in, so one fewer than the most that can be open. */
export const MAX_KEPT_TABS = 7;

const clean = (text: unknown, max: number): string =>
  typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const isWeb = (url: unknown): url is string =>
  typeof url === 'string' && url.length <= 2000 && /^https?:\/\//i.test(url);

/** What to write down for the tabs that are open: web pages only, in order, no more than can be offered again. */
export function tabsToKeep(open: ReadonlyArray<{ url: string; title: string }>): { tabs: KeptTab[] } {
  return {
    tabs: open
      .filter((tab) => isWeb(tab.url))
      .slice(0, MAX_KEPT_TABS)
      .map((tab) => ({ url: tab.url, title: clean(tab.title, 120) })),
  };
}

/** Validates the saved file. Anything unusable is dropped, never thrown on. */
export function parseTabs(raw: unknown): KeptTab[] {
  const list = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)['tabs'] : null;
  if (!Array.isArray(list)) return [];
  const out: KeptTab[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const tab = item as Record<string, unknown>;
    if (!isWeb(tab['url'])) continue;
    out.push({ url: tab['url'], title: clean(tab['title'], 120) });
    if (out.length >= MAX_KEPT_TABS) break;
  }
  return out;
}

/** Whether tabs are kept at all: not when the person turned it off, nor when everything is cleared at closing. */
export function keepsTabs(config: { keepTabs?: boolean; clearOnExit?: boolean }): boolean {
  return config.keepTabs !== false && config.clearOnExit !== true;
}
