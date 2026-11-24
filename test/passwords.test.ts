import { describe, expect, it } from 'vitest';
import {
  addLogin,
  cleanCredentials,
  emptyVault,
  listLogins,
  loginPlace,
  parseVault,
  removeLogin,
  setNever,
  shouldOffer,
  usersAt,
  MAX_LOGINS_PER_SITE,
} from '../src/shared/passwords';

describe('where a sign-in belongs', () => {
  it('is the scheme, the name and the port of a page sent privately', () => {
    expect(loginPlace('https://www.a.example/sign-in?next=/x')).toBe('https://www.a.example');
    expect(loginPlace('https://a.example:8443/x')).toBe('https://a.example:8443');
    expect(loginPlace('http://127.0.0.1:9000/form.html')).toBe('http://127.0.0.1:9000');
  });
  it('is nowhere for plain http, other schemes, or an address that carries a password', () => {
    for (const url of [
      'http://a.example/',
      'file:///etc/passwd',
      'data:text/html,x',
      'chrome-extension://abc/x.html',
      'https://me:secret@a.example/',
      'nonsense',
    ])
      expect(loginPlace(url)).toBeNull();
  });
  it('does not treat a name that ends the same as the same place', () => {
    expect(loginPlace('https://a.example.evil.test/')).not.toBe(loginPlace('https://a.example/'));
    expect(loginPlace('https://sub.a.example/')).not.toBe(loginPlace('https://a.example/'));
  });
});

describe('what a page says was typed', () => {
  it('is taken when it has the right shape', () => {
    expect(cleanCredentials({ user: '  me@a.example ', password: 'p w' })).toEqual({
      user: 'me@a.example',
      password: 'p w',
    });
    expect(cleanCredentials({ user: '', password: 'x' })).toEqual({ user: '', password: 'x' });
  });
  it('is refused otherwise', () => {
    for (const raw of [
      null,
      'x',
      {},
      { user: 'a' },
      { user: 'a', password: '' },
      { user: 'a', password: 5 },
      { user: 'a', password: 'x'.repeat(501) },
      { user: 'a'.repeat(201), password: 'x' },
      { user: 'a', password: 'x\ny' },
    ])
      expect(cleanCredentials(raw)).toBeNull();
  });
});

describe('the vault', () => {
  const place = 'https://a.example';
  it('keeps one sign-in for each user name at a place, newest first', () => {
    let v = addLogin(emptyVault(), place, 'one', 'QQ==', 1)!;
    v = addLogin(v, place, 'two', 'Qg==', 2)!;
    v = addLogin(v, place, 'one', 'Qw==', 3)!;
    expect(usersAt(v, place)).toEqual(['one', 'two']);
    expect(v.sites[place]![0]).toEqual({ user: 'one', secret: 'Qw==', at: 3 });
    expect(usersAt(v, 'https://b.example')).toEqual([]);
    expect(usersAt(v, null)).toEqual([]);
  });
  it('holds only so many at one place, and only at a real place', () => {
    let v = emptyVault();
    for (let i = 0; i < MAX_LOGINS_PER_SITE + 3; i++) v = addLogin(v, place, `u${i}`, 'QQ==', i)!;
    expect(usersAt(v, place)).toHaveLength(MAX_LOGINS_PER_SITE);
    expect(addLogin(emptyVault(), 'http://a.example', 'u', 'QQ==', 1)).toBeNull();
  });
  it('forgets one, and the place with its last', () => {
    let v = addLogin(emptyVault(), place, 'one', 'QQ==', 1)!;
    v = removeLogin(v, place, 'one');
    expect(v.sites).toEqual({});
  });
  it('remembers where never to offer, until something is saved there', () => {
    let v = setNever(emptyVault(), place, true);
    expect(v.never).toEqual([place]);
    expect(setNever(v, place, false).never).toEqual([]);
    v = addLogin(v, place, 'one', 'QQ==', 1)!;
    expect(v.never).toEqual([]);
  });
  it('reads its file back, dropping anything unusable', () => {
    const v = parseVault({
      sites: {
        'https://a.example': [
          { user: 'one', secret: 'QQ==', at: 5 },
          { user: 'one', secret: 'Qg==' },
          { user: 'bad', secret: 'not base64!' },
          'x',
        ],
        'http://plain.example': [{ user: 'u', secret: 'QQ==' }],
        'https://a.example/path': [{ user: 'u', secret: 'QQ==' }],
      },
      never: ['https://n.example', 'nonsense', 'https://n.example'],
    });
    expect(v).toEqual({
      sites: { 'https://a.example': [{ user: 'one', secret: 'QQ==', at: 5 }] },
      never: ['https://n.example'],
    });
    expect(parseVault(null)).toEqual(emptyVault());
    expect(parseVault({ sites: [] })).toEqual(emptyVault());
  });
  it('lists what is saved for Settings, without the secrets', () => {
    let v = addLogin(emptyVault(), 'https://b.example', 'bee', 'QQ==', 1)!;
    v = addLogin(v, 'https://a.example', 'ay', 'Qg==', 2)!;
    expect(listLogins(v)).toEqual([
      { place: 'https://a.example', site: 'a.example', user: 'ay' },
      { place: 'https://b.example', site: 'b.example', user: 'bee' },
    ]);
    expect(JSON.stringify(listLogins(v))).not.toContain('QQ==');
  });
});

describe('offering to keep a password', () => {
  const yes = {
    automation: false,
    privateTab: false,
    enabled: true,
    available: true,
    place: 'https://a.example',
    never: [],
    alreadyKept: false,
  };
  it('is done for an ordinary sign-in', () => expect(shouldOffer(yes)).toBe(true));
  it('is never done in a scripted run (Hard rule 10)', () =>
    expect(shouldOffer({ ...yes, automation: true })).toBe(false));
  it('is not done in a private tab, when turned off, without a keyring, off https, where told never, or when already kept', () => {
    expect(shouldOffer({ ...yes, privateTab: true })).toBe(false);
    expect(shouldOffer({ ...yes, enabled: false })).toBe(false);
    expect(shouldOffer({ ...yes, available: false })).toBe(false);
    expect(shouldOffer({ ...yes, place: null })).toBe(false);
    expect(shouldOffer({ ...yes, never: ['https://a.example'] })).toBe(false);
    expect(shouldOffer({ ...yes, alreadyKept: true })).toBe(false);
  });
});

import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Passwords, type Keyring } from '../src/main/passwords';

describe('the saved sign-ins on disk', () => {
  // A stand-in for the system's keyring: it turns the text round, which is enough to show nothing is written as typed.
  const keyring = (on = true): Keyring => ({
    available: async () => on,
    encrypt: async (t) => Buffer.from([...t].reverse().join(''), 'utf8'),
    decrypt: async (b) => [...b.toString('utf8')].reverse().join(''),
  });
  const file = (): string => join(mkdtempSync(join(tmpdir(), 'longboard-pw-')), 'passwords.json');
  const place = 'https://a.example';

  it('keeps a password encrypted, gives it back, and survives a restart', async () => {
    const at = file();
    const p = new Passwords(at, keyring());
    expect(await p.save(place, 'me', 'correct horse', 1)).toBe(true);
    expect(readFileSync(at, 'utf8')).not.toContain('correct horse');
    expect(statSync(at).mode & 0o077).toBe(0);
    const again = new Passwords(at, keyring());
    expect(again.users(place)).toEqual(['me']);
    expect(await again.reveal(place, 'me')).toBe('correct horse');
    expect(await again.reveal('https://b.example', 'me')).toBeNull();
    expect(await again.reveal(place, 'someone else')).toBeNull();
  });
  it('saves nothing, and gives nothing back, without a keyring', async () => {
    const at = file();
    expect(await new Passwords(at, keyring(false)).save(place, 'me', 'x', 1)).toBe(false);
    await new Passwords(at, keyring()).save(place, 'me', 'x', 1);
    expect(await new Passwords(at, keyring(false)).reveal(place, 'me')).toBeNull();
  });
  it('saves nothing when the keyring will not protect it', async () => {
    const at = file();
    const p = new Passwords(at, { ...keyring(), encrypt: async () => Promise.reject(new Error('not protected')) });
    expect(await p.save(place, 'me', 'x', 1)).toBe(false);
    expect(p.list()).toEqual([]);
  });
  it('removes one, and all', async () => {
    const p = new Passwords(file(), keyring());
    await p.save(place, 'one', 'x', 1);
    await p.save(place, 'two', 'y', 2);
    p.remove(place, 'one');
    expect(p.list()).toEqual([{ place, site: 'a.example', user: 'two' }]);
    p.setNever('https://n.example', true);
    p.removeAll();
    expect([p.list(), p.never()]).toEqual([[], []]);
  });
});
