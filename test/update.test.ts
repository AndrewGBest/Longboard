import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isNewer, packageFor, parseRelease, parseUpdateState, updateDue, UPDATE_EVERY_MS, updateMode, updateWords, versionNumbers } from '../src/shared/update';
import { Updater } from '../src/main/update';
import { parseConfig } from '../src/shared/config';

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const feed = (version: string, body: string, extra: Record<string, unknown> = {}) => ({
  tag_name: `v${version}`,
  assets: [
    { name: 'Longboard-x86_64.AppImage', browser_download_url: 'https://github.com/AndrewGBest/Longboard/releases/download/v9/Longboard-x86_64.AppImage', size: body.length, digest: `sha256:${sha(body)}` },
    { name: 'Longboard-x64.tar.gz', browser_download_url: 'https://github.com/AndrewGBest/Longboard/releases/download/v9/Longboard-x64.tar.gz', size: 10 },
  ],
  ...extra,
});

describe('versions', () => {
  it('are three numbers, and a later one is newer', () => {
    expect(versionNumbers('v1.20.3')).toEqual([1, 20, 3]);
    expect(isNewer('1.10.0', '1.9.9')).toBe(true);
    expect(isNewer('v2.0.0', '1.99.99')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.9.0', '1.0.0')).toBe(false);
  });
  it('anything else is never newer', () => {
    for (const bad of ['1.0', '1.0.0-beta.1', 'latest', '', null, 5, '1.0.0; rm -rf']) {
      expect(versionNumbers(bad)).toBeNull();
      expect(isNewer(bad, '0.0.1')).toBe(false);
    }
  });
});

describe('the release feed', () => {
  it('is read for its version and its files, with the checksum each states', () => {
    const release = parseRelease(feed('1.2.0', 'new'), ['github.com'])!;
    expect(release.version).toBe('1.2.0');
    expect(packageFor(release, 'x64')).toEqual({ name: 'Longboard-x86_64.AppImage', url: expect.stringContaining('https://github.com/'), size: 3, sha256: sha('new') });
    expect(release.assets[1]!.sha256).toBeNull();
    expect(packageFor(release, 'arm64')).toBeNull();
  });
  it('drafts, pre-releases and nonsense are not releases', () => {
    expect(parseRelease(feed('1.2.0', 'x', { draft: true }), ['github.com'])).toBeNull();
    expect(parseRelease(feed('1.2.0', 'x', { prerelease: true }), ['github.com'])).toBeNull();
    for (const bad of [null, 5, 'x', {}, { tag_name: 'nightly' }]) expect(parseRelease(bad, ['github.com'])).toBeNull();
  });
  it('a file is taken only from where releases live, over https', () => {
    const at = (url: string) => parseRelease({ tag_name: 'v2.0.0', assets: [{ name: 'Longboard-x86_64.AppImage', browser_download_url: url, size: 5 }] }, ['github.com'])!.assets.length;
    expect(at('https://github.com/a/b/releases/download/v2/x')).toBe(1);
    for (const url of ['http://github.com/a', 'https://github.com.evil.test/a', 'https://evil.test/a', 'file:///tmp/a', 'nonsense']) expect(at(url)).toBe(0);
  });
  it('is asked once a day', () => {
    expect(updateDue(undefined, 5)).toBe(true);
    expect(updateDue(1000, 1000 + UPDATE_EVERY_MS - 1)).toBe(false);
    expect(updateDue(1000, 1000 + UPDATE_EVERY_MS)).toBe(true);
  });
});

describe('the setting', () => {
  it('is to install unless told otherwise', () => {
    expect(updateMode(undefined)).toBe('install');
    expect(updateMode('tell')).toBe('tell');
    expect(updateMode('off')).toBe('off');
    expect(parseConfig({ updates: 'off' }).config.updates).toBe('off');
    expect(parseConfig({ updates: 'sometimes' }).problems.length).toBe(1);
  });
  it('is said in plain words', () => {
    expect(updateWords('1.0.0', { installed: '1.1.0' }, 'install')).toMatch(/1\.1\.0 is in place/);
    expect(updateWords('1.1.0', { installed: '1.1.0', checkedAt: 0 }, 'install')).toMatch(/^Up to date/);
    expect(updateWords('1.0.0', { available: '1.1.0' }, 'tell')).toMatch(/1\.1\.0 is out/);
    expect(updateWords('1.0.0', {}, 'off')).toBe('New versions are not looked for.');
    expect(parseUpdateState({ installed: 'x', available: '2.0.0', checkedAt: 'now' })).toEqual({ available: '2.0.0' });
  });
});

describe('installing a new version', () => {
  const make = (release: unknown, arrives: string, opts: { target?: boolean; current?: string } = {}) => {
    const folder = mkdtempSync(join(tmpdir(), 'longboard-update-'));
    const target = join(folder, 'Longboard.AppImage');
    writeFileSync(target, 'old');
    const notes: string[] = [];
    let asked = 0;
    const updater = new Updater({
      current: opts.current ?? '1.0.0',
      feed: 'https://feed.example/latest',
      hosts: ['github.com'],
      folder: join(folder, 'data'),
      target: opts.target === false ? null : target,
      arch: 'x64',
      fetchJson: async () => {
        asked += 1;
        if (release instanceof Error) throw release;
        return release;
      },
      download: async (_url, to) => {
        writeFileSync(to, arrives);
        return { size: arrives.length, sha256: sha(arrives) };
      },
      now: () => 1_000_000,
      note: (l) => notes.push(l),
    });
    return { updater, folder, target, notes, asked: () => asked };
  };
  it('puts a newer package that matches its checksum in place, leaving nothing else behind', async () => {
    const t = make(feed('1.1.0', 'the new one'), 'the new one');
    expect(await t.updater.check(true)).toEqual({ checkedAt: 1_000_000, installed: '1.1.0' });
    expect(readFileSync(t.target, 'utf8')).toBe('the new one');
    expect(readdirSync(t.folder).sort()).toEqual(['Longboard.AppImage', 'data']);
    // Not asked again until tomorrow, and not fetched twice.
    await t.updater.check(true);
    expect(t.asked()).toBe(1);
    expect((await t.updater.check(true, true)).installed).toBe('1.1.0');
  });
  it('leaves the copy in use alone when what arrives is not what the release describes', async () => {
    const t = make(feed('1.1.0', 'the new one'), 'something else');
    expect(await t.updater.check(true)).toEqual({ checkedAt: 1_000_000, available: '1.1.0' });
    expect(readFileSync(t.target, 'utf8')).toBe('old');
    expect(readdirSync(t.folder).sort()).toEqual(['Longboard.AppImage', 'data']);
    expect(t.notes.join()).toMatch(/could not be installed/);
  });
  it('does not install without a stated checksum, when only telling, or when it is not an AppImage', async () => {
    const noSum = feed('1.1.0', 'n');
    delete (noSum.assets[0] as Record<string, unknown>)['digest'];
    for (const t of [make(noSum, 'n'), make(feed('1.1.0', 'n'), 'n', { target: false })]) {
      expect((await t.updater.check(true)).available).toBe('1.1.0');
      expect(readFileSync(t.target, 'utf8')).toBe('old');
    }
    const telling = make(feed('1.1.0', 'n'), 'n');
    expect(await telling.updater.check(false)).toEqual({ checkedAt: 1_000_000, available: '1.1.0' });
    expect(readFileSync(telling.target, 'utf8')).toBe('old');
  });
  it('does nothing for the same or an older release, and survives a feed that cannot be read', async () => {
    for (const t of [make(feed('1.0.0', 'n'), 'n'), make(feed('0.9.0', 'n'), 'n'), make(new Error('offline'), 'n'), make({ message: 'Not Found' }, 'n')]) {
      expect(await t.updater.check(true)).toEqual({ checkedAt: 1_000_000 });
      expect(readFileSync(t.target, 'utf8')).toBe('old');
    }
  });
});
