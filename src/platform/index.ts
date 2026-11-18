// Everything that differs between operating systems goes through here, so the
// rest of the app has no Linux-only assumptions (ARCHITECTURE.md section 8).
// Linux is the only system so far.
import { readdirSync, statSync } from 'node:fs';
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
