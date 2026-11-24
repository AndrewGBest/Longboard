// What Longboard's own screens are told to show: one state object, built from everything else.
import { app, net, type WebContents } from 'electron';
import { voiceModelSize } from '../../shared/voice';
import { loginPlace } from '../../shared/passwords';
import { HAND_BACKS } from '../handback';
import { readdirSync, statSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { siteName, DEFAULT_SEARCH } from '../../shared/address';
import { type ChromeState } from '../../shared/chrome';
import { EDIT_MARKS, hasMark, marksOf } from '../../shared/editor';
import { ASKABLE, describeAsk, type Askable } from '../permissions';
import { sizeText, progressText } from '../../shared/downloads';
import { sourceLabel } from '../profiles';
import { launcherFolder, removableFolders } from '../../platform';
import { appFor } from '../../shared/apps';
import { storeExtensionId } from '../../shared/extensions';
import { isVerified, startsOffEntries } from '../../shared/adblock';
import { BUTTON_ACTIONS, searchName } from '../../shared/settings';
import { canSuggest, parseSearchSuggestions, suggestAddress } from '../../shared/suggest';
import { visitLine } from '../../shared/history';
import { NEVER_ASKABLE } from '../../shared/config';
import type { Core } from './core';
import { isNotice } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface ChromeStatePart {
  /** Sends Longboard's own screens the state as it is now. */
  refreshChrome: () => void;
  offeredSearches: Set<string>;
  searchSuggestions: (typed: string) => Promise<string[]>;
  /** The pages that are still arriving: each is told, so it can show that, and the menu offers Stop. */
  arriving: WeakSet<Electron.WebContents>;
  /** The addresses of the tabs closed lately, newest last, so one can be opened again. Private tabs are never in it. */
  closedTabs: string[];
  chromeState: () => ChromeState;
  isFolder: (path: unknown) => path is string;
  active: () => WebContents;
}

export function createChromeState(core: Core): Omit<ChromeStatePart, 'offeredSearches'> {
  // On, the words typed in the address field go to the search site as they
  // are typed. Never an address, never from a private tab, with no cookies,
  // and only the newest question is waited for.
  core.offeredSearches = new Set<string>();
  let suggestAsk: AbortController | null = null;
  let suggestTimer: NodeJS.Timeout | undefined;
  const searchSuggestions = (typed: string): Promise<string[]> => {
    clearTimeout(suggestTimer);
    suggestAsk?.abort();
    suggestAsk = null;
    const at = core.isPrivate(core.partition)
      ? null
      : suggestAddress(typed, core.config.searchSuggestions, core.config.search ?? DEFAULT_SEARCH);
    if (!at) return Promise.resolve([]);
    const ask = (suggestAsk = new AbortController());
    return new Promise((resolve) => {
      // A short wait, so a word typed quickly is asked about once.
      suggestTimer = setTimeout(() => {
        const giveUp = setTimeout(() => ask.abort(), 2500);
        net
          .fetch(at, { credentials: 'omit', cache: 'no-store', redirect: 'error', signal: ask.signal })
          .then(async (response) =>
            response.ok ? parseSearchSuggestions(JSON.parse((await response.text()).slice(0, 20_000)), typed) : [],
          )
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
    surface: core.surface,
    panel: core.panel,
    cover: core.surface === 'page' && !core.panel ? core.covering : null,
    version: app.getVersion(),
    home: {
      apps: core.apps.map((a) => ({
        id: a.id,
        name: a.name,
        site: siteName(a.url),
        icon: core.iconOf(a.id),
        ownSession: a.ownSession,
      })),
      saved: core.saved.map((p) => ({ ...p, icon: core.iconOf(core.siteIconId(p.url)) })),
      privateTab: core.isPrivate(core.partition),
      recents: core.recents.map((r) => {
        const source = core.profileFor(r.url)?.source;
        return {
          ...r,
          icon: core.iconOf(core.siteIconId(r.url)),
          profile:
            source === 'local'
              ? ('own' as const)
              : source === 'catalogue' || source === 'builtin'
                ? ('reviewed' as const)
                : null,
        };
      }),
    },
    page: core.pageLoaded()
      ? {
          site: siteName(core.page.getURL()) || 'this page',
          title: isNotice(core.page.getURL()) ? '' : core.page.getTitle().slice(0, 120),
          canGoBack: core.backIndex() >= 0,
          canGoForward: core.page.navigationHistory.canGoForward(),
          loading: arriving.has(core.page),
          icon: core.iconOf(core.siteIconId(core.page.getURL())),
          zoomPercent: Math.round(core.siteZoom() * 100),
          pointer: core.pointerOn,
          profile: ((p) => (p ? `${p.profile.name} (${sourceLabel(p.source)})` : null))(
            core.profileFor(core.page.getURL()),
          ),
          answers: ((given) => {
            const said = (which: 'granted' | 'denied'): string =>
              (Object.keys(given) as Askable[])
                .filter((n) => given[n] === which)
                .map((n) => ASKABLE[n])
                .join(', ');
            const parts = [
              said('granted') && `Allowed to: ${said('granted')}`,
              said('denied') && `Not allowed to: ${said('denied')}`,
            ].filter(Boolean);
            return parts.length ? parts.join('. ') : null;
          })(core.sites[core.pageSite() ?? '']?.answers ?? {}),
          secure:
            /^https:/i.test(core.page.getURL()) || /^http:\/\/(localhost|127\.0\.0\.1)[:/]/i.test(core.page.getURL()),
          logins:
            core.loginsOn() && core.loginForms.get(core.page) === core.page.getURL()
              ? core.passwords.users(loginPlace(core.page.getURL()))
              : [],
          keepPassword: core.loginsOn() ? (core.typedNow(core.page)?.user ?? null) : null,
          saved: core.saved.some((p) => p.url === core.page.getURL()),
          storeExtension:
            storeExtensionId(core.page.getURL()) !== null &&
            !core.extensions.ids().includes(storeExtensionId(core.page.getURL()) ?? ''),
          desktop: core.sites[core.pageSite() ?? '']?.desktop === true,
          profileOff: core.sites[core.pageSite() ?? '']?.profile === false,
          adBlocking: ((key) => {
            if (!key) return null;
            const mode = core.deps.adBlock.mode();
            if (mode === 'off')
              return { on: false, locked: true, note: 'Ad blocking is off everywhere. Settings can turn it on.' };
            const on = core.blockingAt(core.page.getURL());
            const chosen = typeof core.sites[key]?.adBlocking === 'boolean';
            const count = core.refused.get(core.page) ?? 0;
            const note = !core.deps.adBlock.filters()
              ? 'The filter list has not been downloaded yet, so nothing is refused.'
              : on
                ? `${count === 1 ? '1 request' : `${count} requests`} refused on this page.`
                : !chosen && isVerified(key, core.deps.adBlock.verified())
                  ? 'Off to start with: this site is on the list of sites where it starts off.'
                  : 'Off for this site: your choice.';
            return { on, note, locked: false };
          })(core.pageSite()),
          app: ((a) => (a ? { id: a.id, name: a.name } : null))(appFor(core.apps, core.page.getURL())),
          canAddToAppList: launcherFolder() !== null,
        }
      : null,
    settings:
      core.panel !== 'settings'
        ? null
        : {
            search: searchName(core.config.search),
            searchTemplate: core.config.search ?? DEFAULT_SEARCH,
            startWith: core.config.startWith ?? 'home',
            searchSuggestions:
              core.config.searchSuggestions === true || typeof core.config.searchSuggestions === 'string',
            canSuggest: canSuggest(core.config.searchSuggestions, core.config.search ?? DEFAULT_SEARCH),
            pageSize: core.config.pageSize ?? 1,
            adBlocking: {
              mode: core.deps.adBlock.mode(),
              listUpdated: ((at) =>
                at === null ? 'not downloaded yet' : `downloaded ${new Date(at).toISOString().slice(0, 10)}`)(
                core.deps.adBlock.fetchedAt(),
              ),
              startsOff: startsOffEntries(
                core.deps.adBlock.reviewed(),
                core.config.adBlockingStartsOff,
                core.config.adBlockingStartsOn,
              ),
            },
            catalogue: core.config.catalogue !== false,
            profiles: core.deps.profiles.count,
            hardwareDecode: core.config.hardwareDecode === true,
            neverAsk: core.config.neverAsk ?? [],
            askable: NEVER_ASKABLE.map((name) => ({ name, words: ASKABLE[name] })),
            sitesWithChoices: Object.keys(core.sites).length,
            downloads: core.downloadsDir(),
            dataFolder: core.dataDir,
            httpsOnly: core.config.httpsOnly === true,
            extensions: core.extensions
              .list()
              .map((e) => ({ id: e.id, name: e.name, version: e.version, opens: e.options ?? e.popup })),
            extensionUpdates: core.config.extensionUpdates !== false,
            voiceModel: core.voice.modelReady(),
            passwords: {
              available: core.passwords.available(),
              offer: core.config.passwords !== false,
              logins: core.passwords.list(),
              never: core.passwords.never().map((n) => n.replace(/^https?:\/\//, '')),
            },
            update: core.deps.settings.update(),
            lock: core.lock ? { homeOnly: core.lock.homeOnly } : null,
            doNotTrack: core.config.doNotTrack === true,
            blockTrackers: core.config.blockTrackers === true,
            hideLocalAddress: core.config.hideLocalAddress === true,
            theme: core.config.theme ?? null,
            autoplay: core.config.autoplay !== false,
            clearOnExit: core.config.clearOnExit === true,
            history: core.config.history !== false,
            visits: core.visits.length,
            language: core.config.language ?? null,
            buttons: BUTTON_ACTIONS.map((a) => ({
              ...a,
              keys: Object.entries(core.config.keys)
                .filter(([, action]) => action === a.action)
                .map(([key]) => key),
            })),
            capturing: core.capturing,
            folders: core.pickAt === null ? null : foldersAt(core.pickAt),
          },
    tabs: core.tabPlaces().map((place) => {
      const wc = core.views.get(place)?.webContents;
      const url = wc && !wc.isDestroyed() ? wc.getURL() : '';
      const loaded = !isNotice(url);
      return {
        id: place,
        title: loaded && wc ? wc.getTitle().slice(0, 80) : '',
        site: loaded ? siteName(url) : '',
        current: place === core.partition,
        private: core.isPrivate(place),
      };
    }),
    history: core.panel === 'history' ? core.visits.map((v) => visitLine(v, Date.now())) : null,
    closedTabs: closedTabs.length,
    phoneOn: core.phone.on,
    phone: ((url) =>
      core.panel === 'phone' && url
        ? { url: url.replace(/#.*$/, ''), code: core.codeFor(url), connected: core.phone.connected }
        : null)(core.phone.url),
    downloads: core.downloads.map((d) => ({
      id: d.id,
      name: d.name,
      state: d.state === 'asking' ? ('going' as const) : d.state,
      progress: d.state === 'going' ? progressText(d.item.getReceivedBytes(), d.item.getTotalBytes()) : '',
    })),
    edit: !core.edit
      ? null
      : {
          site: core.edit.site,
          picked: ((step, e) =>
            step
              ? {
                  selector: step.selector,
                  matches: step.matches,
                  canWiden: e.level < e.chain.length - 1,
                  canNarrow: e.level > 0,
                  marks: {
                    include: hasMark(e.draft, 'include', step.selector),
                    exclude: hasMark(e.draft, 'exclude', step.selector),
                    row: hasMark(e.draft, 'row', step.selector),
                    player: hasMark(e.draft, 'player', step.selector),
                  },
                }
              : null)(core.edit.chain[core.edit.level], core.edit),
          marked: ((m) => EDIT_MARKS.reduce((n, mark) => n + m[mark].length, 0))(marksOf(core.edit.draft)),
        },
    reader: core.panel === 'reader' ? core.reading : null,
    lock: core.lock ? { homeOnly: core.lock.homeOnly, unlocked: core.unlocked } : null,
    pin:
      core.panel !== 'pin' || !core.pinFor
        ? null
        : 'set' in core.pinFor
          ? {
              title: core.pinFor.first === null ? 'Choose a PIN: four digits' : 'Enter the same PIN again',
              note: `If the PIN is forgotten, deleting lock.json in ${core.dataDir} removes the lock.`,
              waitSeconds: 0,
            }
          : {
              title: core.pinFor.title,
              note: core.pinFor.note,
              waitSeconds: Math.max(0, Math.ceil((core.pinNotBefore - Date.now()) / 1000)),
            },
    prompt: !core.pending
      ? null
      : core.pending.what === 'profile'
        ? {
            what: 'profile',
            name: core.pending.profile.name,
            version: core.pending.profile.version,
            hosts: core.pending.profile.match.hosts.slice(0, 6),
          }
        : core.pending.what === 'extension'
          ? {
              what: 'extension',
              name: core.pending.extension.name,
              version: core.pending.extension.version,
              can: core.pending.extension.can,
              cannot: core.pending.extension.cannot,
            }
          : core.pending.what === 'handBack'
            ? {
                what: 'handBack',
                site: HAND_BACKS[core.pending.ask.what].site,
                wants: HAND_BACKS[core.pending.ask.what].wants,
                to: core.pending.ask.to,
              }
            : core.pending.what === 'voiceModel'
              ? { what: 'voiceModel', size: voiceModelSize() }
              : core.pending.what === 'password'
                ? { what: 'password', site: core.pending.place.replace(/^https?:\/\//, ''), user: core.pending.user }
                : core.pending.what === 'download'
                  ? {
                      what: 'download',
                      site: core.pending.download.site,
                      name: core.pending.download.name,
                      size: sizeText(core.pending.download.item.getTotalBytes()),
                      folder: core.downloadsDir(),
                    }
                  : { what: 'permission', site: core.pending.site, wants: describeAsk(core.pending.names) },
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
    const places = [
      { name: 'Home folder', path: app.getPath('home') },
      { name: 'Downloads', path: core.deps.downloads },
      ...removableFolders().map((p) => ({ name: `USB: ${basename(p)}`, path: p })),
    ];
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

  const active = (): WebContents => (core.surface === 'home' || core.panel ? core.chrome : core.page);
  /** Sends Longboard's own screens the state as it is now. */
  const refreshChrome = (): void => {
    if (!core.chrome.isDestroyed()) core.chrome.send('longboard:chrome-state', chromeState());
  };
  return { searchSuggestions, arriving, closedTabs, chromeState, isFolder, active, refreshChrome };
}
