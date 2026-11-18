import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { refreshCatalogue } from '../src/main/catalogue';
import { CHECK_EVERY_MS, checkDue, folderOf, parseIndex } from '../src/shared/catalogue';

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const profile = (id: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ longboard: 1, id, name: id, version: '1.0.0', authors: ['a'], licence: 'CC0-1.0', match: { hosts: ['example.com'] }, evidence: { outline: 'outline.txt' }, ...extra });

describe('parseIndex', () => {
  const entry = { id: 'example', version: '1.0.0', path: 'profiles/example.com/profile.json', sha256: 'a'.repeat(64) };

  it('reads a good index', () => {
    expect(parseIndex({ 'longboard-index': 1, profiles: [entry], verifiedSites: ['example.com', 'example.com', 'Not A Domain'] })).toEqual({
      profiles: [entry],
      verifiedSites: ['example.com'],
    });
  });

  it('refuses another format outright', () => {
    for (const raw of [null, [], 'x', { 'longboard-index': 2, profiles: [] }, { profiles: [entry] }, { 'longboard-index': 1 }]) expect(parseIndex(raw)).toBeNull();
  });

  it('drops entries that are malformed or point anywhere but a profile file in the catalogue', () => {
    const bad = [
      { ...entry, path: '../../etc/passwd' },
      { ...entry, path: 'https://evil.test/profile.json' },
      { ...entry, path: 'profiles/example.com/../../x/profile.json' },
      { ...entry, path: 'profiles/example.com/other.json' },
      { ...entry, path: '/profiles/example.com/profile.json' },
      { ...entry, sha256: 'short' },
      { ...entry, version: 'new' },
      { ...entry, id: 'Bad Id' },
      'text',
    ];
    expect(parseIndex({ 'longboard-index': 1, profiles: bad })?.profiles).toEqual([]);
    expect(parseIndex({ 'longboard-index': 1, profiles: [entry, { ...entry }] })?.profiles).toHaveLength(1);
    expect(folderOf(entry)).toBe('example.com');
  });
});

describe('checkDue', () => {
  it('is due the first time, after a day, and when the clock has gone backwards', () => {
    expect(checkDue(undefined, 1000)).toBe(true);
    expect(checkDue('yesterday', 1000)).toBe(true);
    expect(checkDue(1000, 1000 + CHECK_EVERY_MS - 1)).toBe(false);
    expect(checkDue(1000, 1000 + CHECK_EVERY_MS)).toBe(true);
    expect(checkDue(5000, 1000)).toBe(true);
  });
});

describe('refreshCatalogue', () => {
  let dir: string;
  let notes: string[];
  let asked: string[];
  const indexUrl = 'https://catalogue.test/repo/index.json';
  const run = (files: Record<string, string>, now = 1_000_000, force = false): Promise<boolean> =>
    refreshCatalogue(
      {
        folder: join(dir, 'catalogue'),
        indexUrl,
        now: () => now,
        note: (line) => notes.push(line),
        fetchBytes: async (url) => {
          asked.push(url);
          const body = files[url];
          if (body === undefined) throw new Error(`404 for ${url}`);
          return Buffer.from(body);
        },
      },
      force,
    );
  const index = (entries: Array<{ id: string; folder: string; body: string; sha256?: string }>, verified: string[] = []): string =>
    JSON.stringify({
      'longboard-index': 1,
      profiles: entries.map((e) => ({ id: e.id, version: '1.0.0', path: `profiles/${e.folder}/profile.json`, sha256: e.sha256 ?? sha(e.body) })),
      verifiedSites: verified,
    });
  const at = (folder: string): string => `https://catalogue.test/repo/profiles/${folder}/profile.json`;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'longboard-catalogue-'));
    notes = [];
    asked = [];
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('downloads the index and each profile, checks each against its checksum, and keeps the good ones', async () => {
    const good = profile('good');
    const tampered = profile('tampered');
    const wrongId = profile('someone-else');
    const scripted = profile('scripted', { scripts: ['x'] });
    const changed = await run({
      [indexUrl]: index(
        [
          { id: 'good', folder: 'good.example', body: good },
          { id: 'tampered', folder: 'tampered.example', body: tampered, sha256: sha('what the index promised') },
          { id: 'renamed', folder: 'renamed.example', body: wrongId },
          { id: 'scripted', folder: 'scripted.example', body: scripted },
        ],
        ['example.com'],
      ),
      [at('good.example')]: good,
      [at('tampered.example')]: tampered,
      [at('renamed.example')]: wrongId,
      [at('scripted.example')]: scripted,
    });
    expect(changed).toBe(true);
    expect(readdirSync(join(dir, 'catalogue/profiles'))).toEqual(['good.example']);
    expect(readFileSync(join(dir, 'catalogue/profiles/good.example/profile.json'), 'utf8')).toBe(good);
    expect(JSON.parse(readFileSync(join(dir, 'catalogue/verified-sites.json'), 'utf8'))).toEqual({ sites: ['example.com'] });
    expect(notes.join('\n')).toMatch(/tampered\.example\/profile\.json does not match its checksum/);
    expect(notes.join('\n')).toMatch(/renamed\.example\/profile\.json is not a usable profile/);
    expect(notes.join('\n')).toMatch(/scripted\.example\/profile\.json is not a usable profile \(profiles cannot contain scripts/);
    expect(existsSync(join(dir, 'catalogue.new'))).toBe(false);
  });

  it('asks no more than once a day', async () => {
    const files = { [indexUrl]: index([]) };
    expect(await run(files, 1_000_000)).toBe(true);
    expect(await run(files, 1_000_000 + CHECK_EVERY_MS - 1)).toBe(false);
    expect(asked).toHaveLength(1);
    expect(await run(files, 1_000_000 + CHECK_EVERY_MS)).toBe(true);
    expect(await run(files, 1_000_000 + CHECK_EVERY_MS + 1, true)).toBe(true);
  });

  it('leaves the copy on disk alone when anything fails, and tries again next time', async () => {
    const good = profile('good');
    await run({ [indexUrl]: index([{ id: 'good', folder: 'good.example', body: good }]), [at('good.example')]: good });
    const later = 1_000_000 + CHECK_EVERY_MS;
    // The index is unreachable; then it is nonsense; then a profile it lists is missing.
    expect(await run({}, later)).toBe(false);
    expect(await run({ [indexUrl]: 'not json' }, later)).toBe(false);
    expect(await run({ [indexUrl]: index([{ id: 'gone', folder: 'gone.example', body: 'x' }]) }, later)).toBe(false);
    expect(readdirSync(join(dir, 'catalogue/profiles'))).toEqual(['good.example']);
    expect(existsSync(join(dir, 'catalogue.new'))).toBe(false);
    expect(notes.filter((n) => /not updated/.test(n))).toHaveLength(3);
    // Not marked as checked: the next start tries again.
    expect(asked.length).toBeGreaterThanOrEqual(5);
  });

  it('only ever asks for the index and for profile files beside it', async () => {
    const good = profile('good');
    await run({ [indexUrl]: index([{ id: 'good', folder: 'good.example', body: good }]), [at('good.example')]: good });
    expect(asked).toEqual([indexUrl, at('good.example')]);
  });
});
