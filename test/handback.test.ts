import { describe, expect, it } from 'vitest';
import { DECLINED, handBackFrom, standInAt, STEAM, steamAccount, steamAnswer, steamStorePage, steamWho } from '../src/main/handback';

describe('what another program may ask Longboard to hand back', () => {
  it('is asked for by a known name and a whole path to a .json file', () => {
    expect(handBackFrom(['longboard', '--hand-back=steam-library', '--hand-back-to=/home/me/.cache/x/steam.json'])).toEqual({ what: 'steam-library', to: '/home/me/.cache/x/steam.json', at: STEAM });
  });

  it('is refused for a name not on the list, a relative path or another kind of file', () => {
    expect(handBackFrom(['--hand-back=cookies', '--hand-back-to=/tmp/a.json'])).toBeNull();
    expect(handBackFrom(['--hand-back=toString', '--hand-back-to=/tmp/a.json'])).toBeNull();
    expect(handBackFrom(['--hand-back=steam-library', '--hand-back-to=a.json'])).toBeNull();
    expect(handBackFrom(['--hand-back=steam-library', '--hand-back-to=/home/me/.bashrc'])).toBeNull();
    expect(handBackFrom(['--hand-back=steam-library'])).toBeNull();
    expect(handBackFrom(['--hand-back-to=/tmp/a.json'])).toBeNull();
    expect(handBackFrom([])).toBeNull();
  });
});

describe('pointing a scripted run at a stand-in for the site', () => {
  const args = ['--hand-back=steam-library', '--hand-back-to=/tmp/a.json', '--hand-back-site=http://127.0.0.1:4000/pretend'];

  it('is only for a scripted run: otherwise the addresses are Steam\'s own', () => {
    expect(handBackFrom(args)?.at).toEqual(STEAM);
    expect(handBackFrom(args, true)?.at).toEqual({ signIn: 'http://127.0.0.1:4000/pretend/login/', home: 'http://127.0.0.1:4000/pretend/', owned: 'http://127.0.0.1:4000/pretend/dynamicstore/userdata/' });
  });

  it('is only ever this machine\'s own address', () => {
    for (const base of ['https://example.org', 'http://127.0.0.1.example.org:80', 'http://localhost:4000', 'http://127.0.0.1:4000@example.org', 'http://127.0.0.1:4000/a?b', 'http://10.0.0.2:4000', undefined]) {
      expect(standInAt(base)).toBeNull();
    }
    const at = standInAt('http://127.0.0.1:4000/pretend');
    expect(at && steamStorePage('http://127.0.0.1:4000/pretend/', at)).toBe(true);
    expect(at && steamStorePage('http://127.0.0.1:4000/pretend/login/', at)).toBe(false);
    expect(at && steamStorePage('http://127.0.0.1:4001/pretend/', at)).toBe(false);
    expect(at && steamStorePage('https://store.steampowered.com/', at)).toBe(false);
  });
});

describe('reading who is signed in to Steam', () => {
  const page = (info: string): string => `<html><body><div id="application_config" data-config="{}" data-userinfo="${info.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" data-other="x"></div></body></html>`;

  it('finds the account number of a signed-in page', () => {
    expect(steamAccount(page('{"logged_in":true,"steamid":"76561198000000001","country_code":"CA"}'))).toBe('76561198000000001');
  });

  it('finds nobody on a signed-out page, a page without the element, or one that says odd things', () => {
    expect(steamAccount(page('{"logged_in":false,"country_code":"CA"}'))).toBeNull();
    expect(steamAccount('<html><body>Sign in</body></html>')).toBeNull();
    expect(steamAccount(page('{"logged_in":true,"steamid":"me"}'))).toBeNull();
    expect(steamAccount(page('{"logged_in":"true","steamid":"76561198000000001"}'))).toBeNull();
    expect(steamAccount(page('not json'))).toBeNull();
  });

  it('looks only once past the sign-in page of the store itself', () => {
    expect(steamStorePage('https://store.steampowered.com/')).toBe(true);
    expect(steamStorePage('https://store.steampowered.com/app/620/')).toBe(true);
    expect(steamStorePage('https://store.steampowered.com/login/?redir=')).toBe(false);
    expect(steamStorePage('http://store.steampowered.com/')).toBe(false);
    expect(steamStorePage('https://store.steampowered.com.example.org/')).toBe(false);
    expect(steamStorePage('https://steamcommunity.com/')).toBe(false);
    expect(steamStorePage('nonsense')).toBe(false);
  });
});

describe('the answer written to the file', () => {
  it('is the account number and the ids owned, and nothing else Steam said', () => {
    const said = { rgOwnedApps: [440, 570, 'x', -1, 1.5, 99999999999], rgWishlist: [1], rgOwnedPackages: [7] };
    expect(steamAnswer('76561198000000001', said)).toBe('{"steamid":"76561198000000001","owned":[440,570]}');
    expect(steamAnswer('76561198000000001', { rgOwnedApps: [] })).toBe('{"steamid":"76561198000000001","owned":[]}');
  });

  it('is nothing when Steam did not answer with a list', () => {
    expect(steamAnswer('76561198000000001', {})).toBeNull();
    expect(steamAnswer('76561198000000001', null)).toBeNull();
    expect(steamAnswer('76561198000000001', '<html>')).toBeNull();
    expect(steamAnswer('me', { rgOwnedApps: [] })).toBeNull();
  });

  it('says so when the person said no', () => {
    expect(DECLINED).toBe('{"declined":true}');
  });
});

describe('telling "nobody is signed in" from "this page can no longer be read"', () => {
  const page = (info: string): string => `<div id="application_config" data-config="{}" data-userinfo="${info.replace(/"/g, '&quot;')}"></div>`;
  it('says who is signed in, or that nobody is', () => {
    expect(steamWho(page('{"logged_in":true,"steamid":"76561198000000001"}'))).toEqual({ steamid: '76561198000000001' });
    expect(steamWho(page('{"logged_in":false,"country_code":"CA"}'))).toBe('nobody');
  });
  it('says so when the page does not say either in the way known here', () => {
    expect(steamWho('<html><body><div id="app"></div></body></html>')).toBe('unreadable');
    expect(steamWho('<div id="application_config" data-config="{}"></div>')).toBe('unreadable');
    expect(steamWho(page('not json'))).toBe('unreadable');
    expect(steamWho(page('{"logged_in":true}'))).toBe('unreadable');
    expect(steamWho(page('{"logged_in":true,"steamid":"me"}'))).toBe('unreadable');
    expect(steamWho(page('{"signedIn":true}'))).toBe('unreadable');
  });
});
