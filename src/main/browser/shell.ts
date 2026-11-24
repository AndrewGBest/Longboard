// The window, its views, and what Longboard keeps on disk about Home.
import { app, BaseWindow, session, WebContentsView, type WebContents } from 'electron';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { siteKey } from '../../shared/address';
import { type UserConfig } from '../../shared/config';
import { parseRecents, parseSaved, type RecentSite, type SavedPage } from '../../shared/home';
import { parseSites, type SiteSettings } from '../../shared/sites';
import { readJson } from '../store';
import { parseApps, type WebApp } from '../../shared/apps';
import { Extensions } from '../extensions';
import { PRODUCT } from '../../shared/product';
import type { Core } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface ShellPart {
  options: { dev: boolean; automation: boolean };
  config: UserConfig;
  dataDir: string;
  homeFile: string;
  sitesFile: string;
  complain: (file: string) => (why: string) => void;
  recents: RecentSite[];
  /** Pages the person asked to keep on Home. */
  saved: SavedPage[];
  sites: Record<string, SiteSettings>;
  appsFile: string;
  iconsDir: string;
  apps: WebApp[];
  /** Each app's icon as a data: address, read from disk once. */
  iconData: Map<string, string | null>;
  iconOf: (id: string) => string | null;
  /** The name a site's icon is kept under while the site is on Home: nothing that can be read back into an address. */
  siteIconId: (url: string) => string;
  win: BaseWindow;
  extensions: Extensions;
  chromeView: WebContentsView;
  chrome: Electron.WebContents;
  views: Map<string, WebContentsView>;
  wiredSessions: Set<Electron.Session>;
  /** Sets something up on every website view, those made later included. */
  eachPage: (wire: (wc: WebContents) => void) => void;
  /** The same for every session a website view uses. */
  eachSession: (wire: (ses: Electron.Session) => void) => void;
  isPrivate: (place: string) => boolean;
  isTab: (place: string) => boolean;
  makeView: (place: string) => WebContentsView;
  isPageView: (wc: WebContents) => boolean;
  partition: string;
  pageView: WebContentsView;
  page: Electron.WebContents;
}

export function createShell(
  core: Core,
): Omit<ShellPart, 'recents' | 'saved' | 'apps' | 'partition' | 'pageView' | 'page'> {
  const { options, config } = core.deps;
  const dataDir = app.getPath('userData');
  const homeFile = join(dataDir, 'home.json');
  const sitesFile = join(dataDir, 'sites.json');
  const complain = (file: string) => (why: string) => console.error(`[longboard] ${file} could not be read: ${why}`);
  core.recents = parseRecents(readJson(homeFile, complain('home.json')));
  /** Pages the person asked to keep on Home. */
  core.saved = parseSaved(readJson(homeFile));
  const sites: Record<string, SiteSettings> = parseSites(readJson(sitesFile, complain('sites.json')));
  const appsFile = join(dataDir, 'apps.json');
  const iconsDir = join(dataDir, 'icons');
  core.apps = parseApps(readJson(appsFile, complain('apps.json')));
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
  const siteIconId = (url: string): string =>
    `site-${createHash('sha256')
      .update(siteKey(url) ?? '')
      .digest('hex')
      .slice(0, 16)}`;

  // A window with no page of its own: everything shown is one of the views below.
  const win = new BaseWindow({
    width: core.deps.size?.[0] ?? 1280,
    height: core.deps.size?.[1] ?? 720,
    useContentSize: true,
    fullscreen: core.deps.fullscreen,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: PRODUCT.name,
  });
  win.removeMenu();

  // Extensions from the Chrome Web Store (main/extensions.ts), in the session everything shares.
  const extensions = new Extensions(session.defaultSession, join(dataDir, 'Extensions'), {
    open: (url) => {
      core.openInSharedTab(url);
      return core.page;
    },
    window: () => win,
    note: (line) => console.log(`[longboard] ${line}`),
  });

  const hardened = { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } as const;
  // Its own session, kept in memory only: nothing a website stores is visible to it.
  const chromeView = new WebContentsView({
    webPreferences: { ...hardened, preload: join(__dirname, 'chrome.js'), partition: 'longboard-chrome' },
  });
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
  core.partition = '';
  core.pageView = makeView('');
  core.page = core.pageView.webContents;
  return {
    options,
    config,
    dataDir,
    homeFile,
    sitesFile,
    complain,
    sites,
    appsFile,
    iconsDir,
    iconData,
    iconOf,
    siteIconId,
    win,
    extensions,
    chromeView,
    chrome,
    views,
    wiredSessions,
    eachPage,
    eachSession,
    isPrivate,
    isTab,
    makeView,
    isPageView,
  };
}
