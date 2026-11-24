// The parental lock: a PIN the person sets, asked for before Settings is
// opened and, when they choose, before any site that is not on Home is. Pure,
// so the rules are unit-tested; main/lock.ts does the hashing and the shell
// keeps the file.
//
// What it is and is not: it keeps a child with the remote out of Settings and
// off the open web. It is not protection against someone with a keyboard and
// the files: deleting lock.json in Longboard's data folder removes the lock,
// which is also what to do when the PIN is forgotten.
import { siteKey } from './address';

export const PIN_LENGTH = 4;

/** The lock as kept on disk. The PIN itself is never kept: only a salted hash of it. */
export interface Lock {
  salt: string;
  hash: string;
  /** True when only the sites on Home (apps and saved pages) open without the PIN. */
  homeOnly: boolean;
}

const HEX = /^[0-9a-f]{32,128}$/;

/** Validates lock.json. Null when there is no usable lock in it. */
export function parseLock(raw: unknown): Lock | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['salt'] !== 'string' || typeof r['hash'] !== 'string' || !HEX.test(r['salt']) || !HEX.test(r['hash']))
    return null;
  return { salt: r['salt'], hash: r['hash'], homeOnly: r['homeOnly'] === true };
}

/** True for what a PIN is: exactly PIN_LENGTH digits. */
export function isPin(text: unknown): text is string {
  return typeof text === 'string' && text.length === PIN_LENGTH && /^\d+$/.test(text);
}

/**
 * How long, in milliseconds, before another try is taken after `failures`
 * wrong ones in a row. The first two cost nothing; after that guessing all
 * ten thousand would take weeks.
 */
export function waitAfter(failures: number): number {
  if (failures < 3) return 0;
  if (failures < 5) return 30_000;
  if (failures < 8) return 5 * 60_000;
  return 30 * 60_000;
}

/** The sites on Home, as the lock sees them: one name per app and saved page. */
export function homeSites(places: ReadonlyArray<{ url: string }>): string[] {
  return [...new Set(places.map((p) => siteKey(p.url)).filter((k): k is string => k !== null))];
}

/** True when an address is on one of the sites on Home, or on a name under one. Anything that is not a website is not. */
export function onHomeSite(url: string, sites: readonly string[]): boolean {
  const key = siteKey(url);
  return key !== null && sites.some((site) => key === site || key.endsWith(`.${site}`));
}
