// What passes between the shell and Longboard's own screens (Home, the menu
// panel, prompts). Those screens are drawn by a preload in the isolated
// world of a view that only ever loads Longboard's own file; no website can
// send or receive any of this.
import type { RecentSite } from './home';
import type { BlockingMode, StartsOffEntry } from './adblock';

export type Panel = 'menu' | 'about' | 'prompt' | 'addApp' | 'edit' | 'downloads' | 'settings' | 'history' | 'tabs' | 'find' | 'reader' | 'pin';

export interface ChromeState {
  /** What fills the window behind any panel. */
  surface: 'home' | 'page';
  panel: Panel | null;
  version: string;
  /** `profile` says what Longboard has for the site: a reviewed profile, the person's own, or nothing. */
  home: {
    /** Sites added as apps. `icon` is the site's own icon, fetched from the site when the app was added, as a data: address. */
    apps: Array<{ id: string; name: string; site: string; icon: string | null; ownSession: boolean }>;
    /** `icon` is the site's own icon, fetched from the site while it was open, as a data: address. */
    recents: Array<RecentSite & { profile: 'reviewed' | 'own' | null; icon: string | null }>;
    /** Pages the person asked to keep on Home. */
    saved: Array<{ url: string; title: string; icon: string | null }>;
    /** True when the tab in front is a private one: nothing opened in it is kept. */
    privateTab: boolean;
  };
  /** About the page in the page view; null when none has been opened. */
  page: {
    site: string;
    title: string;
    canGoBack: boolean;
    canGoForward: boolean;
    /** True while the page is still arriving: the menu offers Stop in place of Reload. */
    loading: boolean;
    /** The site's own icon when Longboard has it (the site is on Home), as a data: address. */
    icon: string | null;
    /** Zoom relative to the automatic TV scale, in percent. */
    zoomPercent: number;
    pointer: boolean;
    /** The profile in use, as said on screen, or null in generic mode. */
    profile: string | null;
    /** What this site has been allowed or refused, in words, or null when nothing was ever answered. */
    answers: string | null;
    /** The ad-blocking switch for this site and a line about it. `locked` when Settings has ad blocking off everywhere; null when the page is not a website. */
    adBlocking: { on: boolean; note: string; locked: boolean } | null;
    /** False for a page sent over plain http, where anyone on the way can read or change it. */
    secure: boolean;
    /** True on a Chrome Web Store page about an extension that is not installed. */
    storeExtension: boolean;
    /** Whether this page is kept on Home. */
    saved: boolean;
    /** Whether the person asked for this site at the width of a desk screen. */
    desktop: boolean;
    /** The app this site was added as, if it was. */
    app: { id: string; name: string } | null;
    /** Whether the TV's app list can be written to on this system. */
    canAddToAppList: boolean;
  } | null;
  /** The downloads agreed to in this run, newest first. `progress` says how far one under way has got. */
  downloads: Array<{ id: number; name: string; state: 'going' | 'saved' | 'cancelled' | 'failed'; progress: string }>;
  /** The profile editor, while it is in use. */
  edit: {
    /** The site being edited for. */
    site: string;
    /** What was pointed at, at the level now chosen; null before anything is picked. */
    picked: { selector: string; matches: number; canWiden: boolean; canNarrow: boolean; marks: Record<'include' | 'exclude' | 'row' | 'player', boolean> } | null;
    /** How many things are marked in all. */
    marked: number;
  } | null;
  /** What the Settings screen shows, while it is open. */
  settings: {
    /** The search engine by name, and the address it stands for. */
    search: string;
    searchTemplate: string;
    startWith: 'home' | 'last';
    pageSize: number;
    adBlocking: {
      mode: BlockingMode;
      /** When the filter list was last downloaded, in words. */
      listUpdated: string;
      startsOff: StartsOffEntry[];
    };
    /** Whether the reviewed catalogue is downloaded daily, and how many profiles there are. */
    catalogue: boolean;
    profiles: number;
    hardwareDecode: boolean;
    /** Kinds of access no site may ask for, and all the kinds there are with their words. */
    neverAsk: string[];
    askable: Array<{ name: string; words: string }>;
    /** How many sites have settings of their own (answers, size, ad blocking). */
    sitesWithChoices: number;
    downloads: string;
    dataFolder: string;
    httpsOnly: boolean;
    /** The extensions installed; `opens` is the page of its own that can be shown, if it has one. */
    extensions: Array<{ id: string; name: string; version: string; opens: string | null }>;
    extensionUpdates: boolean;
    /** New versions: where things stand, the setting, and whether this copy can replace itself. */
    update: { words: string; mode: 'install' | 'tell' | 'off'; canInstall: boolean };
    /** The parental lock, when a PIN is set. */
    lock: { homeOnly: boolean } | null;
    doNotTrack: boolean;
    blockTrackers: boolean;
    hideLocalAddress: boolean;
    theme: 'dark' | 'light' | null;
    autoplay: boolean;
    clearOnExit: boolean;
    /** Whether a history of pages is kept, and how many pages are in it. */
    history: boolean;
    visits: number;
    /** The language sites are asked for, as a code; null for the system's. */
    language: string | null;
    /** The buttons the person has given to each action, and the action now waiting for a button to be pressed. */
    buttons: Array<{ action: string; words: string; keys: string[] }>;
    capturing: string | null;
    /** The folder chooser, while it is open: where it is, the folder above, and the folders in it. */
    folders: { path: string; up: string | null; inside: string[]; places: Array<{ name: string; path: string }> } | null;
  } | null;
  /** The tabs that are open, in the order they were opened. A tab with nothing in it yet has no title or site. */
  tabs: Array<{ id: string; title: string; site: string; current: boolean; private: boolean }>;
  /** The pages opened lately, newest first, while the history panel is open. */
  history: Array<{ url: string; text: string; title: string; site: string; day: string; time: string }> | null;
  /** How many closed tabs can be opened again. */
  closedTabs: number;
  /** The parental lock, when a PIN is set: whether only Home's sites open, and whether the PIN has been given for browsing. */
  lock: { homeOnly: boolean; unlocked: boolean } | null;
  /** The PIN being asked for, while panel is 'pin': what for, and how long until another try is taken. */
  pin: { title: string; note: string; waitSeconds: number } | null;
  /** The article being read, while the reader view is open. */
  reader: { title: string; site: string; blocks: Array<{ kind: 'heading' | 'text' | 'item' | 'quote' | 'code'; text: string }> } | null;
  /** The question being asked, while panel is 'prompt'. */
  prompt:
    /** A site wants something it has to be allowed: `wants` says what, in plain words. */
    | { what: 'permission'; site: string; wants: string }
    /** A file is about to be downloaded. */
    | { what: 'download'; site: string; name: string; size: string; folder: string }
    /** A profile someone gave the person, which nobody has reviewed: use it? */
    | { what: 'profile'; name: string; version: string; hosts: string[] }
    /** An extension fetched from the store: switch it on? `can` is what it will be able to do. */
    | { what: 'extension'; name: string; version: string; can: string[] }
    | null;
}

export type MenuAction =
  | 'home' | 'resume' | 'back' | 'forward' | 'stop' | 'reload' | 'zoomIn' | 'zoomOut' | 'zoomReset'
  | 'pointer' | 'outline' | 'exportProfile' | 'importProfiles' | 'editProfile' | 'addApp' | 'removeApp' | 'forgetAnswers' | 'adBlocking' | 'desktop' | 'reader' | 'lock' | 'addExtension' | 'settings' | 'history' | 'tabs' | 'find' | 'savePage' | 'unsavePage' | 'downloads' | 'about' | 'quit' | 'close';

export const MENU_ACTIONS: readonly MenuAction[] = [
  'home', 'resume', 'back', 'forward', 'stop', 'reload', 'zoomIn', 'zoomOut', 'zoomReset', 'pointer', 'outline', 'exportProfile', 'importProfiles', 'editProfile', 'addApp', 'removeApp', 'forgetAnswers', 'adBlocking', 'desktop', 'reader', 'lock', 'addExtension', 'settings', 'history', 'tabs', 'find', 'savePage', 'unsavePage', 'downloads', 'about', 'quit', 'close',
];

export type ChromeMessage =
  /** Open what was typed: an address, or words to search for. */
  | { kind: 'open'; input: string }
  /** Open a Home tile. */
  | { kind: 'openRecent'; url: string }
  | { kind: 'openApp'; id: string }
  /** Take a tile off Home. Removing an app also removes what `removeApp` in the menu does. */
  | { kind: 'cancelDownload'; id: number }
  /** A change made on the Settings screen: a setting by its config.json name; null puts it back to the usual. */
  | { kind: 'setting'; name: string; value: unknown }
  /** The list of sites where ad blocking starts off: add a typed site, or press an entry. */
  | { kind: 'startsOff'; op: 'add' | 'toggle'; domain: string }
  | { kind: 'settingsAction'; action: SettingsAction }
  /** Tabs: open a new one, bring one in front, or close one. */
  | { kind: 'tab'; op: 'new' | 'private' | 'switch' | 'close' | 'reopen'; id?: string }
  /** A page kept on Home: open it, or take it off. */
  | { kind: 'openSaved'; url: string }
  | { kind: 'removeSaved'; url: string }
  /** What has been typed in an address field so far, to get suggestions for; and opening one. */
  | { kind: 'suggest'; text: string }
  | { kind: 'openSuggestion'; url: string }
  /** Find words on the page in front, forwards or backwards from the last one found. */
  | { kind: 'find'; text: string; forward: boolean }
  /** Open a page from the history. */
  | { kind: 'openVisit'; url: string }
  /** Take one page out of the history. */
  | { kind: 'forgetVisit'; url: string }
  /** The folder chooser: look in this folder, or null to put the chooser away. */
  | { kind: 'folder'; path: string | null }
  /** Wait for a button to give to this action (null stops waiting), or take its buttons away. */
  | { kind: 'captureButton'; action: string | null }
  | { kind: 'clearButtons'; action: string }
  /** A site's icon, drawn here and handed back as a PNG data: address; null when it could not be drawn. */
  | { kind: 'icon'; id: number; png: string | null }
  /** Four digits entered on the PIN screen. */
  | { kind: 'pin'; digits: string }
  /** The parental lock's own settings: set or change the PIN, remove it, or switch "only sites on Home". */
  | { kind: 'lock'; op: 'set' | 'remove' | 'homeOnly' }
  /** An installed extension: open its own page, or remove it. */
  | { kind: 'extension'; op: 'open' | 'remove'; id: string }
  | { kind: 'removeRecent'; url: string }
  | { kind: 'removeApp'; id: string }
  /** The profile editor's buttons. */
  | { kind: 'edit'; action: EditAction }
  /** Add the site in front as an app. */
  | { kind: 'addApp'; name: string; ownSession: boolean; launcher: boolean }
  | { kind: 'menu'; action: MenuAction }
  /** `remember` false is "not now": the question comes again another time. */
  | { kind: 'answer'; allow: boolean; remember?: boolean };

export type SettingsAction = 'clearSiteData' | 'clearCache' | 'clearHome' | 'clearHistory' | 'clearAll' | 'forgetSites' | 'updateFilters' | 'updateCatalogue' | 'checkUpdate' | 'reset';
export const SETTINGS_ACTIONS: readonly SettingsAction[] = ['clearSiteData', 'clearCache', 'clearHome', 'clearHistory', 'clearAll', 'forgetSites', 'updateFilters', 'updateCatalogue', 'checkUpdate', 'reset'];

export type EditAction = 'include' | 'exclude' | 'row' | 'player' | 'wider' | 'narrower' | 'pickAgain' | 'save' | 'discard';
export const EDIT_ACTIONS: readonly EditAction[] = ['include', 'exclude', 'row', 'player', 'wider', 'narrower', 'pickAgain', 'save', 'discard'];
