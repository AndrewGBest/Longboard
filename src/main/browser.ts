// The window and its two views: the page view shows websites, the chrome view
// shows Longboard's own screens (Home, the menu panel, questions). They are
// separate renderers with separate sessions; a website can never reach the
// chrome view or the shell (Hard rule 13).
import { app, BrowserWindow, ipcMain, powerSaveBlocker, session, WebContentsView, type WebContents } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BootData, BridgeMessage, LayerOptions } from '../shared/actions';
import { resolveAddress, siteKey, siteName } from '../shared/address';
import { MENU_ACTIONS, type ChromeMessage, type ChromeState, type MenuAction, type Panel } from '../shared/chrome';
import type { UserConfig } from '../shared/config';
import { addRecent, parseRecents, titleRecent, type RecentSite } from '../shared/home';
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
import { mayAskProtectedPlayback, permissionDecision } from './permissions';
import { readJson, writeJson } from './store';
import { hoverPoint, tvZoom } from './zoom';

export interface BrowserDeps {
  options: { dev: boolean; automation: boolean };
  config: UserConfig;
  /** An address given on the command line; Home is shown when there is none. */
  startUrl: string | null;
  fullscreen: boolean;
  /** The --zoom= option, which wins over everything. */
  zoomOverride: string | undefined;
  /** Resolves when the protected-playback component is ready (or has been given up on). */
  ready: Promise<void>;
  /** Site adapter data for an address, or null. */
  adapterFor: (url: string) => unknown;
}

/** Share of the window's width the menu panel takes over a website. */
const PANEL_WIDTH = 0.38;
const isNotice = (url: string): boolean => url.startsWith('data:') || url === 'about:blank' || url === '';

export function createBrowser(deps: BrowserDeps): BrowserWindow {
  const { options, config } = deps;
  const dataDir = app.getPath('userData');
  const homeFile = join(dataDir, 'home.json');
  const sitesFile = join(dataDir, 'sites.json');
  const complain = (file: string) => (why: string) => console.error(`[longboard] ${file} could not be read: ${why}`);
  let recents: RecentSite[] = parseRecents(readJson(homeFile, complain('home.json')));
  const sites: Record<string, SiteSettings> = parseSites(readJson(sitesFile, complain('sites.json')));

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    fullscreen: deps.fullscreen,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'Longboard',
  });
  win.removeMenu();

  const hardened = { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } as const;
  const pageView = new WebContentsView({ webPreferences: { ...hardened, preload: join(__dirname, 'preload.js') } });
  // Its own session, kept in memory only: nothing a website stores is visible to it.
  const chromeView = new WebContentsView({ webPreferences: { ...hardened, preload: join(__dirname, 'chrome.js'), partition: 'longboard-chrome' } });
  pageView.setBackgroundColor('#000000');
  chromeView.setBackgroundColor('#0d1014');
  win.contentView.addChildView(pageView);
  win.contentView.addChildView(chromeView);
  const page = pageView.webContents;
  const chrome = chromeView.webContents;

  // ---- What is on screen -------------------------------------------------

  let surface: 'home' | 'page' = 'home';
  let panel: Panel | null = null;
  let pointerOn = false;
  /** The protected-playback question waiting for an answer. */
  let pending: { site: string; answer: Array<(granted: boolean) => void> } | null = null;

  const pageSite = (): string | null => siteKey(page.getURL());
  const pageLoaded = (): boolean => page.navigationHistory.getAllEntries().some((e) => !isNotice(e.url));
  const autoZoom = (): number => {
    const [width = 0, height = 0] = win.getContentSize();
    return tvZoom({ width, height }, deps.zoomOverride ?? (config.zoom === undefined ? undefined : String(config.zoom)));
  };
  const siteZoom = (): number => {
    const key = pageSite();
    return (key ? sites[key]?.zoom : undefined) ?? 1;
  };

  const chromeState = (): ChromeState => ({
    surface,
    panel,
    version: app.getVersion(),
    home: { recents },
    page: pageLoaded()
      ? {
          site: siteName(page.getURL()) || 'this page',
          title: isNotice(page.getURL()) ? '' : page.getTitle().slice(0, 120),
          canGoBack: backIndex() >= 0,
          zoomPercent: Math.round(siteZoom() * 100),
          pointer: pointerOn,
          profile: null,
        }
      : null,
    prompt: pending ? { site: pending.site, what: 'protectedPlayback' } : null,
  });

  const active = (): WebContents => (surface === 'home' || panel ? chrome : page);

  /** Sizes and shows the views for the current state, and gives the keys to the one in front. */
  const layout = (): void => {
    if (win.isDestroyed()) return;
    const [width = 0, height = 0] = win.getContentSize();
    pageView.setBounds({ x: 0, y: 0, width, height });
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

  const saveRecents = (): void => writeJson(homeFile, { recents });
  const saveSites = (): void => writeJson(sitesFile, sites);

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

  /** Opens an address the person asked for. `remember` puts it on Home. */
  const open = (url: string, remember: boolean): void => {
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

  page.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    if (!isMainFrame || !isLoadFailure(code, url)) return;
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
  });
  page.on('did-navigate', (_e, url) => {
    if (!isNotice(url)) {
      retryAttempt = 0;
      pageShown = true;
    }
    applyZoom();
    if (panel) layout();
  });
  page.on('page-title-updated', (_e, title) => {
    if (!titleFor || isNotice(page.getURL())) return;
    recents = titleRecent(recents, titleFor, title);
    titleFor = null;
    saveRecents();
  });
  page.on('render-process-gone', (_e, details) => {
    console.error(`[longboard] page renderer exited: ${details.reason}`);
  });

  let lastNoticeAt = 0;
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
  page.on('will-navigate', (e, url) => {
    if (!allowed(url)) e.preventDefault();
  });
  // Frames inside a page are the site's own business (Hard rule 4); only
  // where the view itself goes is checked.
  page.on('will-redirect', (e, url, _isInPlace, isMainFrame) => {
    if (!isMainFrame) return;
    if (!allowed(url)) e.preventDefault();
  });
  // No pop-up windows: a link that asks for one opens in the same view.
  page.setWindowOpenHandler(({ url }) => {
    if (allowed(url)) void page.loadURL(url).catch(() => undefined);
    return { action: 'deny' };
  });

  const tvCss = readFileSync(join(__dirname, 'tv.css'), 'utf8');
  page.on('dom-ready', () => {
    void page.insertCSS(tvCss, { cssOrigin: 'user' });
  });

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

  // ---- Pointer mode (filled in by the pointer module) --------------------

  const setPointer = (on: boolean): void => {
    pointerOn = on;
  };

  // ---- Keys the shell answers itself ---------------------------------------

  const toggleMenu = (): void => {
    if (panel === 'prompt') return;
    panel = panel ? null : 'menu';
    layout();
  };

  // If the desktop never says the window has focus again, a key press in it
  // still proves someone is here. (Not the layer's own pause key, just sent.)
  let awayAt = 0;
  for (const wc of [page, chrome]) {
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
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
      }
    });
  }

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

  const web = session.defaultSession;
  web.setPermissionRequestHandler((wc, permission, callback, details) => {
    const url = details.requestingUrl || wc.getURL();
    const key = siteKey(url);
    const decision = permissionDecision(permission, key ? sites[key] : undefined);
    if (decision !== 'ask') {
      callback(decision === 'grant');
      return;
    }
    // Only the page view's own page is asked about, and one site at a time.
    if (wc !== page || !key || !mayAskProtectedPlayback(url) || (pending && pending.site !== key)) {
      callback(false);
      return;
    }
    if (pending) pending.answer.push(callback);
    else {
      pending = { site: key, answer: [callback] };
      panel = 'prompt';
      layout();
    }
  });
  web.setPermissionCheckHandler((_wc, permission, origin) => {
    const key = siteKey(origin);
    // "Ask" is not a refusal: the question is put when the site makes its request.
    return permissionDecision(permission, key ? sites[key] : undefined) !== 'deny';
  });
  const answerPrompt = (allow: boolean, remember: boolean): void => {
    const asked = pending;
    if (!asked) return;
    pending = null;
    if (remember) {
      sites[asked.site] = { ...sites[asked.site], protectedPlayback: allow ? 'granted' : 'denied' };
      saveSites();
    }
    for (const answer of asked.answer) answer(allow);
    panel = null;
    layout();
  };
  // A question belongs to the page that asked it.
  page.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace && pending) answerPrompt(false, false);
  });

  // No downloads in this version (ARCHITECTURE.md section 2).
  web.on('will-download', (event) => {
    event.preventDefault();
    notify('Downloads are not available in Longboard yet');
  });

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
    if ((wc !== page && wc !== chrome) || !top) {
      event.returnValue = null;
      return;
    }
    const layerOptions: LayerOptions = { ...options, surface: wc === chrome ? 'chrome' : 'page', keys: config.keys, buttons: config.buttons ?? {} };
    const boot: BootData & { state?: ChromeState } = { options: layerOptions, adapter: wc === page ? deps.adapterFor(event.senderFrame?.url ?? '') : null };
    if (wc === chrome) boot.state = chromeState();
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
      default:
        break;
    }
  };
  ipcMain.on('longboard:msg', onMessage);

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
      case 'menu':
        if (MENU_ACTIONS.includes(msg.action)) menu(msg.action);
        break;
      case 'answer':
        answerPrompt(msg.allow === true, true);
        break;
      default:
        break;
    }
  };
  ipcMain.on('longboard:chrome', onChrome);

  win.on('closed', () => {
    clearTimeout(retryTimer);
    clearTimeout(awayTimer);
    ipcMain.off('longboard:boot', onBoot);
    ipcMain.off('longboard:msg', onMessage);
    ipcMain.off('longboard:chrome', onChrome);
  });

  // ---- Start -----------------------------------------------------------------

  void chrome.loadFile(join(__dirname, 'chrome.html'));
  if (deps.startUrl) {
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
  return win;
}
