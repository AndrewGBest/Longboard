// Web apps: a site added to Home and to the desktop's app list.
import { app, session } from 'electron';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { launchCommand, removeLauncher, writeLauncher } from '../../platform';
import { addApp, appPartition, launcherEntry, launcherFileName, removeApp, type WebApp } from '../../shared/apps';
import type { Core } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface AppsPart {
  /** Writes the app's entry in the desktop's app list. False when it could not be written. */
  writeAppLauncher: (item: WebApp) => boolean;
  /** Adds the site in front as an app (DESIGN.md 4.2). */
  addCurrentAsApp: (wanted: { name: string; ownSession: boolean; launcher: boolean }) => Promise<void>;
  /** Removes an app with its entry in the app list, its icon and, if it kept its own sign-ins, what it stored. */
  removeAppById: (id: string) => void;
  /** Opens an app by its id; false when there is none. */
  openApp: (id: string) => boolean;
}

export function createApps(core: Core): AppsPart {
  const writeAppLauncher = (item: WebApp): boolean => {
    // With no picture of the site, Longboard's own. A copy of it is kept in
    // the data folder: the one inside the package is at a path the desktop
    // cannot see (a Flatpak) or one that changes at every start (an AppImage).
    const fallbackIcon = join(core.iconsDir, 'longboard.png');
    if (!core.iconOf(item.id)) {
      try {
        mkdirSync(core.iconsDir, { recursive: true });
        copyFileSync(join(app.getAppPath(), 'assets', 'icon.png'), fallbackIcon);
      } catch {
        // The entry is written all the same; it will have no picture.
      }
    }
    const ownIcon = core.iconOf(item.id) ? join(core.iconsDir, `${item.id}.png`) : fallbackIcon;
    return writeLauncher(
      launcherFileName(item.id),
      launcherEntry(item, launchCommand(process.execPath, app.getAppPath(), app.isPackaged), ownIcon),
    );
  };
  // Entries are written again at every start: how this copy is started can
  // change (an AppImage moved, a different kind of package), and an entry
  // an older version wrote where no desktop looked is put right.
  for (const item of core.apps) if (item.launcher) writeAppLauncher(item);

  const addCurrentAsApp = async (wanted: { name: string; ownSession: boolean; launcher: boolean }): Promise<void> => {
    const url = core.page.getURL();
    const added = addApp(core.apps, { url, ...wanted });
    core.panel = null;
    if (!added) {
      core.layout();
      core.notify('This page cannot be added as an app');
      return;
    }
    core.apps = added.list;
    core.saveApps();
    const item = added.app;
    // The panel goes at once; the icon may take a moment to come.
    core.layout();
    const from = core.page;
    await core.saveIcon(item.id, await core.iconsFor(from), from.session);
    if (!core.apps.some((a) => a.id === item.id)) {
      // Removed again while its icon was on the way.
      rmSync(join(core.iconsDir, `${item.id}.png`), { force: true });
      core.iconData.delete(item.id);
      return;
    }
    let said = `Added "${item.name}" to Home`;
    if (item.launcher)
      said += writeAppLauncher(item) ? " and to the TV's app list" : ". It could not be put in the TV's app list";
    if (item.ownSession) said += '. Open it from Home to use its own sign-ins';
    core.layout();
    core.notify(said);
  };
  const removeAppById = (id: string): void => {
    const item = core.apps.find((a) => a.id === id);
    if (!item) return;
    core.apps = removeApp(core.apps, id);
    core.saveApps();
    removeLauncher(launcherFileName(id));
    rmSync(join(core.iconsDir, `${id}.png`), { force: true });
    core.iconData.delete(id);
    // What the app kept for itself goes with it.
    if (item.ownSession) {
      if (core.partition === appPartition(item)) {
        // Its view goes with it, so there is nothing left to show but Home.
        core.usePartition(core.lastTab);
        core.surface = 'home';
        core.panel = null;
        core.layout();
      }
      void session
        .fromPartition(appPartition(item))
        .clearStorageData()
        .catch(() => undefined);
    }
    core.notify(`Removed the app "${item.name}"`);
  };
  const openApp = (id: string): boolean => {
    const item = core.apps.find((a) => a.id === id);
    if (!item) return false;
    core.open(item.url, false, appPartition(item));
    return true;
  };
  return { writeAppLauncher, addCurrentAsApp, removeAppById, openApp };
}
