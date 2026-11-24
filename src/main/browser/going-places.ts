// Opening pages: Home, tabs, Back, and what happens when a page arrives,
// fails or tries to go somewhere (every address is checked by blockReason in
// main/navigation.ts, and there are no pop-up windows). Also here: the tip
// about the menu, adding to history and to Home's recent sites, tv.css going
// into each page, keeping the chrome view where it is, and the window's resize.
import { powerSaveBlocker, type WebContents } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { siteName } from '../../shared/address';
import { addRecent, titleRecent } from '../../shared/home';
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
} from '../navigation';
import { readJson, writeJson } from '../store';
import { MENU_TIP } from '../../shared/about';
import { addVisit, titleVisit } from '../../shared/history';
import type { Core } from './core';
import { isNotice } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface GoingPlacesPart {
  /** Loads a page that failed once more, after a wait. */
  retryTimer: NodeJS.Timeout | undefined;
  /** The menu has been opened on a website: the tip about how to open it is not shown again. */
  menuLearned: () => void;
  /** Puts the website view in front, awake and with its sound on. */
  showPage: () => void;
  /** Tabs: a new one (which starts on Home), bringing one in front, or closing one. */
  tabAction: (op: unknown, id: unknown) => void;
  /** Puts Home in front. The page stays loaded, silent and frozen. */
  showHome: () => void;
  /** The tab most recently in front: where an address opens when an app's own view is in front, or none is. */
  lastTab: string;
  /** The places of the open tabs, in the order they were opened. */
  tabPlaces: () => string[];
  /**
   * Makes the view for a place the page in front. A tab's view is kept
   * behind the one in front; an app's own view is closed when another
   * takes its place.
   */
  usePartition: (next: string) => void;
  /** Opens an address the person asked for. `remember` puts it on Home. `inSession` is the place it opens in: a tab, or an app's own session. */
  open: (asked: string, remember: boolean, inSession?: string) => void;
  /** Opens a page in a tab of the session everything shares: where extensions live. Not put on Home. */
  openInSharedTab: (url: string) => void;
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
  backIndex: () => number;
  /** Back: to where backIndex says, or to Home. */
  goBack: () => void;
}

export function createGoingPlaces(core: Core): Omit<GoingPlacesPart, 'retryTimer' | 'lastTab'> {
  core.retryTimer = undefined;
  let retryAttempt = 0;
  let lastNoticeAt = 0;
  /** True once a real page has been shown. Until then a refused navigation would leave the view blank. */
  let pageShown = false;
  /** The address the person asked for, until its page has given its title. */
  let titleFor: string | null = null;

  // How to get the menu on a website with a remote that has no key for it:
  // said on the first website of each run, until the menu has once been
  // opened on a website. A scripted run is told only when it asks to be.
  const tipsFile = join(core.dataDir, 'tips.json');
  let menuTip =
    (readJson(tipsFile) as { menu?: unknown } | undefined)?.menu !== true &&
    (!core.options.automation || process.env['LONGBOARD_TIPS'] === '1');
  let menuTipTimer: NodeJS.Timeout | undefined;
  const menuLearned = (): void => {
    clearTimeout(menuTipTimer);
    if ((readJson(tipsFile) as { menu?: unknown } | undefined)?.menu !== true) writeJson(tipsFile, { menu: true });
    menuTip = false;
  };
  const showPage = (): void => {
    core.surface = 'page';
    core.panel = null;
    core.thaw(core.page);
    core.page.setAudioMuted(false);
    core.layout();
    if (menuTip) {
      menuTip = false;
      const to = core.page;
      menuTipTimer = setTimeout(() => {
        if (core.surface === 'page' && !core.panel && core.page === to && !to.isDestroyed())
          to.send('longboard:notice', MENU_TIP);
      }, 2500);
    }
  };

  const tabAction = (op: unknown, id: unknown): void => {
    if (core.edit) core.endEdit(false);
    const again = op === 'reopen' ? core.closedTabs[core.closedTabs.length - 1] : undefined;
    if (op === 'reopen' && !again) return;
    if (op === 'new' || op === 'private' || op === 'reopen') {
      if (tabPlaces().length >= MAX_TABS) {
        core.notify(`${MAX_TABS} tabs are open. Close one first`);
        return;
      }
      if (core.surface === 'page') core.setPointer(false);
      usePartition(`${op === 'private' ? 'private' : 'tab'}:${++tabCount}`);
      core.surface = 'home';
      core.panel = null;
      core.layout();
      if (again) {
        core.closedTabs.pop();
        open(again, true);
      } else
        core.notify(
          op === 'private' ? 'A private tab. Nothing opened here is kept' : 'A new tab. Open an address or a tile',
        );
      return;
    }
    if (typeof id !== 'string' || !core.isTab(id) || !core.views.has(id)) return;
    if (op === 'switch') {
      usePartition(id);
      if (core.pageLoaded()) showPage();
      else {
        core.surface = 'home';
        core.panel = null;
        core.layout();
      }
      return;
    }
    if (op !== 'close') return;
    const others = tabPlaces().filter((t) => t !== id);
    if (!others.length) {
      core.notify('The only tab cannot be closed');
      return;
    }
    if (core.partition === id) {
      // Another tab comes in front first; the nearest one in the list.
      usePartition(others[Math.min(others.length - 1, tabPlaces().indexOf(id))] ?? others[0]!);
      core.surface = core.pageLoaded() ? 'page' : 'home';
      if (core.surface === 'page') {
        core.thaw(core.page);
        core.page.setAudioMuted(false);
      }
    }
    const gone = core.views.get(id);
    core.views.delete(id);
    if (core.lastTab === id) core.lastTab = core.isTab(core.partition) ? core.partition : (others[0] ?? '');
    if (gone) {
      const left = gone.webContents.session;
      const was = gone.webContents.getURL();
      if (!core.isPrivate(id) && /^https?:/i.test(was) && !isNotice(was)) {
        core.closedTabs.push(was);
        if (core.closedTabs.length > 10) core.closedTabs.shift();
      }
      core.win.contentView.removeChildView(gone);
      gone.webContents.close();
      // What a private tab's sites stored goes with the tab.
      if (core.isPrivate(id)) void left.clearStorageData().catch(() => undefined);
    }
    core.layout();
  };

  const showHome = (): void => {
    core.covering = null;
    clearTimeout(core.coverTimer);
    if (core.edit) core.endEdit(false);
    if (core.surface === 'page') {
      // The site stays loaded, silent and still: what was playing is paused by
      // the site's own key, and then the whole page is frozen.
      core.setPointer(false);
      core.page.send('longboard:away');
      core.page.setAudioMuted(true);
      core.freezeSoon(core.page);
    }
    core.surface = 'home';
    core.panel = null;
    core.layout();
  };

  /** While a video plays the display is kept awake; this lets it sleep again. */
  const releaseDisplay = (): void => {
    if (core.blocker === undefined) return;
    powerSaveBlocker.stop(core.blocker);
    core.blocker = undefined;
  };
  /** The tab most recently in front: where an address opens when an app's own view is in front, or none is. */
  core.lastTab = '';
  let tabCount = 0;
  const MAX_TABS = 8;
  const tabPlaces = (): string[] => [...core.views.keys()].filter(core.isTab);
  const usePartition = (next: string): void => {
    if (next === core.partition) return;
    core.setPointer(false);
    clearTimeout(core.retryTimer);
    if (core.pending?.what === 'permission') core.answerPrompt(false, false);
    if (!core.page.isDestroyed()) {
      core.page.send('longboard:away');
      core.page.setAudioMuted(true);
      // A tab left behind stands still until it is in front again.
      if (core.isTab(core.partition)) core.freezeSoon(core.page);
    }
    core.pageView.setVisible(false);
    releaseDisplay();
    const leaving = core.partition;
    const left = core.pageView;
    core.pageView = core.views.get(next) ?? core.makeView(next);
    core.page = core.pageView.webContents;
    core.partition = next;
    // A tab stays open behind the one in front. An app's own view is closed when it is left.
    if (!core.isTab(leaving)) {
      core.views.delete(leaving);
      core.win.contentView.removeChildView(left);
      left.webContents.close();
    }
    if (core.isTab(next)) core.lastTab = next;
    retryAttempt = 0;
    titleFor = null;
    lastNoticeAt = 0;
    pageShown = core.pageLoaded();
  };

  /** Where an address of a site is opened instead, when the site's profile says its interface for a TV is elsewhere and the person has not switched the profile off. */
  const entryAt = (url: string): string | null => (core.profileOffAt(url) ? null : core.deps.profiles.entry(url));
  const open = (asked: string, remember: boolean, inSession = core.lastTab): void => {
    // A site whose profile says its interface for a TV starts elsewhere: its front page opens there.
    const url = entryAt(asked) ?? asked;
    const reason = blockReason(url, core.navRules());
    if (reason === 'locked') {
      // Asked for by the person: the PIN opens it, and every other site until Longboard is locked again.
      core.withPin(`${siteName(url)} is not on Home. Enter the PIN to unlock every site`, () => {
        core.unlocked = true;
        open(url, remember, inSession);
      });
      return;
    }
    if (reason) {
      console.error(`[longboard] blocked navigation (${reason}): ${describeBlockedUrl(url)}`);
      if (pageShown || core.surface === 'home') {
        core.notify(blockedMessage(reason));
        return;
      }
      showPage();
      void core.page.loadURL(noticePageUrl(reason, url));
      return;
    }
    if (core.edit) core.endEdit(false);
    usePartition(inSession);
    if (remember && !core.isPrivate(core.partition)) {
      core.recents = addRecent(core.recents, url, Date.now());
      titleFor = url;
      core.saveRecents();
    }
    clearTimeout(core.retryTimer);
    core.setPointer(false);
    // Another site than the one this tab shows, or the tab's first: covered until it has come.
    if (core.otherSite(core.page.getURL(), url)) core.coverFor(url);
    showPage();
    void core.page.loadURL(url).catch(() => undefined);
  };

  const openInSharedTab = (url: string): void =>
    open(url, false, core.isTab(core.lastTab) && !core.isPrivate(core.lastTab) ? core.lastTab : '');

  const backIndex = (): number => {
    const history = core.page.navigationHistory;
    const entries = history.getAllEntries();
    const at = history.getActiveIndex();
    const here = entries[at]?.url ?? '';
    const notice = (url: string | undefined): boolean =>
      url === undefined || isNotice(url) || url.startsWith('chrome-error:');
    let i = at - 1;
    const skip = notice(here) ? entries[i]?.url : here;
    while (i >= 0 && (notice(entries[i]?.url) || entries[i]?.url === skip)) i -= 1;
    return i;
  };
  const goBack = (): void => {
    clearTimeout(core.retryTimer);
    const i = backIndex();
    if (i >= 0) core.page.navigationHistory.goToIndex(i);
    else showHome();
  };

  core.eachPage((wc) =>
    wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
      if (wc !== core.page || !isMainFrame || !isLoadFailure(code, url)) return;
      console.error(`[longboard] page failed to load (${code} ${description}): ${describeBlockedUrl(url)}`);
      if (blockReason(url, core.navRules())) return;
      clearTimeout(core.retryTimer);
      if (isCertificateError(code)) {
        void core.page.loadURL(certificatePageUrl(description));
        return;
      }
      retryAttempt += 1;
      const wait = retryDelaySeconds(retryAttempt);
      void core.page.loadURL(offlinePageUrl(description, wait));
      core.retryTimer = setTimeout(() => {
        // Only while the notice is still what is shown: the person may have moved on.
        if (!core.page.isDestroyed() && core.page.getURL().startsWith('data:'))
          void core.page.loadURL(url).catch(() => undefined);
      }, wait * 1000);
    }),
  );
  core.eachPage((wc) =>
    wc.on('did-navigate', (_e, url) => {
      if (wc !== core.page) return;
      if (!isNotice(url)) {
        retryAttempt = 0;
        pageShown = true;
      }
      // A profile may keep the edges of the screen clear, so where the page is drawn can change with the address.
      const area = core.pageArea();
      const now = core.pageView.getBounds();
      if (core.panel || area.x !== now.x || area.y !== now.y || area.width !== now.width || area.height !== now.height)
        core.layout();
      core.applyZoom();
    }),
  );
  // History: every page that arrives in the view in front, while the setting is on.
  const visited = (wc: WebContents, url: string): void => {
    if (wc !== core.page || isNotice(url) || core.config.history === false || core.isPrivate(core.partition)) return;
    core.visits = addVisit(core.visits, url, Date.now());
    core.saveHistory();
  };
  core.eachPage((wc) => wc.on('did-navigate', (_e, url) => visited(wc, url)));
  core.eachPage((wc) =>
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (isMainFrame) visited(wc, url);
    }),
  );
  core.eachPage((wc) =>
    wc.on('page-title-updated', (_e, title) => {
      if (
        wc === core.page &&
        !isNotice(core.page.getURL()) &&
        core.config.history !== false &&
        !core.isPrivate(core.partition) &&
        core.visits[0]?.url === core.page.getURL()
      ) {
        core.visits = titleVisit(core.visits, core.page.getURL(), title);
        core.saveHistory();
      }
    }),
  );
  core.eachPage((wc) =>
    wc.on('page-title-updated', (_e, title) => {
      if (wc !== core.page || !titleFor || isNotice(core.page.getURL())) return;
      core.recents = titleRecent(core.recents, titleFor, title);
      titleFor = null;
      core.saveRecents();
    }),
  );
  core.eachPage((wc) =>
    wc.on('render-process-gone', (_e, details) => {
      console.error(`[longboard] page renderer exited: ${details.reason}`);
    }),
  );

  const NOTICE_GAP_MS = 5000;
  /** Returns true when `url` may load. A refusal is always logged and shown, never silent. */
  const allowed = (url: string): boolean => {
    const reason = blockReason(url, core.navRules());
    if (!reason) return true;
    console.error(`[longboard] blocked navigation (${reason}): ${describeBlockedUrl(url)}`);
    if (pageShown) {
      // Said once, not for every try: a page that keeps asking would keep the message up.
      if (Date.now() - lastNoticeAt > NOTICE_GAP_MS) core.page.send('longboard:notice', blockedMessage(reason));
      lastNoticeAt = Date.now();
    } else {
      // Deferred so the refused navigation is fully cancelled first.
      setImmediate(() => {
        if (!core.page.isDestroyed() && !pageShown) void core.page.loadURL(noticePageUrl(reason, url));
      });
    }
    return false;
  };
  // The front page of a site whose profile names another way in (view.entry)
  // is opened there, however it was reached: a link, or the site's own redirect.
  const byEntry = (wc: WebContents, e: { preventDefault: () => void }, url: string): void => {
    const entry = wc === core.page ? entryAt(url) : null;
    if (!entry || !allowed(entry)) return;
    e.preventDefault();
    setImmediate(() => {
      if (!core.page.isDestroyed()) void core.page.loadURL(entry).catch(() => undefined);
    });
  };
  core.eachPage((wc) =>
    wc.on('will-navigate', (e, url) => {
      if (wc !== core.page || !allowed(url)) e.preventDefault();
      else byEntry(wc, e, url);
    }),
  );
  // Frames inside a page are the site's own business; only where the view
  // itself goes is checked.
  core.eachPage((wc) =>
    wc.on('will-redirect', (e, url, _isInPlace, isMainFrame) => {
      if (!isMainFrame) return;
      if (wc !== core.page || !allowed(url)) e.preventDefault();
      else byEntry(wc, e, url);
    }),
  );
  // No pop-up windows: a link that asks for one opens in the same view.
  core.eachPage((wc) =>
    wc.setWindowOpenHandler(({ url }) => {
      // An empty window a script means to fill in later is refused outright:
      // opened in this view it would put a blank page in place of the site.
      if (wc === core.page && allowed(url) && !isNotice(url)) void core.page.loadURL(url).catch(() => undefined);
      return { action: 'deny' };
    }),
  );

  const tvCss = readFileSync(join(__dirname, 'tv.css'), 'utf8');
  core.eachPage((wc) =>
    wc.on('dom-ready', () => {
      void wc.insertCSS(tvCss, { cssOrigin: 'user' });
    }),
  );

  // The chrome view shows one file and goes nowhere else.
  core.chrome.on('will-navigate', (e) => e.preventDefault());
  core.chrome.setWindowOpenHandler(() => ({ action: 'deny' }));
  core.chrome.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  core.chrome.session.setPermissionCheckHandler(() => false);

  core.win.on('resize', () => {
    core.applyZoom();
    core.layout();
  });
  core.win.on('enter-full-screen', core.applyZoom);
  core.win.on('leave-full-screen', core.applyZoom);
  return {
    menuLearned,
    showPage,
    tabAction,
    showHome,
    tabPlaces,
    usePartition,
    open,
    openInSharedTab,
    backIndex,
    goBack,
  };
}
