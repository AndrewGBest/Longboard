// The window and its two views: the page view shows websites, the chrome view
// shows Longboard's own screens (Home, the menu panel, questions). They are
// separate renderers with separate sessions; a website can never reach the
// chrome view or the shell (Hard rule 13).
import { app, BrowserWindow, ipcMain, powerSaveBlocker, session, WebContentsView, type WebContents } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BootData, BridgeMessage, Direction, LayerOptions } from '../shared/actions';
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
import { PointerHolds, pointerGlide, pointerTap, startPoint, type PointerStep } from './pointer';
import { readJson, writeJson } from './store';
import { hoverPoint, tvZoom } from './zoom';

export interface BrowserDeps {
  options: { dev: boolean; automation: boolean };
  config: UserConfig;
  /** An address given on the command line; Home is shown when there is none. */
  startUrl: string | null;
  fullscreen: boolean;
  /** The --size=WIDTHxHEIGHT option: the window's size when it is not full screen. */
  size: [number, number] | undefined;
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
  const pageView = new WebContentsView({
    webPreferences: {
      ...hardened,
      preload: join(__dirname, 'preload.js'),
      // The preload also runs in embedded frames, where in a scripted run it
      // puts up the purchase guard and nothing else. Despite its name this
      // gives pages nothing: the view stays sandboxed and isolated.
      nodeIntegrationInSubFrames: true,
      additionalArguments: options.automation ? ['--longboard-automation'] : [],
    },
  });
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
  page.debugger.on('detach', () => {
    attached = false;
  });
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
  page.on('dom-ready', () => {
    if (pointerOn) showPointer();
  });
  // In pointer mode the shell takes the keys before the page sees them: the
  // pointer must work wherever in the page the keys would have gone.
  page.on('before-input-event', (event, input) => {
    if (!pointerOn || active() !== page) return;
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
      else if (action.type === 'select') pressPointer();
      else setPointer(false);
    });
  });

  // ---- Keys the shell answers itself ---------------------------------------

  const toggleMenu = (): void => {
    if (panel === 'prompt') return;
    stopGlide();
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
      } else if (action?.type === 'pointer') {
        event.preventDefault();
        // After this event, for the reason given in the pointer's own key handling.
        if (wc === page && active() === page) setImmediate(() => setPointer(!pointerOn));
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
      case 'pointer':
        if (wc !== page || active() !== page) break;
        if (msg.x === undefined) setPointer(!pointerOn);
        else setPointer(true, startPoint(msg, page.getZoomFactor(), pageSize()));
        break;
      case 'pointerOff':
        if (wc === page) setPointer(false);
        break;
      case 'pointerHeld':
        if (wc === page && pointerOn && active() === page && Array.isArray(msg.dirs)) {
          padPointer(msg.dirs.filter((d): d is Direction => d === 'up' || d === 'down' || d === 'left' || d === 'right'));
        }
        break;
      case 'pointerClick':
        if (wc === page && pointerOn && active() === page) pressPointer();
        break;
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
    if (event.sender !== page || !frame || frame === page.mainFrame || !options.automation) return;
    if (what === 'guarded') guarded.add(frameKey(frame));
    else if (what === 'blocked') page.send('longboard:notice', 'Blocked: automation mode never activates purchase or sign-up controls');
  };
  ipcMain.on('longboard:frame', onFrame);
  page.on('did-navigate', () => guarded.clear());
  page.on('did-frame-navigate', (_e, _url, _code, _status, isMainFrame, processId, routingId) => {
    // A frame that has gone somewhere new has to say again that it is guarded.
    if (!isMainFrame) guarded.delete(`${processId}:${routingId}`);
  });

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
