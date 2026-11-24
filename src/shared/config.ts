// The user's config file: <user data>/config.json. Everything in it is
// optional, and anything invalid is dropped with a note rather than stopping
// the app. Pure, so the rules are unit-tested.
//
//   {
//     "zoom": 2,
//     "hardwareDecode": true,
//     "search": "https://www.google.com/search?q=%s",
//     "catalogue": false,
//     "adBlocking": false,
//     "filterLists": ["https://easylist.to/easylist/easylist.txt"],
//     "keys": { "F1": "search", "F9": "menu", "MediaStop": "back", "Ctrl+h": "none" },
//     "buttons": { "8": "pointer", "9": "playPause" }
//   }
//
// A key is a KeyboardEvent.key value (what a remote sends: "MediaStop",
// "F5", "ContextMenu"...), optionally with "Ctrl+" in front. A mapping here
// wins over the built-in one for that key.
import type { Action } from './actions';
import { isSearchTemplate } from './address';
import { isSuggestTemplate } from './suggest';
import { UPDATE_MODES, type UpdateMode } from './update';
import { BLOCKING_MODES, blockingMode, MAX_LISTS, parseDomains, parseFilterLists, type BlockingMode } from './adblock';

/** The kinds of access the person can say no site may ask for (the names main/permissions.ts asks about). */
export const NEVER_ASKABLE = [
  'camera',
  'microphone',
  'location',
  'notifications',
  'clipboard',
  'midi',
  'pointerLock',
] as const;
/** The settings `parseConfig` knows by name, besides the eight it lists itself in its unknown-setting check. */
const SETTING_KEYS = [
  'adBlockingStartsOff',
  'adBlockingStartsOn',
  'startWith',
  'pageSize',
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
] as const;

/** What a key or button can be mapped to in config.json. "none" makes the key do nothing. */
export const ACTION_NAMES = [
  'up',
  'down',
  'left',
  'right',
  'select',
  'back',
  'playPause',
  'seekBack',
  'seekForward',
  'search',
  'menu',
  'pointer',
  'voice',
  'quit',
  'none',
] as const;
export type ActionName = (typeof ACTION_NAMES)[number];

export interface UserConfig {
  /** TV scale override; the --zoom option still wins. */
  zoom?: number;
  /** Ask the browser to decode video on the graphics chip. Off unless set; see the README. */
  hardwareDecode?: boolean;
  /** Set to false to stop the daily download of the profile catalogue. */
  catalogue?: boolean;
  /**
   * Ad blocking over all sites: "sites" (each site's own switch, the usual),
   * "everywhere" (on for every site, ignoring the list of sites where it
   * starts off), or "off" (nothing refused anywhere, no filter list fetched).
   * `false` also means "off".
   */
  adBlocking?: BlockingMode;
  /** Sites the person added to the list where ad blocking starts off. */
  adBlockingStartsOff?: string[];
  /** Reviewed sites the person took off that list. */
  adBlockingStartsOn?: string[];
  /** What Longboard opens with: "home" (the usual) or "last", the site opened most recently. */
  startWith?: 'home' | 'last';
  /** Everything bigger or smaller, on top of the TV scale: 1 is unchanged. */
  pageSize?: number;
  /** Kinds of access no site may even ask for: "camera", "location"... */
  neverAsk?: string[];
  /** Open only pages sent privately (https); plain http pages are refused. */
  httpsOnly?: boolean;
  /** The look sites are asked for: "dark" or "light". The system's without it. */
  theme?: 'dark' | 'light';
  /** Set to false to stop videos starting by themselves. Read at start. */
  autoplay?: boolean;
  /** Send "Do Not Track" and "Global Privacy Control" with every request (shared/privacy.ts). */
  doNotTrack?: boolean;
  /** Refuse requests on the public list of trackers as well as ads, by each site's ad-blocking switch. */
  blockTrackers?: boolean;
  /** Keep this device's address on the home network from sites that set up calls (WebRTC). */
  hideLocalAddress?: boolean;
  /** Set to false to stop asking the Chrome Web Store daily for newer versions of installed extensions. */
  extensionUpdates?: boolean;
  /** False stops Longboard offering to keep passwords, and offering saved ones back. */
  passwords?: boolean;
  /** True sends what is typed in the address field to the search site for suggestions; an address with %s asks there instead. Off as shipped. */
  searchSuggestions?: boolean | string;
  /** New versions: "install" them (the usual), only "tell", or "off" to never look. */
  updates?: UpdateMode;
  /** Clear what sites have stored each time the program closes. */
  clearOnExit?: boolean;
  /** Set to false to keep no history of the pages opened. */
  history?: boolean;
  /** Set to false to start with no tabs from the last time. */
  keepTabs?: boolean;
  /** Set to false for no warning before sites on public lists of harmful sites, and no fetching of those lists. */
  harmfulSites?: boolean;
  /** Where downloaded files are saved: a folder's full path. The desktop's Downloads folder without it. */
  downloads?: string;
  /** The language sites are asked for, such as "fr" or "en-GB". The system's without it. Read at start. */
  language?: string;
  /** The public filter lists to use instead of the usual one: https addresses. */
  filterLists?: string[];
  /** Where typed words are searched for: an https address with %s where the words go. */
  search?: string;
  /** Key (as written by the user, "Ctrl+" normalised) to action. */
  keys: Record<string, ActionName>;
  /** Gamepad button number (standard mapping, 0 to 16) to action. */
  buttons?: Record<string, ActionName>;
}

const MAX_KEYS = 200;

/** "ctrl + H" -> "Ctrl+h"; plain keys keep their case, since "a" and "A" differ. */
export function normaliseKey(spec: string): string | null {
  const parts = spec.split('+').map((p) => p.trim());
  const key = parts.pop() ?? '';
  if (!key || key.length > 40) return null;
  if (parts.length === 0) return key === 'Space' ? ' ' : key;
  if (parts.length === 1 && parts[0]!.toLowerCase() === 'ctrl')
    return `Ctrl+${key.length === 1 ? key.toLowerCase() : key}`;
  return null; // only Ctrl is supported as a modifier
}

/** Validates untrusted config data. Returns what could be used and a note for each thing that could not. */
export function parseConfig(raw: unknown): { config: UserConfig; problems: string[] } {
  const config: UserConfig = { keys: {} };
  const problems: string[] = [];
  if (raw === undefined || raw === null) return { config, problems };
  if (typeof raw !== 'object' || Array.isArray(raw))
    return { config, problems: ['the file must contain a JSON object'] };
  const r = raw as Record<string, unknown>;

  if (r['zoom'] !== undefined) {
    if (typeof r['zoom'] === 'number' && Number.isFinite(r['zoom']) && r['zoom'] > 0) config.zoom = r['zoom'];
    else problems.push('"zoom" must be a positive number');
  }

  if (r['hardwareDecode'] !== undefined) {
    if (typeof r['hardwareDecode'] === 'boolean') config.hardwareDecode = r['hardwareDecode'];
    else problems.push('"hardwareDecode" must be true or false');
  }

  if (r['adBlocking'] !== undefined) {
    if (typeof r['adBlocking'] === 'boolean' || (BLOCKING_MODES as readonly unknown[]).includes(r['adBlocking']))
      config.adBlocking = blockingMode(r['adBlocking']);
    else problems.push('"adBlocking" must be "sites", "everywhere" or "off"');
  }
  for (const name of ['adBlockingStartsOff', 'adBlockingStartsOn'] as const) {
    if (r[name] === undefined) continue;
    const domains = parseDomains(r[name]);
    if (domains) config[name] = domains;
    else problems.push(`"${name}" must be a list of domains such as "example.com"`);
  }
  if (r['startWith'] !== undefined) {
    if (r['startWith'] === 'home' || r['startWith'] === 'last') config.startWith = r['startWith'];
    else problems.push('"startWith" must be "home" or "last"');
  }
  if (r['pageSize'] !== undefined) {
    if (typeof r['pageSize'] === 'number' && r['pageSize'] >= 0.5 && r['pageSize'] <= 2)
      config.pageSize = r['pageSize'];
    else problems.push('"pageSize" must be a number from 0.5 to 2');
  }
  for (const name of [
    'httpsOnly',
    'autoplay',
    'clearOnExit',
    'doNotTrack',
    'blockTrackers',
    'hideLocalAddress',
    'extensionUpdates',
    'passwords',
  ] as const) {
    if (r[name] === undefined) continue;
    if (typeof r[name] === 'boolean') config[name] = r[name];
    else problems.push(`"${name}" must be true or false`);
  }
  if (r['theme'] !== undefined) {
    if (r['theme'] === 'dark' || r['theme'] === 'light') config.theme = r['theme'];
    else problems.push('"theme" must be "dark" or "light"');
  }
  if (r['updates'] !== undefined) {
    if ((UPDATE_MODES as readonly unknown[]).includes(r['updates'])) config.updates = r['updates'] as UpdateMode;
    else problems.push('"updates" must be "install", "tell" or "off"');
  }
  if (r['history'] !== undefined) {
    if (typeof r['history'] === 'boolean') config.history = r['history'];
    else problems.push('"history" must be true or false');
  }
  if (r['keepTabs'] !== undefined) {
    if (typeof r['keepTabs'] === 'boolean') config.keepTabs = r['keepTabs'];
    else problems.push('"keepTabs" must be true or false');
  }
  if (r['harmfulSites'] !== undefined) {
    if (typeof r['harmfulSites'] === 'boolean') config.harmfulSites = r['harmfulSites'];
    else problems.push('"harmfulSites" must be true or false');
  }
  if (r['downloads'] !== undefined) {
    if (
      typeof r['downloads'] === 'string' &&
      r['downloads'].startsWith('/') &&
      r['downloads'].length <= 1000 &&
      !r['downloads'].includes('\u0000')
    )
      config.downloads = r['downloads'];
    else problems.push('"downloads" must be the full path of a folder');
  }
  if (r['language'] !== undefined) {
    if (typeof r['language'] === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/.test(r['language']))
      config.language = r['language'];
    else problems.push('"language" must be a language code such as "fr" or "en-GB"');
  }
  if (r['neverAsk'] !== undefined) {
    if (
      Array.isArray(r['neverAsk']) &&
      r['neverAsk'].every((n) => typeof n === 'string' && (NEVER_ASKABLE as readonly string[]).includes(n))
    )
      config.neverAsk = [...new Set(r['neverAsk'] as string[])];
    else problems.push(`"neverAsk" must be a list from: ${NEVER_ASKABLE.join(', ')}`);
  }
  if (r['filterLists'] !== undefined) {
    const lists = parseFilterLists(r['filterLists']);
    if (lists) config.filterLists = lists;
    else problems.push(`"filterLists" must be a list of one to ${MAX_LISTS} https addresses`);
  }
  if (r['catalogue'] !== undefined) {
    if (typeof r['catalogue'] === 'boolean') config.catalogue = r['catalogue'];
    else problems.push('"catalogue" must be true or false');
  }

  if (r['searchSuggestions'] !== undefined) {
    if (typeof r['searchSuggestions'] === 'boolean' || isSuggestTemplate(r['searchSuggestions']))
      config.searchSuggestions = r['searchSuggestions'];
    else problems.push('"searchSuggestions" must be true, false, or an https address containing %s once');
  }
  if (r['search'] !== undefined) {
    if (isSearchTemplate(r['search'])) config.search = r['search'];
    else problems.push('"search" must be an https address containing %s once');
  }

  if (r['keys'] !== undefined) {
    if (typeof r['keys'] !== 'object' || r['keys'] === null || Array.isArray(r['keys'])) {
      problems.push('"keys" must be an object of key: action');
    } else {
      for (const [spec, action] of Object.entries(r['keys']).slice(0, MAX_KEYS)) {
        const key = normaliseKey(spec);
        if (!key) problems.push(`key "${spec.slice(0, 40)}" is not understood (use a key name, optionally with Ctrl+)`);
        else if (typeof action !== 'string' || !(ACTION_NAMES as readonly string[]).includes(action)) {
          problems.push(`key "${spec.slice(0, 40)}": unknown action (use one of ${ACTION_NAMES.join(', ')})`);
        } else config.keys[key] = action as ActionName;
      }
    }
  }
  if (r['buttons'] !== undefined) {
    if (typeof r['buttons'] !== 'object' || r['buttons'] === null || Array.isArray(r['buttons'])) {
      problems.push('"buttons" must be an object of button number: action');
    } else {
      const buttons: Record<string, ActionName> = {};
      for (const [spec, action] of Object.entries(r['buttons']).slice(0, MAX_KEYS)) {
        const n = Number(spec);
        if (!/^\d{1,2}$/.test(spec) || n > 31)
          problems.push(`button "${spec.slice(0, 40)}" must be a number from 0 to 31`);
        else if (typeof action !== 'string' || !(ACTION_NAMES as readonly string[]).includes(action)) {
          problems.push(`button ${n}: unknown action (use one of ${ACTION_NAMES.join(', ')})`);
        } else buttons[String(n)] = action as ActionName;
      }
      config.buttons = buttons;
    }
  }
  for (const name of Object.keys(r)) {
    if (
      name !== 'zoom' &&
      name !== 'keys' &&
      name !== 'buttons' &&
      name !== 'hardwareDecode' &&
      name !== 'search' &&
      name !== 'catalogue' &&
      name !== 'adBlocking' &&
      name !== 'filterLists' &&
      !(SETTING_KEYS as readonly string[]).includes(name)
    )
      problems.push(`unknown setting "${name.slice(0, 40)}"`);
  }
  return { config, problems };
}

/** Seconds skipped by "seekBack" and "seekForward". */
const SEEK_STEP = 10;

/** The action a configured name stands for; `null` for "none" (the key does nothing in the layer). */
export function actionFor(name: ActionName): Action | null {
  switch (name) {
    case 'up':
    case 'down':
    case 'left':
    case 'right':
      return { type: 'move', dir: name };
    case 'select':
      return { type: 'select' };
    case 'back':
      return { type: 'back' };
    case 'playPause':
      return { type: 'playPause' };
    case 'seekBack':
      return { type: 'seek', seconds: -SEEK_STEP };
    case 'seekForward':
      return { type: 'seek', seconds: SEEK_STEP };
    case 'search':
      return { type: 'search' };
    case 'menu':
      return { type: 'menu' };
    case 'voice':
      return { type: 'voice' };
    case 'pointer':
      return { type: 'pointer' };
    case 'quit':
      return { type: 'exit' };
    case 'none':
      return null;
  }
}
