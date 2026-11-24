// Browser extensions from the Chrome Web Store (shared/extensions.ts).
//
// Two open-source libraries do the work Electron leaves out: one downloads
// and unpacks an extension from the store's own download address, the other
// supplies the extension interfaces (tabs, toolbar buttons and the rest).
// Both are MIT licensed (docs/DECISIONS.md). What they put into pages of an
// extension's own is for that extension; nothing of theirs is exposed to
// websites (Hard rule 13).
//
// Extensions run in the session everything shares. A private tab, and an app
// that keeps its own sign-ins, have none.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import AdmZip from 'adm-zip';
import { ElectronChromeExtensions } from 'electron-chrome-extensions';
import { loadAllExtensions, uninstallExtension, updateExtensions } from 'electron-chrome-web-store';
import { extensionFacts, extensionName, isExtensionId, type ExtensionFacts } from '../shared/extensions';
import { openCrx } from './crx';

/** A manifest value as text; anything that is not text counts as missing. */
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** An extension as Settings lists it. */
export interface InstalledExtension extends ExtensionFacts {
  id: string;
  name: string;
  version: string;
}
/** An extension that has been downloaded and unpacked but not switched on: what the person is asked about. */
export interface DownloadedExtension extends InstalledExtension {
  path: string;
}

/** What the extensions need from the shell. */
export interface ExtensionHooks {
  /** An extension asks for a page to be opened. */
  open: (url: string) => Electron.WebContents;
  window: () => Electron.BaseWindow;
  note: (line: string) => void;
}

/** The most an extension may weigh as it comes from the store. */
const MAX_EXTENSION_BYTES = 120_000_000;

/** The extensions of one session: loading, downloading, switching on, removing and updating. */
export class Extensions {
  private readonly api: ElectronChromeExtensions;

  constructor(
    private readonly session: Electron.Session,
    private readonly folder: string,
    private readonly hooks: ExtensionHooks,
  ) {
    this.api = new ElectronChromeExtensions({
      session,
      createTab: (details) => Promise.resolve([hooks.open(details.url ?? 'about:blank'), hooks.window()]),
      selectTab: () => undefined,
      removeTab: () => undefined,
    });
    // After the library's own preload: gives `browser` what it gave `chrome` (src/extension/preload.ts).
    const fill = join(__dirname, 'extension-preload.js');
    session.registerPreloadScript({ id: 'longboard-extension-worker', type: 'service-worker', filePath: fill });
    session.registerPreloadScript({ id: 'longboard-extension-page', type: 'frame', filePath: fill });
  }

  private describe(extension: { id: string; name: string; version: string; manifest: unknown }): InstalledExtension {
    return {
      id: extension.id,
      name: extensionName(extension.manifest) || extension.name,
      version: extension.version,
      ...extensionFacts(extension.manifest),
    };
  }

  /** Loads the extensions installed in earlier runs. Never throws. */
  async load(): Promise<void> {
    try {
      if (existsSync(this.folder)) await loadAllExtensions(this.session, this.folder);
    } catch (err) {
      this.hooks.note(`extensions: could not be loaded (${String(err).slice(0, 160)})`);
    }
  }

  /** What is installed, in name order. */
  list(): InstalledExtension[] {
    return this.session.extensions
      .getAllExtensions()
      .map((e) => this.describe(e))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  ids(): string[] {
    return this.session.extensions.getAllExtensions().map((e) => e.id);
  }

  /** Tells the extension interfaces about a page view, and which one is in front. */
  addTab(wc: Electron.WebContents): void {
    if (wc.session === this.session) this.api.addTab(wc, this.hooks.window());
  }
  selectTab(wc: Electron.WebContents): void {
    if (wc.session === this.session && !wc.isDestroyed()) this.api.selectTab(wc);
  }

  /** Fetches an extension from the store and unpacks it, without switching it on. Throws when it cannot be had. */
  async download(id: string): Promise<DownloadedExtension> {
    if (!isExtensionId(id)) throw new Error('not an extension');
    const path = await this.fetchAndUnpack(id);
    const manifest = JSON.parse(readFileSync(join(path, 'manifest.json'), 'utf8')) as Record<string, unknown>;
    let name = extensionName(manifest);
    if (!name) {
      // The name is a translation: taken from the extension's own default language.
      try {
        const words = JSON.parse(
          readFileSync(join(path, '_locales', text(manifest['default_locale']) || 'en', 'messages.json'), 'utf8'),
        ) as Record<string, { message?: unknown }>;
        const key = /^__MSG_(.+)__$/.exec(String(manifest['name']))?.[1] ?? '';
        const found = Object.entries(words).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1]?.message;
        if (typeof found === 'string') name = found.replace(/\s+/g, ' ').trim().slice(0, 80);
      } catch {
        // left without a name
      }
    }
    return {
      id,
      path,
      name: name || id,
      version: text(manifest['version']).slice(0, 40),
      ...extensionFacts(manifest),
    };
  }

  /**
   * Fetches an extension from the store's own download address, checks that
   * it is signed by that extension's key (main/crx.ts), and unpacks it where
   * the library keeps extensions. Nothing is unpacked from a file that fails
   * the check. Throws, saying why, when anything is wrong.
   */
  private async fetchAndUnpack(id: string): Promise<string> {
    const url = new URL('https://clients2.google.com/service/update2/crx');
    url.searchParams.set('response', 'redirect');
    url.searchParams.set('acceptformat', 'crx3');
    url.searchParams.set('x', new URLSearchParams({ id, uc: '' }).toString());
    url.searchParams.set('prodversion', process.versions.chrome ?? '');
    const response = await this.session.fetch(url.toString(), { credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error(`the store answered ${response.status}`);
    const file = Buffer.from(await response.arrayBuffer());
    if (file.length > MAX_EXTENSION_BYTES) throw new Error('the extension is too big');
    const crx = openCrx(file, id);

    const zip = new AdmZip(crx.archive);
    const entries = zip.getEntries();
    if (entries.length > 20_000 || entries.reduce((n, e) => n + e.header.size, 0) > MAX_EXTENSION_BYTES * 4)
      throw new Error('the extension is too big');
    const home = join(this.folder, id);
    const fresh = join(home, `.new-${Date.now().toString(36)}`);
    rmSync(fresh, { recursive: true, force: true });
    try {
      for (const entry of entries) {
        // A name that would land outside the extension's own folder is refused, and the whole extension with it.
        const to = resolve(fresh, entry.entryName);
        if (!to.startsWith(fresh + sep)) throw new Error('the extension has a file that points outside itself');
        if (entry.isDirectory) mkdirSync(to, { recursive: true });
        else {
          mkdirSync(dirname(to), { recursive: true });
          writeFileSync(to, entry.getData());
        }
      }
      const manifestFile = join(fresh, 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as Record<string, unknown>;
      // The key is what gives the extension its id when it is loaded from a folder.
      manifest['key'] = crx.key;
      writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
      const version = text(manifest['version']);
      if (!/^[0-9.]{1,40}$/.test(version)) throw new Error('the extension has no version');
      const path = join(home, `${version}_0`);
      rmSync(path, { recursive: true, force: true });
      renameSync(fresh, path);
      return path;
    } catch (err) {
      rmSync(fresh, { recursive: true, force: true });
      throw err;
    }
  }

  /** Switches on an extension that was downloaded, after the person agreed. */
  async enable(downloaded: DownloadedExtension): Promise<void> {
    const extension = await this.session.extensions.loadExtension(downloaded.path);
    const manifest = extension.manifest as { manifest_version?: number; background?: { service_worker?: string } };
    if (manifest.manifest_version === 3 && manifest.background?.service_worker) {
      // Refused when the worker is already on its way up, which is the usual case just after loading.
      await this.session.serviceWorkers
        .startWorkerForScope(`chrome-extension://${extension.id}`)
        .catch(() => undefined);
    }
  }

  /** Throws away an extension that was downloaded and refused. */
  discard(downloaded: DownloadedExtension): void {
    // Its folder is <extensions>/<id>/<version>; an extension already in use under the same id is left alone.
    if (this.ids().includes(downloaded.id)) rmSync(downloaded.path, { recursive: true, force: true });
    else rmSync(dirname(downloaded.path), { recursive: true, force: true });
  }

  async remove(id: string): Promise<void> {
    if (isExtensionId(id)) await uninstallExtension(id, { session: this.session, extensionsPath: this.folder });
  }

  /** Asks the store for newer versions of what is installed. Never throws. */
  async update(): Promise<void> {
    try {
      if (this.ids().length) await updateExtensions(this.session);
    } catch (err) {
      this.hooks.note(`extensions: could not be updated (${String(err).slice(0, 160)})`);
    }
  }
}
