// Messages from Longboard's own screens.
import { app, ipcMain } from 'electron';
import { loginPlace } from '../../shared/passwords';
import { accessSync, constants as fsConstants } from 'node:fs';
import { searchUrl, siteName, DEFAULT_SEARCH } from '../../shared/address';
import { EDIT_ACTIONS, MENU_ACTIONS, SETTINGS_ACTIONS, type ChromeMessage } from '../../shared/chrome';
import { removeRecent, removeSaved } from '../../shared/home';
import { writeJson } from '../store';
import { isPin, waitAfter } from '../../shared/lock';
import { checkPin, makeLock } from '../lock';
import { cleanDomain, editStartsOff } from '../../shared/adblock';
import { BUTTON_ACTIONS, unmapButtons } from '../../shared/settings';
import { suggest, type Known } from '../../shared/suggest';
import { pngFromDataUrl } from '../../shared/icons';
import type { Core } from './core';
import { PROMPT_SETTLE_MS } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface ChromeMessagesPart {
  onChrome: (event: Electron.IpcMainEvent, msg: ChromeMessage) => void;
}

export function createChromeMessages(core: Core): ChromeMessagesPart {
  /** The places the person already knows, most their own first: for the suggestions under an address field. */
  const knownPlaces = (): Known[] => [
    ...core.saved,
    ...core.apps.map((a) => ({ url: a.url, title: a.name })),
    ...core.recents.map((r) => ({ url: r.url, title: r.title })),
    ...core.visits.map((v) => ({ url: v.url, title: v.title })),
  ];
  /** The words last looked for on the page, so that pressing again goes to the next place. */
  let lastFound = '';
  core.eachPage((wc) =>
    wc.on('found-in-page', (_e, result) => {
      if (wc !== core.page || core.panel !== 'find' || !result.finalUpdate) return;
      core.notify(result.matches > 0 ? `${result.activeMatchOrdinal} of ${result.matches}` : 'Not found on this page');
    }),
  );
  /** True while a change to Home that the PIN was just given for is being made. */
  let pinGiven = false;
  const onChrome = (event: Electron.IpcMainEvent, msg: ChromeMessage): void => {
    // Only Longboard's own screen, and only its top frame.
    if (event.sender !== core.chrome || event.senderFrame !== core.chrome.mainFrame) return;
    if (!msg || typeof msg !== 'object') return;
    // Taking a tile off Home is a change to Home; from Settings the PIN has been given already.
    if (
      (msg.kind === 'removeRecent' ||
        msg.kind === 'removeSaved' ||
        (msg.kind === 'removeApp' && core.panel !== 'settings')) &&
      core.lock?.homeOnly &&
      !core.unlocked &&
      !pinGiven
    ) {
      core.withPin('Enter the PIN to change what is on Home', () => {
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
        if (core.panel !== 'pin' || !core.pinFor || !isPin(msg.digits)) break;
        if ('set' in core.pinFor) {
          if (core.pinFor.first === null) {
            core.pinFor = { set: true, first: msg.digits };
            core.layout();
          } else if (core.pinFor.first !== msg.digits) {
            core.pinFor = { set: true, first: null };
            core.layout();
            core.notify('Those two were not the same. Choose again');
          } else {
            core.lock = makeLock(msg.digits, core.lock?.homeOnly ?? false);
            core.saveLock();
            core.panel = 'settings';
            core.layout();
            core.notify('The PIN is set');
          }
          break;
        }
        if (Date.now() < core.pinNotBefore) {
          core.layout();
          core.notify(`Wait ${Math.ceil((core.pinNotBefore - Date.now()) / 1000)} seconds before trying again`);
          break;
        }
        if (!core.lock || !checkPin(core.lock, msg.digits)) {
          core.pinFailures += 1;
          core.pinNotBefore = Date.now() + waitAfter(core.pinFailures);
          core.layout();
          core.notify(
            core.pinNotBefore > Date.now()
              ? `Wrong PIN. Wait ${Math.ceil(waitAfter(core.pinFailures) / 1000)} seconds before trying again`
              : 'Wrong PIN',
          );
          break;
        }
        core.pinFailures = 0;
        const then = core.pinFor.then;
        core.panel = null;
        core.pinFor = null;
        then();
        break;
      }
      case 'extension': {
        // From the Settings screen: open an extension's own page, or remove it.
        const item =
          core.panel === 'settings' && typeof msg.id === 'string'
            ? core.extensions.list().find((e) => e.id === msg.id)
            : undefined;
        if (!item) break;
        if (msg.op === 'remove') {
          void core.extensions.remove(item.id).then(() => {
            core.layout();
            core.notify(`"${item.name}" is removed`);
          });
        } else if (msg.op === 'open' && (item.options ?? item.popup))
          core.openInSharedTab(`chrome-extension://${item.id}/${item.options ?? item.popup}`);
        break;
      }
      case 'lock':
        // The lock's own settings, on the Settings screen: the PIN was given to get there.
        if (core.panel !== 'settings') break;
        if (msg.op === 'set') {
          core.pinFor = { set: true, first: null };
          core.panel = 'pin';
        } else if (msg.op === 'remove') {
          core.lock = null;
          core.unlocked = false;
          core.saveLock();
        } else if (msg.op === 'homeOnly' && core.lock) {
          core.lock = { ...core.lock, homeOnly: !core.lock.homeOnly };
          core.unlocked = false;
          core.saveLock();
          core.lockViews();
        }
        core.layout();
        break;
      case 'open':
        if (typeof msg.input === 'string') core.openTyped(msg.input);
        break;
      case 'openRecent':
        if (typeof msg.url === 'string' && core.recents.some((r) => r.url === msg.url)) core.open(msg.url, true);
        break;
      case 'openApp':
        if (typeof msg.id === 'string') core.openApp(msg.id);
        break;
      case 'icon':
        // A picture Longboard's own screen drew from a site's icon.
        if (typeof msg.id === 'number') core.drawing.get(msg.id)?.(pngFromDataUrl(msg.png));
        break;
      case 'tab':
        if (core.panel === 'tabs') core.tabAction(msg.op, msg.id);
        break;
      case 'openSaved':
        if (typeof msg.url === 'string' && core.saved.some((p) => p.url === msg.url)) core.open(msg.url, false);
        break;
      case 'removeSaved':
        if (core.surface === 'home' && typeof msg.url === 'string' && core.saved.some((p) => p.url === msg.url)) {
          core.saved = removeSaved(core.saved, msg.url);
          core.saveRecents();
          core.panel = null;
          core.layout();
          core.notify('That page is no longer on Home');
        }
        break;
      case 'suggest':
        // Looked for in what is kept here, and nowhere else.
        if (typeof msg.text === 'string') {
          const text = msg.text.slice(0, 200);
          const local = suggest(text, knownPlaces());
          core.chrome.send('longboard:suggestions', { text, list: local });
          void core.searchSuggestions(text).then((words) => {
            if (!words.length || core.chrome.isDestroyed()) return;
            const template = core.config.search ?? DEFAULT_SEARCH;
            const more = words.map((w) => ({ url: searchUrl(w, template), text: w, search: true }));
            core.offeredSearches = new Set(more.map((m) => m.url));
            // Fewer of the places already known, so the list stays short enough to walk with a remote.
            core.chrome.send('longboard:suggestions', { text, list: [...local.slice(0, 3), ...more] });
          });
        }
        break;
      case 'openSuggestion':
        if (
          typeof msg.url === 'string' &&
          (knownPlaces().some((k) => k.url === msg.url) || core.offeredSearches.has(msg.url))
        )
          core.open(msg.url, true);
        break;
      case 'find':
        if (core.panel === 'find' && core.surface === 'page' && typeof msg.text === 'string' && msg.text.trim()) {
          const text = msg.text.trim().slice(0, 200);
          core.page.findInPage(text, { forward: msg.forward !== false, findNext: text === lastFound });
          lastFound = text;
        }
        break;
      case 'openVisit':
        if (core.panel === 'history' && typeof msg.url === 'string' && core.visits.some((v) => v.url === msg.url))
          core.open(msg.url, true);
        break;
      case 'forgetVisit':
        if (core.panel === 'history' && typeof msg.url === 'string' && core.visits.some((v) => v.url === msg.url)) {
          core.visits = core.visits.filter((v) => v.url !== msg.url);
          writeJson(core.historyFile, { visits: core.visits });
          core.layout();
        }
        break;
      case 'folder':
        if (core.panel !== 'settings') break;
        if (msg.path === null) core.pickAt = null;
        else if (core.isFolder(msg.path)) core.pickAt = msg.path;
        // The chooser opens on the folder in use; when that is not there yet, on the home folder.
        else if (core.pickAt === null) core.pickAt = app.getPath('home');
        else core.notify('That folder cannot be opened');
        core.layout();
        break;
      case 'captureButton':
        if (core.panel !== 'settings') break;
        core.capturing =
          typeof msg.action === 'string' && BUTTON_ACTIONS.some((a) => a.action === msg.action) ? msg.action : null;
        core.layout();
        break;
      case 'clearButtons':
        if (core.panel !== 'settings' || typeof msg.action !== 'string') break;
        if (core.deps.settings.set('keys', unmapButtons(core.config.keys, msg.action))) core.sendKeys();
        core.layout();
        break;
      case 'setting':
        if (core.panel !== 'settings' || typeof msg.name !== 'string') break;
        // Button mappings are set by pressing the button, not by a message naming it.
        if (msg.name === 'keys') break;
        if (msg.name === 'downloads' && msg.value !== null) {
          // A folder that is there and can be written to, or nothing changes.
          let usable = core.isFolder(msg.value);
          try {
            if (usable) accessSync(msg.value as string, fsConstants.W_OK);
          } catch {
            usable = false;
          }
          if (!usable) {
            core.notify('Files cannot be saved in that folder');
            break;
          }
          core.pickAt = null;
        }
        if (!core.deps.settings.set(msg.name, msg.value)) {
          core.notify('That setting could not be changed');
          break;
        }
        if (msg.name === 'pageSize') core.applyZoom();
        core.applyPrivacy();
        core.layout();
        break;
      case 'startsOff': {
        const domain = cleanDomain(msg.domain);
        if (core.panel !== 'settings' || (msg.op !== 'add' && msg.op !== 'toggle')) break;
        if (!domain) {
          core.notify('That is not a site name. Try something like example.com');
          break;
        }
        const next = editStartsOff(
          core.deps.adBlock.reviewed(),
          core.config.adBlockingStartsOff ?? [],
          core.config.adBlockingStartsOn ?? [],
          msg.op,
          domain,
        );
        core.deps.settings.set('adBlockingStartsOff', next.added.length ? next.added : null);
        core.deps.settings.set('adBlockingStartsOn', next.removed.length ? next.removed : null);
        core.layout();
        break;
      }
      case 'settingsAction':
        if (core.panel === 'settings' && SETTINGS_ACTIONS.includes(msg.action)) core.settingsAction(msg.action);
        break;
      case 'cancelDownload': {
        const d = core.downloads.find((x) => x.id === msg.id);
        if (core.panel === 'downloads' && d?.state === 'going') d.item.cancel();
        break;
      }
      case 'removeRecent':
        if (core.surface === 'home' && typeof msg.url === 'string' && core.recents.some((r) => r.url === msg.url)) {
          const name = siteName(msg.url);
          core.recents = removeRecent(core.recents, msg.url);
          core.saveRecents();
          core.panel = null;
          core.layout();
          core.notify(`Removed ${name} from Home`);
        }
        break;
      case 'removeApp':
        if (
          (core.surface === 'home' || core.panel === 'settings') &&
          typeof msg.id === 'string' &&
          core.apps.some((a) => a.id === msg.id)
        ) {
          // From Settings the screen stays open; from a Home tile the menu closes.
          if (core.panel !== 'settings') core.panel = null;
          core.removeAppById(msg.id);
          core.layout();
        }
        break;
      case 'edit':
        if (EDIT_ACTIONS.includes(msg.action)) core.editAction(msg.action);
        break;
      case 'addApp':
        if (core.panel === 'addApp' && core.surface === 'page') {
          void core.addCurrentAsApp({
            name: typeof msg.name === 'string' ? msg.name : '',
            ownSession: msg.ownSession === true,
            launcher: msg.launcher === true,
          });
        }
        break;
      case 'menu':
        if (MENU_ACTIONS.includes(msg.action)) core.menu(msg.action);
        break;
      case 'fillLogin': {
        const at = core.surface === 'page' ? core.page.getURL() : '';
        const user = msg.user;
        const to = core.page;
        if (!core.loginsOn() || typeof user !== 'string' || core.loginForms.get(to) !== at) break;
        core.panel = null;
        core.layout();
        void core.passwords.reveal(loginPlace(at), user).then((password) => {
          // Only into the page it was asked for, if that page is still the one there.
          if (password === null || to.isDestroyed() || to.getURL() !== at) return;
          to.send('longboard:fill', { user, password });
          core.notify("Filled in. Press the site's own button to sign in");
        });
        break;
      }
      case 'password':
        if (core.panel !== 'settings') break;
        if (msg.op === 'removeAll') core.passwords.removeAll();
        else if (msg.op === 'remove' && typeof msg.place === 'string' && typeof msg.user === 'string')
          core.passwords.remove(msg.place, msg.user);
        else if (msg.op === 'offerAgain' && typeof msg.place === 'string')
          core.passwords.setNever(
            core.passwords.never().find((n) => n.replace(/^https?:\/\//, '') === msg.place) ?? msg.place,
            false,
          );
        core.layout();
        break;
      case 'answer':
        // "Never for this site", said to keeping a password.
        if (msg.allow !== true && msg.never === true && core.pending?.what === 'password')
          core.passwords.setNever(core.pending.place, true);
        // A yes in the first moments of a question is not counted: a page can
        // time its request for when OK is about to be pressed for something else.
        if (msg.allow === true && Date.now() - core.promptShownAt < PROMPT_SETTLE_MS) break;
        // Back on the question is "not now": asked again another time.
        core.answerPrompt(msg.allow === true, msg.remember !== false);
        break;
      default:
        break;
    }
  };
  ipcMain.on('longboard:chrome', onChrome);
  return { onChrome };
}
