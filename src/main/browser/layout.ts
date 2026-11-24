// Where the views sit in the window (layout), the cover shown while another
// site is on its way, telling each view whether it is in front, and notices.
// Also the saving of Home's lists and the sites' settings, and zoom.
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { siteName } from '../../shared/address';
import { zoomStep } from '../../shared/sites';
import { writeJson } from '../store';
import type { Core } from './core';
import { PANEL_WIDTH } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface LayoutPart {
  /** The name of the site the cover is up for, or null when there is no cover. */
  covering: string | null;
  /** Takes the cover down if nothing else has by then. */
  coverTimer: NodeJS.Timeout | undefined;
  /** Covers the window with Longboard's own screen, naming the site at this address, until its first page is there. */
  coverFor: (url: string) => void;
  /** True when two addresses are on different hosts, or either is not an address. */
  otherSite: (from: string, to: string) => boolean;
  /** True while another program's window is in front, as far as the shell has heard. */
  windowAway: boolean;
  /** Tells each view whether it is the one in front. */
  tellFront: () => void;
  /** Sizes and shows the views for the current state, and gives the keys to the one in front. */
  layout: () => void;
  /** A line of text over whatever is in front. */
  notify: (text: string) => void;
  /** Writes Home's lists (recent sites and saved pages), and drops the icons of sites no longer on Home. */
  saveRecents: () => void;
  saveSites: () => void;
  saveApps: () => void;
  /** Sets the page in front to the screen's zoom times the person's own for the site. */
  applyZoom: () => void;
  /** One step in or out for the site in front, or back to its usual size with 0. Remembered for the site. */
  changeZoom: (direction: 1 | -1 | 0) => void;
}

export function createLayout(core: Core): Omit<LayoutPart, 'covering' | 'coverTimer' | 'windowAway'> {
  // While one site is opened in place of another (an app started, a tile
  // chosen on Home, an address typed), the site being left would stay on
  // screen until the new one's first page came. The whole window is covered
  // by Longboard's own screen meanwhile, saying which site is coming (see
  // DECISIONS.md, 2026-11-23). The keys stay with the page: Back still works.
  core.covering = null;
  core.coverTimer = undefined;
  const COVER_MOST_MS = 12_000;
  const uncover = (): void => {
    clearTimeout(core.coverTimer);
    if (core.covering === null) return;
    core.covering = null;
    if (!core.win.isDestroyed()) layout();
  };
  const coverFor = (url: string): void => {
    core.covering = siteName(url);
    clearTimeout(core.coverTimer);
    // Never for good: a site that does not come is dealt with by the page's own notice.
    core.coverTimer = setTimeout(uncover, COVER_MOST_MS);
  };
  const otherSite = (from: string, to: string): boolean => {
    try {
      return new URL(from).hostname !== new URL(to).hostname;
    } catch {
      return true;
    }
  };
  core.eachPage((wc) => {
    // The new site's page is there to be drawn: a moment for its first picture, then the cover goes.
    wc.on('dom-ready', () => {
      if (wc === core.page && core.covering !== null) {
        clearTimeout(core.coverTimer);
        core.coverTimer = setTimeout(uncover, 250);
      }
    });
    wc.on('did-fail-load', (_e, _code, _text, _url, isMainFrame) => {
      if (wc === core.page && isMainFrame) uncover();
    });
  });
  /** True while another program's window is in front, as far as the shell has heard. */
  core.windowAway = false;
  // Each view is told whether it is the one in front. A game controller is
  // read by the views themselves, and a view cannot go by whether its own
  // window has heard it is focused: that is not always heard.
  const tellFront = (): void => {
    const front = core.active();
    for (const wc of [core.chrome, core.page]) {
      if (wc.isDestroyed()) continue;
      // With the app's window itself not in front, null: the view goes by what its own window hears.
      const on = wc !== front ? false : core.windowAway ? null : true;
      wc.send('longboard:front', on);
      if (wc === core.page)
        for (const f of wc.mainFrame.framesInSubtree)
          if (f !== wc.mainFrame && !f.isDestroyed()) f.send('longboard:front', on);
    }
  };
  // A page that has just come takes whatever lies under the idle pointer
  // for pointed at, and some sites open a menu on that as they load. Until
  // the mouse is really moved, the pointer is not in the window.
  core.eachPage((wc) => {
    const away = (): void => {
      if (wc === core.page && !core.pointerOn && !wc.isDestroyed())
        wc.sendInputEvent({ type: 'mouseLeave', x: 0, y: 0 });
    };
    wc.on('dom-ready', away);
    wc.on('did-finish-load', away);
  });
  // A page that has just come has heard nothing yet.
  core.eachPage((wc) => wc.on('dom-ready', () => tellFront()));
  const layout = (): void => {
    if (core.win.isDestroyed()) return;
    if (core.pending && core.panel !== 'prompt') core.dropQuestion();
    if (core.panel === 'prompt' && core.shownPanel !== 'prompt') core.promptShownAt = Date.now();
    // Leaving "find on this page" takes its marks off the page.
    if (core.shownPanel === 'find' && core.panel !== 'find' && !core.page.isDestroyed())
      core.page.stopFindInPage('clearSelection');
    // The article is held only while it is being read.
    if (core.panel !== 'reader') core.reading = null;
    if (core.panel !== 'pin') core.pinFor = null;
    core.shownPanel = core.panel;
    core.extensions.selectTab(core.page);
    const [width = 0, height = 0] = core.win.getContentSize();
    for (const view of core.views.values()) {
      view.setBounds(view === core.pageView ? core.pageArea() : { x: 0, y: 0, width, height });
      if (view !== core.pageView) view.setVisible(false);
    }
    // Home and the reader view fill the window; every other panel is a strip beside the website.
    const covered = core.surface === 'page' && !core.panel && core.covering !== null;
    if (core.surface === 'home' || core.panel === 'reader' || covered)
      core.chromeView.setBounds({ x: 0, y: 0, width, height });
    else {
      const strip = Math.round(width * PANEL_WIDTH);
      core.chromeView.setBounds({ x: width - strip, y: 0, width: strip, height });
    }
    core.pageView.setVisible(core.surface === 'page');
    core.chromeView.setVisible(core.surface === 'home' || core.panel !== null || covered);
    if (!core.chrome.isDestroyed()) core.chrome.send('longboard:chrome-state', core.chromeState());
    const front = core.active();
    if (!front.isDestroyed()) front.focus();
    tellFront();
  };

  const notify = (text: string): void => {
    const front = core.active();
    if (!front.isDestroyed()) front.send('longboard:notice', text);
  };

  const saveRecents = (): void => {
    writeJson(core.homeFile, { recents: core.recents, saved: core.saved });
    // A site that is no longer on Home does not keep its icon here.
    const kept = new Set([...core.recents, ...core.saved].map((r) => `${core.siteIconId(r.url)}.png`));
    try {
      for (const file of readdirSync(core.iconsDir)) {
        if (!file.startsWith('site-') || kept.has(file)) continue;
        rmSync(join(core.iconsDir, file), { force: true });
        core.iconData.delete(file.slice(0, -4));
      }
    } catch {
      // no icons have been saved yet
    }
  };
  const saveSites = (): void => writeJson(core.sitesFile, core.sites);
  const saveApps = (): void => writeJson(core.appsFile, { apps: core.apps });

  const applyZoom = (): void => {
    if (core.win.isDestroyed() || core.page.isDestroyed()) return;
    const zoom = Math.min(5, Math.max(0.25, core.autoZoom() * core.siteZoom()));
    if (Math.abs(core.page.getZoomFactor() - zoom) > 0.001) core.page.setZoomFactor(zoom);
  };
  const changeZoom = (direction: 1 | -1 | 0): void => {
    const key = core.pageSite();
    if (!key) return;
    const next = direction === 0 ? 1 : zoomStep(core.siteZoom(), direction);
    const site = { ...core.sites[key] };
    if (next === 1) delete site.zoom;
    else site.zoom = next;
    if (Object.keys(site).length) core.sites[key] = site;
    else delete core.sites[key];
    saveSites();
    applyZoom();
  };
  return { coverFor, otherSite, tellFront, layout, notify, saveRecents, saveSites, saveApps, applyZoom, changeZoom };
}
