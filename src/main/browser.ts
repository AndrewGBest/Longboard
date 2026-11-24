// Makes the window. The page view shows websites and the chrome view shows
// Longboard's own screens (Home, the menu panel, questions): separate
// renderers with separate sessions, so a website can never reach the chrome
// view or the shell (Hard rule 13). The work is done by the parts in
// browser/, put together here in order. This file also decides what the
// window opens with, and tidies up when it closes.
import { rmSync } from 'node:fs';
import { ipcMain } from 'electron';
import { DECLINED } from './handback';
import { startingPageUrl } from './navigation';
import type { Browser, BrowserDeps, Core } from './browser/core';
import { SCREENS_URL } from './browser/core';
import { createShell } from './browser/shell';
import { createState } from './browser/state';
import { createLock } from './browser/lock';
import { createTextEntry } from './browser/text-entry';
import { createChromeState } from './browser/chrome-state';
import { createHandBack } from './browser/hand-back';
import { createLayout } from './browser/layout';
import { createGoingPlaces } from './browser/going-places';
import { createStandstill } from './browser/standstill';
import { createPointerMode } from './browser/pointer-mode';
import { createKeys } from './browser/keys';
import { createAway } from './browser/away';
import { createPermissions } from './browser/permissions';
import { createPrivacy } from './browser/privacy';
import { createDownloads } from './browser/downloads';
import { createLayerMessages } from './browser/layer-messages';
import { createFrames } from './browser/frames';
import { createProfileEditor } from './browser/profile-editor';
import { createIcons } from './browser/icons';
import { createApps } from './browser/apps';
import { createMenu } from './browser/menu';
import { createChromeMessages } from './browser/chrome-messages';

export type { Browser, BrowserDeps } from './browser/core';

/** Makes the window and everything in it, and opens what the command line or Settings asked for. */
export function createBrowser(deps: BrowserDeps): Browser {
  // Each part adds to `core` what the later ones use and, once running, the
  // earlier ones too. The order matters: a part's set-up may use only what
  // the parts above it made.
  const core = { deps } as Core;
  Object.assign(core, createShell(core));
  Object.assign(core, createState(core));
  Object.assign(core, createLock(core));
  Object.assign(core, createTextEntry(core));
  Object.assign(core, createChromeState(core));
  Object.assign(core, createHandBack(core));
  Object.assign(core, createLayout(core));
  Object.assign(core, createGoingPlaces(core));
  Object.assign(core, createStandstill(core));
  Object.assign(core, createPointerMode(core));
  Object.assign(core, createKeys(core));
  Object.assign(core, createAway(core));
  Object.assign(core, createPermissions(core));
  Object.assign(core, createPrivacy(core));
  Object.assign(core, createDownloads(core));
  Object.assign(core, createLayerMessages(core));
  Object.assign(core, createFrames(core));
  Object.assign(core, createProfileEditor(core));
  Object.assign(core, createIcons(core));
  Object.assign(core, createApps(core));
  Object.assign(core, createMenu(core));
  Object.assign(core, createChromeMessages(core));

  core.win.on('closed', () => {
    // Closed with something asked for and not answered: that is a no, and the program waiting is told.
    if (core.pending?.what === 'handBack') core.writeHandBack(core.pending.ask, DECLINED);
    else if (core.wanted) core.writeHandBack(core.wanted, DECLINED);
    clearInterval(core.downloadsTick);
    core.phone.stop();
    core.voice.close();
    // A half-fetched file is of no use to anyone.
    for (const d of core.downloads) if (d.state === 'going') d.item.cancel();
    rmSync(core.waitingDir, { recursive: true, force: true });
    clearInterval(core.pointer.timer);
    clearTimeout(core.retryTimer);
    clearTimeout(core.awayTimer);
    ipcMain.off('longboard:boot', core.onBoot);
    ipcMain.off('longboard:msg', core.onMessage);
    ipcMain.off('longboard:chrome', core.onChrome);
    ipcMain.off('longboard:frame', core.onFrame);
  });

  core.restoreTabs();
  void core.chrome.loadURL(SCREENS_URL);
  const startApp = core.deps.startApp ? core.apps.find((a) => a.id === core.deps.startApp) : undefined;
  if (core.deps.startApp && !startApp)
    console.error(`[longboard] there is no app called "${core.deps.startApp.slice(0, 80)}"`);
  if (startApp) {
    void core.deps.ready.then(() => {
      if (!core.win.isDestroyed()) core.openApp(startApp.id);
    });
    core.layout();
  } else if (core.deps.startUrl) {
    // The window is up at once with a notice; the site loads when the playback
    // component is ready, so protected playback works on the first page.
    const url = core.deps.startUrl;
    core.showPage();
    void core.page.loadURL(startingPageUrl());
    void core.deps.ready.then(() => {
      if (!core.page.isDestroyed()) core.open(url, false);
    });
  } else if (core.config.startWith === 'last' && core.recents[0]) {
    // "Open with the last site": the one opened most recently, when nothing else was asked for.
    const url = core.recents[0].url;
    core.showPage();
    void core.page.loadURL(startingPageUrl());
    void core.deps.ready.then(() => {
      if (!core.page.isDestroyed()) core.open(url, true);
    });
  } else {
    core.layout();
  }
  return {
    win: core.win,
    openApp: core.openApp,
    openAddress: (url: string) => core.open(url, true),
    handBack: core.handBack,
    clearSiteData: core.clearSiteData,
  };
}
