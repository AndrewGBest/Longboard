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
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ElectronChromeExtensions } from 'electron-chrome-extensions';
import { downloadExtension, loadAllExtensions, uninstallExtension, updateExtensions } from 'electron-chrome-web-store';
import { extensionFacts, extensionName, isExtensionId, type ExtensionFacts } from '../shared/extensions';

export interface InstalledExtension extends ExtensionFacts {
  id: string;
  name: string;
  version: string;
}
/** An extension that has been downloaded and unpacked but not switched on: what the person is asked about. */
export interface DownloadedExtension extends InstalledExtension {
  path: string;
}

export interface ExtensionHooks {
  /** An extension asks for a page to be opened. */
  open: (url: string) => Electron.WebContents;
  window: () => Electron.BaseWindow;
  note: (line: string) => void;
}

export class Extensions {
  private readonly api: ElectronChromeExtensions;

  constructor(
    private readonly session: Electron.Session,
    private readonly folder: string,
    private readonly hooks: ExtensionHooks,
  ) {
    this.api = new ElectronChromeExtensions({
      session,
      createTab: async (details) => [hooks.open(details.url ?? 'about:blank'), hooks.window() as unknown as Electron.BrowserWindow],
      selectTab: () => undefined,
      removeTab: () => undefined,
    });
  }

  private describe(extension: { id: string; name: string; version: string; manifest: unknown }): InstalledExtension {
    return { id: extension.id, name: extensionName(extension.manifest) || extension.name, version: extension.version, ...extensionFacts(extension.manifest) };
  }

  /** Loads the extensions installed in earlier runs. Never throws. */
  async load(): Promise<void> {
    try {
      if (existsSync(this.folder)) await loadAllExtensions(this.session, this.folder);
    } catch (err) {
      this.hooks.note(`extensions: could not be loaded (${String(err).slice(0, 160)})`);
    }
  }

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
    if (wc.session === this.session) this.api.addTab(wc, this.hooks.window() as unknown as Electron.BrowserWindow);
  }
  selectTab(wc: Electron.WebContents): void {
    if (wc.session === this.session && !wc.isDestroyed()) this.api.selectTab(wc);
  }

  /** Fetches an extension from the store and unpacks it, without switching it on. Throws when it cannot be had. */
  async download(id: string): Promise<DownloadedExtension> {
    if (!isExtensionId(id)) throw new Error('not an extension');
    const path = await downloadExtension(id, this.folder);
    const manifest = JSON.parse(readFileSync(join(path, 'manifest.json'), 'utf8')) as Record<string, unknown>;
    let name = extensionName(manifest);
    if (!name) {
      // The name is a translation: taken from the extension's own default language.
      try {
        const words = JSON.parse(readFileSync(join(path, '_locales', String(manifest['default_locale'] ?? 'en'), 'messages.json'), 'utf8')) as Record<string, { message?: unknown }>;
        const key = /^__MSG_(.+)__$/.exec(String(manifest['name']))?.[1] ?? '';
        const found = Object.entries(words).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1]?.message;
        if (typeof found === 'string') name = found.replace(/\s+/g, ' ').trim().slice(0, 80);
      } catch {
        // left without a name
      }
    }
    return { id, path, name: name || id, version: String(manifest['version'] ?? '').slice(0, 40), ...extensionFacts(manifest) };
  }

  /** Switches on an extension that was downloaded, after the person agreed. */
  async enable(downloaded: DownloadedExtension): Promise<void> {
    const extension = await this.session.extensions.loadExtension(downloaded.path);
    const manifest = extension.manifest as { manifest_version?: number; background?: { service_worker?: string } };
    if (manifest.manifest_version === 3 && manifest.background?.service_worker) {
      // Refused when the worker is already on its way up, which is the usual case just after loading.
      await this.session.serviceWorkers.startWorkerForScope(`chrome-extension://${extension.id}`).catch(() => undefined);
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
