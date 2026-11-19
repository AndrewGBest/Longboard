// The window and its two views: the page view shows websites, the chrome view
// shows Longboard's own screens (Home, the menu panel, questions). They are
// separate renderers with separate sessions; a website can never reach the
// chrome view or the shell (Hard rule 13).
import { shortcutFor, type Shortcut } from '../shared/shortcuts';
import { app, BaseWindow, ipcMain, net, powerSaveBlocker, safeStorage, session, WebContentsView, type WebContents } from 'electron';
import { Passwords } from './passwords';
import { PhoneTyping } from './phone';
import qrcode from 'qrcode-generator';
import { cleanCredentials, loginPlace, shouldOffer } from '../shared/passwords';
import { accessSync, constants as fsConstants, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import type { BootData, BridgeMessage, Direction, LayerOptions } from '../shared/actions';
import { resolveAddress, searchUrl, siteKey, siteName } from '../shared/address';
import { EDIT_ACTIONS, MENU_ACTIONS, SETTINGS_ACTIONS, type ChromeMessage, type ChromeState, type EditAction, type MenuAction, type Panel, type SettingsAction } from '../shared/chrome';
import { EDIT_MARKS, hasMark, marksOf, parsePicked, startDraft, toggleMark, type PickedStep } from '../shared/editor';
import type { UserConfig } from '../shared/config';
import { addRecent, addSaved, parseRecents, parseSaved, removeRecent, removeSaved, titleRecent, type RecentSite, type SavedPage } from '../shared/home';
import { typableText } from '../shared/osk';
import { playerKeyInfo } from '../shared/player-keys';
import { parseSites, zoomStep, type SiteSettings } from '../shared/sites';
import { keyToAction } from '../layer/input/keys';
import {
  blockReason,
  blockedMessage,
  certificatePageUrl,
  describeBlockedUrl,
  isCertificateError,
  isLoadFailure,
  noticePageUrl,
  offlinePageUrl,
  retryDelaySeconds,
  startingPageUrl,
} from './navigation';
import { ASKABLE, describeAsk, hasPermission, mayAsk, permissionDecision, withAnswers, type Askable } from './permissions';
import { sizeText, uniqueName, progressText } from '../shared/downloads';
import { cdpPoint, PointerHolds, pointerGlide, pointerTap, startPoint, type PointerStep } from './pointer';
import { sourceLabel, type ProfileStore } from './profiles';
import { readJson, writeJson } from './store';
import { launchCommand, launcherFolder, removableFolders, removeLauncher, writeLauncher } from '../platform';
import { addApp, appFor, appPartition, launcherEntry, launcherFileName, parseApps, removeApp, type WebApp } from '../shared/apps';
import { canvasOf, type Profile, type ProfileSource } from '../shared/profile';
import { desktopZoom, hoverPoint, pageBounds, tvZoom } from './zoom';
import { filterSession, type FilterSet } from './adblock';
import { privacySignals } from './signals';
import { parseArticle, type Article } from '../shared/reader';
import type { UpdateMode } from '../shared/update';
import { storeExtensionId } from '../shared/extensions';
import { Extensions, type DownloadedExtension } from './extensions';
import { homeSites, isPin, onHomeSite, parseLock, waitAfter, type Lock } from '../shared/lock';
import { checkPin, makeLock } from './lock';
import { blockingOn, cleanDomain, editStartsOff, isVerified, startsOffEntries, type BlockingMode } from '../shared/adblock';
import { BUTTON_ACTIONS, mapButton, searchName, unmapButtons } from '../shared/settings';
import { canSuggest, parseSearchSuggestions, suggest, suggestAddress, type Known } from '../shared/suggest';
import { addVisit, parseHistory, titleVisit, visitLine, type Visit } from '../shared/history';
import { PRODUCT } from '../shared/product';
import { DEFAULT_SEARCH } from '../shared/address';
import { NEVER_ASKABLE } from '../shared/config';
import { ICON_SIZE, iconCandidates, iconDataUrl, manifestIcons, manifestLink, MAX_ICON_BYTES, parseIconLinks, pngFromDataUrl, type IconLink } from '../shared/icons';

export interface BrowserDeps {
  options: { dev: boolean; automation: boolean };
  config: UserConfig;
  /** An address given on the command line; Home is shown when there is none. */
  startUrl: string | null;
  /** An app named on the command line with --app=, to open instead. */
  startApp: string | null;
  /** Where typing from a phone listens, when it is not the home-network address. */
  phoneAt?: string | undefined;
  phoneKey?: string | undefined;
  fullscreen: boolean;
  /** The --size=WIDTHxHEIGHT option: the window's size when it is not full screen. */
  size: [number, number] | undefined;
  /** Where downloaded files are saved unless Settings says otherwise: the desktop's Downloads folder. */
  downloads: string;
  /** The --downloads= option, which wins over Settings. */
  downloadsFlag: string | undefined;
  /** The --zoom= option, which wins over everything. */
  zoomOverride: string | undefined;
  /** Resolves when the protected-playback component is ready (or has been given up on). */
  ready: Promise<void>;
  /** The profiles on this machine. */
  profiles: ProfileStore;
  /** Ad blocking: whether it is there at all, the filters (null until downloaded), and the verified sites. */
  adBlock: {
    /** The person's setting over all sites. */
    mode: () => BlockingMode;
    /** The filters, or null until a list has been downloaded. */
    filters: () => FilterSet | null;
    /** The sites where blocking starts off, after the person's own changes. */
    verified: () => readonly string[];
    /** The reviewed list as it came, before those changes. */
    reviewed: () => readonly string[];
    fetchedAt: () => number | null;
    /** Downloads the list now. */
    refresh: () => Promise<boolean>;
  };
  /** The Settings screen's way to config.json. `set` is false when the value is not one the setting can take. */
  settings: {
    set: (name: string, value: unknown) => boolean;
    reset: () => void;
    refreshCatalogue: () => Promise<boolean>;
    /** New versions: where things stand in words, the setting, and whether this copy can replace itself. */
    update: () => { words: string; mode: UpdateMode; canInstall: boolean };
    lookForUpdate: () => Promise<unknown>;
  };
}

/** Share of the window's width the menu panel takes over a website. */
const PANEL_WIDTH = 0.38;
/** How long after a page is left it is frozen: time for the site's own pause key to be dealt with. */
const FREEZE_DELAY_MS = 600;
/** How long a question has to have been on screen before "yes" is accepted. */
const PROMPT_SETTLE_MS = 600;
/** How long a Home tile's icon is used before it is fetched from the site again. */
const ICON_KEPT_MS = 7 * 24 * 60 * 60 * 1000;
/** How long a site is given to send its icon. */
const ICON_WAIT_MS = 8000;
const isNotice = (url: string): boolean => url.startsWith('data:') || url === 'about:blank' || url === '';

export function createBrowser(deps: BrowserDeps): Browser {
  const { options, config } = deps;
  const dataDir = app.getPath('userData');
  const homeFile = join(dataDir, 'home.json');
  const sitesFile = join(dataDir, 'sites.json');
  const complain = (file: string) => (why: string) => console.error(`[longboard] ${file} could not be read: ${why}`);
  let recents: RecentSite[] = parseRecents(readJson(homeFile, complain('home.json')));
  /** Pages the person asked to keep on Home. */
  let saved: SavedPage[] = parseSaved(readJson(homeFile));
  const sites: Record<string, SiteSettings> = parseSites(readJson(sitesFile, complain('sites.json')));
  const appsFile = join(dataDir, 'apps.json');
  const iconsDir = join(dataDir, 'icons');
  let apps: WebApp[] = parseApps(readJson(appsFile, complain('apps.json')));
  /** Each app's icon as a data: address, read from disk once. */
  const iconData = new Map<string, string | null>();
  const iconOf = (id: string): string | null => {
    if (!iconData.has(id)) {
      let data: string | null = null;
      try {
        data = `data:image/png;base64,${readFileSync(join(iconsDir, `${id}.png`)).toString('base64')}`;
      } catch {
        // the site gave no usable icon
      }
      iconData.set(id, data);
    }
    return iconData.get(id) ?? null;
  };

  /** The name a site's icon is kept under while the site is on Home: nothing that can be read back into an address. */
  const siteIconId = (url: string): string => `site-${createHash('sha256').update(siteKey(url) ?? '').digest('hex').slice(0, 16)}`;

  // A window with no page of its own: everything shown is one of the views below.
  const win = new BaseWindow({
    width: deps.size?.[0] ?? 1280,
    height: deps.size?.[1] ?? 720,
    useContentSize: true,
    fullscreen: deps.fullscreen,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: PRODUCT.name,
  });
  win.removeMenu();

  // Extensions from the Chrome Web Store (main/extensions.ts), in the session everything shares.
  const extensions = new Extensions(session.defaultSession, join(dataDir, 'Extensions'), {
    open: (url) => {
      openInSharedTab(url);
      return page;
    },
    window: () => win,
    note: (line) => console.log(`[longboard] ${line}`),
  });

  const hardened = { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } as const;
  // Its own session, kept in memory only: nothing a website stores is visible to it.
  const chromeView = new WebContentsView({ webPreferences: { ...hardened, preload: join(__dirname, 'chrome.js'), partition: 'longboard-chrome' } });
  chromeView.setBackgroundColor('#0d1014');
  const chrome = chromeView.webContents;

  // Website views. There is one for the session everything shares, and one
  // more while an app that keeps its own sign-ins is open. Only one is ever
  // the page in front; the rest of this file calls that one `page`.
  const views = new Map<string, WebContentsView>();
  const wiring: Array<(wc: WebContents) => void> = [];
  const wiredSessions = new Set<Electron.Session>();
  const sessionWiring: Array<(ses: Electron.Session) => void> = [];
  /** Sets something up on every website view, those made later included. */
  const eachPage = (wire: (wc: WebContents) => void): void => {
    wiring.push(wire);
    for (const view of views.values()) wire(view.webContents);
  };
  /** The same for every session a website view uses. */
  const eachSession = (wire: (ses: Electron.Session) => void): void => {
    sessionWiring.push(wire);
    for (const ses of wiredSessions) wire(ses);
  };
  /** Makes the website view for a session: "" is the one everything shares. */
  // A view is known by its place: "" is the first tab, "tab:N" another tab,
  // and anything else is the session of an app that keeps its own sign-ins.
  // Tabs share the one session everything shares; they differ only in page.
  // A private tab ("private:N") is a tab with a session of its own that is kept
  // in memory only: nothing opened in it is written down, and what its sites
  // stored is gone when it is closed.
  const isPrivate = (place: string): boolean => place.startsWith('private:');
  const isTab = (place: string): boolean => place === '' || place.startsWith('tab:') || isPrivate(place);
  const makeView = (place: string): WebContentsView => {
    const partition = isPrivate(place) ? `longboard-${place.replace(':', '-')}` : isTab(place) ? '' : place;
    const view = new WebContentsView({
      webPreferences: {
        ...hardened,
        preload: join(__dirname, 'preload.js'),
        // The preload also runs in embedded frames, where in a scripted run it
        // puts up the purchase guard and nothing else. Despite its name this
        // gives pages nothing: the view stays sandboxed and isolated.
        nodeIntegrationInSubFrames: true,
        additionalArguments: options.automation ? ['--longboard-automation'] : [],
        // Video and sound start by themselves unless the person said otherwise in Settings; then a press is needed first.
        ...(config.autoplay === false ? { autoplayPolicy: 'document-user-activation-required' as const } : {}),
        ...(partition ? { partition } : {}),
      },
    });
    view.setBackgroundColor('#000000');
    view.setVisible(false);
    win.contentView.addChildView(view);
    // Longboard's own screens stay in front of every website view.
    win.contentView.addChildView(chromeView);
    views.set(place, view);
    const ses = view.webContents.session;
    if (!wiredSessions.has(ses)) {
      wiredSessions.add(ses);
      for (const wire of sessionWiring) wire(ses);
    }
    for (const wire of wiring) wire(view.webContents);
    return view;
  };
  const isPageView = (wc: WebContents): boolean => [...views.values()].some((v) => v.webContents === wc);
  let partition = '';
  let pageView = makeView('');
  let page = pageView.webContents;

  // ---- What is on screen -------------------------------------------------

  let surface: 'home' | 'page' = 'home';
  let panel: Panel | null = null;
  let pointerOn = false;
  /** The question waiting for an answer: protected playback for a site, or whether to use an imported profile. */
  let pending:
    | { what: 'permission'; site: string; names: Askable[]; answer: Array<(granted: boolean) => void> }
    | { what: 'profile'; profile: Profile }
    | { what: 'extension'; extension: DownloadedExtension }
    | { what: 'download'; download: Download }
    | { what: 'password'; place: string; user: string; password: string }
    | null = null;
  /** A file on its way, or that was. `temp` is where it is held until it is whole and agreed to. */
  interface Download {
    id: number;
    name: string;
    site: string;
    item: Electron.DownloadItem;
    temp: string;
    state: 'asking' | 'going' | 'saved' | 'cancelled' | 'failed';
    agreed: boolean;
    /** All of it came while the question was still up. */
    arrived: boolean;
  }
  /** The downloads the person agreed to in this run, newest first. */
  const downloads: Download[] = [];
  const MAX_LISTED = 30;
  let lastDownload = 0;
  // Where files are held until they are whole and agreed to. Anything left from a run that ended badly is thrown away.
  const waitingDir = join(dataDir, 'downloads-waiting');
  rmSync(waitingDir, { recursive: true, force: true });

  /** The profile editor, while it is in use: the draft, and what was last pointed at. */
  let edit: { site: string; draft: Profile; chain: PickedStep[]; level: number; saving: boolean } | null = null;

  /** The profile that applies to an address now, without asking about one that still needs an answer. */
  const profileFor = (url: string): { profile: Profile; source: ProfileSource } | null => {
    const choice = deps.profiles.choose(url);
    return choice.kind === 'use' ? choice : choice.kind === 'ask' ? choice.fallback : null;
  };

  /** Where files are saved: the command line's folder, else the one chosen in Settings, else the desktop's. */
  const downloadsDir = (): string => deps.downloadsFlag ?? config.downloads ?? deps.downloads;
  /** History: the pages opened, newest first (shared/history.ts). */
  const historyFile = join(dataDir, 'history.json');
  let visits: Visit[] = parseHistory(readJson(historyFile, complain('history.json')));
  const saveHistory = (): void => writeJson(historyFile, { visits });
  /** The folder the folder chooser is looking in, while it is open. */
  let pickAt: string | null = null;
  /** The action waiting for a button to be pressed for it, on the Settings screen. */
  let capturing: string | null = null;
  const pageSite = (): string | null => siteKey(page.getURL());
  /** Whether requests are filtered for the site at this address (Hard rule 5): the person's choice, else where the switch starts. */
  const blockingAt = (url: string): boolean => {
    const key = siteKey(url);
    return blockingOn(key, key ? sites[key]?.adBlocking : undefined, deps.adBlock.verified(), deps.adBlock.mode());
  };
  /** How many requests were refused for the page each view is showing. */
  const refused = new WeakMap<WebContents, number>();
  const pageLoaded = (): boolean => page.navigationHistory.getAllEntries().some((e) => !isNotice(e.url));
  /** Where the page in front is drawn: the whole window, less the edge its profile asks to be kept clear. */
  const pageArea = (): { x: number; y: number; width: number; height: number } => {
    const [width = 0, height = 0] = win.getContentSize();
    return pageBounds({ width, height }, profileFor(page.getURL())?.profile.view?.safeMargin);
  };
  const autoZoom = (): number => {
    const { width, height } = pageArea();
    // A profile may say what size the site should be drawn at.
    const canvas = canvasOf(profileFor(page.getURL())?.profile ?? null);
    const usual = tvZoom({ width, height }, deps.zoomOverride ?? (config.zoom === undefined ? undefined : String(config.zoom)), canvas ?? undefined);
    // "Desktop site": the person asked for this site at the width of a desk screen.
    return (sites[pageSite() ?? '']?.desktop ? desktopZoom({ width, height }, usual) : usual) * (config.pageSize ?? 1);
  };
  const siteZoom = (): number => {
    const key = pageSite();
    return (key ? sites[key]?.zoom : undefined) ?? 1;
  };

  // ---- The parental lock (shared/lock.ts) --------------------------------------
  const lockFile = join(dataDir, 'lock.json');
  let lock: Lock | null = parseLock(readJson(lockFile, complain('lock.json')));
  /** True once the PIN has been given for browsing; until "Lock again" or the end of this run. */
  let unlocked = false;
  let pinFailures = 0;
  let pinNotBefore = 0;
  /** What the PIN on screen is being asked for. `set` is the two entries of a new PIN. */
  let pinFor: { title: string; note: string; then: () => void; back?: 'settings' } | { set: true; first: string | null } | null = null;
  const saveLock = (): void => {
    if (lock) writeJson(lockFile, lock);
    else rmSync(lockFile, { force: true });
  };
  /** The sites that open without the PIN, or null when every site does. */
  const onlySites = (): string[] | null => (lock?.homeOnly && !unlocked ? homeSites([...apps, ...saved]) : null);
  const navRules = (): { automation: boolean; httpsOnly: boolean; onlySites: string[] | null; extensions: string[] } => ({ automation: options.automation, httpsOnly: config.httpsOnly === true, onlySites: onlySites(), extensions: extensions.ids() });
  /**
   * Locking: a page that is not on one of Home's sites gives way to the
   * notice saying so, in every tab, and Back leads to nothing opened while
   * it was unlocked.
   */
  const lockViews = (): void => {
    const sites = onlySites();
    if (!sites) return;
    for (const view of views.values()) {
      const wc = view.webContents;
      if (wc.isDestroyed()) continue;
      const url = wc.getURL();
      if (isNotice(url) || onHomeSite(url, sites)) {
        wc.navigationHistory.clear();
        continue;
      }
      void wc
        .loadURL(noticePageUrl('locked', url))
        .catch(() => undefined)
        .then(() => {
          if (!wc.isDestroyed()) wc.navigationHistory.clear();
        });
    }
  };
  /** Does `then` at once when there is no PIN, and after the PIN has been given when there is. */
  const withPin = (title: string, then: () => void): void => {
    if (!lock) return then();
    pinFor = { title, note: '', then };
    panel = 'pin';
    layout();
  };
  /** The same, for changes to what is on Home: asked for only while Home decides which sites open. */
  const withPinForHome = (then: () => void): void => (lock?.homeOnly && !unlocked ? withPin('Enter the PIN to change what is on Home', then) : then());

  // ---- Saved sign-ins (Hard rule 10) ----------------------------------------
  // Kept only when the person says so, encrypted by the system's keyring;
  // without a keyring nothing is kept. Never in a scripted run.
  const passwords = new Passwords(join(dataDir, 'passwords.json'), {
    // "basic_text" is Chromium's fallback when the system has no keyring: a fixed key, which keeps nothing safe.
    available: async () => (process.platform !== 'linux' || !['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend())) && (await safeStorage.isAsyncEncryptionAvailable()),
    encrypt: async (text) => {
      const secret = await safeStorage.encryptStringAsync(text);
      // On Linux what the keyring protected starts "v11"; "v10" is the fixed key again, used when the keyring could not be reached after all.
      if (process.platform === 'linux' && secret.subarray(0, 3).toString('latin1') === 'v10') throw new Error('the keyring did not protect it');
      return secret;
    },
    decrypt: async (secret) => (await safeStorage.decryptStringAsync(secret)).result,
  });
  // The screens are drawn again once the keyring has answered.
  void passwords.ready.then(() => setImmediate(() => !win.isDestroyed() && refreshChrome()));
  const loginsOn = (): boolean => config.passwords !== false && !options.automation && passwords.available();
  /** The address of the page whose sign-in form was seen, for each view that has one showing. */
  const loginForms = new WeakMap<WebContents, string>();
  /** A sign-in just typed that the person may ask to keep; held in memory for a few minutes and then dropped. */
  const typed = new WeakMap<WebContents, { place: string; user: string; password: string; at: number }>();
  const TYPED_KEPT_MS = 5 * 60_000;
  const typedNow = (wc: WebContents): { place: string; user: string; password: string } | null => {
    const held = typed.get(wc);
    if (held && Date.now() - held.at > TYPED_KEPT_MS) typed.delete(wc);
    return typed.get(wc) ?? null;
  };

  // ---- Typing from a phone (main/phone.ts) ------------------------------------
  // Off until the person turns it on from the menu, and off again when
  // Longboard closes. What a phone sends is typed where the cursor is, or
  // pressed as a button of the remote would be.
  let phoneCount = 0;
  let phoneHeld: { id: number; text: string; to: WebContents; at: number } | null = null;
  const PHONE_BUTTONS = { up: 'Up', down: 'Down', left: 'Left', right: 'Right', ok: 'Return', enter: 'Return', back: 'Escape', delete: 'Backspace', playPause: 'MediaPlayPause' } as const;
  const phone = new PhoneTyping(
    join(__dirname, 'phone.js'),
    (message) => {
      if (win.isDestroyed()) return;
      const front = active();
      if (front.isDestroyed()) return;
      if (message.t === 'text') {
        // The text stays here. The layer is only asked whether a text field has the cursor, and answers by number.
        const id = ++phoneCount;
        phoneHeld = { id, text: message.v.replace(/[\u0000-\u001f\u007f]+/g, ' '), to: front, at: Date.now() };
        front.send('longboard:phone-text', id);
      }
      else if (message.t === 'key' && message.v === 'menu') toggleMenu();
      else if (message.t === 'key') {
        const keyCode = PHONE_BUTTONS[message.v as keyof typeof PHONE_BUTTONS];
        front.sendInputEvent({ type: 'keyDown', keyCode });
        if (keyCode === 'Return') front.sendInputEvent({ type: 'char', keyCode: '\r' });
        front.sendInputEvent({ type: 'keyUp', keyCode });
      }
    },
    () => {
      if (win.isDestroyed()) return;
      refreshChrome();
      notify('A phone is connected');
    },
  );
  /** An address as a square code for a phone's camera: rows of 0 and 1. */
  const codeFor = (text: string): string[] => {
    const code = qrcode(0, 'M');
    code.addData(text);
    code.make();
    const size = code.getModuleCount();
    return Array.from({ length: size }, (_r, row) => Array.from({ length: size }, (_c, col) => (code.isDark(row, col) ? '1' : '0')).join(''));
  };

  // ---- Suggestions from the search site (off as shipped; Hard rule 12) -----
  // On, the words typed in the address field go to the search site as they
  // are typed. Never an address, never from a private tab, with no cookies,
  // and only the newest question is waited for.
  let offeredSearches = new Set<string>();
  let suggestAsk: AbortController | null = null;
  let suggestTimer: NodeJS.Timeout | undefined;
  const searchSuggestions = (typed: string): Promise<string[]> => {
    clearTimeout(suggestTimer);
    suggestAsk?.abort();
    suggestAsk = null;
    const at = isPrivate(partition) ? null : suggestAddress(typed, config.searchSuggestions, config.search ?? DEFAULT_SEARCH);
    if (!at) return Promise.resolve([]);
    const ask = (suggestAsk = new AbortController());
    return new Promise((resolve) => {
      // A short wait, so a word typed quickly is asked about once.
      suggestTimer = setTimeout(() => {
        const giveUp = setTimeout(() => ask.abort(), 2500);
        net.fetch(at, { credentials: 'omit', cache: 'no-store', redirect: 'error', signal: ask.signal })
          .then(async (response) => (response.ok ? parseSearchSuggestions(JSON.parse((await response.text()).slice(0, 20_000)), typed) : []))
          .then(resolve, () => resolve([]))
          .finally(() => clearTimeout(giveUp));
      }, 180);
    });
  };

  /** The pages that are still arriving: each is told, so it can show that, and the menu offers Stop. */
  const arriving = new WeakSet<WebContents>();
  /** The addresses of the tabs closed lately, newest last, so one can be opened again. Private tabs are never in it. */
  const closedTabs: string[] = [];

  const chromeState = (): ChromeState => ({
    surface,
    panel,
    version: app.getVersion(),
    home: {
      apps: apps.map((a) => ({ id: a.id, name: a.name, site: siteName(a.url), icon: iconOf(a.id), ownSession: a.ownSession })),
      saved: saved.map((p) => ({ ...p, icon: iconOf(siteIconId(p.url)) })),
      privateTab: isPrivate(partition),
      recents: recents.map((r) => {
        const source = profileFor(r.url)?.source;
        return { ...r, icon: iconOf(siteIconId(r.url)), profile: source === 'local' ? ('own' as const) : source === 'catalogue' || source === 'builtin' ? ('reviewed' as const) : null };
      }),
    },
    page: pageLoaded()
      ? {
          site: siteName(page.getURL()) || 'this page',
          title: isNotice(page.getURL()) ? '' : page.getTitle().slice(0, 120),
          canGoBack: backIndex() >= 0,
          canGoForward: page.navigationHistory.canGoForward(),
          loading: arriving.has(page),
          icon: iconOf(siteIconId(page.getURL())),
          zoomPercent: Math.round(siteZoom() * 100),
          pointer: pointerOn,
          profile: ((p) => (p ? `${p.profile.name} (${sourceLabel(p.source)})` : null))(profileFor(page.getURL())),
          answers: ((given) => {
            const said = (which: 'granted' | 'denied'): string => (Object.keys(given) as Askable[]).filter((n) => given[n] === which).map((n) => ASKABLE[n]).join(', ');
            const parts = [said('granted') && `Allowed to: ${said('granted')}`, said('denied') && `Not allowed to: ${said('denied')}`].filter(Boolean);
            return parts.length ? parts.join('. ') : null;
          })(sites[pageSite() ?? '']?.answers ?? {}),
          secure: /^https:/i.test(page.getURL()) || /^http:\/\/(localhost|127\.0\.0\.1)[:/]/i.test(page.getURL()),
          logins: loginsOn() && loginForms.get(page) === page.getURL() ? passwords.users(loginPlace(page.getURL())) : [],
          keepPassword: loginsOn() ? (typedNow(page)?.user ?? null) : null,
          saved: saved.some((p) => p.url === page.getURL()),
          storeExtension: storeExtensionId(page.getURL()) !== null && !extensions.ids().includes(storeExtensionId(page.getURL()) ?? ''),
          desktop: sites[pageSite() ?? '']?.desktop === true,
          adBlocking: ((key) => {
            if (!key) return null;
            const mode = deps.adBlock.mode();
            if (mode === 'off') return { on: false, locked: true, note: 'Ad blocking is off everywhere. Settings can turn it on.' };
            const on = blockingAt(page.getURL());
            const chosen = typeof sites[key]?.adBlocking === 'boolean';
            const count = refused.get(page) ?? 0;
            const note = !deps.adBlock.filters()
              ? 'The filter list has not been downloaded yet, so nothing is refused.'
              : on
                ? `${count === 1 ? '1 request' : `${count} requests`} refused on this page.`
                : !chosen && isVerified(key, deps.adBlock.verified())
                  ? 'Off to start with: this site is on the list of sites where it starts off.'
                  : 'Off for this site: your choice.';
            return { on, note, locked: false };
          })(pageSite()),
          app: ((a) => (a ? { id: a.id, name: a.name } : null))(appFor(apps, page.getURL())),
          canAddToAppList: launcherFolder() !== null,
        }
      : null,
    settings:
      panel !== 'settings'
        ? null
        : {
            search: searchName(config.search),
            searchTemplate: config.search ?? DEFAULT_SEARCH,
            startWith: config.startWith ?? 'home',
            searchSuggestions: config.searchSuggestions === true || typeof config.searchSuggestions === 'string',
            canSuggest: canSuggest(config.searchSuggestions, config.search ?? DEFAULT_SEARCH),
            pageSize: config.pageSize ?? 1,
            adBlocking: {
              mode: deps.adBlock.mode(),
              listUpdated: ((at) => (at === null ? 'not downloaded yet' : `downloaded ${new Date(at).toISOString().slice(0, 10)}`))(deps.adBlock.fetchedAt()),
              startsOff: startsOffEntries(deps.adBlock.reviewed(), config.adBlockingStartsOff, config.adBlockingStartsOn),
            },
            catalogue: config.catalogue !== false,
            profiles: deps.profiles.count,
            hardwareDecode: config.hardwareDecode === true,
            neverAsk: config.neverAsk ?? [],
            askable: NEVER_ASKABLE.map((name) => ({ name, words: ASKABLE[name] })),
            sitesWithChoices: Object.keys(sites).length,
            downloads: downloadsDir(),
            dataFolder: dataDir,
            httpsOnly: config.httpsOnly === true,
            extensions: extensions.list().map((e) => ({ id: e.id, name: e.name, version: e.version, opens: e.options ?? e.popup })),
            extensionUpdates: config.extensionUpdates !== false,
            passwords: { available: passwords.available(), offer: config.passwords !== false, logins: passwords.list(), never: passwords.never().map((n) => n.replace(/^https?:\/\//, '')) },
            update: deps.settings.update(),
            lock: lock ? { homeOnly: lock.homeOnly } : null,
            doNotTrack: config.doNotTrack === true,
            blockTrackers: config.blockTrackers === true,
            hideLocalAddress: config.hideLocalAddress === true,
            theme: config.theme ?? null,
            autoplay: config.autoplay !== false,
            clearOnExit: config.clearOnExit === true,
            history: config.history !== false,
            visits: visits.length,
            language: config.language ?? null,
            buttons: BUTTON_ACTIONS.map((a) => ({ ...a, keys: Object.entries(config.keys).filter(([, action]) => action === a.action).map(([key]) => key) })),
            capturing,
            folders: pickAt === null ? null : foldersAt(pickAt),
          },
    tabs: tabPlaces().map((place) => {
      const wc = views.get(place)?.webContents;
      const url = wc && !wc.isDestroyed() ? wc.getURL() : '';
      const loaded = !isNotice(url);
      return { id: place, title: loaded && wc ? wc.getTitle().slice(0, 80) : '', site: loaded ? siteName(url) : '', current: place === partition, private: isPrivate(place) };
    }),
    history: panel === 'history' ? visits.map((v) => visitLine(v, Date.now())) : null,
    closedTabs: closedTabs.length,
    phoneOn: phone.on,
    phone: ((url) => (panel === 'phone' && url ? { url: url.replace(/#.*$/, ''), code: codeFor(url), connected: phone.connected } : null))(phone.url),
    downloads: downloads.map((d) => ({
      id: d.id,
      name: d.name,
      state: d.state === 'asking' ? ('going' as const) : d.state,
      progress: d.state === 'going' ? progressText(d.item.getReceivedBytes(), d.item.getTotalBytes()) : '',
    })),
    edit: !edit
      ? null
      : {
          site: edit.site,
          picked: ((step, e) =>
            step
              ? {
                  selector: step.selector,
                  matches: step.matches,
                  canWiden: e.level < e.chain.length - 1,
                  canNarrow: e.level > 0,
                  marks: { include: hasMark(e.draft, 'include', step.selector), exclude: hasMark(e.draft, 'exclude', step.selector), row: hasMark(e.draft, 'row', step.selector), player: hasMark(e.draft, 'player', step.selector) },
                }
              : null)(edit.chain[edit.level], edit),
          marked: ((m) => EDIT_MARKS.reduce((n, mark) => n + m[mark].length, 0))(marksOf(edit.draft)),
        },
    reader: panel === 'reader' ? reading : null,
    lock: lock ? { homeOnly: lock.homeOnly, unlocked } : null,
    pin:
      panel !== 'pin' || !pinFor
        ? null
        : 'set' in pinFor
          ? { title: pinFor.first === null ? 'Choose a PIN: four digits' : 'Enter the same PIN again', note: `If the PIN is forgotten, deleting lock.json in ${dataDir} removes the lock.`, waitSeconds: 0 }
          : { title: pinFor.title, note: pinFor.note, waitSeconds: Math.max(0, Math.ceil((pinNotBefore - Date.now()) / 1000)) },
    prompt: !pending
      ? null
      : pending.what === 'profile'
        ? { what: 'profile', name: pending.profile.name, version: pending.profile.version, hosts: pending.profile.match.hosts.slice(0, 6) }
        : pending.what === 'extension'
          ? { what: 'extension', name: pending.extension.name, version: pending.extension.version, can: pending.extension.can }
        : pending.what === 'password'
          ? { what: 'password', site: pending.place.replace(/^https?:\/\//, ''), user: pending.user }
        : pending.what === 'download'
          ? { what: 'download', site: pending.download.site, name: pending.download.name, size: sizeText(pending.download.item.getTotalBytes()), folder: downloadsDir() }
          : { what: 'permission', site: pending.site, wants: describeAsk(pending.names) },
  });

  /** What the folder chooser shows for a folder: the folders in it, the one above, and a few places to start from. */
  const foldersAt = (path: string): NonNullable<NonNullable<ChromeState['settings']>['folders']> => {
    let inside: string[] = [];
    try {
      inside = readdirSync(path, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
        .map((d) => d.name)
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 200);
    } catch {
      // a folder that cannot be read shows as empty
    }
    const up = dirname(path);
    const places = [{ name: 'Home folder', path: app.getPath('home') }, { name: 'Downloads', path: deps.downloads }, ...removableFolders().map((p) => ({ name: `USB: ${basename(p)}`, path: p }))];
    return { path, up: up === path ? null : up, inside, places };
  };
  const isFolder = (path: unknown): path is string => {
    if (typeof path !== 'string' || !path.startsWith('/') || path.length > 1000) return false;
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  };

  const active = (): WebContents => (surface === 'home' || panel ? chrome : page);

  /** The article shown in the reader view, while it is open. */
  let reading: (Article & { site: string }) | null = null;
  /** When the question now on screen was put there. */
  let promptShownAt = 0;
  let shownPanel: Panel | null = null;
  /**
   * A question that is no longer on screen cannot be answered, so it is
   * answered "not now": the site is refused this once, the file is dropped,
   * the profile is asked about another time. Left waiting, it would refuse
   * every later question until Longboard was closed.
   */
  const dropQuestion = (): void => {
    const asked = pending;
    if (!asked) return;
    pending = null;
    if (asked.what === 'permission') for (const answer of asked.answer) answer(false);
    else if (asked.what === 'download') {
      if (!asked.download.arrived) asked.download.item.cancel();
      rmSync(asked.download.temp, { force: true });
    } else if (asked.what === 'extension') extensions.discard(asked.extension);
  };

  /** Sizes and shows the views for the current state, and gives the keys to the one in front. */
  const layout = (): void => {
    if (win.isDestroyed()) return;
    if (pending && panel !== 'prompt') dropQuestion();
    if (panel === 'prompt' && shownPanel !== 'prompt') promptShownAt = Date.now();
    // Leaving "find on this page" takes its marks off the page.
    if (shownPanel === 'find' && panel !== 'find' && !page.isDestroyed()) page.stopFindInPage('clearSelection');
    // The article is held only while it is being read.
    if (panel !== 'reader') reading = null;
    if (panel !== 'pin') pinFor = null;
    shownPanel = panel;
    extensions.selectTab(page);
    const [width = 0, height = 0] = win.getContentSize();
    for (const view of views.values()) {
      view.setBounds(view === pageView ? pageArea() : { x: 0, y: 0, width, height });
      if (view !== pageView) view.setVisible(false);
    }
    // Home and the reader view fill the window; every other panel is a strip beside the website.
    if (surface === 'home' || panel === 'reader') chromeView.setBounds({ x: 0, y: 0, width, height });
    else {
      const strip = Math.round(width * PANEL_WIDTH);
      chromeView.setBounds({ x: width - strip, y: 0, width: strip, height });
    }
    pageView.setVisible(surface === 'page');
    chromeView.setVisible(surface === 'home' || panel !== null);
    if (!chrome.isDestroyed()) chrome.send('longboard:chrome-state', chromeState());
    const front = active();
    if (!front.isDestroyed()) front.focus();
  };

  /** A line of text over whatever is in front. */
  const notify = (text: string): void => {
    const front = active();
    if (!front.isDestroyed()) front.send('longboard:notice', text);
  };

  const saveRecents = (): void => {
    writeJson(homeFile, { recents, saved });
    // A site that is no longer on Home does not keep its icon here.
    const kept = new Set([...recents, ...saved].map((r) => `${siteIconId(r.url)}.png`));
    try {
      for (const file of readdirSync(iconsDir)) {
        if (!file.startsWith('site-') || kept.has(file)) continue;
        rmSync(join(iconsDir, file), { force: true });
        iconData.delete(file.slice(0, -4));
      }
    } catch {
      // no icons have been saved yet
    }
  };
  const saveSites = (): void => writeJson(sitesFile, sites);
  const saveApps = (): void => writeJson(appsFile, { apps });

  // ---- Zoom --------------------------------------------------------------

  const applyZoom = (): void => {
    if (win.isDestroyed() || page.isDestroyed()) return;
    const zoom = Math.min(5, Math.max(0.25, autoZoom() * siteZoom()));
    if (Math.abs(page.getZoomFactor() - zoom) > 0.001) page.setZoomFactor(zoom);
  };
  const changeZoom = (direction: 1 | -1 | 0): void => {
    const key = pageSite();
    if (!key) return;
    const next = direction === 0 ? 1 : zoomStep(siteZoom(), direction);
    const site = { ...sites[key] };
    if (next === 1) delete site.zoom;
    else site.zoom = next;
    if (Object.keys(site).length) sites[key] = site;
    else delete sites[key];
    saveSites();
    applyZoom();
  };

  // ---- Going places ------------------------------------------------------

  let retryTimer: NodeJS.Timeout | undefined;
  let retryAttempt = 0;
  let lastNoticeAt = 0;
  /** True once a real page has been shown. Until then a refused navigation would leave the view blank. */
  let pageShown = false;
  /** The address the person asked for, until its page has given its title. */
  let titleFor: string | null = null;

  const showPage = (): void => {
    surface = 'page';
    panel = null;
    thaw(page);
    page.setAudioMuted(false);
    layout();
  };

  /** Tabs: a new one (which starts on Home), bringing one in front, or closing one. */
  const tabAction = (op: unknown, id: unknown): void => {
    if (edit) endEdit(false);
    const again = op === 'reopen' ? closedTabs[closedTabs.length - 1] : undefined;
    if (op === 'reopen' && !again) return;
    if (op === 'new' || op === 'private' || op === 'reopen') {
      if (tabPlaces().length >= MAX_TABS) {
        notify(`${MAX_TABS} tabs are open. Close one first`);
        return;
      }
      if (surface === 'page') setPointer(false);
      usePartition(`${op === 'private' ? 'private' : 'tab'}:${++tabCount}`);
      surface = 'home';
      panel = null;
      layout();
      if (again) {
        closedTabs.pop();
        open(again, true);
      } else notify(op === 'private' ? 'A private tab. Nothing opened here is kept' : 'A new tab. Open an address or a tile');
      return;
    }
    if (typeof id !== 'string' || !isTab(id) || !views.has(id)) return;
    if (op === 'switch') {
      usePartition(id);
      if (pageLoaded()) showPage();
      else {
        surface = 'home';
        panel = null;
        layout();
      }
      return;
    }
    if (op !== 'close') return;
    const others = tabPlaces().filter((t) => t !== id);
    if (!others.length) {
      notify('The only tab cannot be closed');
      return;
    }
    if (partition === id) {
      // Another tab comes in front first; the nearest one in the list.
      usePartition(others[Math.min(others.length - 1, tabPlaces().indexOf(id))] ?? others[0]!);
      surface = pageLoaded() ? 'page' : 'home';
      if (surface === 'page') {
        thaw(page);
        page.setAudioMuted(false);
      }
    }
    const gone = views.get(id);
    views.delete(id);
    if (lastTab === id) lastTab = isTab(partition) ? partition : (others[0] ?? '');
    if (gone) {
      const left = gone.webContents.session;
      const was = gone.webContents.getURL();
      if (!isPrivate(id) && /^https?:/i.test(was) && !isNotice(was)) {
        closedTabs.push(was);
        if (closedTabs.length > 10) closedTabs.shift();
      }
      win.contentView.removeChildView(gone);
      gone.webContents.close();
      // What a private tab's sites stored goes with the tab.
      if (isPrivate(id)) void left.clearStorageData().catch(() => undefined);
    }
    layout();
  };

  const showHome = (): void => {
    if (edit) endEdit(false);
    if (surface === 'page') {
      // The site stays loaded, silent and still: what was playing is paused by
      // the site's own key, and then the whole page is frozen.
      setPointer(false);
      page.send('longboard:away');
      page.setAudioMuted(true);
      freezeSoon(page);
    }
    surface = 'home';
    panel = null;
    layout();
  };

  /**
   * Makes the view for a session the page in front. The shared view is kept
   * for the whole run; an app's own view is closed when another session's
   * takes its place.
   */
  /** While a video plays the display is kept awake; this lets it sleep again. */
  const releaseDisplay = (): void => {
    if (blocker === undefined) return;
    powerSaveBlocker.stop(blocker);
    blocker = undefined;
  };
  /** The tab most recently in front: where an address opens when an app's own view is in front, or none is. */
  let lastTab = '';
  let tabCount = 0;
  const MAX_TABS = 8;
  const tabPlaces = (): string[] => [...views.keys()].filter(isTab);
  const usePartition = (next: string): void => {
    if (next === partition) return;
    setPointer(false);
    clearTimeout(retryTimer);
    if (pending?.what === 'permission') answerPrompt(false, false);
    if (!page.isDestroyed()) {
      page.send('longboard:away');
      page.setAudioMuted(true);
      // A tab left behind stands still until it is in front again.
      if (isTab(partition)) freezeSoon(page);
    }
    pageView.setVisible(false);
    releaseDisplay();
    const leaving = partition;
    const left = pageView;
    pageView = views.get(next) ?? makeView(next);
    page = pageView.webContents;
    partition = next;
    // A tab stays open behind the one in front. An app's own view is closed when it is left.
    if (!isTab(leaving)) {
      views.delete(leaving);
      win.contentView.removeChildView(left);
      left.webContents.close();
    }
    if (isTab(next)) lastTab = next;
    retryAttempt = 0;
    titleFor = null;
    lastNoticeAt = 0;
    pageShown = pageLoaded();
  };

  /** Opens an address the person asked for. `remember` puts it on Home. `inSession` is an app's own session, or "" for the shared one. */
  const open = (url: string, remember: boolean, inSession = lastTab): void => {
    const reason = blockReason(url, navRules());
    if (reason === 'locked') {
      // Asked for by the person: the PIN opens it, and every other site until Longboard is locked again.
      withPin(`${siteName(url)} is not on Home. Enter the PIN to unlock every site`, () => {
        unlocked = true;
        open(url, remember, inSession);
      });
      return;
    }
    if (reason) {
      console.error(`[longboard] blocked navigation (${reason}): ${describeBlockedUrl(url)}`);
      if (pageShown || surface === 'home') {
        notify(blockedMessage(reason));
        return;
      }
      showPage();
      void page.loadURL(noticePageUrl(reason, url));
      return;
    }
    if (edit) endEdit(false);
    usePartition(inSession);
    if (remember && !isPrivate(partition)) {
      recents = addRecent(recents, url, Date.now());
      titleFor = url;
      saveRecents();
    }
    clearTimeout(retryTimer);
    setPointer(false);
    showPage();
    void page.loadURL(url).catch(() => undefined);
  };

  /** Opens a page in a tab of the session everything shares: where extensions live. Not put on Home. */
  const openInSharedTab = (url: string): void => open(url, false, isTab(lastTab) && !isPrivate(lastTab) ? lastTab : '');

  /**
   * Where Back leads in the view's history, or -1 when it leads Home.
   * - Longboard's own notices are never gone back to.
   * - From a notice, the page it is about is passed over too: stepping onto
   *   it would only bring the notice back.
   * - Entries with the address being left are passed over. Some pages add a
   *   second history entry for themselves as they load (seen on the title
   *   pages of the service Steamboat was written for), and one step back
   *   would then change nothing the person can see.
   */
  const backIndex = (): number => {
    const history = page.navigationHistory;
    const entries = history.getAllEntries();
    const at = history.getActiveIndex();
    const here = entries[at]?.url ?? '';
    const notice = (url: string | undefined): boolean => url === undefined || isNotice(url) || url.startsWith('chrome-error:');
    let i = at - 1;
    const skip = notice(here) ? entries[i]?.url : here;
    while (i >= 0 && (notice(entries[i]?.url) || entries[i]?.url === skip)) i -= 1;
    return i;
  };
  const goBack = (): void => {
    clearTimeout(retryTimer);
    const i = backIndex();
    if (i >= 0) page.navigationHistory.goToIndex(i);
    else showHome();
  };

  eachPage((wc) => wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    if (wc !== page || !isMainFrame || !isLoadFailure(code, url)) return;
    console.error(`[longboard] page failed to load (${code} ${description}): ${describeBlockedUrl(url)}`);
    if (blockReason(url, navRules())) return;
    clearTimeout(retryTimer);
    if (isCertificateError(code)) {
      void page.loadURL(certificatePageUrl(description));
      return;
    }
    retryAttempt += 1;
    const wait = retryDelaySeconds(retryAttempt);
    void page.loadURL(offlinePageUrl(description, wait));
    retryTimer = setTimeout(() => {
      // Only while the notice is still what is shown: the person may have moved on.
      if (!page.isDestroyed() && page.getURL().startsWith('data:')) void page.loadURL(url).catch(() => undefined);
    }, wait * 1000);
  }));
  eachPage((wc) => wc.on('did-navigate', (_e, url) => {
    if (wc !== page) return;
    if (!isNotice(url)) {
      retryAttempt = 0;
      pageShown = true;
    }
    // A profile may keep the edges of the screen clear, so where the page is drawn can change with the address.
    const area = pageArea();
    const now = pageView.getBounds();
    if (panel || area.x !== now.x || area.y !== now.y || area.width !== now.width || area.height !== now.height) layout();
    applyZoom();
  }));
  // History: every page that arrives in the view in front, while the setting is on.
  const visited = (wc: WebContents, url: string): void => {
    if (wc !== page || isNotice(url) || config.history === false || isPrivate(partition)) return;
    visits = addVisit(visits, url, Date.now());
    saveHistory();
  };
  eachPage((wc) => wc.on('did-navigate', (_e, url) => visited(wc, url)));
  eachPage((wc) => wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
    if (isMainFrame) visited(wc, url);
  }));
  eachPage((wc) => wc.on('page-title-updated', (_e, title) => {
    if (wc === page && !isNotice(page.getURL()) && config.history !== false && !isPrivate(partition) && visits[0]?.url === page.getURL()) {
      visits = titleVisit(visits, page.getURL(), title);
      saveHistory();
    }
  }));
  eachPage((wc) => wc.on('page-title-updated', (_e, title) => {
    if (wc !== page || !titleFor || isNotice(page.getURL())) return;
    recents = titleRecent(recents, titleFor, title);
    titleFor = null;
    saveRecents();
  }));
  eachPage((wc) => wc.on('render-process-gone', (_e, details) => {
    console.error(`[longboard] page renderer exited: ${details.reason}`);
  }));

  const NOTICE_GAP_MS = 5000;
  /** Returns true when `url` may load. A refusal is always logged and shown, never silent. */
  const allowed = (url: string): boolean => {
    const reason = blockReason(url, navRules());
    if (!reason) return true;
    console.error(`[longboard] blocked navigation (${reason}): ${describeBlockedUrl(url)}`);
    if (pageShown) {
      // Said once, not for every try: a page that keeps asking would keep the message up.
      if (Date.now() - lastNoticeAt > NOTICE_GAP_MS) page.send('longboard:notice', blockedMessage(reason));
      lastNoticeAt = Date.now();
    } else {
      // Deferred so the refused navigation is fully cancelled first.
      setImmediate(() => {
        if (!page.isDestroyed() && !pageShown) void page.loadURL(noticePageUrl(reason, url));
      });
    }
    return false;
  };
  eachPage((wc) => wc.on('will-navigate', (e, url) => {
    if (wc !== page || !allowed(url)) e.preventDefault();
  }));
  // Frames inside a page are the site's own business; only
  // where the view itself goes is checked.
  eachPage((wc) => wc.on('will-redirect', (e, url, _isInPlace, isMainFrame) => {
    if (!isMainFrame) return;
    if (wc !== page || !allowed(url)) e.preventDefault();
  }));
  // No pop-up windows: a link that asks for one opens in the same view.
  eachPage((wc) => wc.setWindowOpenHandler(({ url }) => {
    // An empty window a script means to fill in later is refused outright:
    // opened in this view it would put a blank page in place of the site.
    if (wc === page && allowed(url) && !isNotice(url)) void page.loadURL(url).catch(() => undefined);
    return { action: 'deny' };
  }));

  const tvCss = readFileSync(join(__dirname, 'tv.css'), 'utf8');
  eachPage((wc) => wc.on('dom-ready', () => {
    void wc.insertCSS(tvCss, { cssOrigin: 'user' });
  }));

  // The chrome view shows one file and goes nowhere else.
  chrome.on('will-navigate', (e) => e.preventDefault());
  chrome.setWindowOpenHandler(() => ({ action: 'deny' }));
  chrome.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  chrome.session.setPermissionCheckHandler(() => false);

  win.on('resize', () => {
    applyZoom();
    layout();
  });
  win.on('enter-full-screen', applyZoom);
  win.on('leave-full-screen', applyZoom);

  // ---- Pointer mode --------------------------------------------------------

  // An on-screen pointer moved with the arrows, for what the highlight cannot
  // reach: maps, canvases, embedded frames. Everything it does is an ordinary
  // mouse event sent to the page, so the page cannot tell it from a mouse and
  // nothing in the page is touched. The layer only draws the arrow.
  const pointer = { x: 0, y: 0, holds: new PointerHolds(), timer: undefined as NodeJS.Timeout | undefined, last: 0, checkId: 0 };
  const pageSize = (): { width: number; height: number } => {
    const b = pageView.getBounds();
    return { width: b.width, height: b.height };
  };
  // Mouse events for pointer mode go through the browser's DevTools input
  // channel, attached only while pointer mode is on. Electron's own
  // sendInputEvent does not deliver mouse events into frames served by
  // another site (seen 2026-11-18), and those frames are what pointer mode is
  // for. They are the same ordinary, trusted mouse events either way.
  // ---- Pages that are not in front stand still ---------------------------------

  // A TV shows one thing at a time. A page that is not in front (another tab
  // is, or Home, or another program) is put into the browser's own "frozen"
  // state, the one a phone's browser puts a background tab into: its video
  // and audio pause, its timers stop, and nothing in it runs until it is in
  // front again. Longboard does not touch the site's player to do this (Hard
  // rule 4); the browser pauses the page as a whole. Measured 2026-11-18:
  // a playing <video>, a playing <audio> and Web Audio all stop, and stay
  // paused when the page is thawed, so playback waits for the person.
  const frozen = new WeakSet<WebContents>();
  const lifecycle = (wc: WebContents, state: 'frozen' | 'active'): void => {
    if (wc.isDestroyed()) return;
    try {
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
      void wc.debugger.sendCommand('Page.setWebLifecycleState', { state }).catch(() => undefined);
    } catch (err) {
      console.error(`[longboard] a page could not be ${state === 'frozen' ? 'paused' : 'woken'} (${String(err).slice(0, 120)})`);
    }
  };
  const freeze = (wc: WebContents): void => {
    if (wc.isDestroyed() || frozen.has(wc) || isNotice(wc.getURL())) return;
    frozen.add(wc);
    lifecycle(wc, 'frozen');
  };
  /** Pages that have been left and will be frozen in a moment, unless they come back first. */
  const leaving = new WeakSet<WebContents>();
  const thaw = (wc: WebContents): void => {
    leaving.delete(wc);
    if (!frozen.has(wc)) return;
    frozen.delete(wc);
    lifecycle(wc, 'active');
  };
  /** Freezes a page a moment after it is left, so the site's own pause key (sent first) has been dealt with. */
  const freezeSoon = (wc: WebContents): void => {
    leaving.add(wc);
    setTimeout(() => {
      // Still left? It may have come straight back, which takes it off the list.
      if (wc.isDestroyed() || !leaving.has(wc)) return;
      leaving.delete(wc);
      freeze(wc);
    }, FREEZE_DELAY_MS);
  };
  // A page that goes somewhere new starts awake: the frozen state belongs to the page that was left.
  eachPage((wc) => wc.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) thaw(wc);
  }));

  let attached = false;
  const attach = (): void => {
    if (attached || page.isDestroyed()) return;
    try {
      if (!page.debugger.isAttached()) page.debugger.attach('1.3');
      attached = true;
    } catch (err) {
      console.error(`[longboard] pointer mode: falling back to plain input events (${String(err).slice(0, 120)})`);
    }
  };
  const detach = (): void => {
    if (!attached) return;
    attached = false;
    try {
      // Left attached while the page is frozen: letting go would wake it.
      if (!page.isDestroyed() && page.debugger.isAttached() && !frozen.has(page)) page.debugger.detach();
    } catch {
      // already gone
    }
  };
  eachPage((wc) => wc.debugger.on('detach', () => {
    if (wc === page) attached = false;
  }));
  type Mouse = { type: 'move' } | { type: 'down' | 'up' } | { type: 'wheel'; dx: number; dy: number };
  const mouse = (x: number, y: number, what: Mouse): void => {
    if (page.isDestroyed()) return;
    if (attached) {
      // This channel counts in the page's own pixels, not the screen's.
      // Measured: with the page drawn at 1.33 times, a click sent in screen
      // pixels landed 1.33 times too far from the corner.
      const at = cdpPoint(x, y, page.getZoomFactor());
      const params =
        what.type === 'move'
          ? { type: 'mouseMoved', ...at }
          : what.type === 'wheel'
            ? { type: 'mouseWheel', ...at, deltaX: what.dx, deltaY: what.dy }
            : { type: what.type === 'down' ? 'mousePressed' : 'mouseReleased', ...at, button: 'left', clickCount: 1 };
      page.debugger.sendCommand('Input.dispatchMouseEvent', params).catch(() => undefined);
      return;
    }
    if (what.type === 'move') page.sendInputEvent({ type: 'mouseMove', x, y, globalX: x, globalY: y, movementX: 0, movementY: 0 });
    // A wheel's "up" is positive for sendInputEvent; the amounts here are "down is positive".
    else if (what.type === 'wheel') page.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: -what.dx, deltaY: -what.dy, canScroll: true });
    else page.sendInputEvent({ type: what.type === 'down' ? 'mouseDown' : 'mouseUp', x, y, button: 'left', clickCount: 1 });
  };
  const showPointer = (): void => {
    if (page.isDestroyed()) return;
    const zoom = page.getZoomFactor() || 1;
    page.send('longboard:pointer', pointerOn ? { x: pointer.x / zoom, y: pointer.y / zoom } : null);
  };
  const applyStep = (step: PointerStep): void => {
    if (page.isDestroyed()) return;
    const x = Math.round(step.x);
    const y = Math.round(step.y);
    const moved = x !== Math.round(pointer.x) || y !== Math.round(pointer.y);
    pointer.x = step.x;
    pointer.y = step.y;
    if (moved) {
      mouse(x, y, { type: 'move' });
      showPointer();
    }
    // Pushing against an edge scrolls, as a wheel would.
    const dx = Math.round(step.scrollX);
    const dy = Math.round(step.scrollY);
    if (dx !== 0 || dy !== 0) mouse(x, y, { type: 'wheel', dx, dy });
  };
  const stopGlide = (): void => {
    clearInterval(pointer.timer);
    pointer.timer = undefined;
    pointer.holds.clear();
  };
  /** Runs while something is held or a press may still turn into a hold, and not otherwise. */
  const glide = (): void => {
    if (pointer.timer) return;
    pointer.last = Date.now();
    pointer.timer = setInterval(() => {
      if (!pointerOn || page.isDestroyed() || active() !== page) {
        stopGlide();
        return;
      }
      const now = Date.now();
      const held = pointer.holds.held(now);
      if (held.size > 0) applyStep(pointerGlide(pointer, held, now, now - pointer.last, pageSize()));
      pointer.last = now;
      if (pointer.holds.idle(now)) {
        clearInterval(pointer.timer);
        pointer.timer = undefined;
      }
    }, 16);
  };
  /** A direction key of a keyboard or remote went down. */
  const keyPointer = (dir: Direction, isRepeat: boolean): void => {
    if (pointer.holds.keyDown(dir, isRepeat, Date.now())) applyStep(pointerTap(pointer, dir, pageSize()));
    glide();
  };
  /** What a game controller holds now. */
  const padPointer = (dirs: readonly Direction[]): void => {
    for (const dir of pointer.holds.setPad(dirs, Date.now())) applyStep(pointerTap(pointer, dir, pageSize()));
    glide();
  };
  const click = (): void => {
    if (page.isDestroyed()) return;
    const x = Math.round(pointer.x);
    const y = Math.round(pointer.y);
    mouse(x, y, { type: 'down' });
    mouse(x, y, { type: 'up' });
  };
  /** OK in pointer mode. A scripted run asks the layer first whether the spot is safe (Hard rule 11). */
  const pressPointer = (): void => {
    if (!options.automation) {
      click();
      return;
    }
    const zoom = page.getZoomFactor() || 1;
    pointer.checkId += 1;
    page.send('longboard:pointer-check', { id: pointer.checkId, x: pointer.x / zoom, y: pointer.y / zoom });
  };
  const setPointer = (on: boolean, at?: { x: number; y: number } | null): void => {
    if (on === pointerOn && !at) return;
    stopGlide();
    pointerOn = on && surface === 'page';
    if (pointerOn) {
      attach();
      const size = pageSize();
      pointer.x = at?.x ?? size.width / 2;
      pointer.y = at?.y ?? size.height / 2;
      mouse(Math.round(pointer.x), Math.round(pointer.y), { type: 'move' });
    } else {
      detach();
    }
    showPointer();
  };
  // A new page has a new layer, which has to be told the pointer is out.
  eachPage((wc) => wc.on('dom-ready', () => {
    if (wc === page && pointerOn) showPointer();
  }));
  // In pointer mode the shell takes the keys before the page sees them: the
  // pointer must work wherever in the page the keys would have gone.
  eachPage((wc) => wc.on('before-input-event', (event, input) => {
    if (wc !== page || !pointerOn || active() !== page) return;
    const action = keyToAction({ key: input.key, ctrlKey: input.control, altKey: input.alt, metaKey: input.meta, shiftKey: input.shift }, 'browse', config.keys);
    if (!action || (action.type !== 'move' && action.type !== 'select' && action.type !== 'back')) return;
    event.preventDefault();
    if (input.type !== 'keyDown') return;
    const repeat = input.isAutoRepeat;
    // Acted on after this event has been dealt with: sending the page a mouse
    // event from inside the handling of a key event stalls the key.
    setImmediate(() => {
      if (!pointerOn || page.isDestroyed()) return;
      if (action.type === 'move') keyPointer(action.dir, repeat);
      else if (repeat) return;
      else if (edit) {
        // In the editor OK picks what is under the pointer, and Back opens the editor's panel.
        if (action.type === 'select') pickForEdit();
        else openEditPanel();
      } else if (action.type === 'select') pressPointer();
      else setPointer(false);
    });
  }));

  // ---- A page that is arriving ---------------------------------------------

  // The page is told when another is on its way and when it has come, and
  // draws a line along the top meanwhile (the layer's overlay). The page
  // being left is the one that hears the start; the new one starts with the
  // line showing and hears the end.
  eachPage((wc) => {
    const said = (on: boolean): void => {
      if (wc.isDestroyed() || arriving.has(wc) === on) return;
      if (on) arriving.add(wc);
      else arriving.delete(wc);
      wc.send('longboard:loading', on);
      if (wc === page && panel === 'menu') refreshChrome();
    };
    wc.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument && !isNotice(details.url)) said(true);
    });
    wc.on('did-stop-loading', () => said(false));
    wc.on('did-fail-load', (_e, _code, _text, _url, isMainFrame) => {
      if (isMainFrame) said(false);
    });
  });

  // ---- Keys the shell answers itself ---------------------------------------

  /** A desk browser's keyboard shortcut (shared/shortcuts.ts), done with what the menu already does. */
  const runShortcut = (shortcut: Shortcut): void => {
    if (win.isDestroyed()) return;
    const onPage = surface === 'page';
    const step = (by: number): void => {
      const places = tabPlaces();
      const at = places.indexOf(partition);
      if (places.length > 1 && at >= 0) tabAction('switch', places[(at + by + places.length) % places.length]);
    };
    switch (shortcut) {
      case 'address':
        if (onPage) {
          panel = 'menu';
          layout();
        } else if (panel) {
          panel = null;
          layout();
        }
        if (!chrome.isDestroyed()) chrome.send('longboard:type-address');
        break;
      case 'newTab': tabAction('new', undefined); break;
      case 'privateTab': tabAction('private', undefined); break;
      case 'reopenTab': tabAction('reopen', undefined); break;
      case 'closeTab': if (isTab(partition)) tabAction('close', partition); break;
      case 'nextTab': step(1); break;
      case 'previousTab': step(-1); break;
      case 'history': menu('history'); break;
      case 'downloads': menu('downloads'); break;
      case 'reload': case 'back': case 'forward': case 'find': case 'zoomIn': case 'zoomOut': case 'zoomReset':
        if (onPage) menu(shortcut);
        break;
      case 'savePage':
        if (onPage && !saved.some((p) => p.url === page.getURL())) menu('savePage');
        break;
    }
  };

  const toggleMenu = (): void => {
    if (panel === 'prompt') return;
    stopGlide();
    // While a profile is being edited the menu key opens the editor's panel.
    panel = panel ? null : edit ? 'edit' : 'menu';
    layout();
  };

  // If the desktop never says the window has focus again, a key press in it
  // still proves someone is here. (Not the layer's own pause key, just sent.)
  let awayAt = 0;
  const watchKeys = (wc: WebContents): void => {
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || (wc !== chrome && wc !== page)) return;
      if (awayAt !== 0 && Date.now() - awayAt > 1500) returned();
      // Settings is waiting for a button to give to an action: this press is it.
      if (capturing && wc === chrome && panel === 'settings') {
        event.preventDefault();
        const action = capturing;
        capturing = null;
        const next = input.key === 'Escape' || input.key === 'Backspace' ? null : mapButton(config.keys, input.key, input.control, action);
        if (next && deps.settings.set('keys', next)) {
          sendKeys();
          notify('That button is set');
        } else notify(input.key === 'Escape' || input.key === 'Backspace' ? 'No button was set' : 'That button cannot be used for this');
        layout();
        return;
      }
      // Quit and the menu must work whatever the page is doing, and wherever
      // in the page the keys are going (an embedded frame has no layer).
      const action = keyToAction({ key: input.key, ctrlKey: input.control, altKey: input.alt, metaKey: input.meta, shiftKey: input.shift }, 'text', config.keys);
      if (action?.type === 'exit') {
        event.preventDefault();
        app.quit();
      } else if (action?.type === 'menu') {
        event.preventDefault();
        toggleMenu();
      } else if (action?.type === 'pointer') {
        event.preventDefault();
        // After this event, for the reason given in the pointer's own key handling.
        if (wc === page && active() === page) setImmediate(() => setPointer(!pointerOn));
      }
      else if (!action) {
        const shortcut = shortcutFor(input, config.keys);
        if (!shortcut || panel === 'prompt' || panel === 'pin' || edit) return;
        event.preventDefault();
        // After this event: several of these change which view has the keys.
        setImmediate(() => runShortcut(shortcut));
      }
    });
  };
  /** Tells every layer the button mappings as they now are; pages opened later get them when they start. */
  const sendKeys = (): void => {
    for (const wc of [chrome, ...[...views.values()].map((v) => v.webContents)]) if (!wc.isDestroyed()) wc.send('longboard:keys', config.keys);
  };
  watchKeys(chrome);
  eachPage(watchKeys);

  // ---- Leaving and coming back --------------------------------------------

  // A TV shows one thing at a time. When another app comes in front: what is
  // playing is paused, by the layer, with the site's own key; the app is
  // silenced; a fullscreen window is minimised. Sound returns with the
  // window; playback waits for the person.
  let awayTimer: NodeJS.Timeout | undefined;
  const away = (): void => {
    if (page.isDestroyed()) return;
    page.send('longboard:away');
    page.setAudioMuted(true);
    // Everything else on the page stops too, once the window has really lost
    // its place (not for a moment, as when one of its own lists opens).
    if (surface === 'page') freezeSoon(page);
    awayAt = Date.now();
    clearTimeout(awayTimer);
    awayTimer = setTimeout(() => {
      if (!win.isDestroyed() && win.isFullScreen() && !win.isFocused() && !win.isMinimized()) win.minimize();
    }, 700);
  };
  const returned = (): void => {
    clearTimeout(awayTimer);
    awayAt = 0;
    if (!page.isDestroyed() && surface === 'page') {
      thaw(page);
      page.setAudioMuted(false);
    }
  };
  win.on('blur', away);
  win.on('minimize', away);
  win.on('hide', away);
  win.on('focus', returned);
  win.on('restore', returned);
  win.on('show', returned);

  // ---- Permissions ---------------------------------------------------------

  eachSession((web) => web.setPermissionRequestHandler((wc, permission, callback, details) => {
    const url = details.requestingUrl || wc.getURL();
    const key = siteKey(url);
    const mediaTypes = 'mediaTypes' in details && Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
    // An answer given to a site counts only for its pages loaded securely.
    const decision = permissionDecision(permission, key && mayAsk(url) ? sites[key] : undefined, mediaTypes, config.neverAsk);
    if (decision.kind !== 'ask') {
      callback(decision.kind === 'grant');
      return;
    }
    // Only the page in front is asked about, only when it was loaded securely,
    // and one question at a time: anything else is refused for now, unremembered.
    const same = pending?.what === 'permission' && pending.site === key && pending.names.join() === decision.names.join();
    if (wc !== page || surface !== 'page' || !key || !mayAsk(url) || (pending && !same)) {
      callback(false);
      return;
    }
    if (pending?.what === 'permission') pending.answer.push(callback);
    else {
      pending = { what: 'permission', site: key, names: decision.names, answer: [callback] };
      panel = 'prompt';
      layout();
    }
  }));
  eachSession((web) => web.setPermissionCheckHandler((_wc, permission, origin, details) => {
    const key = siteKey(origin);
    const mediaType = details.mediaType === 'video' || details.mediaType === 'audio' ? [details.mediaType] : [];
    return hasPermission(permission, key && mayAsk(origin) ? sites[key] : undefined, mediaType, config.neverAsk);
  }));
  const answerPrompt = (allow: boolean, remember: boolean): void => {
    const asked = pending;
    if (!asked) return;
    pending = null;
    panel = null;
    if (asked.what === 'extension') {
      layout();
      if (!allow) {
        extensions.discard(asked.extension);
        return;
      }
      void extensions.enable(asked.extension).then(
        () => {
          layout();
          notify(`"${asked.extension.name}" is added. Settings, under Extensions, opens or removes it`);
        },
        (err) => {
          console.error(`[longboard] extension could not be switched on: ${String(err).slice(0, 200)}`);
          extensions.discard(asked.extension);
          notify(`"${asked.extension.name}" could not be added: this browser cannot run it`);
        },
      );
      return;
    }
    if (asked.what === 'password') {
      // Back is "not now" and leaves it to be asked for again from the menu; an answer settles it.
      if (remember) typed.delete(page);
      layout();
      if (allow) void passwords.save(asked.place, asked.user, asked.password, Date.now()).then((kept) => notify(kept ? 'That password is kept. Settings, under Passwords, lists and removes them' : 'That password could not be kept: the keyring did not take it'));
      return;
    }
    if (asked.what === 'profile') {
      deps.profiles.answer(asked.profile, allow, remember);
      layout();
      // The page starts again so the profile applies from its first moment.
      if (allow && surface === 'page') page.reload();
      return;
    }
    if (asked.what === 'download') {
      const d = asked.download;
      layout();
      if (!allow) {
        // What arrived while the question was up is thrown away.
        if (!d.arrived) d.item.cancel();
        rmSync(d.temp, { force: true });
        return;
      }
      d.agreed = true;
      downloads.unshift(d);
      // The list is of this run only, and not endless: the oldest finished ones go first.
      while (downloads.length > MAX_LISTED) {
        let old = downloads.length - 1;
        while (old >= 0 && downloads[old]?.state === 'going') old -= 1;
        if (old < 0) break;
        downloads.splice(old, 1);
      }
      if (d.arrived) keep(d);
      else {
        d.state = 'going';
        notify(`Downloading ${d.name}`);
      }
      return;
    }
    if (remember && !isPrivate(partition)) {
      sites[asked.site] = { ...sites[asked.site], ...withAnswers(sites[asked.site], asked.names, allow) };
      saveSites();
    }
    for (const answer of asked.answer) answer(allow);
    layout();
  };
  /** Asks, once, whether to use a profile someone gave the person (docs/PROFILES.md section 3). */
  const askAboutProfile = (profile: Profile): void => {
    if (pending || surface !== 'page') return;
    pending = { what: 'profile', profile };
    panel = 'prompt';
    layout();
  };
  // A question belongs to the page that asked it.
  eachPage((wc) => wc.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
    if (wc === page && isMainFrame && !isInPlace && pending?.what === 'permission') answerPrompt(false, false);
  }));

  // ---- Ad blocking ----------------------------------------------------------

  // Requests that the public filter lists name are refused, for the views
  // that show websites, when the switch for the site in front is on. That is
  // all: nothing is redirected, rewritten or put into a page (main/adblock.ts).
  eachSession((web) => filterSession(web, (url, kind, wc) => {
    if (!wc || wc.isDestroyed() || !isPageView(wc)) return false;
    const pageUrl = wc.getURL();
    if (!blockingAt(pageUrl)) return false;
    if (!deps.adBlock.filters()?.refuses(url, pageUrl, kind)) return false;
    refused.set(wc, (refused.get(wc) ?? 0) + 1);
    return true;
  }));
  // The privacy settings that act on every website view: the two "do not
  // track" signals (main/signals.ts), and keeping the device's address on the
  // home network from sites that set up calls.
  const signalSession = (web: Electron.Session): void => privacySignals(web, config.doNotTrack === true);
  const guardAddress = (wc: WebContents): void => {
    if (!wc.isDestroyed()) wc.setWebRTCIPHandlingPolicy(config.hideLocalAddress === true ? 'default_public_interface_only' : 'default');
  };
  eachSession(signalSession);
  eachPage((wc) => extensions.addTab(wc));
  void extensions.load().then(() => {
    // Newer versions of installed extensions, a minute after starting and once a day. Not in a scripted run.
    const refresh = (): void => {
      if (config.extensionUpdates !== false && !options.automation) void extensions.update();
    };
    setTimeout(refresh, 60_000).unref();
    setInterval(refresh, 24 * 60 * 60 * 1000).unref();
  });
  eachPage(guardAddress);
  /** Puts those settings into effect again after one was changed. */
  const applyPrivacy = (): void => {
    for (const web of wiredSessions) signalSession(web);
    for (const view of views.values()) guardAddress(view.webContents);
  };
  // Counted from the moment a new page is asked for: its first requests can
  // be on their way before the shell hears that the page has arrived.
  eachPage((wc) => wc.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) refused.set(wc, 0);
  }));

  // ---- Downloads -----------------------------------------------------------

  // A file a site sends, or that the person chose to download, is asked about
  // first: what it is called, how big, where from. While the question is up
  // the file goes on arriving, under a meaningless name in a folder of
  // Longboard's own (a download cannot be made to wait, and one that came
  // from sending a form cannot be asked for twice). Agreed
  // to, it is moved to the downloads folder under a name that writes over
  // nothing. Refused, what arrived is deleted. Longboard never opens or runs
  // what it downloads.
  const taken = (n: string): boolean => existsSync(join(downloadsDir(), n));
  const refreshChrome = (): void => {
    if (!chrome.isDestroyed()) chrome.send('longboard:chrome-state', chromeState());
  };
  /** Puts a finished download where the person will look for it. */
  const keep = (d: Download): void => {
    try {
      mkdirSync(downloadsDir(), { recursive: true });
      const name = uniqueName(d.name, taken);
      const to = join(downloadsDir(), name);
      try {
        renameSync(d.temp, to);
      } catch {
        // The downloads folder is on another disk.
        copyFileSync(d.temp, to);
        rmSync(d.temp, { force: true });
      }
      d.name = name;
      d.state = 'saved';
      notify(`Saved ${name} in ${downloadsDir()}`);
    } catch (err) {
      console.error(`[longboard] the downloads folder cannot be used: ${String(err).slice(0, 160)}`);
      rmSync(d.temp, { force: true });
      d.state = 'failed';
      notify(`${d.name} could not be saved: the downloads folder cannot be used`);
    }
    if (panel === 'menu' || panel === 'downloads') refreshChrome();
  };
  eachSession((web) => web.on('will-download', (event, item, wc) => {
    if (pending || surface !== 'page' || wc !== page) {
      event.preventDefault();
      notify(pending ? 'A download was not started: another question was waiting' : 'A download was not started');
      return;
    }
    let temp: string;
    try {
      mkdirSync(waitingDir, { recursive: true });
      temp = join(waitingDir, `${randomUUID()}.part`);
    } catch (err) {
      console.error(`[longboard] downloads cannot be held: ${String(err).slice(0, 160)}`);
      event.preventDefault();
      notify('A download could not be started');
      return;
    }
    // Set now, so the browser never puts up a file chooser of its own.
    item.setSavePath(temp);
    const url = item.getURL();
    const d: Download = { id: ++lastDownload, name: uniqueName(item.getFilename(), taken), site: siteName(url) || 'this site', item, temp, state: 'asking', agreed: false, arrived: false };
    item.once('done', (_e, state) => {
      if (state === 'completed' && !d.agreed) {
        // All of it came before the answer did; it waits where it is.
        d.arrived = true;
        return;
      }
      if (state === 'completed') {
        keep(d);
        return;
      }
      rmSync(temp, { force: true });
      const asking = pending?.what === 'download' && pending.download === d;
      if (asking) {
        pending = null;
        panel = null;
        layout();
      }
      // Refused by the person: nothing more to say about it.
      if (d.state === 'asking' && !asking) return;
      d.state = state === 'cancelled' ? 'cancelled' : 'failed';
      notify(state === 'cancelled' ? `The download of ${d.name} was cancelled` : `The download of ${d.name} failed`);
      if (panel === 'menu' || panel === 'downloads') refreshChrome();
    });
    pending = { what: 'download', download: d };
    panel = 'prompt';
    layout();
  }));
  // The list on screen shows how far each download has got.
  const downloadsTick = setInterval(() => {
    if (panel === 'downloads' && downloads.some((d) => d.state === 'going')) refreshChrome();
  }, 1000);

  // ---- Messages from the layers ---------------------------------------------

  let blocker: number | undefined;
  let nudge = false;
  const viewSize = (wc: WebContents): [number, number] => {
    const b = (wc === page ? pageView : chromeView).getBounds();
    return [b.width, b.height];
  };

  /** The profile each website view's page is being driven by now. */
  const driving = new WeakMap<WebContents, Profile | null>();
  // A site that changes its address without loading a page (most web apps)
  // can move onto or off the paths a profile is for. The page is the same
  // page, so its layer is told the new rules; nothing is reloaded.
  eachPage((wc) => wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
    if (!isMainFrame || edit) return;
    const next = profileFor(url)?.profile ?? null;
    if (next === (driving.get(wc) ?? null)) return;
    driving.set(wc, next);
    wc.send('longboard:rules', next);
    if (wc !== page) return;
    layout();
    applyZoom();
  }));

  const onBoot = (event: Electron.IpcMainEvent): void => {
    const wc = event.sender;
    const top = event.senderFrame === wc.mainFrame;
    // Any website view is answered, in front or not: a page that starts
    // behind another must still get its options (the automation guard above all).
    if ((!isPageView(wc) && wc !== chrome) || !top) {
      event.returnValue = null;
      return;
    }
    const place = [...views].find(([, v]) => v.webContents === wc)?.[0] ?? '';
    const layerOptions: LayerOptions = { ...options, surface: wc === chrome ? 'chrome' : 'page', keys: config.keys, buttons: config.buttons ?? {}, logins: wc !== chrome && loginsOn() && !isPrivate(place) };
    const boot: BootData & { state?: ChromeState } = { options: layerOptions, profile: null };
    if (wc === chrome) boot.state = chromeState();
    else {
      // Chosen by the shell from the frame's real address, never from anything the page says.
      const choice = deps.profiles.choose(event.senderFrame?.url ?? '');
      const use = choice.kind === 'use' ? choice : choice.kind === 'ask' ? choice.fallback : null;
      boot.profile = use?.profile ?? null;
      driving.set(wc, use?.profile ?? null);
      if (choice.kind === 'ask' && wc === page) {
        const asked = choice.profile;
        setImmediate(() => askAboutProfile(asked));
      }
    }
    event.returnValue = boot;
  };
  ipcMain.on('longboard:boot', onBoot);

  const onMessage = (event: Electron.IpcMainEvent, msg: BridgeMessage): void => {
    const wc = event.sender;
    // Only the top frame of one of our two views may talk to the shell.
    if ((wc !== page && wc !== chrome) || event.senderFrame !== wc.mainFrame) return;
    if (!msg || typeof msg !== 'object') return;
    switch (msg.kind) {
      case 'exit':
        app.quit();
        break;
      case 'playerKey': {
        // An ordinary key press, delivered to the page like one from a keyboard.
        const info = playerKeyInfo(msg.key);
        if (info) {
          wc.sendInputEvent({ type: 'keyDown', keyCode: info.code });
          if (info.char) wc.sendInputEvent({ type: 'char', keyCode: info.char });
          wc.sendInputEvent({ type: 'keyUp', keyCode: info.code });
        }
        break;
      }
      case 'phoneOk': {
        const held = phoneHeld;
        if (!held || held.id !== msg.id || held.to !== wc || Date.now() - held.at > 3000) break;
        phoneHeld = null;
        void wc.insertText(held.text);
        break;
      }
      case 'loginSeen': {
        const at = event.senderFrame?.url ?? '';
        if (wc !== page || !loginsOn() || isPrivate(partition) || !loginPlace(at)) break;
        loginForms.set(wc, at);
        if (passwords.users(loginPlace(at)).length) notify('A sign-in is saved for this site: open the menu to fill it in');
        break;
      }
      case 'credentials': {
        // What was typed is looked at for one thing: whether to offer to keep it. It is not logged and goes nowhere else.
        const place = loginPlace(event.senderFrame?.url ?? '');
        const login = cleanCredentials(msg);
        if (wc !== page || !login || !place) break;
        void passwords.reveal(place, login.user).then((kept) => {
          const offer = shouldOffer({ automation: options.automation, privateTab: isPrivate(partition), enabled: config.passwords !== false, available: passwords.available(), place, never: passwords.never(), alreadyKept: kept === login.password });
          if (!offer || wc.isDestroyed()) return;
          typed.set(wc, { place, ...login, at: Date.now() });
          // After a moment: the page is usually on its way to the next one.
          setTimeout(() => {
            if (!wc.isDestroyed() && wc === page && typedNow(wc)) notify('To keep that password, open the menu');
          }, 2500);
        });
        break;
      }
      case 'typeText': {
        const text = typableText(msg.text);
        if (text) void wc.insertText(text);
        break;
      }
      case 'revealControls': {
        // An ordinary pointer movement across the middle of the picture. One
        // step is not enough on some players, and steps sent together are
        // merged into one, so it is a short sweep spread over time, in
        // alternating directions so every call is a real movement.
        const [w, h] = viewSize(wc);
        nudge = !nudge;
        const forward = nudge;
        const steps = forward ? [0, 20, 40, 60] : [60, 40, 20, 0];
        steps.forEach((dx, i) => {
          setTimeout(() => {
            if (wc.isDestroyed()) return;
            const x = Math.round(w / 2) + dx;
            const y = Math.round(h / 2);
            // A real pointer reports how far it moved; some players ignore a move that reports zero.
            wc.sendInputEvent({ type: 'mouseMove', x, y, globalX: x, globalY: y, movementX: forward ? 20 : -20, movementY: 0 });
          }, i * 40);
        });
        break;
      }
      case 'hover': {
        // An ordinary pointer movement to a point the layer names. Page
        // coordinates are CSS pixels; input events are in view pixels.
        const point = hoverPoint(msg, wc.getZoomFactor(), viewSize(wc));
        if (point) {
          // Two steps: a single event is not always treated as movement.
          wc.sendInputEvent({ type: 'mouseMove', x: Math.max(0, point.x - 3), y: point.y, movementX: 0, movementY: 0 });
          setTimeout(() => {
            if (!wc.isDestroyed()) wc.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y, movementX: 3, movementY: 0 });
          }, 40);
        }
        break;
      }
      case 'playback':
        if (wc !== page) break;
        if (msg.playing && blocker === undefined) {
          blocker = powerSaveBlocker.start('prevent-display-sleep');
        } else if (!msg.playing && blocker !== undefined) {
          powerSaveBlocker.stop(blocker);
          blocker = undefined;
        }
        break;
      case 'diagnostics': {
        if (wc !== page) break;
        if (edit?.saving) {
          // The editor asked for this outline: it is the evidence for the profile being saved.
          const text = `# Saved by Longboard's profile editor on ${new Date().toISOString().slice(0, 10)}.\n# Structure only: no text, names or addresses.\n#### page\n${String(msg.outline).slice(0, 2_000_000)}\n`;
          const file = deps.profiles.saveLocal(edit.draft, text);
          endEdit(true);
          notify(file ? `Profile saved as ${file}` : 'The profile could not be saved');
          break;
        }
        const dir = join(dataDir, 'diagnostics');
        mkdirSync(dir, { recursive: true });
        const name = `outline-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        writeFileSync(join(dir, name), `# ${String(msg.url).slice(0, 300)}\n${String(msg.outline).slice(0, 2_000_000)}\n`);
        break;
      }
      case 'reader': {
        if (wc !== page || surface !== 'page') break;
        const article = parseArticle(msg.article);
        if (!article) {
          notify('No article to read was found on this page');
          break;
        }
        reading = { ...article, site: siteName(page.getURL()) };
        panel = 'reader';
        layout();
        break;
      }
      case 'icons':
        // What the page's own links say its icons are; a web-app manifest may list bigger ones.
        if (wc !== page) break;
        iconLinks.set(wc, parseIconLinks(msg.list));
        refreshIcons(wc);
        break;
      case 'back':
        // Only from the view in front: a page left behind must not move anything.
        if (wc === page && surface === 'page' && !panel) goBack();
        break;
      case 'menu':
        if (wc === active()) toggleMenu();
        break;
      case 'pointer':
        if (wc !== page || active() !== page) break;
        if (msg.x === undefined) setPointer(!pointerOn);
        else setPointer(true, startPoint(msg, page.getZoomFactor(), pageSize()));
        break;
      case 'pointerOff':
        if (wc !== page) break;
        if (edit) openEditPanel();
        else setPointer(false);
        break;
      case 'pointerHeld':
        if (wc === page && pointerOn && active() === page && Array.isArray(msg.dirs)) {
          padPointer(msg.dirs.filter((d): d is Direction => d === 'up' || d === 'down' || d === 'left' || d === 'right'));
        }
        break;
      case 'pointerClick':
        if (wc === page && pointerOn && active() === page) {
          if (edit) pickForEdit();
          else pressPointer();
        }
        break;
      case 'editPicked': {
        if (wc !== page || !edit) break;
        const chain = parsePicked(msg.chain);
        if (chain.length === 0) {
          notify('Nothing there can be marked');
          break;
        }
        edit.chain = chain;
        edit.level = 0;
        panel = 'edit';
        showEdit();
        layout();
        break;
      }
      case 'pointerClickOk':
        // Only the answer to the question just asked, and only while it still stands.
        if (wc === page && pointerOn && options.automation && msg.id === pointer.checkId) {
          pointer.checkId += 1;
          if (msg.frame === true && !framesGuarded()) page.send('longboard:notice', 'Blocked: automation mode could not check an embedded frame');
          else click();
        }
        break;
      default:
        break;
    }
  };
  ipcMain.on('longboard:msg', onMessage);

  // Embedded frames, in a scripted run only: each says when its purchase
  // guard is up, and when the guard stopped something.
  const guarded = new Set<string>();
  const frameKey = (frame: Electron.WebFrameMain): string => `${frame.processId}:${frame.routingId}`;
  /** True when every frame inside the page has its guard up. */
  const framesGuarded = (): boolean => page.mainFrame.framesInSubtree.every((f) => f === page.mainFrame || guarded.has(frameKey(f)));
  const onFrame = (event: Electron.IpcMainEvent, what: unknown): void => {
    const frame = event.senderFrame;
    if (!isPageView(event.sender) || !frame || frame === event.sender.mainFrame || !options.automation) return;
    if (what === 'guarded') guarded.add(frameKey(frame));
    else if (what === 'blocked' && event.sender === page) page.send('longboard:notice', 'Blocked: automation mode never activates purchase or sign-up controls');
  };
  ipcMain.on('longboard:frame', onFrame);
  eachPage((wc) => wc.on('did-frame-navigate', (_e, _url, _code, _status, isMainFrame, processId, routingId) => {
    // A frame that has gone somewhere new has to say again that it is guarded.
    if (!isMainFrame) guarded.delete(`${processId}:${routingId}`);
  }));

  // ---- The profile editor ----------------------------------------------------

  // A first, small editor (DESIGN.md 4.5): point at something, press OK, and
  // say what it is. Every choice goes into a draft profile in the ordinary
  // format, the page is driven by the draft at once, and saving writes it to
  // the person's own profiles with an outline of the page as its evidence.
  const showEdit = (): void => {
    if (page.isDestroyed()) return;
    page.send('longboard:edit-show', edit ? { picked: panel === 'edit' ? (edit.chain[edit.level]?.selector ?? null) : null, marks: marksOf(edit.draft) } : null);
  };
  const startEdit = (): void => {
    const url = page.getURL();
    const draft = surface === 'page' && !isNotice(url) ? startDraft(url, profileFor(url)?.profile ?? null) : null;
    panel = null;
    if (!draft) {
      layout();
      notify('A profile cannot be made for this address');
      return;
    }
    edit = { site: siteName(url), draft, chain: [], level: 0, saving: false };
    setPointer(true);
    layout();
    showEdit();
    notify('Profile editor: move the pointer onto something and press OK. Back to finish.');
  };
  /** Ends the editing. Unless it was saved, the page goes back to the rules it had. */
  const endEdit = (saved: boolean): void => {
    if (!edit) return;
    edit = null;
    if (panel === 'edit') panel = null;
    setPointer(false);
    if (!page.isDestroyed()) {
      page.send('longboard:edit-show', null);
      if (!saved) page.send('longboard:rules', profileFor(page.getURL())?.profile ?? null);
    }
    layout();
  };
  const pickForEdit = (): void => {
    const zoom = page.getZoomFactor() || 1;
    page.send('longboard:edit-pick', { x: pointer.x / zoom, y: pointer.y / zoom });
  };
  const openEditPanel = (): void => {
    stopGlide();
    panel = 'edit';
    showEdit();
    layout();
  };
  const editAction = (action: EditAction): void => {
    if (!edit) return;
    const step = edit.chain[edit.level];
    switch (action) {
      case 'include':
      case 'exclude':
      case 'row':
      case 'player':
        if (!step) break;
        edit.draft = toggleMark(edit.draft, action, step.selector);
        // Seen at once: the page is driven by the draft from here on.
        page.send('longboard:rules', edit.draft);
        break;
      case 'wider':
        edit.level = Math.min(edit.chain.length - 1, edit.level + 1);
        break;
      case 'narrower':
        edit.level = Math.max(0, edit.level - 1);
        break;
      case 'pickAgain':
        edit.chain = [];
        edit.level = 0;
        panel = null;
        setPointer(true);
        break;
      case 'save':
        // The outline comes back as a message from the layer; the saving is done there.
        edit.saving = true;
        page.send('longboard:action', 'diagnostics');
        return;
      case 'discard':
        endEdit(false);
        return;
    }
    showEdit();
    layout();
  };
  // A new page of the same site carries on with the draft; another site ends the editing.
  eachPage((wc) => wc.on('dom-ready', () => {
    if (wc !== page || !edit) return;
    if (siteName(page.getURL()) !== edit.site) {
      endEdit(false);
      return;
    }
    page.send('longboard:rules', edit.draft);
    showEdit();
  }));

  // ---- Web apps ----------------------------------------------------------------

  /** The icons each page says are its own: what the browser found, and what the page's own links name. */
  const favicons = new WeakMap<WebContents, string[]>();
  const iconLinks = new WeakMap<WebContents, IconLink[]>();
  /** Icons being fetched now, by the name they are kept under. */
  const fetchingIcons = new Set<string>();
  /**
   * The addresses to try for the icon of the page in `wc`, best first. When
   * the page names a web-app manifest that is read too: it is where a site
   * lists the big icons it made for being put on a home screen.
   */
  const iconsFor = async (wc: WebContents): Promise<string[]> => {
    const url = wc.getURL();
    const links = iconLinks.get(wc) ?? [];
    const manifestUrl = manifestLink(links);
    let listed: Array<{ url: string; size: number }> = [];
    if (manifestUrl) {
      const got = await fetchIcon(manifestUrl, wc.session);
      try {
        if (got) listed = manifestIcons(JSON.parse(got.body.toString('utf8')), manifestUrl);
      } catch {
        // not a manifest
      }
    }
    return iconCandidates(links, listed, favicons.get(wc) ?? [], url);
  };
  /**
   * Fetches the icon for whatever on Home the page in front belongs to (an
   * app, a saved page, a recent site) when there is none yet or it is old.
   * Called when the page says what its icons are, and when something is put on Home.
   */
  const refreshIcons = (wc: WebContents): void => {
    if (wc !== page || wc.isDestroyed() || isNotice(wc.getURL())) return;
    const url = wc.getURL();
    const key = siteKey(url);
    if (!key) return;
    const onHome = (): boolean => [...recents, ...saved].some((r) => siteKey(r.url) === key);
    const ids: string[] = [];
    const item = appFor(apps, url);
    if (item) ids.push(item.id);
    if (onHome()) ids.push(siteIconId(url));
    for (const id of ids) {
      // Fetched again after a week, in case the site has changed it.
      let age = Infinity;
      try {
        age = Date.now() - statSync(join(iconsDir, `${id}.png`)).mtimeMs;
      } catch {
        // not fetched yet
      }
      if (age < ICON_KEPT_MS || fetchingIcons.has(id)) continue;
      fetchingIcons.add(id);
      void iconsFor(wc)
        .then((candidates) => saveIcon(id, candidates, wc.session))
        .catch(() => false)
        .then((done) => {
          fetchingIcons.delete(id);
          if (!done) return;
          const added = apps.find((a) => a.id === id);
          if (id.startsWith('site-')) {
            // The site may have been taken off Home while its icon was on the way.
            if (!onHome()) saveRecents();
          } else if (!added) {
            rmSync(join(iconsDir, `${id}.png`), { force: true });
            iconData.delete(id);
          } else if (added.launcher) writeAppLauncher(added);
          if (surface === 'home' && !win.isDestroyed()) layout();
        });
    }
  };
  eachPage((wc) => wc.on('page-favicon-updated', (_e, urls) => {
    favicons.set(wc, urls.filter((u) => /^https?:/i.test(u)).slice(0, 8));
    refreshIcons(wc);
  }));
  eachPage((wc) => wc.on('did-navigate', () => {
    favicons.delete(wc);
    iconLinks.delete(wc);
  }));
  /**
   * Saves a site's own icon for an app, fetched from the site by the session
   * the page is in. Hard rule 6: icons come from the site at run time and are
   * never in the repository. Nothing is saved when the site offers none that
   * can be read as a picture.
   */
  /** Icons handed to Longboard's own screen to be drawn, waiting to come back as a PNG. */
  const drawing = new Map<number, (png: Buffer | null) => void>();
  let lastDrawing = 0;
  /**
   * Turns what a site sent into a small PNG without the shell ever decoding
   * it: the sandboxed process that draws Longboard's own screens does, as it
   * would for any picture on a page, and sends back a PNG of its own making.
   */
  const drawIcon = (dataUrl: string): Promise<Buffer | null> =>
    new Promise((resolve) => {
      if (chrome.isDestroyed()) return resolve(null);
      const id = ++lastDrawing;
      const timer = setTimeout(() => {
        drawing.delete(id);
        resolve(null);
      }, 8000);
      drawing.set(id, (png) => {
        clearTimeout(timer);
        drawing.delete(id);
        resolve(png);
      });
      chrome.send('longboard:icon', { id, dataUrl, size: ICON_SIZE });
    });
  /** A site's icon as the site sends it: given up on after a few seconds or when it is bigger than an icon could be. */
  const fetchIcon = async (url: string, from: Electron.Session): Promise<{ body: Buffer; type: string | null } | null> => {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), ICON_WAIT_MS);
    try {
      const response = await from.fetch(url, { cache: 'force-cache', signal: stop.signal });
      if (!response.ok || !response.body || Number(response.headers.get('content-length') ?? 0) > MAX_ICON_BYTES) return null;
      const parts: Buffer[] = [];
      let size = 0;
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_ICON_BYTES) {
          stop.abort();
          return null;
        }
        parts.push(Buffer.from(value));
      }
      return { body: Buffer.concat(parts), type: response.headers.get('content-type') };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  const saveIcon = async (id: string, candidates: readonly string[], from: Electron.Session): Promise<boolean> => {
    for (const url of candidates) {
      try {
        const bytes = await fetchIcon(url, from);
        const dataUrl = bytes ? iconDataUrl(bytes.body, bytes.type) : null;
        const png = dataUrl ? await drawIcon(dataUrl) : null;
        if (!png) continue;
        mkdirSync(iconsDir, { recursive: true });
        writeFileSync(join(iconsDir, `${id}.png`), png);
        iconData.delete(id);
        return true;
      } catch {
        // try the next one
      }
    }
    return false;
  };
  const writeAppLauncher = (item: WebApp): boolean => {
    const ownIcon = iconOf(item.id) ? join(iconsDir, `${item.id}.png`) : join(app.getAppPath(), 'assets', 'icon.png');
    return writeLauncher(launcherFileName(item.id), launcherEntry(item, launchCommand(process.execPath, app.getAppPath(), app.isPackaged), ownIcon));
  };
  /** Adds the site in front as an app (DESIGN.md 4.2). */
  const addCurrentAsApp = async (wanted: { name: string; ownSession: boolean; launcher: boolean }): Promise<void> => {
    const url = page.getURL();
    const added = addApp(apps, { url, ...wanted });
    panel = null;
    if (!added) {
      layout();
      notify('This page cannot be added as an app');
      return;
    }
    apps = added.list;
    saveApps();
    const item = added.app;
    // The panel goes at once; the icon may take a moment to come.
    layout();
    const from = page;
    await saveIcon(item.id, await iconsFor(from), from.session);
    if (!apps.some((a) => a.id === item.id)) {
      // Removed again while its icon was on the way.
      rmSync(join(iconsDir, `${item.id}.png`), { force: true });
      iconData.delete(item.id);
      return;
    }
    let said = `Added "${item.name}" to Home`;
    if (item.launcher) said += writeAppLauncher(item) ? " and to the TV's app list" : ". It could not be put in the TV's app list";
    if (item.ownSession) said += '. Open it from Home to use its own sign-ins';
    layout();
    notify(said);
  };
  const removeAppById = (id: string): void => {
    const item = apps.find((a) => a.id === id);
    if (!item) return;
    apps = removeApp(apps, id);
    saveApps();
    removeLauncher(launcherFileName(id));
    rmSync(join(iconsDir, `${id}.png`), { force: true });
    iconData.delete(id);
    // What the app kept for itself goes with it.
    if (item.ownSession) {
      if (partition === appPartition(item)) {
        // Its view goes with it, so there is nothing left to show but Home.
        usePartition(lastTab);
        surface = 'home';
        panel = null;
        layout();
      }
      void session.fromPartition(appPartition(item)).clearStorageData().catch(() => undefined);
    }
    notify(`Removed the app "${item.name}"`);
  };
  const openApp = (id: string): boolean => {
    const item = apps.find((a) => a.id === id);
    if (!item) return false;
    open(item.url, false, appPartition(item));
    return true;
  };

  // ---- Messages from Longboard's own screens ---------------------------------

  /** Menu entries that change what is on Home, which the parental lock asks the PIN for while Home decides which sites open. */
  const HOME_CHANGES: readonly MenuAction[] = ['addApp', 'removeApp', 'savePage', 'unsavePage'];
  const menu = (action: MenuAction): void => (HOME_CHANGES.includes(action) ? withPinForHome(() => menuNow(action)) : menuNow(action));
  const menuNow = (action: MenuAction): void => {
    switch (action) {
      case 'close':
        // Leaving the choosing of a new PIN goes back to Settings, where it was started.
        panel = panel === 'pin' && pinFor && ('set' in pinFor || pinFor.back === 'settings') ? 'settings' : null;
        layout();
        break;
      case 'home':
        showHome();
        break;
      case 'resume':
        if (pageLoaded()) showPage();
        break;
      case 'back':
        panel = null;
        layout();
        if (surface === 'page') goBack();
        break;
      case 'forward':
        panel = null;
        layout();
        if (surface === 'page' && page.navigationHistory.canGoForward()) {
          clearTimeout(retryTimer);
          page.navigationHistory.goForward();
        }
        break;
      case 'stop':
        if (surface === 'page') page.stop();
        panel = null;
        layout();
        break;
      case 'reload':
        panel = null;
        layout();
        if (surface === 'page') page.reload();
        break;
      case 'zoomIn':
      case 'zoomOut':
      case 'zoomReset':
        if (surface === 'page') changeZoom(action === 'zoomIn' ? 1 : action === 'zoomOut' ? -1 : 0);
        layout();
        break;
      case 'pointer':
        panel = null;
        if (surface === 'page') setPointer(!pointerOn);
        layout();
        break;
      case 'outline':
        panel = null;
        layout();
        if (surface === 'page') page.send('longboard:action', 'diagnostics');
        break;
      case 'exportProfile': {
        panel = null;
        layout();
        const current = surface === 'page' ? profileFor(page.getURL()) : null;
        const file = current ? deps.profiles.exportProfile(current.profile) : null;
        notify(file ? `Profile saved as ${file}` : 'There is no profile to export here');
        break;
      }
      case 'addExtension': {
        const id = surface === 'page' ? storeExtensionId(page.getURL()) : null;
        if (!id || extensions.ids().includes(id) || pending) break;
        // An extension can see everything that is browsed: with a parental lock, adding one needs the PIN.
        withPin('Enter the PIN to add an extension', () => {
          panel = null;
          layout();
          notify('Fetching the extension from the Chrome Web Store');
          extensions.download(id).then(
            (extension) => {
              if (pending) return extensions.discard(extension);
              pending = { what: 'extension', extension };
              panel = 'prompt';
              layout();
            },
            (err) => {
              console.error(`[longboard] extension could not be fetched: ${String(err).slice(0, 200)}`);
              notify('That extension could not be fetched from the store');
            },
          );
        });
        break;
      }
      case 'importProfiles': {
        panel = null;
        layout();
        const taken = deps.profiles.importFrom([join(dataDir, 'import'), ...removableFolders()]);
        notify(taken.length ? `Imported: ${taken.join(', ')}. You will be asked before each is used.` : 'No profile files (*.longboard-profile.json) were found');
        break;
      }
      case 'editProfile':
        if (surface === 'page') startEdit();
        break;
      case 'addApp':
        if (surface === 'page' && !isNotice(page.getURL()) && !appFor(apps, page.getURL())) panel = 'addApp';
        layout();
        break;
      case 'removeApp': {
        panel = null;
        const item = surface === 'page' ? appFor(apps, page.getURL()) : null;
        if (item) removeAppById(item.id);
        layout();
        break;
      }
      case 'adBlocking': {
        // The switch is the person's: this is the only place it is ever changed.
        const key = surface === 'page' ? pageSite() : null;
        if (!key || deps.adBlock.mode() === 'off') break;
        sites[key] = { ...sites[key], adBlocking: !blockingAt(page.getURL()) };
        saveSites();
        // The page is loaded again so what it shows matches the switch.
        page.reload();
        layout();
        break;
      }
      case 'desktop': {
        const key = surface === 'page' ? pageSite() : null;
        if (!key) break;
        const site = { ...sites[key] };
        if (site.desktop) delete site.desktop;
        else site.desktop = true;
        if (Object.keys(site).length) sites[key] = site;
        else delete sites[key];
        saveSites();
        applyZoom();
        layout();
        break;
      }
      case 'reader':
        panel = null;
        layout();
        if (surface === 'page' && !isNotice(page.getURL())) page.send('longboard:action', 'reader');
        break;
      case 'forgetAnswers': {
        panel = null;
        const key = surface === 'page' ? pageSite() : null;
        if (key && sites[key]?.answers) {
          const { answers: _gone, ...rest } = sites[key];
          if (Object.keys(rest).length) sites[key] = rest;
          else delete sites[key];
          saveSites();
          layout();
          notify('Forgotten. This site will ask again; load the page again for it to take effect');
        } else layout();
        break;
      }
      case 'downloads':
        panel = 'downloads';
        layout();
        break;
      case 'about':
        panel = 'about';
        layout();
        break;
      case 'settings':
        withPin('Enter the PIN to open Settings', () => {
          panel = 'settings';
          pickAt = null;
          capturing = null;
          layout();
        });
        break;
      case 'lock':
        // "Lock again", or "Unlock every site" with the PIN.
        if (!lock?.homeOnly) break;
        if (unlocked) {
          unlocked = false;
          lockViews();
          panel = null;
          layout();
          notify('Locked: only the sites on Home open now');
        } else {
          withPin('Enter the PIN to unlock every site', () => {
            unlocked = true;
            layout();
            notify(`Unlocked until you lock again or ${PRODUCT.name} closes`);
          });
        }
        break;
      case 'history':
        panel = 'history';
        layout();
        break;
      case 'tabs':
        panel = 'tabs';
        layout();
        break;
      case 'find':
        if (surface === 'page') panel = 'find';
        layout();
        break;
      case 'phone':
        // `--phone-at=` is for a scripted run on a machine with no network: this machine's own address.
        void phone.start(deps.phoneAt, deps.phoneKey).then((ok) => {
          if (win.isDestroyed()) return;
          if (!ok) {
            notify('Typing from a phone needs this machine to be on your home network');
            return;
          }
          panel = 'phone';
          layout();
        });
        break;
      case 'phoneOff':
        phone.stop();
        panel = null;
        layout();
        notify('Typing from a phone is off');
        break;
      case 'savePassword': {
        const held = surface === 'page' ? typedNow(page) : null;
        if (!held || !loginsOn()) break;
        pending = { what: 'password', ...held };
        panel = 'prompt';
        layout();
        break;
      }
      case 'savePage':
      case 'unsavePage': {
        const url = surface === 'page' ? page.getURL() : '';
        if (isNotice(url)) break;
        saved = action === 'savePage' ? addSaved(saved, url, page.getTitle()) : removeSaved(saved, url);
        saveRecents();
        // Its site's own icon is fetched for the tile.
        if (action === 'savePage') refreshIcons(page);
        layout();
        notify(action === 'savePage' ? 'This page is kept on Home' : 'This page is no longer on Home');
        break;
      }
      case 'quit':
        app.quit();
        break;
    }
  };
  /** Clears what every site has stored (cookies and the rest) and the saved copies of pages, in every session. */
  const clearSiteData = async (): Promise<void> => {
    // By name, not through the views: this also runs as the program closes, when the views are gone.
    const all = [session.defaultSession, ...apps.filter((a) => a.ownSession).map((a) => session.fromPartition(appPartition(a)))];
    await Promise.all(all.flatMap((s) => [s.clearStorageData().catch(() => undefined), s.clearCache().catch(() => undefined)]));
  };
  /** The buttons on the Settings screen that do something once, as against changing a setting. */
  const settingsAction = (action: SettingsAction): void => {
    const webSessions = (): Electron.Session[] => [(views.get(lastTab) ?? pageView).webContents.session, ...apps.filter((a) => a.ownSession).map((a) => session.fromPartition(appPartition(a)))];
    switch (action) {
      case 'clearSiteData':
        // Cookies and everything sites have stored: signs out of every site, apps with their own sign-ins included.
        void Promise.all(webSessions().map((s) => s.clearStorageData().catch(() => undefined))).then(() => {
          if (surface === 'page' && !page.isDestroyed()) page.reload();
          notify('Cleared. You are signed out of every site');
        });
        break;
      case 'clearCache':
        void Promise.all(webSessions().map((s) => s.clearCache().catch(() => undefined))).then(() => notify('Cleared the saved copies of pages and pictures'));
        break;
      case 'clearAll':
        // Everything Longboard and sites have kept about what was opened. Saved pages, apps and settings stay.
        visits = [];
        saveHistory();
        recents = [];
        saveRecents();
        void clearSiteData().then(() => {
          if (surface === 'page' && !page.isDestroyed()) page.reload();
          layout();
          notify('Cleared: history, recent sites, and what sites had stored');
        });
        break;
      case 'clearHistory':
        visits = [];
        saveHistory();
        layout();
        notify('Cleared the history');
        break;
      case 'clearHome':
        recents = [];
        saveRecents();
        layout();
        notify('Cleared the recently opened sites');
        break;
      case 'forgetSites':
        for (const key of Object.keys(sites)) delete sites[key];
        saveSites();
        applyZoom();
        layout();
        notify("Forgotten: every site's answers, size and ad-blocking switch");
        break;
      case 'updateFilters':
        notify('Downloading the filter list');
        void deps.adBlock.refresh().then((ok) => {
          if (panel === 'settings') layout();
          notify(ok ? 'The filter list is up to date' : 'The filter list could not be downloaded');
        });
        break;
      case 'updateCatalogue':
        notify('Looking for reviewed profiles');
        void deps.settings.refreshCatalogue().then((ok) => {
          if (panel === 'settings') layout();
          notify(ok ? 'Reviewed profiles are up to date' : 'Reviewed profiles could not be downloaded');
        });
        break;
      case 'checkUpdate':
        notify('Looking for a new version');
        void deps.settings.lookForUpdate().then(() => {
          if (panel === 'settings') layout();
          notify(deps.settings.update().words);
        });
        break;
      case 'reset':
        deps.settings.reset();
        applyZoom();
        applyPrivacy();
        layout();
        notify('Settings are back to the usual');
        break;
    }
  };
  /** The places the person already knows, most their own first: for the suggestions under an address field. */
  const knownPlaces = (): Known[] => [...saved, ...apps.map((a) => ({ url: a.url, title: a.name })), ...recents.map((r) => ({ url: r.url, title: r.title })), ...visits.map((v) => ({ url: v.url, title: v.title }))];
  /** The words last looked for on the page, so that pressing again goes to the next place. */
  let lastFound = '';
  eachPage((wc) => wc.on('found-in-page', (_e, result) => {
    if (wc !== page || panel !== 'find' || !result.finalUpdate) return;
    notify(result.matches > 0 ? `${result.activeMatchOrdinal} of ${result.matches}` : 'Not found on this page');
  }));
  /** True while a change to Home that the PIN was just given for is being made. */
  let pinGiven = false;
  const onChrome = (event: Electron.IpcMainEvent, msg: ChromeMessage): void => {
    // Only Longboard's own screen, and only its top frame.
    if (event.sender !== chrome || event.senderFrame !== chrome.mainFrame) return;
    if (!msg || typeof msg !== 'object') return;
    // Taking a tile off Home is a change to Home; from Settings the PIN has been given already.
    if ((msg.kind === 'removeRecent' || msg.kind === 'removeSaved' || (msg.kind === 'removeApp' && panel !== 'settings')) && lock?.homeOnly && !unlocked && !pinGiven) {
      withPin('Enter the PIN to change what is on Home', () => {
        pinGiven = true;
        try {
          onChrome(event, msg);
        } finally {
          pinGiven = false;
        }
      });
      return;
    }
    switch (msg.kind) {
      case 'pin': {
        if (panel !== 'pin' || !pinFor || !isPin(msg.digits)) break;
        if ('set' in pinFor) {
          if (pinFor.first === null) {
            pinFor = { set: true, first: msg.digits };
            layout();
          } else if (pinFor.first !== msg.digits) {
            pinFor = { set: true, first: null };
            layout();
            notify('Those two were not the same. Choose again');
          } else {
            lock = makeLock(msg.digits, lock?.homeOnly ?? false);
            saveLock();
            panel = 'settings';
            layout();
            notify('The PIN is set');
          }
          break;
        }
        if (Date.now() < pinNotBefore) {
          layout();
          notify(`Wait ${Math.ceil((pinNotBefore - Date.now()) / 1000)} seconds before trying again`);
          break;
        }
        if (!lock || !checkPin(lock, msg.digits)) {
          pinFailures += 1;
          pinNotBefore = Date.now() + waitAfter(pinFailures);
          layout();
          notify(pinNotBefore > Date.now() ? `Wrong PIN. Wait ${Math.ceil(waitAfter(pinFailures) / 1000)} seconds before trying again` : 'Wrong PIN');
          break;
        }
        pinFailures = 0;
        const then = pinFor.then;
        panel = null;
        pinFor = null;
        then();
        break;
      }
      case 'extension': {
        // From the Settings screen: open an extension's own page, or remove it.
        const item = panel === 'settings' && typeof msg.id === 'string' ? extensions.list().find((e) => e.id === msg.id) : undefined;
        if (!item) break;
        if (msg.op === 'remove') {
          void extensions.remove(item.id).then(() => {
            layout();
            notify(`"${item.name}" is removed`);
          });
        } else if (msg.op === 'open' && (item.options ?? item.popup)) openInSharedTab(`chrome-extension://${item.id}/${item.options ?? item.popup}`);
        break;
      }
      case 'lock':
        // The lock's own settings, on the Settings screen: the PIN was given to get there.
        if (panel !== 'settings') break;
        if (msg.op === 'set') {
          pinFor = { set: true, first: null };
          panel = 'pin';
        } else if (msg.op === 'remove') {
          lock = null;
          unlocked = false;
          saveLock();
        } else if (msg.op === 'homeOnly' && lock) {
          lock = { ...lock, homeOnly: !lock.homeOnly };
          unlocked = false;
          saveLock();
          lockViews();
        }
        layout();
        break;
      case 'open': {
        const url = typeof msg.input === 'string' ? resolveAddress(msg.input, config.search) : null;
        // A search is not a site the person asked for by name; it is not put on Home.
        if (url) open(url, resolveAddress(msg.input, 'https://search.invalid/?q=%s') === url);
        break;
      }
      case 'openRecent':
        if (typeof msg.url === 'string' && recents.some((r) => r.url === msg.url)) open(msg.url, true);
        break;
      case 'openApp':
        if (typeof msg.id === 'string') openApp(msg.id);
        break;
      case 'icon':
        // A picture Longboard's own screen drew from a site's icon.
        if (typeof msg.id === 'number') drawing.get(msg.id)?.(pngFromDataUrl(msg.png));
        break;
      case 'tab':
        if (panel === 'tabs') tabAction(msg.op, msg.id);
        break;
      case 'openSaved':
        if (typeof msg.url === 'string' && saved.some((p) => p.url === msg.url)) open(msg.url, false);
        break;
      case 'removeSaved':
        if (surface === 'home' && typeof msg.url === 'string' && saved.some((p) => p.url === msg.url)) {
          saved = removeSaved(saved, msg.url);
          saveRecents();
          panel = null;
          layout();
          notify('That page is no longer on Home');
        }
        break;
      case 'suggest':
        // Looked for in what is kept here, and nowhere else.
        if (typeof msg.text === 'string') {
          const text = msg.text.slice(0, 200);
          const local = suggest(text, knownPlaces());
          chrome.send('longboard:suggestions', { text, list: local });
          void searchSuggestions(text).then((words) => {
            if (!words.length || chrome.isDestroyed()) return;
            const template = config.search ?? DEFAULT_SEARCH;
            const more = words.map((w) => ({ url: searchUrl(w, template), text: w, search: true }));
            offeredSearches = new Set(more.map((m) => m.url));
            // Fewer of the places already known, so the list stays short enough to walk with a remote.
            chrome.send('longboard:suggestions', { text, list: [...local.slice(0, 3), ...more] });
          });
        }
        break;
      case 'openSuggestion':
        if (typeof msg.url === 'string' && (knownPlaces().some((k) => k.url === msg.url) || offeredSearches.has(msg.url))) open(msg.url, true);
        break;
      case 'find':
        if (panel === 'find' && surface === 'page' && typeof msg.text === 'string' && msg.text.trim()) {
          const text = msg.text.trim().slice(0, 200);
          page.findInPage(text, { forward: msg.forward !== false, findNext: text === lastFound });
          lastFound = text;
        }
        break;
      case 'openVisit':
        if (panel === 'history' && typeof msg.url === 'string' && visits.some((v) => v.url === msg.url)) open(msg.url, true);
        break;
      case 'forgetVisit':
        if (panel === 'history' && typeof msg.url === 'string' && visits.some((v) => v.url === msg.url)) {
          visits = visits.filter((v) => v.url !== msg.url);
          writeJson(historyFile, { visits });
          layout();
        }
        break;
      case 'folder':
        if (panel !== 'settings') break;
        if (msg.path === null) pickAt = null;
        else if (isFolder(msg.path)) pickAt = msg.path;
        // The chooser opens on the folder in use; when that is not there yet, on the home folder.
        else if (pickAt === null) pickAt = app.getPath('home');
        else notify('That folder cannot be opened');
        layout();
        break;
      case 'captureButton':
        if (panel !== 'settings') break;
        capturing = typeof msg.action === 'string' && BUTTON_ACTIONS.some((a) => a.action === msg.action) ? msg.action : null;
        layout();
        break;
      case 'clearButtons':
        if (panel !== 'settings' || typeof msg.action !== 'string') break;
        if (deps.settings.set('keys', unmapButtons(config.keys, msg.action))) sendKeys();
        layout();
        break;
      case 'setting':
        if (panel !== 'settings' || typeof msg.name !== 'string') break;
        // Button mappings are set by pressing the button, not by a message naming it.
        if (msg.name === 'keys') break;
        if (msg.name === 'downloads' && msg.value !== null) {
          // A folder that is there and can be written to, or nothing changes.
          let usable = isFolder(msg.value);
          try {
            if (usable) accessSync(msg.value as string, fsConstants.W_OK);
          } catch {
            usable = false;
          }
          if (!usable) {
            notify('Files cannot be saved in that folder');
            break;
          }
          pickAt = null;
        }
        if (!deps.settings.set(msg.name, msg.value)) {
          notify('That setting could not be changed');
          break;
        }
        if (msg.name === 'pageSize') applyZoom();
        applyPrivacy();
        layout();
        break;
      case 'startsOff': {
        const domain = cleanDomain(msg.domain);
        if (panel !== 'settings' || (msg.op !== 'add' && msg.op !== 'toggle')) break;
        if (!domain) {
          notify('That is not a site name. Try something like example.com');
          break;
        }
        const next = editStartsOff(deps.adBlock.reviewed(), config.adBlockingStartsOff ?? [], config.adBlockingStartsOn ?? [], msg.op, domain);
        deps.settings.set('adBlockingStartsOff', next.added.length ? next.added : null);
        deps.settings.set('adBlockingStartsOn', next.removed.length ? next.removed : null);
        layout();
        break;
      }
      case 'settingsAction':
        if (panel === 'settings' && SETTINGS_ACTIONS.includes(msg.action)) settingsAction(msg.action);
        break;
      case 'cancelDownload': {
        const d = downloads.find((x) => x.id === msg.id);
        if (panel === 'downloads' && d?.state === 'going') d.item.cancel();
        break;
      }
      case 'removeRecent':
        if (surface === 'home' && typeof msg.url === 'string' && recents.some((r) => r.url === msg.url)) {
          const name = siteName(msg.url);
          recents = removeRecent(recents, msg.url);
          saveRecents();
          panel = null;
          layout();
          notify(`Removed ${name} from Home`);
        }
        break;
      case 'removeApp':
        if ((surface === 'home' || panel === 'settings') && typeof msg.id === 'string' && apps.some((a) => a.id === msg.id)) {
          // From Settings the screen stays open; from a Home tile the menu closes.
          if (panel !== 'settings') panel = null;
          removeAppById(msg.id);
          layout();
        }
        break;
      case 'edit':
        if (EDIT_ACTIONS.includes(msg.action)) editAction(msg.action);
        break;
      case 'addApp':
        if (panel === 'addApp' && surface === 'page') {
          void addCurrentAsApp({ name: typeof msg.name === 'string' ? msg.name : '', ownSession: msg.ownSession === true, launcher: msg.launcher === true });
        }
        break;
      case 'menu':
        if (MENU_ACTIONS.includes(msg.action)) menu(msg.action);
        break;
      case 'fillLogin': {
        const at = surface === 'page' ? page.getURL() : '';
        const user = msg.user;
        const to = page;
        if (!loginsOn() || typeof user !== 'string' || loginForms.get(to) !== at) break;
        panel = null;
        layout();
        void passwords.reveal(loginPlace(at), user).then((password) => {
          // Only into the page it was asked for, if that page is still the one there.
          if (password === null || to.isDestroyed() || to.getURL() !== at) return;
          to.send('longboard:fill', { user, password });
          notify("Filled in. Press the site's own button to sign in");
        });
        break;
      }
      case 'password':
        if (panel !== 'settings') break;
        if (msg.op === 'removeAll') passwords.removeAll();
        else if (msg.op === 'remove' && typeof msg.place === 'string' && typeof msg.user === 'string') passwords.remove(msg.place, msg.user);
        else if (msg.op === 'offerAgain' && typeof msg.place === 'string') passwords.setNever(passwords.never().find((n) => n.replace(/^https?:\/\//, '') === msg.place) ?? msg.place, false);
        layout();
        break;
      case 'answer':
        // "Never for this site", said to keeping a password.
        if (msg.allow !== true && msg.never === true && pending?.what === 'password') passwords.setNever(pending.place, true);
        // A yes in the first moments of a question is not counted: a page can
        // time its request for when OK is about to be pressed for something else.
        if (msg.allow === true && Date.now() - promptShownAt < PROMPT_SETTLE_MS) break;
        // Back on the question is "not now": asked again another time.
        answerPrompt(msg.allow === true, msg.remember !== false);
        break;
      default:
        break;
    }
  };
  ipcMain.on('longboard:chrome', onChrome);

  win.on('closed', () => {
    clearInterval(downloadsTick);
    phone.stop();
    // A half-fetched file is of no use to anyone.
    for (const d of downloads) if (d.state === 'going') d.item.cancel();
    rmSync(waitingDir, { recursive: true, force: true });
    clearInterval(pointer.timer);
    clearTimeout(retryTimer);
    clearTimeout(awayTimer);
    ipcMain.off('longboard:boot', onBoot);
    ipcMain.off('longboard:msg', onMessage);
    ipcMain.off('longboard:chrome', onChrome);
    ipcMain.off('longboard:frame', onFrame);
  });

  // ---- Start -----------------------------------------------------------------

  void chrome.loadFile(join(__dirname, 'chrome.html'));
  const startApp = deps.startApp ? apps.find((a) => a.id === deps.startApp) : undefined;
  if (deps.startApp && !startApp) console.error(`[longboard] there is no app called "${deps.startApp.slice(0, 80)}"`);
  if (startApp) {
    void deps.ready.then(() => {
      if (!win.isDestroyed()) openApp(startApp.id);
    });
    layout();
  } else if (deps.startUrl) {
    // The window is up at once with a notice; the site loads when the playback
    // component is ready, so protected playback works on the first page.
    const url = deps.startUrl;
    showPage();
    void page.loadURL(startingPageUrl());
    void deps.ready.then(() => {
      if (!page.isDestroyed()) open(url, false);
    });
  } else if (config.startWith === 'last' && recents[0]) {
    // "Open with the last site": the one opened most recently, when nothing else was asked for.
    const url = recents[0].url;
    showPage();
    void page.loadURL(startingPageUrl());
    void deps.ready.then(() => {
      if (!page.isDestroyed()) open(url, true);
    });
  } else {
    layout();
  }
  return {
    win,
    openApp,
    openAddress: (url: string) => open(url, true),
    clearSiteData,
  };
}

/** What the rest of the shell can ask of the window once it is up. */
export interface Browser {
  win: BaseWindow;
  /** Opens an app by its id; false when there is none. */
  openApp: (id: string) => boolean;
  openAddress: (url: string) => void;
  /** Clears what every site has stored, for "clear when Longboard closes". */
  clearSiteData: () => Promise<void>;
}
