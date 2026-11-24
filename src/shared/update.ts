// New versions (Hard rule 14: a browser on an old engine is unsafe, and an
// update nobody receives protects nobody). Longboard asks GitHub once a day
// for its newest release and, when it runs as an AppImage, fetches it,
// checks it and puts it in place for the next start. Pure, so the rules are
// unit-tested; main/update.ts does the fetching and the file work.
//
// What is sent: one request to GitHub's public API for the release list of
// this project. No identifier, nothing about the person or the sites they
// visit. It is disclosed in Settings and can be turned off there (Hard rule 12).

/** Where the newest release is described. */
export const RELEASE_FEED = 'https://api.github.com/repos/AndrewGBest/Longboard/releases/latest';
/** GitHub is asked no more often than this. */
export const UPDATE_EVERY_MS = 24 * 60 * 60 * 1000;
/** A package is never bigger than this. */
export const MAX_PACKAGE_BYTES = 600_000_000;

/** "install": fetch and install new versions (the usual). "tell": only say there is one. "off": never ask. */
export type UpdateMode = 'install' | 'tell' | 'off';
export const UPDATE_MODES: readonly UpdateMode[] = ['install', 'tell', 'off'];
/** The mode config.json asks for; anything unknown is "install". */
export function updateMode(setting: unknown): UpdateMode {
  return setting === 'tell' || setting === 'off' ? setting : 'install';
}

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
  /** The file's SHA-256 as the release feed states it, in hex; null when the feed gives none. */
  sha256: string | null;
}
export interface Release {
  version: string;
  assets: ReleaseAsset[];
}

const VERSION = /^v?(\d{1,5})\.(\d{1,5})\.(\d{1,5})$/;

/** The three numbers of a version such as "1.4.0" or "v1.4.0"; null for anything else, pre-release names included. */
export function versionNumbers(text: unknown): [number, number, number] | null {
  const m = typeof text === 'string' ? VERSION.exec(text.trim()) : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True when `candidate` is a later version than `current`. Never true when either cannot be read. */
export function isNewer(candidate: unknown, current: unknown): boolean {
  const a = versionNumbers(candidate);
  const b = versionNumbers(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}

/**
 * A release as the feed describes it, checked. Drafts and pre-releases are
 * not releases. A file is taken only when its address is https on one of
 * `hosts` (GitHub's, or the made-up one a scripted run points at).
 */
export function parseRelease(raw: unknown, hosts: readonly string[]): Release | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r['draft'] === true || r['prerelease'] === true) return null;
  const numbers = versionNumbers(r['tag_name']);
  if (!numbers) return null;
  const assets: ReleaseAsset[] = [];
  for (const item of Array.isArray(r['assets']) ? r['assets'].slice(0, 100) : []) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    if (
      typeof a['name'] !== 'string' ||
      !/^[A-Za-z0-9._+-]{1,120}$/.test(a['name']) ||
      typeof a['browser_download_url'] !== 'string'
    )
      continue;
    if (
      typeof a['size'] !== 'number' ||
      !Number.isInteger(a['size']) ||
      a['size'] <= 0 ||
      a['size'] > MAX_PACKAGE_BYTES
    )
      continue;
    try {
      const u = new URL(a['browser_download_url']);
      if (!hosts.includes(u.host) || (u.protocol !== 'https:' && !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(u.host)))
        continue;
    } catch {
      continue;
    }
    const digest = typeof a['digest'] === 'string' ? /^sha256:([0-9a-f]{64})$/i.exec(a['digest']) : null;
    assets.push({
      name: a['name'],
      url: a['browser_download_url'],
      size: a['size'],
      sha256: digest ? digest[1]!.toLowerCase() : null,
    });
  }
  return { version: numbers.join('.'), assets };
}

/** The AppImage in a release for this kind of processor ("x64", "arm64"), or null when there is none. */
export function packageFor(release: Release, arch: string): ReleaseAsset | null {
  const names = arch === 'x64' ? ['x86_64', 'x64'] : arch === 'arm64' ? ['arm64', 'aarch64'] : [arch];
  return release.assets.find((a) => names.some((n) => a.name === `Longboard-${n}.AppImage`)) ?? null;
}

/** True when it is time to ask again. `last` is when it was last asked, or undefined. */
export function updateDue(last: unknown, now: number): boolean {
  return typeof last !== 'number' || !Number.isFinite(last) || now - last >= UPDATE_EVERY_MS || last > now;
}

/** What the last check found, as kept in update.json and said in Settings. */
export interface UpdateState {
  checkedAt?: number;
  /** A newer version that exists but is not installed. */
  available?: string;
  /** A newer version put in place, in use from the next start. */
  installed?: string;
}
export function parseUpdateState(raw: unknown): UpdateState {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: UpdateState = {};
  if (typeof r['checkedAt'] === 'number' && Number.isFinite(r['checkedAt'])) out.checkedAt = r['checkedAt'];
  if (versionNumbers(r['available'])) out.available = r['available'] as string;
  if (versionNumbers(r['installed'])) out.installed = r['installed'] as string;
  return out;
}

/** One line for Settings about where things stand. */
export function updateWords(current: string, state: UpdateState, mode: UpdateMode): string {
  if (state.installed && isNewer(state.installed, current))
    return `Version ${state.installed} is in place: close and open Longboard to use it.`;
  if (state.available && isNewer(state.available, current))
    return `Version ${state.available} is out. This copy cannot replace itself; get the new one where you got this one.`;
  if (mode === 'off') return 'New versions are not looked for.';
  return state.checkedAt !== undefined
    ? `Up to date when last looked, ${new Date(state.checkedAt).toISOString().slice(0, 10)}.`
    : 'Not looked yet.';
}
