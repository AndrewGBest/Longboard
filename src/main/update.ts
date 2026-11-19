// Fetching and installing a new version (shared/update.ts). The package is
// taken only when the release feed states its SHA-256 and the file that
// arrives has it. It then takes the place of the AppImage this copy was
// started from, in one step, and is used from the next start.
import { chmodSync, mkdirSync, renameSync, rmSync, statSync, accessSync, constants } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { isNewer, packageFor, parseRelease, parseUpdateState, updateDue, type UpdateState } from '../shared/update';
import { readJson, writeJson } from './store';

export interface UpdaterDeps {
  /** The version running now. */
  current: string;
  /** The address of the release feed, and the hosts a package may come from. */
  feed: string;
  hosts: readonly string[];
  /** Where update.json is kept. */
  folder: string;
  /** The AppImage this copy was started from, when it was started from one. */
  target: string | null;
  arch: string;
  fetchJson: (url: string) => Promise<unknown>;
  /** Fetches a file to `to`, giving up past `maxBytes`, and returns its size and SHA-256 in hex. */
  download: (url: string, to: string, maxBytes: number) => Promise<{ size: number; sha256: string }>;
  now: () => number;
  note: (line: string) => void;
}

export class Updater {
  private busy = false;
  constructor(private readonly deps: UpdaterDeps) {}

  private get file(): string {
    return join(this.deps.folder, 'update.json');
  }
  get state(): UpdateState {
    return parseUpdateState(readJson(this.file));
  }

  /** True when this copy can replace itself: it is an AppImage in a folder that can be written to. */
  canInstall(): boolean {
    const { target } = this.deps;
    if (!target) return false;
    try {
      if (!statSync(target).isFile()) return false;
      accessSync(dirname(target), constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Looks for a newer release if it is time (or `force`), and installs it
   * when `install` and this copy can. Never throws; a failure of any kind
   * leaves the copy in use as it was.
   */
  async check(install: boolean, force = false): Promise<UpdateState> {
    const { deps } = this;
    const before = this.state;
    if (this.busy || (!force && !updateDue(before.checkedAt, deps.now()))) return before;
    this.busy = true;
    const next: UpdateState = { ...before, checkedAt: deps.now() };
    try {
      const release = parseRelease(await deps.fetchJson(deps.feed), deps.hosts);
      if (!release || !isNewer(release.version, deps.current)) {
        delete next.available;
        return next;
      }
      if (before.installed === release.version) return next;
      next.available = release.version;
      const asset = packageFor(release, deps.arch);
      if (!install || !this.canInstall() || !asset) {
        deps.note(`update: version ${release.version} is out; not installed here`);
        return next;
      }
      if (!asset.sha256) {
        deps.note(`update: version ${release.version} is out, but the release does not state the package's checksum; not installed`);
        return next;
      }
      const target = deps.target as string;
      // Beside the file it will replace, so that taking its place is one step.
      const part = join(dirname(target), `.${basename(target)}.new`);
      try {
        mkdirSync(deps.folder, { recursive: true });
        const got = await deps.download(asset.url, part, asset.size);
        if (got.size !== asset.size || got.sha256 !== asset.sha256) throw new Error('the package that arrived is not the one the release describes');
        chmodSync(part, 0o755);
        renameSync(part, target);
        next.installed = release.version;
        delete next.available;
        deps.note(`update: version ${release.version} is in place for the next start`);
      } catch (err) {
        rmSync(part, { force: true });
        deps.note(`update: version ${release.version} could not be installed (${String(err).slice(0, 160)})`);
      }
      return next;
    } catch (err) {
      deps.note(`update: could not look for a new version (${String(err).slice(0, 160)})`);
      return next;
    } finally {
      this.busy = false;
      try {
        mkdirSync(deps.folder, { recursive: true });
        writeJson(this.file, next);
      } catch {
        // said again at the next check
      }
    }
  }
}
