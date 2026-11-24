import { describe, expect, it } from 'vitest';
import {
  changeSetting,
  LANGUAGE_CHOICES,
  mapButton,
  resetSettings,
  searchName,
  SEARCH_CHOICES,
  unmapButtons,
} from '../src/shared/settings';
import { parseConfig } from '../src/shared/config';
import {
  blockingMode,
  blockingOn,
  cleanDomain,
  editStartsOff,
  effectiveVerified,
  startsOffEntries,
} from '../src/shared/adblock';
import { permissionDecision } from '../src/main/permissions';
import { isSearchTemplate } from '../src/shared/address';

describe('changing a setting', () => {
  const file = { keys: { F9: 'menu' }, search: 'https://duckduckgo.com/?q=%s', somethingNewer: 1 };

  it('changes that setting and keeps everything else in the file', () => {
    expect(changeSetting(file, 'startWith', 'last')).toEqual({ ...file, startWith: 'last' });
    expect(changeSetting(undefined, 'adBlocking', 'everywhere')).toEqual({ adBlocking: 'everywhere' });
    expect(changeSetting('not a file', 'pageSize', 1.25)).toEqual({ pageSize: 1.25 });
  });
  it('puts a setting back to the usual with null', () => {
    expect(changeSetting(file, 'search', null)).toEqual({ keys: { F9: 'menu' }, somethingNewer: 1 });
  });
  it('refuses a value the setting cannot take', () => {
    expect(changeSetting(file, 'startWith', 'elsewhere')).toBeNull();
    expect(changeSetting(file, 'search', 'http://insecure.example/?q=%s')).toBeNull();
    expect(changeSetting(file, 'search', 'javascript:alert(1)')).toBeNull();
    expect(changeSetting(file, 'pageSize', 40)).toBeNull();
    expect(changeSetting(file, 'adBlocking', 'sometimes')).toBeNull();
    expect(changeSetting(file, 'adBlockingStartsOff', ['not a domain'])).toBeNull();
    expect(changeSetting(file, 'neverAsk', ['camera', 'everything'])).toBeNull();
    expect(changeSetting(file, 'catalogue', 'yes')).toBeNull();
  });
  it('refuses anything that is not a setting of the screen', () => {
    for (const name of ['buttons', 'filterLists', 'zoom', '__proto__', 'constructor', '', 5, null]) {
      expect(changeSetting(file, name, {}), String(name)).toBeNull();
    }
  });
  it('what it writes is a file Longboard reads without complaint', () => {
    const next = changeSetting(changeSetting({}, 'neverAsk', ['camera', 'location']), 'adBlockingStartsOff', [
      'example.com',
    ]);
    expect(parseConfig(next)).toMatchObject({
      problems: [],
      config: { neverAsk: ['camera', 'location'], adBlockingStartsOff: ['example.com'] },
    });
  });
  it('resetting takes out the settings and keeps the key mappings', () => {
    expect(resetSettings({ ...file, adBlocking: 'off', pageSize: 1.5, neverAsk: ['camera'] })).toEqual({
      keys: { F9: 'menu' },
      somethingNewer: 1,
    });
  });
});

describe('the search engines offered', () => {
  it('are all usable search addresses, with Google the usual one', () => {
    for (const c of SEARCH_CHOICES) expect(isSearchTemplate(c.template), c.name).toBe(true);
    expect(searchName(undefined)).toBe('Google');
    expect(searchName('https://duckduckgo.com/?q=%s')).toBe('DuckDuckGo');
    expect(searchName('https://www.search.example/find?q=%s')).toBe('search.example');
  });
});

describe('ad blocking over all sites', () => {
  const verified = ['video.example'];
  it('"off" refuses nothing anywhere, whatever a site is set to', () => {
    expect(blockingOn('news.example', undefined, verified, 'off')).toBe(false);
    expect(blockingOn('news.example', true, verified, 'off')).toBe(false);
  });
  it('"everywhere" ignores the list of sites where it starts off', () => {
    expect(blockingOn('video.example', undefined, verified, 'everywhere')).toBe(true);
    expect(blockingOn('news.example', undefined, verified, 'everywhere')).toBe(true);
  });
  it("but not a site's own switch that the person turned off", () => {
    expect(blockingOn('video.example', false, verified, 'everywhere')).toBe(false);
  });
  it('"sites" is each site\'s own switch, and is what Longboard ships with', () => {
    expect(blockingOn('video.example', undefined, verified, 'sites')).toBe(false);
    expect(blockingOn('video.example', undefined, verified)).toBe(false);
    expect(blockingMode(undefined)).toBe('sites');
    expect(parseConfig({}).config.adBlocking).toBeUndefined();
  });
  it('reads the setting, old form included', () => {
    expect(blockingMode(false)).toBe('off');
    expect(blockingMode(true)).toBe('sites');
    expect(blockingMode('everywhere')).toBe('everywhere');
    expect(blockingMode('nonsense')).toBe('sites');
    expect(parseConfig({ adBlocking: false }).config.adBlocking).toBe('off');
  });
});

describe('editing the list of sites where ad blocking starts off', () => {
  const reviewed = ['clips.example', 'video.example'];
  it("shows the reviewed sites and the person's own, in order", () => {
    expect(startsOffEntries(reviewed, ['blog.example'], ['video.example'])).toEqual([
      { domain: 'blog.example', from: 'you', off: true },
      { domain: 'clips.example', from: 'reviewed', off: true },
      { domain: 'video.example', from: 'reviewed', off: false },
    ]);
    expect(effectiveVerified(reviewed, ['blog.example'], ['video.example'])).toEqual(['blog.example', 'clips.example']);
  });
  it("adds a site, and takes the person's own site away again when pressed", () => {
    const one = editStartsOff(reviewed, [], [], 'add', 'blog.example');
    expect(one).toEqual({ added: ['blog.example'], removed: [] });
    expect(editStartsOff(reviewed, one.added, one.removed, 'toggle', 'blog.example')).toEqual({
      added: [],
      removed: [],
    });
  });
  it('takes a reviewed site off when pressed, and puts it back when pressed again or added', () => {
    const off = editStartsOff(reviewed, [], [], 'toggle', 'video.example');
    expect(off).toEqual({ added: [], removed: ['video.example'] });
    expect(editStartsOff(reviewed, [], off.removed, 'toggle', 'video.example')).toEqual({ added: [], removed: [] });
    expect(editStartsOff(reviewed, [], off.removed, 'add', 'video.example')).toEqual({ added: [], removed: [] });
  });
  it('reads a site as a person would type it', () => {
    expect(cleanDomain(' WWW.Example.com ')).toBe('example.com');
    expect(cleanDomain('https://video.example.org/watch?v=1')).toBe('video.example.org');
    expect(cleanDomain('example.com:8443')).toBe('example.com');
    for (const bad of ['', 'localhost', 'not a site', 'http://', '*.example.com', 5, null, 'a'.repeat(400)])
      expect(cleanDomain(bad)).toBeNull();
  });
});

describe('kinds of access no site may ask for', () => {
  it('are refused without a question, and without touching what a site was already told', () => {
    expect(permissionDecision('geolocation', undefined, [], ['location'])).toEqual({ kind: 'deny' });
    expect(permissionDecision('media', undefined, ['video', 'audio'], ['microphone'])).toEqual({ kind: 'deny' });
    expect(permissionDecision('media', { answers: { camera: 'granted' } }, ['video'], ['camera'])).toEqual({
      kind: 'deny',
    });
    expect(permissionDecision('notifications', undefined, [], ['location'])).toEqual({
      kind: 'ask',
      names: ['notifications'],
    });
    expect(permissionDecision('fullscreen', undefined, [], ['camera'])).toEqual({ kind: 'grant' });
  });
});

describe('the later settings', () => {
  it('takes a history switch, a downloads folder and a language, and nothing odd for any of them', () => {
    expect(changeSetting({}, 'history', false)).toEqual({ history: false });
    expect(changeSetting({}, 'downloads', '/media/usb/films')).toEqual({ downloads: '/media/usb/films' });
    expect(changeSetting({}, 'downloads', 'relative/path')).toBeNull();
    expect(changeSetting({}, 'downloads', 5)).toBeNull();
    expect(changeSetting({}, 'language', 'pt-BR')).toEqual({ language: 'pt-BR' });
    expect(changeSetting({}, 'language', 'en-US --no-sandbox')).toBeNull();
    expect(changeSetting({}, 'language', '../../etc')).toBeNull();
    for (const l of LANGUAGE_CHOICES) if (l.code) expect(changeSetting({}, 'language', l.code), l.code).not.toBeNull();
  });
});

describe('giving a button a job', () => {
  it('adds the button, with Ctrl when it was held', () => {
    expect(mapButton({}, 'F7', false, 'back')).toEqual({ F7: 'back' });
    expect(mapButton({ F7: 'back' }, 'MediaStop', false, 'menu')).toEqual({ F7: 'back', MediaStop: 'menu' });
    expect(mapButton({}, 'H', true, 'menu')).toEqual({ 'Ctrl+h': 'menu' });
    expect(mapButton({ F7: 'back' }, 'F7', false, 'menu')).toEqual({ F7: 'menu' });
  });
  it('leaves alone the buttons the screen cannot be used without, and keys for typing', () => {
    for (const key of [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Enter',
      'Escape',
      'Tab',
      'Control',
      'Shift',
      'Unidentified',
      'a',
      '5',
      ' ',
      '',
    ]) {
      expect(mapButton({}, key, false, 'back'), key).toBeNull();
    }
    expect(mapButton({}, 'F7', false, 'quit')).toBeNull();
    expect(mapButton({}, 'F7', false, 'explode')).toBeNull();
  });
  it('what it makes is something config.json accepts', () => {
    expect(changeSetting({}, 'keys', mapButton({}, 'F7', false, 'back'))).toEqual({ keys: { F7: 'back' } });
    expect(changeSetting({}, 'keys', { F7: 'explode' })).toBeNull();
  });
  it('takes every button away from one action, and keeps them through a reset', () => {
    expect(unmapButtons({ F7: 'back', F8: 'back', F9: 'menu' }, 'back')).toEqual({ F9: 'menu' });
    expect(resetSettings({ keys: { F9: 'menu' }, history: false, language: 'fr' })).toEqual({ keys: { F9: 'menu' } });
  });
});
