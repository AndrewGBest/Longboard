// The parental lock: which sites are allowed and when a PIN is asked for (shared/lock.ts decides).
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { noticePageUrl } from '../navigation';
import { readJson, writeJson } from '../store';
import { homeSites, onHomeSite, parseLock, type Lock } from '../../shared/lock';
import type { Core } from './core';
import { isNotice } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface LockPart {
  lock: Lock | null;
  /** True once the PIN has been given for browsing; until "Lock again" or the end of this run. */
  unlocked: boolean;
  pinFailures: number;
  pinNotBefore: number;
  /** What the PIN on screen is being asked for. `set` is the two entries of a new PIN. */
  pinFor:
    { title: string; note: string; then: () => void; back?: 'settings' } | { set: true; first: string | null } | null;
  saveLock: () => void;
  navRules: () => { automation: boolean; httpsOnly: boolean; onlySites: string[] | null; extensions: string[] };
  /**
   * Locking: a page that is not on one of Home's sites gives way to the
   * notice saying so, in every tab, and Back leads to nothing opened while
   * it was unlocked.
   */
  lockViews: () => void;
  /** Does `then` at once when there is no PIN, and after the PIN has been given when there is. */
  withPin: (title: string, then: () => void) => void;
  /** The same, for changes to what is on Home: asked for only while Home decides which sites open. */
  withPinForHome: (then: () => void) => void;
}

export function createLock(
  core: Core,
): Omit<LockPart, 'lock' | 'unlocked' | 'pinFailures' | 'pinNotBefore' | 'pinFor'> {
  const lockFile = join(core.dataDir, 'lock.json');
  core.lock = parseLock(readJson(lockFile, core.complain('lock.json')));
  /** True once the PIN has been given for browsing; until "Lock again" or the end of this run. */
  core.unlocked = false;
  core.pinFailures = 0;
  core.pinNotBefore = 0;
  /** What the PIN on screen is being asked for. `set` is the two entries of a new PIN. */
  core.pinFor = null;
  const saveLock = (): void => {
    if (core.lock) writeJson(lockFile, core.lock);
    else rmSync(lockFile, { force: true });
  };
  /** The sites that open without the PIN, or null when every site does. */
  const onlySites = (): string[] | null =>
    core.lock?.homeOnly && !core.unlocked ? homeSites([...core.apps, ...core.saved]) : null;
  const navRules = (): {
    automation: boolean;
    httpsOnly: boolean;
    onlySites: string[] | null;
    extensions: string[];
  } => ({
    automation: core.options.automation,
    httpsOnly: core.config.httpsOnly === true,
    onlySites: onlySites(),
    extensions: core.extensions.ids(),
  });
  /**
   * Locking: a page that is not on one of Home's sites gives way to the
   * notice saying so, in every tab, and Back leads to nothing opened while
   * it was unlocked.
   */
  const lockViews = (): void => {
    const sites = onlySites();
    if (!sites) return;
    for (const view of core.views.values()) {
      const wc = view.webContents;
      if (wc.isDestroyed()) continue;
      const url = wc.getURL();
      if (isNotice(url) || onHomeSite(url, sites)) {
        wc.navigationHistory.clear();
        continue;
      }
      void wc
        .loadURL(noticePageUrl('locked', url))
        .catch(() => undefined)
        .then(() => {
          if (!wc.isDestroyed()) wc.navigationHistory.clear();
        });
    }
  };
  /** Does `then` at once when there is no PIN, and after the PIN has been given when there is. */
  const withPin = (title: string, then: () => void): void => {
    if (!core.lock) return then();
    core.pinFor = { title, note: '', then };
    core.panel = 'pin';
    core.layout();
  };
  /** The same, for changes to what is on Home: asked for only while Home decides which sites open. */
  const withPinForHome = (then: () => void): void =>
    core.lock?.homeOnly && !core.unlocked ? withPin('Enter the PIN to change what is on Home', then) : then();
  return { saveLock, navRules, lockViews, withPin, withPinForHome };
}
