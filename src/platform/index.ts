// Everything that differs between operating systems goes through here, so the
// rest of the app has no Linux-only assumptions (ARCHITECTURE.md section 8).
// Linux is the only system so far.
import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';

/** Folders where a USB stick or card shows up when it is plugged in. Missing ones are simply skipped. */
export function removableFolders(): string[] {
  if (process.platform !== 'linux') return [];
  let user = '';
  try {
    user = userInfo().username;
  } catch {
    // no user name: only the shared mount points are looked at
  }
  const parents = [user && join('/run/media', user), user && join('/media', user), '/media', '/mnt'].filter(Boolean) as string[];
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

/**
 * Where the desktop looks for entries in its app list that belong to this
 * user, or null where there is no such place. On Linux this is the
 * "applications" folder of the XDG data folder; Plasma Bigscreen and other
 * desktops read it.
 */
export function launcherFolder(): string | null {
  if (process.platform !== 'linux') return null;
  const data = process.env['XDG_DATA_HOME'] || (process.env['HOME'] ? join(process.env['HOME'], '.local', 'share') : '');
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
 * How this copy of Longboard is started, as a command line. An AppImage is
 * started by its own file, not by the program unpacked from it; a copy run
 * from source needs the folder it is run from.
 */
export function launchCommand(execPath: string, appPath: string, packaged: boolean): string[] {
  if (process.env['APPIMAGE']) return [process.env['APPIMAGE']];
  return packaged ? [execPath] : [execPath, appPath];
}
