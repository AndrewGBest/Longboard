// The window and its two views: the page view shows websites, the chrome view
// shows Longboard's own screens (Home, the menu panel, questions). They are
// separate renderers with separate sessions; a website can never reach the
// chrome view or the shell (Hard rule 13).
import { app, BaseWindow, ipcMain, nativeImage, powerSaveBlocker, session, WebContentsView, type WebContents } from 'electron';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { BootData, BridgeMessage, Direction, LayerOptions } from '../shared/actions';
import { resolveAddress, siteKey, siteName } from '../shared/address';
import { EDIT_ACTIONS, MENU_ACTIONS, type ChromeMessage, type ChromeState, type EditAction, type MenuAction, type Panel } from '../shared/chrome';
import { EDIT_MARKS, hasMark, marksOf, parsePicked, startDraft, toggleMark, type PickedStep } from '../shared/editor';
import type { UserConfig } from '../shared/config';
import { addRecent, parseRecents, removeRecent, titleRecent, type RecentSite } from '../shared/home';
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
import { sizeText, uniqueName } from '../shared/downloads';
import { PointerHolds, pointerGlide, pointerTap, startPoint, type PointerStep } from './pointer';
import { sourceLabel, type ProfileStore } from './profiles';
import { readJson, writeJson } from './store';
import { launchCommand, launcherFolder, removableFolders, removeLauncher, writeLauncher } from '../platform';
import { addApp, appFor, appPartition, launcherEntry, launcherFileName, parseApps, removeApp, type WebApp } from '../shared/apps';
import { canvasOf, type Profile, type ProfileSource } from '../shared/profile';
import { hoverPoint, pageBounds, tvZoom } from './zoom';

export interface BrowserDeps {
  options: { dev: boolean; automation: boolean };
  config: UserConfig;
  /** An address given on the command line; Home is shown when there is none. */
  startUrl: string | null;
  /** An app named on the command line with --app=, to open instead. */
  startApp: string | null;
  fullscreen: boolean;
  /** The --size=WIDTHxHEIGHT option: the window's size when it is not full screen. */
  size: [number, number] | undefined;
  /** Where downloaded files are saved. */
  downloads: string;
  /** The --zoom= option, which wins over everything. */
  zoomOverride: string | undefined;
  /** Resolves when the protected-playback component is ready (or has been given up on). */
  ready: Promise<void>;
  /** The profiles on this machine. */
  profiles: ProfileStore;
}

/** Share of the window's width the menu panel takes over a website. */
const PANEL_WIDTH = 0.38;
const isNotice = (url: string): boolean => url.startsWith('data:') || url === 'about:blank' || url === '';

export function createBrowser(deps: BrowserDeps): Browser {
  const { options, config } = deps;
  const dataDir = app.getPath('userData');
  const homeFile = join(dataDir, 'home.json');
  const sitesFile = join(dataDir, 'sites.json');
  const complain = (file: string) => (why: string) => console.error(`[longboard] ${file} could not be read: ${why}`);
  let recents: RecentSite[] = parseRecents(readJson(homeFile, complain('home.json')));
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
    title: 'Longboard',
  });
  win.removeMenu();

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
  const makeView = (partition: string): WebContentsView => {
    const view = new WebContentsView({
      webPreferences: {
        ...hardened,
        preload: join(__dirname, 'preload.js'),
        // The preload also runs in embedded frames, where in a scripted run it
        // puts up the purchase guard and nothing else. Despite its name this
        // gives pages nothing: the view stays sandboxed and isolated.
        nodeIntegrationInSubFrames: true,
        additionalArguments: options.automation ? ['--longboard-automation'] : [],
        ...(partition ? { partition } : {}),
      },
    });
    view.setBackgroundColor('#000000');
    view.setVisible(false);
    win.contentView.addChildView(view);
    // Longboard's own screens stay in front of every website view.
    win.contentView.addChildView(chromeView);
    views.set(partition, view);
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
    | { what: 'download'; url: string; name: string; site: string; bytes: number; from: WebContents }
    | null = null;
  /** Downloads the person agreed to that have not finished. */
  const downloading = new Set<Electron.DownloadItem>();

  /** The profile editor, while it is in use: the draft, and what was last pointed at. */
  let edit: { site: string; draft: Profile; chain: PickedStep[]; level: number; saving: boolean } | null = null;

  /** The profile that applies to an address now, without asking about one that still needs an answer. */
  const profileFor = (url: string): { profile: Profile; source: ProfileSource } | null => {
    const choice = deps.profiles.choose(url);
    return choice.kind === 'use' ? choice : choice.kind === 'ask' ? choice.fallback : null;
  };

  const pageSite = (): string | null => siteKey(page.getURL());
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
    return tvZoom({ width, height }, deps.zoomOverride ?? (config.zoom === undefined ? undefined : String(config.zoom)), canvas ?? undefined);
  };
  const siteZoom = (): number => {
    const key = pageSite();
    return (key ? sites[key]?.zoom : undefined) ?? 1;
  };

  const chromeState = (): ChromeState => ({
    surface,
    panel,
    version: app.getVersion(),
    home: {
      apps: apps.map((a) => ({ id: a.id, name: a.name, site: siteName(a.url), icon: iconOf(a.id), ownSession: a.ownSession })),
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
          zoomPercent: Math.round(siteZoom() * 100),
          pointer: pointerOn,
          profile: ((p) => (p ? `${p.profile.name} (${sourceLabel(p.source)})` : null))(profileFor(page.getURL())),
          answers: ((given) => {
            const said = (which: 'granted' | 'denied'): string => (Object.keys(given) as Askable[]).filter((n) => given[n] === which).map((n) => ASKABLE[n]).join(', ');
            const parts = [said('granted') && `Allowed to: ${said('granted')}`, said('denied') && `Not allowed to: ${said('denied')}`].filter(Boolean);
            return parts.length ? parts.join('. ') : null;
          })(sites[pageSite() ?? '']?.answers ?? {}),
          app: ((a) => (a ? { id: a.id, name: a.name } : null))(appFor(apps, page.getURL())),
          canAddToAppList: launcherFolder() !== null,
        }
      : null,
    downloads: downloading.size,
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
    prompt: !pending
      ? null
      : pending.what === 'profile'
        ? { what: 'profile', name: pending.profile.name, version: pending.profile.version, hosts: pending.profile.match.hosts.slice(0, 6) }
        : pending.what === 'download'
          ? { what: 'download', site: pending.site, name: pending.name, size: sizeText(pending.bytes), folder: deps.downloads }
          : { what: 'permission', site: pending.site, wants: describeAsk(pending.names) },
  });

  const active = (): WebContents => (surface === 'home' || panel ? chrome : page);

  /** Sizes and shows the views for the current state, and gives the keys to the one in front. */
  const layout = (): void => {
    if (win.isDestroyed()) return;
    const [width = 0, height = 0] = win.getContentSize();
    for (const view of views.values()) {
      view.setBounds(view === pageView ? pageArea() : { x: 0, y: 0, width, height });
      if (view !== pageView) view.setVisible(false);
    }
    if (surface === 'home') chromeView.setBounds({ x: 0, y: 0, width, height });
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
    writeJson(homeFile, { recents });
    // A site that is no longer on Home does not keep its icon here.
    const kept = new Set(recents.map((r) => `${siteIconId(r.url)}.png`));
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
    page.setAudioMuted(false);
    layout();
  };

  const showHome = (): void => {
    if (edit) endEdit(false);
    if (surface === 'page') {
      // The site stays loaded, silent, with what was playing paused by the site's own key.
      setPointer(false);
      page.send('longboard:away');
      page.setAudioMuted(true);
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
  const usePartition = (next: string): void => {
    if (next === partition) return;
    setPointer(false);
    clearTimeout(retryTimer);
    if (pending?.what === 'permission') answerPrompt(false, false);
    if (!page.isDestroyed()) {
      page.send('longboard:away');
      page.setAudioMuted(true);
    }
    pageView.setVisible(false);
    const leaving = partition;
    const left = pageView;
    pageView = views.get(next) ?? makeView(next);
    page = pageView.webContents;
    partition = next;
    if (leaving !== '') {
      views.delete(leaving);
      win.contentView.removeChildView(left);
      left.webContents.close();
    }
    retryAttempt = 0;
    titleFor = null;
    lastNoticeAt = 0;
    pageShown = pageLoaded();
  };

  /** Opens an address the person asked for. `remember` puts it on Home. `inSession` is an app's own session, or "" for the shared one. */
  const open = (url: string, remember: boolean, inSession = ''): void => {
    const reason = blockReason(url, options);
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
    if (remember) {
      recents = addRecent(recents, url, Date.now());
      titleFor = url;
      saveRecents();
    }
    clearTimeout(retryTimer);
    setPointer(false);
    showPage();
    void page.loadURL(url).catch(() => undefined);
  };

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
    if (blockReason(url, options)) return;
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
    const reason = blockReason(url, options);
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
  // Frames inside a page are the site's own business (Hard rule 4); only
  // where the view itself goes is checked.
  eachPage((wc) => wc.on('will-redirect', (e, url, _isInPlace, isMainFrame) => {
    if (!isMainFrame) return;
    if (wc !== page || !allowed(url)) e.preventDefault();
  }));
  // No pop-up windows: a link that asks for one opens in the same view.
  eachPage((wc) => wc.setWindowOpenHandler(({ url }) => {
    if (wc === page && allowed(url)) void page.loadURL(url).catch(() => undefined);
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
      if (!page.isDestroyed() && page.debugger.isAttached()) page.debugger.detach();
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
      const params =
        what.type === 'move'
          ? { type: 'mouseMoved', x, y }
          : what.type === 'wheel'
            ? { type: 'mouseWheel', x, y, deltaX: what.dx, deltaY: what.dy }
            : { type: what.type === 'down' ? 'mousePressed' : 'mouseReleased', x, y, button: 'left', clickCount: 1 };
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

  // ---- Keys the shell answers itself ---------------------------------------

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
    });
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
    awayAt = Date.now();
    clearTimeout(awayTimer);
    awayTimer = setTimeout(() => {
      if (!win.isDestroyed() && win.isFullScreen() && !win.isFocused() && !win.isMinimized()) win.minimize();
    }, 700);
  };
  const returned = (): void => {
    clearTimeout(awayTimer);
    awayAt = 0;
    if (!page.isDestroyed() && surface === 'page') page.setAudioMuted(false);
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
    const decision = permissionDecision(permission, key ? sites[key] : undefined, mediaTypes);
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
    return hasPermission(permission, key ? sites[key] : undefined, mediaType);
  }));
  const answerPrompt = (allow: boolean, remember: boolean): void => {
    const asked = pending;
    if (!asked) return;
    pending = null;
    panel = null;
    if (asked.what === 'profile') {
      deps.profiles.answer(asked.profile, allow, remember);
      layout();
      // The page starts again so the profile applies from its first moment.
      if (allow && surface === 'page') page.reload();
      return;
    }
    if (asked.what === 'download') {
      layout();
      if (allow && !asked.from.isDestroyed()) {
        // Asked for again, this time to be kept (see the download handling below).
        agreed.add(asked.url);
        asked.from.downloadURL(asked.url);
      }
      return;
    }
    if (remember) {
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

  // ---- Downloads -----------------------------------------------------------

  // A file a site sends, or that the person chose to download, is asked about
  // first: what it is called, how big, where from. Agreed to, it is saved in
  // the downloads folder under a name that writes over nothing. Longboard
  // never opens or runs what it downloads.
  //
  // A download cannot be held while the question is up (a small file is on
  // disk before it could be answered), so the first attempt is stopped and,
  // if the person agrees, the same address is asked for again and kept.
  const agreed = new Set<string>();
  eachSession((web) => web.on('will-download', (event, item, wc) => {
    const url = item.getURL();
    if (!agreed.delete(url)) {
      event.preventDefault();
      if (pending || surface !== 'page' || wc !== page) {
        notify(pending ? 'A download was not started: another question was waiting' : 'A download was not started');
        return;
      }
      const taken = (n: string): boolean => existsSync(join(deps.downloads, n));
      pending = { what: 'download', url, name: uniqueName(item.getFilename(), taken), site: siteName(url) || 'this site', bytes: item.getTotalBytes(), from: wc };
      panel = 'prompt';
      layout();
      return;
    }
    let name = 'download';
    try {
      mkdirSync(deps.downloads, { recursive: true });
      name = uniqueName(item.getFilename(), (n) => existsSync(join(deps.downloads, n)));
    } catch (err) {
      console.error(`[longboard] the downloads folder cannot be used: ${String(err).slice(0, 160)}`);
      event.preventDefault();
      notify('The downloads folder cannot be used');
      return;
    }
    // Set now, so the browser never puts up a file chooser of its own.
    item.setSavePath(join(deps.downloads, name));
    downloading.add(item);
    notify(`Downloading ${name}`);
    item.once('done', (_e, state) => {
      downloading.delete(item);
      notify(state === 'completed' ? `Saved ${name} in ${deps.downloads}` : state === 'cancelled' ? `The download of ${name} was cancelled` : `The download of ${name} failed`);
      if (panel === 'menu') layout();
    });
  }));

  // ---- Messages from the layers ---------------------------------------------

  let blocker: number | undefined;
  let nudge = false;
  const viewSize = (wc: WebContents): [number, number] => {
    const b = (wc === page ? pageView : chromeView).getBounds();
    return [b.width, b.height];
  };

  const onBoot = (event: Electron.IpcMainEvent): void => {
    const wc = event.sender;
    const top = event.senderFrame === wc.mainFrame;
    // Any website view is answered, in front or not: a page that starts
    // behind another must still get its options (the automation guard above all).
    if ((!isPageView(wc) && wc !== chrome) || !top) {
      event.returnValue = null;
      return;
    }
    const layerOptions: LayerOptions = { ...options, surface: wc === chrome ? 'chrome' : 'page', keys: config.keys, buttons: config.buttons ?? {} };
    const boot: BootData & { state?: ChromeState } = { options: layerOptions, profile: null };
    if (wc === chrome) boot.state = chromeState();
    else {
      // Chosen by the shell from the frame's real address, never from anything the page says.
      const choice = deps.profiles.choose(event.senderFrame?.url ?? '');
      const use = choice.kind === 'use' ? choice : choice.kind === 'ask' ? choice.fallback : null;
      boot.profile = use?.profile ?? null;
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

  /** The icons the page in front says are its own, newest list last. */
  let favicons: string[] = [];
  eachPage((wc) => wc.on('page-favicon-updated', (_e, urls) => {
    if (wc !== page) return;
    favicons = urls.filter((u) => /^https?:/i.test(u)).slice(0, 8);
    // A site on Home gets its own icon on its tile, fetched once from the site while it is open.
    const key = pageSite();
    const id = siteIconId(page.getURL());
    if (!key || !favicons.length || iconOf(id) || !recents.some((r) => siteKey(r.url) === key)) return;
    void saveIcon(id, favicons, page.session).then((saved) => {
      // The site may have been taken off Home while its icon was on the way.
      if (saved && !recents.some((r) => siteKey(r.url) === key)) saveRecents();
      else if (saved && surface === 'home' && !win.isDestroyed()) layout();
    });
  }));
  eachPage((wc) => wc.on('did-navigate', () => {
    if (wc === page) favicons = [];
  }));
  /**
   * Saves a site's own icon for an app, fetched from the site by the session
   * the page is in. Hard rule 6: icons come from the site at run time and are
   * never in the repository. Nothing is saved when the site offers none that
   * can be read as a picture.
   */
  const saveIcon = async (id: string, candidates: readonly string[], from: Electron.Session): Promise<boolean> => {
    for (const url of candidates) {
      try {
        const response = await from.fetch(url, { cache: 'force-cache' });
        if (!response.ok) continue;
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length === 0 || bytes.length > 2_000_000) continue;
        let image = nativeImage.createFromBuffer(bytes);
        if (image.isEmpty()) continue;
        const { width, height } = image.getSize();
        if (Math.max(width, height) > 256) image = image.resize(width >= height ? { width: 256 } : { height: 256 });
        mkdirSync(iconsDir, { recursive: true });
        writeFileSync(join(iconsDir, `${id}.png`), image.toPNG());
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
    await saveIcon(item.id, favicons, page.session);
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
      if (partition === appPartition(item)) usePartition('');
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

  const menu = (action: MenuAction): void => {
    switch (action) {
      case 'close':
        panel = null;
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
      case 'cancelDownloads':
        panel = null;
        for (const item of [...downloading]) item.cancel();
        layout();
        break;
      case 'about':
        panel = 'about';
        layout();
        break;
      case 'quit':
        app.quit();
        break;
    }
  };
  const onChrome = (event: Electron.IpcMainEvent, msg: ChromeMessage): void => {
    // Only Longboard's own screen, and only its top frame.
    if (event.sender !== chrome || event.senderFrame !== chrome.mainFrame) return;
    if (!msg || typeof msg !== 'object') return;
    switch (msg.kind) {
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
        if (surface === 'home' && typeof msg.id === 'string' && apps.some((a) => a.id === msg.id)) {
          panel = null;
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
      case 'answer':
        // Back on the question is "not now": asked again another time.
        answerPrompt(msg.allow === true, msg.remember !== false);
        break;
      default:
        break;
    }
  };
  ipcMain.on('longboard:chrome', onChrome);

  win.on('closed', () => {
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
  } else {
    layout();
  }
  return {
    win,
    openApp,
    openAddress: (url: string) => open(url, true),
  };
}

/** What the rest of the shell can ask of the window once it is up. */
export interface Browser {
  win: BaseWindow;
  /** Opens an app by its id; false when there is none. */
  openApp: (id: string) => boolean;
  openAddress: (url: string) => void;
}
