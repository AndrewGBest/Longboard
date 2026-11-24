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
export const SETTING_NAMES = [
  'search',
  'startWith',
  'pageSize',
  'adBlocking',
  'adBlockingStartsOff',
  'adBlockingStartsOn',
  'catalogue',
  'hardwareDecode',
  'neverAsk',
  'history',
  'keepTabs',
  'harmfulSites',
  'downloads',
  'language',
  'httpsOnly',
  'theme',
  'autoplay',
  'clearOnExit',
  'doNotTrack',
  'blockTrackers',
  'hideLocalAddress',
  'updates',
  'extensionUpdates',
  'passwords',
  'searchSuggestions',
  'keys',
] as const;
export type SettingName = (typeof SETTING_NAMES)[number];

/**
 * config.json after one setting is changed, or null when the name is not a
 * setting or the value is not one it can take. Everything else in the file
 * (key mappings, anything a newer version understands) is kept as it was.
 * A value of null puts the setting back to what Longboard does by itself.
 */
export function changeSetting(raw: unknown, name: unknown, value: unknown): Record<string, unknown> | null {
  if (typeof name !== 'string' || !(SETTING_NAMES as readonly string[]).includes(name)) return null;
  const next: Record<string, unknown> =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  if (value === null || value === undefined) delete next[name];
  else next[name] = value;
  // Judged by the same rules as the file itself.
  const problems = parseConfig(next).problems;
  if (problems.some((p) => p.startsWith(`"${name}"`) || (name === 'keys' && p.startsWith('key ')))) return null;
  return next;
}

/** config.json with every setting the screen can change taken out: key mappings and the rest stay. */
export function resetSettings(raw: unknown): Record<string, unknown> {
  const next: Record<string, unknown> =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  // Button mappings are the person's remote, not a preference: they stay.
  for (const name of SETTING_NAMES) if (name !== 'keys') delete next[name];
  return next;
}

/** The languages offered by name; any other code can be put in config.json. The first is "whatever the system uses". */
export const LANGUAGE_CHOICES: readonly { code: string | null; name: string }[] = [
  { code: null, name: "the system's" },
  { code: 'en-US', name: 'English (United States)' },
  { code: 'en-GB', name: 'English (United Kingdom)' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'es', name: 'Spanish' },
  { code: 'it', name: 'Italian' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },
  { code: 'pl', name: 'Polish' },
  { code: 'ja', name: 'Japanese' },
];

/** The actions a remote's button can be given, in the words Settings uses. */
export const BUTTON_ACTIONS: readonly { action: string; words: string }[] = [
  { action: 'back', words: 'Back' },
  { action: 'menu', words: 'Menu' },
  { action: 'pointer', words: 'Pointer on and off' },
  { action: 'playPause', words: 'Play or pause' },
  { action: 'seekBack', words: 'Skip back' },
  { action: 'seekForward', words: 'Skip forward' },
  { action: 'search', words: 'Go to search' },
  { action: 'voice', words: 'Speak' },
  { action: 'select', words: 'OK' },
];

/** Keys that are never given another job from the screen: without them the screen itself could not be used. */
const KEPT_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Tab'];

/**
 * The button mappings after `key` (as the keyboard reports it, with whether
 * Ctrl was held) is given to `action`, or null when that key cannot be
 * reassigned or is no real key.
 */
export function mapButton(
  keys: Readonly<Record<string, string>>,
  key: string,
  ctrl: boolean,
  action: string,
): Record<string, string> | null {
  if (
    !key ||
    key.length > 40 ||
    KEPT_KEYS.includes(key) ||
    ['Control', 'Shift', 'Alt', 'Meta', 'Unidentified', 'Dead'].includes(key)
  )
    return null;
  if (!BUTTON_ACTIONS.some((a) => a.action === action)) return null;
  // A plain letter or digit is for typing; with Ctrl it can be a button.
  if (key.length === 1 && !ctrl) return null;
  const spec = ctrl ? `Ctrl+${key.length === 1 ? key.toLowerCase() : key}` : key;
  return { ...keys, [spec]: action };
}

/** The mappings with every button given to `action` taken away. */
export function unmapButtons(keys: Readonly<Record<string, string>>, action: string): Record<string, string> {
  return Object.fromEntries(Object.entries(keys).filter(([, a]) => a !== action));
}
