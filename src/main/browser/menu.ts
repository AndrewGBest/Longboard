// What the menu's entries and the Settings screen's buttons do. Also
// clearSiteData, which the shell calls for "clear when Longboard closes".
import { app, session } from 'electron';
import { join } from 'node:path';
import { type MenuAction, type SettingsAction } from '../../shared/chrome';
import { addSaved, removeSaved } from '../../shared/home';
import { removableFolders } from '../../platform';
import { appFor, appPartition } from '../../shared/apps';
import { storeExtensionId } from '../../shared/extensions';
import { PRODUCT } from '../../shared/product';
import type { Core } from './core';
import { isNotice } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface MenuPart {
  /** Does a menu entry. One that changes what is on Home asks for the PIN first while Home decides which sites open. */
  menu: (action: MenuAction) => void;
  /** Clears what every site has stored (cookies and the rest) and the saved copies of pages, in every session. */
  clearSiteData: () => Promise<void>;
  /** The buttons on the Settings screen that do something once, as against changing a setting. */
  settingsAction: (action: SettingsAction) => void;
}

export function createMenu(core: Core): MenuPart {
  /** Menu entries that change what is on Home, which the parental lock asks the PIN for while Home decides which sites open. */
  const HOME_CHANGES: readonly MenuAction[] = ['addApp', 'removeApp', 'savePage', 'unsavePage'];
  const menu = (action: MenuAction): void =>
    HOME_CHANGES.includes(action) ? core.withPinForHome(() => menuNow(action)) : menuNow(action);
  const menuNow = (action: MenuAction): void => {
    switch (action) {
      case 'open':
        // Home's own Menu button, for a remote without a menu key.
        if (!core.panel) core.toggleMenu();
        break;
      case 'close':
        // Leaving the choosing of a new PIN goes back to Settings, where it was started.
        core.panel =
          core.panel === 'pin' && core.pinFor && ('set' in core.pinFor || core.pinFor.back === 'settings')
            ? 'settings'
            : null;
        core.layout();
        break;
      case 'home':
        core.showHome();
        break;
      case 'resume':
        if (core.pageLoaded()) core.showPage();
        break;
      case 'back':
        core.panel = null;
        core.layout();
        if (core.surface === 'page') core.goBack();
        break;
      case 'forward':
        core.panel = null;
        core.layout();
        if (core.surface === 'page' && core.page.navigationHistory.canGoForward()) {
          clearTimeout(core.retryTimer);
          core.page.navigationHistory.goForward();
        }
        break;
      case 'stop':
        if (core.surface === 'page') core.page.stop();
        core.panel = null;
        core.layout();
        break;
      case 'reload':
        core.panel = null;
        core.layout();
        if (core.surface === 'page') core.page.reload();
        break;
      case 'zoomIn':
      case 'zoomOut':
      case 'zoomReset':
        if (core.surface === 'page') core.changeZoom(action === 'zoomIn' ? 1 : action === 'zoomOut' ? -1 : 0);
        core.layout();
        break;
      case 'pointer':
        core.panel = null;
        if (core.surface === 'page') core.setPointer(!core.pointerOn);
        core.layout();
        break;
      case 'outline':
        core.panel = null;
        core.layout();
        if (core.surface === 'page') core.page.send('longboard:action', 'diagnostics');
        break;
      case 'exportProfile': {
        core.panel = null;
        core.layout();
        const current = core.surface === 'page' ? core.profileFor(core.page.getURL()) : null;
        const file = current ? core.deps.profiles.exportProfile(current.profile) : null;
        core.notify(file ? `Profile saved as ${file}` : 'There is no profile to export here');
        break;
      }
      case 'addExtension': {
        const id = core.surface === 'page' ? storeExtensionId(core.page.getURL()) : null;
        if (!id || core.extensions.ids().includes(id) || core.pending) break;
        // An extension can see everything that is browsed: with a parental lock, adding one needs the PIN.
        core.withPin('Enter the PIN to add an extension', () => {
          core.panel = null;
          core.layout();
          core.notify('Fetching the extension from the Chrome Web Store');
          core.extensions.download(id).then(
            (extension) => {
              if (core.pending) return core.extensions.discard(extension);
              core.pending = { what: 'extension', extension };
              core.panel = 'prompt';
              core.layout();
            },
            (err) => {
              console.error(`[longboard] extension could not be fetched: ${String(err).slice(0, 200)}`);
              core.notify('That extension could not be fetched from the store');
            },
          );
        });
        break;
      }
      case 'importProfiles': {
        core.panel = null;
        core.layout();
        const taken = core.deps.profiles.importFrom([join(core.dataDir, 'import'), ...removableFolders()]);
        core.notify(
          taken.length
            ? `Imported: ${taken.join(', ')}. You will be asked before each is used.`
            : 'No profile files (*.longboard-profile.json) were found',
        );
        break;
      }
      case 'editProfile':
        if (core.surface === 'page') core.startEdit();
        break;
      case 'addApp':
        if (core.surface === 'page' && !isNotice(core.page.getURL()) && !appFor(core.apps, core.page.getURL()))
          core.panel = 'addApp';
        core.layout();
        break;
      case 'removeApp': {
        core.panel = null;
        const item = core.surface === 'page' ? appFor(core.apps, core.page.getURL()) : null;
        if (item) core.removeAppById(item.id);
        core.layout();
        break;
      }
      case 'adBlocking': {
        // The switch is the person's: this is the only place it is ever changed.
        const key = core.surface === 'page' ? core.pageSite() : null;
        if (!key || core.deps.adBlock.mode() === 'off') break;
        core.sites[key] = { ...core.sites[key], adBlocking: !core.blockingAt(core.page.getURL()) };
        core.saveSites();
        // The page is loaded again so what it shows matches the switch.
        core.page.reload();
        core.layout();
        break;
      }
      case 'desktop': {
        const key = core.surface === 'page' ? core.pageSite() : null;
        if (!key) break;
        const site = { ...core.sites[key] };
        if (site.desktop) delete site.desktop;
        else site.desktop = true;
        if (Object.keys(site).length) core.sites[key] = site;
        else delete core.sites[key];
        core.saveSites();
        core.applyZoom();
        core.layout();
        break;
      }
      case 'siteProfile': {
        // The site's profile, off or on again for this site. Off, the site is
        // what any browser gets: no interface for TVs, no other way in.
        const key = core.surface === 'page' ? core.pageSite() : null;
        if (!key) break;
        const at = core.page.getURL();
        const was = core.profileFor(at)?.profile ?? null;
        const site = { ...core.sites[key] };
        if (site.profile === false) delete site.profile;
        else site.profile = false;
        if (Object.keys(site).length) core.sites[key] = site;
        else delete core.sites[key];
        core.saveSites();
        core.panel = null;
        core.layout();
        // Leaving a profile's own way in: that address is nothing without the profile, so the site's front page instead.
        const inside = site.profile === false && was?.view?.entry !== undefined;
        core.open(inside ? new URL('/', at).href : at, false);
        break;
      }
      case 'reader':
        core.panel = null;
        core.layout();
        if (core.surface === 'page' && !isNotice(core.page.getURL())) core.page.send('longboard:action', 'reader');
        break;
      case 'forgetAnswers': {
        core.panel = null;
        const key = core.surface === 'page' ? core.pageSite() : null;
        if (key && core.sites[key]?.answers) {
          const { answers: _gone, ...rest } = core.sites[key];
          if (Object.keys(rest).length) core.sites[key] = rest;
          else delete core.sites[key];
          core.saveSites();
          core.layout();
          core.notify('Forgotten. This site will ask again; load the page again for it to take effect');
        } else core.layout();
        break;
      }
      case 'downloads':
        core.panel = 'downloads';
        core.layout();
        break;
      case 'about':
        core.panel = 'about';
        core.layout();
        break;
      case 'settings':
        core.withPin('Enter the PIN to open Settings', () => {
          core.panel = 'settings';
          core.pickAt = null;
          core.capturing = null;
          core.layout();
        });
        break;
      case 'lock':
        // "Lock again", or "Unlock every site" with the PIN.
        if (!core.lock?.homeOnly) break;
        if (core.unlocked) {
          core.unlocked = false;
          core.lockViews();
          core.panel = null;
          core.layout();
          core.notify('Locked: only the sites on Home open now');
        } else {
          core.withPin('Enter the PIN to unlock every site', () => {
            core.unlocked = true;
            core.layout();
            core.notify(`Unlocked until you lock again or ${PRODUCT.name} closes`);
          });
        }
        break;
      case 'history':
        core.panel = 'history';
        core.layout();
        break;
      case 'tabs':
        core.panel = 'tabs';
        core.layout();
        break;
      case 'find':
        if (core.surface === 'page') core.panel = 'find';
        core.layout();
        break;
      case 'voice':
        core.speak();
        break;
      case 'phone':
        // `--phone-at=` is for a scripted run on a machine with no network: this machine's own address.
        void core.phone.start(core.deps.phoneAt, core.deps.phoneKey).then((ok) => {
          if (core.win.isDestroyed()) return;
          if (!ok) {
            core.notify('Typing from a phone needs this machine to be on your home network');
            return;
          }
          core.panel = 'phone';
          core.layout();
        });
        break;
      case 'phoneOff':
        core.phone.stop();
        core.panel = null;
        core.layout();
        core.notify('Typing from a phone is off');
        break;
      case 'savePassword': {
        const held = core.surface === 'page' ? core.typedNow(core.page) : null;
        if (!held || !core.loginsOn()) break;
        core.pending = { what: 'password', ...held };
        core.panel = 'prompt';
        core.layout();
        break;
      }
      case 'savePage':
      case 'unsavePage': {
        const url = core.surface === 'page' ? core.page.getURL() : '';
        if (isNotice(url)) break;
        core.saved =
          action === 'savePage' ? addSaved(core.saved, url, core.page.getTitle()) : removeSaved(core.saved, url);
        core.saveRecents();
        // Its site's own icon is fetched for the tile.
        if (action === 'savePage') core.refreshIcons(core.page);
        core.layout();
        core.notify(action === 'savePage' ? 'This page is kept on Home' : 'This page is no longer on Home');
        break;
      }
      case 'quit':
        app.quit();
        break;
    }
  };
  const clearSiteData = async (): Promise<void> => {
    // By name, not through the views: this also runs as the program closes, when the views are gone.
    const all = [
      session.defaultSession,
      ...core.apps.filter((a) => a.ownSession).map((a) => session.fromPartition(appPartition(a))),
    ];
    await Promise.all(
      all.flatMap((s) => [s.clearStorageData().catch(() => undefined), s.clearCache().catch(() => undefined)]),
    );
  };
  const settingsAction = (action: SettingsAction): void => {
    const webSessions = (): Electron.Session[] => [
      (core.views.get(core.lastTab) ?? core.pageView).webContents.session,
      ...core.apps.filter((a) => a.ownSession).map((a) => session.fromPartition(appPartition(a))),
    ];
    switch (action) {
      case 'clearSiteData':
        // Cookies and everything sites have stored: signs out of every site, apps with their own sign-ins included.
        void Promise.all(webSessions().map((s) => s.clearStorageData().catch(() => undefined))).then(() => {
          if (core.surface === 'page' && !core.page.isDestroyed()) core.page.reload();
          core.notify('Cleared. You are signed out of every site');
        });
        break;
      case 'clearCache':
        void Promise.all(webSessions().map((s) => s.clearCache().catch(() => undefined))).then(() =>
          core.notify('Cleared the saved copies of pages and pictures'),
        );
        break;
      case 'clearAll':
        // Everything Longboard and sites have kept about what was opened. Saved pages, apps and settings stay.
        core.visits = [];
        core.saveHistory();
        core.recents = [];
        core.saveRecents();
        void clearSiteData().then(() => {
          if (core.surface === 'page' && !core.page.isDestroyed()) core.page.reload();
          core.layout();
          core.notify('Cleared: history, recent sites, and what sites had stored');
        });
        break;
      case 'clearHistory':
        core.visits = [];
        core.saveHistory();
        core.layout();
        core.notify('Cleared the history');
        break;
      case 'clearHome':
        core.recents = [];
        core.saveRecents();
        core.layout();
        core.notify('Cleared the recently opened sites');
        break;
      case 'forgetSites':
        for (const key of Object.keys(core.sites)) delete core.sites[key];
        core.saveSites();
        core.applyZoom();
        core.layout();
        core.notify("Forgotten: every site's answers, size and ad-blocking switch");
        break;
      case 'updateFilters':
        core.notify('Downloading the filter list');
        void core.deps.adBlock.refresh().then((ok) => {
          if (core.panel === 'settings') core.layout();
          core.notify(ok ? 'The filter list is up to date' : 'The filter list could not be downloaded');
        });
        break;
      case 'updateCatalogue':
        core.notify('Looking for reviewed profiles');
        void core.deps.settings.refreshCatalogue().then((ok) => {
          if (core.panel === 'settings') core.layout();
          core.notify(ok ? 'Reviewed profiles are up to date' : 'Reviewed profiles could not be downloaded');
        });
        break;
      case 'removeVoiceModel':
        core.voice.removeModel();
        core.layout();
        core.notify('The speech model is removed');
        break;
      case 'checkUpdate':
        core.notify('Looking for a new version');
        void core.deps.settings.lookForUpdate().then(() => {
          if (core.panel === 'settings') core.layout();
          core.notify(core.deps.settings.update().words);
        });
        break;
      case 'reset':
        core.deps.settings.reset();
        core.applyZoom();
        core.applyPrivacy();
        core.layout();
        core.notify('Settings are back to the usual');
        break;
    }
  };
  return { menu, clearSiteData, settingsAction };
}
