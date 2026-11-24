// The profile store: the profiles on this machine, where each came from, and
// which one applies to an address. Every file is validated when it is read
// and a file with any problem is not used (shared/profile.ts).
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  chooseProfile,
  entryFor,
  exportName,
  importKey,
  validateProfile,
  type Profile,
  type ProfileChoice,
  type ProfileSource,
  type StoredProfile,
} from '../shared/profile';
import { readJson, writeJson } from './store';

/** Where each kind of profile is kept on disk. */
export interface ProfileFolders {
  /** Shipped with the app: `<folder>/<site>/profile.json`. */
  builtin: string;
  /** The downloaded catalogue: `<folder>/profiles/<site>/profile.json`. */
  catalogue: string;
  /** Made or edited on this machine: `<folder>/*.json`. */
  local: string;
  /** Given by someone else, not reviewed: `<folder>/*.json`. */
  imported: string;
  /** Where exported profiles are written. */
  exports: string;
  /** Answers to "use this imported profile?". */
  answers: string;
}

const MAX_FILE = 200_000;
const EXPORT_SUFFIX = '.longboard-profile.json';

/** The names in a folder, sorted, so the order profiles load in does not depend on the file system. Empty when there is no such folder. */
function listDir(dir: string): string[] {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

/** Reads and validates one profile file. Problems are reported and the file is left out. */
function readProfile(file: string, note: (line: string) => void): Profile | null {
  try {
    if (statSync(file).size > MAX_FILE) {
      note(`${file}: too large to be a profile; ignored`);
      return null;
    }
  } catch {
    return null;
  }
  const raw = readJson(file, (why) => note(`${file} could not be read: ${why}`));
  if (raw === undefined) return null;
  const { profile, problems } = validateProfile(raw);
  if (!profile) note(`${file} is not a usable profile: ${problems.slice(0, 5).join('; ')}`);
  return profile;
}

/**
 * What an answer about an imported profile is kept under: its name and
 * version, and a fingerprint of everything in it. A yes is a yes to that
 * file's contents; another file calling itself the same thing is asked about.
 */
export function answerKey(profile: Profile): string {
  return `${importKey(profile)}#${createHash('sha256').update(JSON.stringify(profile)).digest('hex').slice(0, 32)}`;
}

export class ProfileStore {
  private stored: StoredProfile[] = [];
  private answers: Record<string, 'yes' | 'no'> = {};
  /** Imported profiles turned down for now, until the app is next started. */
  private readonly later = new Set<string>();

  constructor(
    private readonly folders: ProfileFolders,
    private readonly note: (line: string) => void = (line) => console.error(`[longboard] ${line}`),
  ) {
    this.load();
  }

  /** Reads everything again from disk. */
  load(): void {
    const stored: StoredProfile[] = [];
    const add = (source: ProfileSource, file: string): void => {
      const profile = readProfile(file, this.note);
      if (profile) stored.push({ profile, source });
    };
    for (const name of listDir(this.folders.local))
      if (name.endsWith('.json')) add('local', join(this.folders.local, name));
    for (const name of listDir(this.folders.imported))
      if (name.endsWith('.json')) add('imported', join(this.folders.imported, name));
    for (const name of listDir(join(this.folders.catalogue, 'profiles')))
      add('catalogue', join(this.folders.catalogue, 'profiles', name, 'profile.json'));
    for (const name of listDir(this.folders.builtin)) add('builtin', join(this.folders.builtin, name, 'profile.json'));
    this.stored = stored;
    const saved = readJson(this.folders.answers);
    this.answers = {};
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const [key, value] of Object.entries(saved as Record<string, unknown>))
        if (value === 'yes' || value === 'no') this.answers[key] = value;
    }
  }

  get count(): number {
    return this.stored.length;
  }

  /** Which profile applies to an address (shared/profile.ts chooseProfile). */
  choose(url: string): ProfileChoice {
    const answers = { ...this.answers };
    for (const key of this.later) answers[key] ??= 'no';
    return chooseProfile(url, this.stored, answers, answerKey);
  }

  /** Where a site's front page is opened instead, when the profile in use there says so (shared/profile.ts entryFor). */
  entry(url: string): string | null {
    return entryFor(url, this.stored, (at) => {
      const choice = this.choose(at);
      return choice.kind === 'use' ? choice.profile : choice.kind === 'ask' ? (choice.fallback?.profile ?? null) : null;
    });
  }

  /** Records the answer to "use this imported profile?". `remember` false keeps it for this run only. */
  answer(profile: Profile, use: boolean, remember: boolean): void {
    const key = answerKey(profile);
    if (!remember) {
      if (!use) this.later.add(key);
      return;
    }
    this.answers[key] = use ? 'yes' : 'no';
    writeJson(this.folders.answers, this.answers);
  }

  /** Writes a profile as a single file anyone can be given. Returns where it went, or null. */
  exportProfile(profile: Profile): string | null {
    try {
      mkdirSync(this.folders.exports, { recursive: true });
      const file = join(this.folders.exports, exportName(profile));
      writeFileSync(file, `${JSON.stringify(profile, null, 2)}\n`);
      return file;
    } catch (err) {
      this.note(`could not export ${profile.id}: ${String(err).slice(0, 200)}`);
      return null;
    }
  }

  /**
   * Saves a profile made on this machine, with the page outline that is its
   * evidence beside it, and reads everything again. Returns where the profile
   * went, or null when it could not be written or is not valid.
   */
  saveLocal(profile: Profile, outline: string): string | null {
    const { profile: checked, problems } = validateProfile(profile);
    if (!checked) {
      this.note(`the edited profile is not valid and was not saved: ${problems.slice(0, 3).join('; ')}`);
      return null;
    }
    try {
      mkdirSync(this.folders.local, { recursive: true });
      writeFileSync(join(this.folders.local, checked.evidence.outline), outline);
      const file = join(this.folders.local, `${checked.id}.json`);
      writeFileSync(file, `${JSON.stringify(checked, null, 2)}\n`);
      this.load();
      return file;
    } catch (err) {
      this.note(`could not save ${checked.id}: ${String(err).slice(0, 200)}`);
      return null;
    }
  }

  /**
   * Copies profile files found at the top of `folders` into the imported
   * folder. Only files named `*.longboard-profile.json` are looked at, and
   * only valid ones are taken. Nothing imported is used until the person
   * says so. Returns the names of the profiles taken.
   */
  importFrom(folders: readonly string[]): string[] {
    const taken: string[] = [];
    for (const dir of folders) {
      for (const name of listDir(dir)) {
        if (!name.endsWith(EXPORT_SUFFIX)) continue;
        const profile = readProfile(join(dir, name), this.note);
        if (!profile) continue;
        try {
          mkdirSync(this.folders.imported, { recursive: true });
          copyFileSync(join(dir, name), join(this.folders.imported, `${profile.id}.json`));
          taken.push(profile.name);
        } catch (err) {
          this.note(`could not import ${name}: ${String(err).slice(0, 200)}`);
        }
      }
    }
    if (taken.length) this.load();
    return taken;
  }
}

/** How a profile's source is said on screen. */
export function sourceLabel(source: ProfileSource): string {
  return source === 'local'
    ? 'your own'
    : source === 'imported'
      ? 'imported, not reviewed'
      : source === 'catalogue'
        ? 'reviewed'
        : 'reviewed, built in';
}
