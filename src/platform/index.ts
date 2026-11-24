// Everything that differs between operating systems goes through here, so the
// rest of the app has no Linux-only assumptions (ARCHITECTURE.md section 8).
// Linux is the only system so far.
import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';

/** Folders where a USB stick or card shows up when it is plugged in. Missing ones are skipped. */
export function removableFolders(): string[] {
  if (process.platform !== 'linux') return [];
  let user = '';
  try {
    user = userInfo().username;
  } catch {
    // no user name: only the shared mount points are looked at
  }
  const parents = [user && join('/run/media', user), user && join('/media', user), '/media', '/mnt'].filter(
    (folder): folder is string => Boolean(folder),
  );
  const out: string[] = [];
  for (const parent of parents) {
    try {
      for (const name of readdirSync(parent)) {
        const dir = join(parent, name);
        if (statSync(dir).isDirectory()) out.push(dir);
      }
    } catch {
      // not there, or not readable
    }
  }
  return out;
}

/** The name this copy runs under as a Flatpak, or null when it is not one. */
export function flatpakId(env: NodeJS.ProcessEnv = process.env): string | null {
  const id = env['FLATPAK_ID'];
  return id && /^[A-Za-z0-9_.-]+$/.test(id) ? id : null;
}

/**
 * Where the desktop looks for entries in its app list that belong to this
 * user, or null where there is no such place. On Linux this is the
 * "applications" folder of the XDG data folder; Plasma Bigscreen and other
 * desktops read it.
 *
 * A Flatpak is given a data folder of its own, which no desktop reads: an
 * entry written there shows up nowhere. So there the desktop's real folder
 * is used, which Flatpak names in HOST_XDG_DATA_HOME and which the package
 * asks to be let into (`--filesystem=xdg-data/applications:create`).
 */
export function launcherFolder(
  env: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
): string | null {
  if (platform !== 'linux') return null;
  const home = env['HOME'] ? join(env['HOME'], '.local', 'share') : '';
  const data = flatpakId(env) ? env['HOST_XDG_DATA_HOME'] || home : env['XDG_DATA_HOME'] || home;
  return data ? join(data, 'applications') : null;
}

/** Puts an entry in the app list. Returns false when it could not be written. */
export function writeLauncher(fileName: string, text: string): boolean {
  const folder = launcherFolder();
  if (!folder) return false;
  try {
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, fileName), text, { mode: 0o644 });
    return true;
  } catch {
    return false;
  }
}

/** Takes an entry out of the app list. One that is not there is not an error. */
export function removeLauncher(fileName: string): void {
  const folder = launcherFolder();
  if (!folder) return;
  try {
    unlinkSync(join(folder, fileName));
  } catch {
    // it was not there
  }
}

/**
 * How this copy of Longboard is started, as a command line. A Flatpak is
 * started by Flatpak, by name; an AppImage by its own file, not by the
 * program unpacked from it; a copy run from source needs the folder it is
 * run from.
 */
export function launchCommand(
  execPath: string,
  appPath: string,
  packaged: boolean,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  // A Flatpak's own program is a path inside its box that the desktop cannot run; Flatpak starts it by name.
  const flatpak = flatpakId(env);
  if (flatpak) return ['flatpak', 'run', flatpak];
  if (env['APPIMAGE']) return [env['APPIMAGE']];
  return packaged ? [execPath] : [execPath, appPath];
}
