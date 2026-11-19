// Main process: start-up. The window and its views are in browser.ts.
import { app, nativeTheme, session } from 'electron';
import * as electron from 'electron';
import { join } from 'node:path';
import { parseConfig, type UserConfig } from '../shared/config';
import { resolveAddress } from '../shared/address';
import { DEFAULT_INDEX_URL } from '../shared/catalogue';
import { blockingMode, DEFAULT_FILTER_LISTS, effectiveVerified, parseVerified } from '../shared/adblock';
import { changeSetting, resetSettings } from '../shared/settings';
import { listsInUse } from '../shared/privacy';
import { RELEASE_FEED, updateMode, updateWords, type UpdateState } from '../shared/update';
import { Updater } from './update';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { FilterStore } from './adblock';
import { createBrowser } from './browser';
import { refreshCatalogue } from './catalogue';
import { ProfileStore } from './profiles';
import { readJson, writeJson } from './store';
import { browserUserAgent } from './useragent';

const argv = process.argv.slice(1);
const flag = (name: string): boolean => argv.includes(`--${name}`);
const value = (name: string): string | undefined =>
  argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const options = {
  dev: flag('dev'),
  automation: flag('automation'),
};

// castLabs builds add `components` (the Widevine component updater). Stock
// Electron lacks it, and then protected playback cannot work.
interface Components {
  whenReady(): Promise<unknown>;
  status(): unknown;
}
const components = (electron as unknown as { components?: Components }).components;

/** Reads <user data>/config.json. A missing file is normal; a broken one is reported and ignored. */
function loadConfig(): { config: UserConfig; raw: unknown } {
  const raw = readJson(join(app.getPath('userData'), 'config.json'), (why) => console.error(`[longboard] config.json could not be read: ${why}`));
  const { config, problems } = parseConfig(raw);
  for (const problem of problems) console.error(`[longboard] config.json: ${problem}`);
  return { config, raw };
}

/** The address to open at start: `--url=` or a bare address on the command line. Null shows Home. */
function startUrl(config: UserConfig): string | null {
  const given = value('url') ?? argv.find((a) => /^https?:\/\//i.test(a));
  return given ? resolveAddress(given, config.search) : null;
}

async function main(): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  // Before the browser starts: its switches cannot be changed afterwards.
  const loaded = loadConfig();
  const config = loaded.config;
  let rawConfig = loaded.raw;
  // The language sites are asked for, when the person chose one in Settings.
  // On Linux the browser takes its language from the environment, as every
  // program does, and reads it after this point; its own --lang switch is
  // not honoured there (both measured, 2026-11-18).
  if (config.language) process.env['LANGUAGE'] = config.language;
  if (config.hardwareDecode) {
    // Chromium's own switches for decoding video on the graphics chip on
    // Linux, which it does not promise to support. Off unless asked for.
    app.commandLine.appendSwitch('enable-features', 'AcceleratedVideoDecodeLinuxGL,AcceleratedVideoDecodeLinuxZeroCopyGL');
  }

  await app.whenReady();
  // Said once in the terminal, so "is the graphics chip decoding?" has an answer.
  void app
    .getGPUInfo('basic')
    .then(() => {
      const status = app.getGPUFeatureStatus() as unknown as Record<string, string>;
      console.log(`[longboard] video decode: ${status['video_decode'] ?? 'unknown'}${config.hardwareDecode ? ' (hardwareDecode is on)' : ''}`);
    })
    .catch(() => undefined);
  app.userAgentFallback = browserUserAgent(app.userAgentFallback);

  // Nothing but our two views is ever created; a page cannot embed another browser.
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

  const data = app.getPath('userData');
  const profiles = new ProfileStore({
    builtin: join(app.getAppPath(), 'profiles'),
    catalogue: join(data, 'catalogue'),
    local: join(data, 'profiles'),
    imported: join(data, 'imported'),
    exports: join(data, 'exports'),
    answers: join(data, 'imported-answers.json'),
  });
  console.log(`[longboard] profiles: ${profiles.count}`);

  // The window opens before the component is ready, never after: on a first
  // run the component is a download, and a slow one must not look like an
  // app that did not start. If it is still not ready after a while sites are
  // loaded anyway, so browsing works and the terminal says what is missing.
  const COMPONENT_WAIT_MS = 45_000;
  const componentsReady = (async (): Promise<void> => {
    let widevine: unknown = 'unavailable: not a castLabs Electron build';
    if (components) {
      try {
        const timedOut = await Promise.race([
          components.whenReady().then(() => false),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(true), COMPONENT_WAIT_MS)),
        ]);
        widevine = timedOut ? `not ready after ${COMPONENT_WAIT_MS / 1000} seconds; protected playback may fail` : components.status();
      } catch (err) {
        widevine = `component error: ${String(err)}`;
      }
    }
    console.log('[longboard] widevine component:', JSON.stringify(widevine));
  })();

  // Ad blocking (DESIGN.md section 5). The reviewed list of sites where it
  // starts off comes from the catalogue once that has been fetched, and until
  // then from the copy that ships with Longboard, so such a site never starts
  // with blocking on. The person's own changes to the list are in config.json.
  const readReviewed = (): string[] => {
    const fetched = readJson(join(data, 'catalogue', 'verified-sites.json'));
    return parseVerified(fetched ?? readJson(join(app.getAppPath(), 'profiles', 'verified-sites.json')));
  };
  let reviewed = readReviewed();
  let startsOff = effectiveVerified(reviewed, config.adBlockingStartsOff, config.adBlockingStartsOn);
  // Its own session, kept in memory: no cookies go out and none are kept.
  const fetcher = session.fromPartition('longboard-catalogue');
  const fetchBytes = async (url: string, maxBytes: number): Promise<Buffer> => {
    const response = await fetcher.fetch(url, { credentials: 'omit', cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new Error(`${response.status} for ${new URL(url).pathname}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error(`${new URL(url).pathname} is larger than expected`);
    return bytes;
  };
  const note = (line: string): void => console.log(`[longboard] ${line}`);
  // A scripted run uses the lists it is pointed at with --filters=, and fetches none otherwise.
  const filterStore = new FilterStore({
    folder: join(data, 'filters'),
    // Read each time: the person can ask in Settings for trackers to be refused too.
    get lists() {
      return value('filters') ? [value('filters') as string] : listsInUse(DEFAULT_FILTER_LISTS, config.filterLists, config.blockTrackers === true);
    },
    fetchBytes,
    now: () => Date.now(),
    note,
  });
  const mayFetchLists = (): boolean => !options.automation || value('filters') !== undefined;
  /** Gets the filters ready when ad blocking is in use: from disk, then from the publisher if the copy is old or `force`. */
  const readyFilters = async (force = false): Promise<boolean> => {
    if (blockingMode(config.adBlocking) === 'off') return false;
    if (!filterStore.filters) filterStore.load();
    return mayFetchLists() ? filterStore.refresh(force) : false;
  };
  if (blockingMode(config.adBlocking) !== 'off') filterStore.load();

  // The reviewed catalogue, fetched in the background and never in the way
  // of starting (DESIGN.md section 9). A scripted run does not fetch it
  // unless it is pointed at a catalogue of its own.
  const indexUrl = value('catalogue') ?? DEFAULT_INDEX_URL;
  const fetchCatalogue = async (force: boolean): Promise<boolean> => {
    if (options.automation && !value('catalogue')) return false;
    const changed = await refreshCatalogue({ folder: join(data, 'catalogue'), indexUrl, now: () => Date.now(), note, fetchBytes }, force);
    if (!changed) return false;
    profiles.load();
    reviewed = readReviewed();
    startsOff = effectiveVerified(reviewed, config.adBlockingStartsOff, config.adBlockingStartsOn);
    return true;
  };

  /** Writes config.json after a change made on the Settings screen, and puts the change into effect. */
  const saveConfig = (next: Record<string, unknown>): void => {
    rawConfig = next;
    writeJson(join(data, 'config.json'), next);
    const parsed = parseConfig(next).config;
    // The same object the rest of the shell holds, so everything sees the change.
    for (const key of Object.keys(config) as (keyof UserConfig)[]) delete config[key];
    Object.assign(config, parsed);
    startsOff = effectiveVerified(reviewed, config.adBlockingStartsOff, config.adBlockingStartsOn);
    nativeTheme.themeSource = config.theme ?? 'system';
    void readyFilters();
  };
  // The look sites are asked for (their dark or light one), when the person chose.
  nativeTheme.themeSource = config.theme ?? 'system';

  const feed = value('updates') ?? RELEASE_FEED;
  const updater = new Updater({
    current: app.getVersion(),
    feed,
    // Packages come from GitHub's release pages; a scripted run may also use the made-up host it points at.
    hosts: value('updates') ? ['github.com', new URL(feed).host] : ['github.com'],
    folder: data,
    // An AppImage says where its file is; no other kind of package can replace itself.
    target: process.env['APPIMAGE'] || null,
    arch: process.arch,
    fetchJson: async (url) => JSON.parse((await fetchBytes(url, 2_000_000)).toString('utf8')) as unknown,
    download: async (url, to, maxBytes) => {
      const response = await fetcher.fetch(url, { credentials: 'omit', cache: 'no-store' });
      if (!response.ok || !response.body) throw new Error(`${response.status} for the package`);
      const hash = createHash('sha256');
      const out = createWriteStream(to, { mode: 0o600 });
      let size = 0;
      try {
        const reader = response.body.getReader();
        for (;;) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          size += chunk.byteLength;
          if (size > maxBytes) throw new Error('the package is larger than the release says');
          hash.update(chunk);
          if (!out.write(chunk)) await new Promise<void>((resolve) => out.once('drain', () => resolve()));
        }
      } finally {
        await new Promise<void>((resolve) => out.end(() => resolve()));
      }
      return { size, sha256: hash.digest('hex') };
    },
    now: () => Date.now(),
    note,
  });

  const browser = createBrowser({
    options,
    config,
    startUrl: startUrl(config),
    startApp: value('app') ?? null,
    // For a scripted run on a machine with no network: the phone page is served on this machine's own address.
    phoneAt: value('phone-at') === '127.0.0.1' ? '127.0.0.1' : undefined,
    // A scripted run cannot scan the code on the screen, so it brings its own key. Never outside one.
    phoneKey: options.automation ? value('phone-key') : undefined,
    // Windowed while developing, so the desktop stays reachable.
    fullscreen: flag('fullscreen') || !options.dev,
    // Where files are saved: the desktop's Downloads folder, unless told otherwise.
    downloads: app.getPath('downloads'),
    downloadsFlag: value('downloads') || undefined,
    zoomOverride: value('zoom'),
    size: /^\d{3,5}x\d{3,5}$/.test(value('size') ?? '') ? (value('size') as string).split('x').map(Number) as [number, number] : undefined,
    ready: componentsReady,
    profiles,
    adBlock: {
      mode: () => blockingMode(config.adBlocking),
      filters: () => filterStore.filters,
      verified: () => startsOff,
      reviewed: () => reviewed,
      fetchedAt: () => filterStore.fetchedAt,
      refresh: () => readyFilters(true),
    },
    settings: {
      set: (name, value) => {
        const next = changeSetting(rawConfig, name, value);
        if (next) saveConfig(next);
        return next !== null;
      },
      reset: () => saveConfig(resetSettings(rawConfig)),
      refreshCatalogue: () => fetchCatalogue(true),
      update: () => ({ words: updateWords(app.getVersion(), updater.state, updateMode(config.updates)), mode: updateMode(config.updates), canInstall: updater.canInstall() }),
      lookForUpdate: () => lookForUpdate(true),
    },
  });
  void readyFilters(value('filters') !== undefined);
  if (config.catalogue !== false) void fetchCatalogue(value('catalogue') !== undefined);

  const { win } = browser;
  // Started again while already running (an entry in the TV's app list was
  // chosen): the window comes forward and opens what was asked for.
  app.on('second-instance', (_event, args) => {
    if (win.isMinimized()) win.restore();
    win.focus();
    const wantedApp = args.find((a) => a.startsWith('--app='))?.slice(6);
    const given = args.find((a) => a.startsWith('--url='))?.slice(6) ?? args.slice(1).find((a) => /^https?:\/\//i.test(a));
    const address = given ? resolveAddress(given, config.search) : null;
    if (wantedApp) browser.openApp(wantedApp);
    else if (address) browser.openAddress(address);
  });
  // New versions (shared/update.ts): looked for at start and once a day,
  // unless Settings says not to. A scripted run looks only when pointed at a
  // release feed of its own.
  const lookForUpdate = (force = false): Promise<UpdateState> => {
    const mode = updateMode(config.updates);
    if (mode === 'off' || (options.automation && !value('updates'))) return Promise.resolve(updater.state);
    return updater.check(mode === 'install', force);
  };
  void lookForUpdate(value('updates') !== undefined);
  setInterval(() => void lookForUpdate(), 60 * 60 * 1000).unref();

  // "Clear what sites stored when Longboard closes": done before the program goes, once.
  let cleared = false;
  app.on('before-quit', (event) => {
    if (cleared || config.clearOnExit !== true) return;
    event.preventDefault();
    cleared = true;
    void Promise.race([browser.clearSiteData(), new Promise((r) => setTimeout(r, 3000))]).finally(() => app.quit());
  });
  app.on('window-all-closed', () => app.quit());
}

void main();
