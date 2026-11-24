// The catalogue index: the one file Longboard downloads to learn which
// reviewed profiles exist and which sites are verified. Pure checks only; the
// downloading is in main/catalogue.ts.

export const INDEX_FORMAT = 1;
/** Where the reviewed catalogue is published (docs/PROFILES.md section 4). */
export const DEFAULT_INDEX_URL = 'https://raw.githubusercontent.com/AndrewGBest/Longboard-Profiles/main/index.json';
/** The catalogue is looked at no more often than this. */
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

export interface IndexEntry {
  id: string;
  version: string;
  /** Where the profile file is, relative to the index. */
  path: string;
  /** The SHA-256 of the profile file, in hex. */
  sha256: string;
}

export interface CatalogueIndex {
  profiles: IndexEntry[];
  verifiedSites: string[];
}

const PATH = /^profiles\/[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?\/profile\.json$/;
const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const MAX_ENTRIES = 5000;

/**
 * Checks a downloaded index. Null when it is not an index this version
 * understands; entries that are malformed are dropped. A path can only name
 * `profiles/<folder>/profile.json`, so an index cannot point anywhere else.
 */
export function parseIndex(raw: unknown): CatalogueIndex | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r['longboard-index'] !== INDEX_FORMAT || !Array.isArray(r['profiles'])) return null;
  const profiles: IndexEntry[] = [];
  const seen = new Set<string>();
  for (const item of r['profiles'].slice(0, MAX_ENTRIES)) {
    if (typeof item !== 'object' || item === null) continue;
    const e = item as Record<string, unknown>;
    if (typeof e['id'] !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e['id']) || seen.has(e['id'])) continue;
    if (typeof e['version'] !== 'string' || !/^\d+\.\d+\.\d+$/.test(e['version'])) continue;
    if (typeof e['path'] !== 'string' || !PATH.test(e['path']) || e['path'].includes('..')) continue;
    if (typeof e['sha256'] !== 'string' || !/^[0-9a-f]{64}$/.test(e['sha256'])) continue;
    seen.add(e['id']);
    profiles.push({ id: e['id'], version: e['version'], path: e['path'], sha256: e['sha256'] });
  }
  const verified = Array.isArray(r['verifiedSites'])
    ? r['verifiedSites'].filter((d): d is string => typeof d === 'string' && DOMAIN.test(d)).slice(0, MAX_ENTRIES)
    : [];
  return { profiles, verifiedSites: [...new Set(verified)] };
}

/** True when the catalogue should be looked at again. `last` is when it last was, or undefined. */
export function checkDue(last: unknown, now: number): boolean {
  return typeof last !== 'number' || !Number.isFinite(last) || now - last >= CHECK_EVERY_MS || last > now;
}

/** The folder a catalogue profile is kept in, taken from its path in the index. */
export function folderOf(entry: IndexEntry): string {
  return entry.path.split('/')[1] ?? '';
}
