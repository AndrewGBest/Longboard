// The Settings screen's rules: what can be changed from the TV, and what a
// change does to config.json. Pure, so it is unit-tested; the shell reads and
// writes the file. Everything set here can also be set by editing the file.
import { parseConfig } from './config';
import { DEFAULT_SEARCH } from './address';

/** Search engines offered by name. Each is an ordinary link; there is no arrangement with any of them. */
export const SEARCH_CHOICES: readonly { name: string; template: string }[] = [
  { name: 'Google', template: DEFAULT_SEARCH },
  { name: 'DuckDuckGo', template: 'https://duckduckgo.com/?q=%s' },
  { name: 'Bing', template: 'https://www.bing.com/search?q=%s' },
  { name: 'Brave Search', template: 'https://search.brave.com/search?q=%s' },
];

/** What the search setting is called on screen: a known engine's name, or the site of one the person put in config.json. */
export function searchName(template: string | undefined): string {
  const known = SEARCH_CHOICES.find((c) => c.template === (template ?? DEFAULT_SEARCH));
  if (known) return known.name;
  try {
    return new URL(template ?? '').hostname.replace(/^www\./, '');
  } catch {
    return 'Custom';
  }
}

/** The sizes "everything bigger or smaller" steps through. */
export const PAGE_SIZES = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;

/** The settings the screen may change, and nothing else in the file. */
export const SETTING_NAMES = ['search', 'startWith', 'pageSize', 'adBlocking', 'adBlockingStartsOff', 'adBlockingStartsOn', 'catalogue', 'hardwareDecode', 'neverAsk'] as const;
export type SettingName = (typeof SETTING_NAMES)[number];

/**
 * config.json after one setting is changed, or null when the name is not a
 * setting or the value is not one it can take. Everything else in the file
 * (key mappings, anything a newer version understands) is kept as it was.
 * A value of null puts the setting back to what Longboard does by itself.
 */
export function changeSetting(raw: unknown, name: unknown, value: unknown): Record<string, unknown> | null {
  if (typeof name !== 'string' || !(SETTING_NAMES as readonly string[]).includes(name)) return null;
  const next: Record<string, unknown> = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  if (value === null || value === undefined) delete next[name];
  else next[name] = value;
  // Judged by the same rules as the file itself.
  if (parseConfig(next).problems.some((p) => p.startsWith(`"${name}"`))) return null;
  return next;
}

/** config.json with every setting the screen can change taken out: key mappings and the rest stay. */
export function resetSettings(raw: unknown): Record<string, unknown> {
  const next: Record<string, unknown> = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  for (const name of SETTING_NAMES) delete next[name];
  return next;
}
