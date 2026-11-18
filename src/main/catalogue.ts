// Fetches the reviewed catalogue in the background: the index, then each
// profile it lists, each checked against the checksum the index gives. A
// failure of any kind leaves the copy already on disk untouched.
//
// This is one of the two background requests Longboard makes (Hard rule 12).
// It fetches the whole catalogue from one public address, at most once a day,
// with no cookies and nothing about the sites visited; `"catalogue": false`
// in config.json switches it off.
import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { checkDue, folderOf, parseIndex } from '../shared/catalogue';
import { validateProfile } from '../shared/profile';
import { readJson, writeJson } from './store';

const MAX_INDEX = 2_000_000;
const MAX_PROFILE = 200_000;

export interface CatalogueDeps {
  /** Where the catalogue is kept. */
  folder: string;
  indexUrl: string;
  /** Fetches an address and returns its bytes, or throws. */
  fetchBytes: (url: string, maxBytes: number) => Promise<Buffer>;
  now: () => number;
  note: (line: string) => void;
}

/**
 * Looks at the catalogue if it is due. Returns true when a new copy was put
 * in place. Never throws.
 */
export async function refreshCatalogue(deps: CatalogueDeps, force = false): Promise<boolean> {
  const stateFile = join(dirname(deps.folder), 'catalogue-state.json');
  const state = readJson(stateFile) as { checkedAt?: unknown } | undefined;
  if (!force && !checkDue(state?.checkedAt, deps.now())) return false;
  const fresh = `${deps.folder}.new`;
  try {
    const index = parseIndex(JSON.parse((await deps.fetchBytes(deps.indexUrl, MAX_INDEX)).toString('utf8')));
    if (!index) throw new Error('the index is not one this version understands');
    rmSync(fresh, { recursive: true, force: true });
    mkdirSync(join(fresh, 'profiles'), { recursive: true });
    let kept = 0;
    for (const entry of index.profiles) {
      const bytes = await deps.fetchBytes(new URL(entry.path, deps.indexUrl).toString(), MAX_PROFILE);
      if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) {
        deps.note(`catalogue: ${entry.path} does not match its checksum; left out`);
        continue;
      }
      const { profile, problems } = validateProfile(JSON.parse(bytes.toString('utf8')));
      if (!profile || profile.id !== entry.id) {
        deps.note(`catalogue: ${entry.path} is not a usable profile (${problems[0] ?? 'its id differs from the index'}); left out`);
        continue;
      }
      const dir = join(fresh, 'profiles', folderOf(entry));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'profile.json'), bytes);
      kept += 1;
    }
    writeFileSync(join(fresh, 'verified-sites.json'), `${JSON.stringify({ sites: index.verifiedSites }, null, 2)}\n`);
    // Swap the new copy in whole; the old one goes only after the new one is in place.
    const old = `${deps.folder}.old`;
    rmSync(old, { recursive: true, force: true });
    try {
      renameSync(deps.folder, old);
    } catch {
      // there was no earlier copy
    }
    renameSync(fresh, deps.folder);
    rmSync(old, { recursive: true, force: true });
    writeJson(stateFile, { checkedAt: deps.now() });
    deps.note(`catalogue: ${kept} profile(s), ${index.verifiedSites.length} verified site(s)`);
    return true;
  } catch (err) {
    rmSync(fresh, { recursive: true, force: true });
    deps.note(`catalogue: not updated (${String(err).slice(0, 160)}); keeping the copy on disk`);
    return false;
  }
}
