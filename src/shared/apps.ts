// Web apps: sites the person added so they open like apps (DESIGN.md 4.2).
// An app is a small record; the Home tile, the entry in the TV's app list and
// the optional separate session all follow from it. Pure, so the rules are
// unit-tested; the shell and the platform layer do the reading and writing.
import { siteKey } from './address';
import { PRODUCT } from './product';

export interface WebApp {
  /** Stable name for files and the command line: lower-case letters, digits and hyphens. */
  id: string;
  url: string;
  name: string;
  /** True when the app keeps its own sign-ins, apart from the rest of Longboard. */
  ownSession: boolean;
  /** True when it was also put in the TV's app list. */
  launcher: boolean;
}

export const MAX_APPS = 60;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const cleanName = (text: unknown): string => (typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) : '');

/** Validates the saved list. Anything unusable is dropped. */
export function parseApps(raw: unknown): WebApp[] {
  const list = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)['apps'] : null;
  if (!Array.isArray(list)) return [];
  const out: WebApp[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r['id'] !== 'string' || !ID.test(r['id']) || r['id'].length > 80 || out.some((a) => a.id === r['id'])) continue;
    if (typeof r['url'] !== 'string' || r['url'].length > 2000 || !siteKey(r['url'])) continue;
    out.push({ id: r['id'], url: r['url'], name: cleanName(r['name']) || siteKey(r['url'])!, ownSession: r['ownSession'] === true, launcher: r['launcher'] === true });
    if (out.length >= MAX_APPS) break;
  }
  return out;
}

/** An id for a new app, made from its site's name and unlike any in `taken`. */
export function newAppId(url: string, taken: readonly string[]): string {
  const base = (siteKey(url) ?? 'app').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'app';
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`;
}

/** The list with a new app at the end, and the app. Null when the address is not a web address or the list is full. */
export function addApp(list: readonly WebApp[], wanted: { url: string; name: string; ownSession: boolean; launcher: boolean }): { list: WebApp[]; app: WebApp } | null {
  const site = siteKey(wanted.url);
  if (!site || list.length >= MAX_APPS) return null;
  const app: WebApp = {
    id: newAppId(wanted.url, list.map((a) => a.id)),
    url: wanted.url,
    name: cleanName(wanted.name) || site,
    ownSession: wanted.ownSession,
    launcher: wanted.launcher,
  };
  return { list: [...list, app], app };
}

export function removeApp(list: readonly WebApp[], id: string): WebApp[] {
  return list.filter((a) => a.id !== id);
}

/** The app an address belongs to: the one for the same site. */
export function appFor(list: readonly WebApp[], url: string): WebApp | null {
  const site = siteKey(url);
  return site ? (list.find((a) => siteKey(a.url) === site) ?? null) : null;
}

/** The session an app's pages live in: its own, kept on disk, or "" for the one everything shares. */
export function appPartition(app: WebApp): string {
  return app.ownSession ? `persist:app-${app.id}` : '';
}

/** The file name of an app's entry in the desktop's app list. */
export function launcherFileName(id: string): string {
  return `${PRODUCT.appId}.app-${id}.desktop`;
}

/** One argument of an Exec line, quoted as the desktop entry specification asks. */
function execArg(arg: string): string {
  const doubled = arg.replace(/%/g, '%%');
  if (/^[A-Za-z0-9_\-+=./:@%,]+$/.test(doubled)) return doubled;
  return `"${doubled.replace(/(["`$\\])/g, '\\$1')}"`;
}

/**
 * The text of a desktop entry that opens an app. `command` is how this copy
 * of Longboard is started (the platform layer knows); `icon` is a file path
 * or an icon name.
 */
export function launcherEntry(app: WebApp, command: readonly string[], icon: string): string {
  const value = (text: string): string => text.replace(/\\/g, '\\\\').replace(/[\r\n]+/g, ' ');
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    `Name=${value(app.name)}`,
    `Comment=${value(`Opens ${siteKey(app.url) ?? 'a website'} in Longboard`)}`,
    `Exec=${[...command, `--app=${app.id}`].map(execArg).join(' ')}`,
    `Icon=${value(icon)}`,
    'Categories=Network;',
    'Terminal=false',
    '',
  ].join('\n');
}
