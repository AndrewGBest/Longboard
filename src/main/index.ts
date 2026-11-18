// Main process: start-up. The window and its views are in browser.ts.
import { app, session } from 'electron';
import * as electron from 'electron';
import { join } from 'node:path';
import { parseConfig, type UserConfig } from '../shared/config';
import { resolveAddress } from '../shared/address';
import { DEFAULT_INDEX_URL } from '../shared/catalogue';
import { createBrowser } from './browser';
import { refreshCatalogue } from './catalogue';
import { ProfileStore } from './profiles';
import { readJson } from './store';
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
function loadConfig(): UserConfig {
  const raw = readJson(join(app.getPath('userData'), 'config.json'), (why) => console.error(`[longboard] config.json could not be read: ${why}`));
  const { config, problems } = parseConfig(raw);
  for (const problem of problems) console.error(`[longboard] config.json: ${problem}`);
  return config;
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
  const config = loadConfig();
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

  const win = createBrowser({
    options,
    config,
    startUrl: startUrl(config),
    // Windowed while developing, so the desktop stays reachable.
    fullscreen: flag('fullscreen') || !options.dev,
    zoomOverride: value('zoom'),
    size: /^\d{3,5}x\d{3,5}$/.test(value('size') ?? '') ? (value('size') as string).split('x').map(Number) as [number, number] : undefined,
    ready: componentsReady,
    profiles,
  });
  // The reviewed catalogue, in the background and never in the way of starting
  // (DESIGN.md section 9). A scripted run does not fetch it unless it is
  // pointed at a catalogue of its own.
  const indexUrl = value('catalogue') ?? DEFAULT_INDEX_URL;
  if (config.catalogue !== false && (!options.automation || value('catalogue'))) {
    // Its own session, kept in memory: no cookies go out and none are kept.
    const fetcher = session.fromPartition('longboard-catalogue');
    void refreshCatalogue(
      {
        folder: join(data, 'catalogue'),
        indexUrl,
        now: () => Date.now(),
        note: (line) => console.log(`[longboard] ${line}`),
        fetchBytes: async (url, maxBytes) => {
          const response = await fetcher.fetch(url, { credentials: 'omit', cache: 'no-store', redirect: 'error' });
          if (!response.ok) throw new Error(`${response.status} for ${new URL(url).pathname}`);
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length > maxBytes) throw new Error(`${new URL(url).pathname} is larger than expected`);
          return bytes;
        },
      },
      value('catalogue') !== undefined,
    ).then((changed) => {
      if (changed) profiles.load();
    });
  }

  app.on('second-instance', () => {
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on('window-all-closed', () => app.quit());
}

void main();
