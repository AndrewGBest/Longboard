// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { coversPicture, findMainVideo, isPlayerActive, playControl, playerScope, isSeekBar, playerIsOwnPage } from '../src/layer/player';
import { SpatialNavigator } from '../src/layer/spatial/navigator';
import { cdpKey, strayKeyCode, InjectedKeys, isNativePlayerKey, playerKeyFor, playerKeyInfo } from '../src/shared/player-keys';
import { PLAYER_KEY_NAMES } from '../src/shared/profile';

// jsdom has no layout, so each test gives its videos a size by hand.
function video(id: string, w: number, h: number, opts: { muted?: boolean; playing?: boolean } = {}): string {
  return `<video id="${id}" data-w="${w}" data-h="${h}" ${opts.muted ? 'muted' : ''} data-playing="${opts.playing ?? true}"></video>`;
}

function mount(markup: string): void {
  document.body.innerHTML = markup;
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 720, configurable: true });
  for (const v of document.querySelectorAll('video')) {
    const w = Number(v.dataset['w']);
    const h = Number(v.dataset['h']);
    v.getBoundingClientRect = () => ({ width: w, height: h, left: 0, top: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) });
    v.muted = v.hasAttribute('muted');
    const playing = v.dataset['playing'] === 'true';
    Object.defineProperty(v, 'paused', { value: !playing, configurable: true });
    Object.defineProperty(v, 'readyState', { value: 4, configurable: true });
  }
}

describe('findMainVideo', () => {
  beforeEach(() => (document.body.innerHTML = ''));

  it('finds a large unmuted video with no adapter', () => {
    mount(video('main', 1280, 720));
    expect(findMainVideo(document)?.id).toBe('main');
    expect(isPlayerActive(document)).toBe(true);
  });

  it('ignores small videos', () => {
    mount(video('thumb', 320, 180));
    expect(findMainVideo(document)).toBeNull();
  });

  it('does not take a muted full-width background trailer for the player', () => {
    mount(video('trailer', 1280, 660, { muted: true }));
    expect(findMainVideo(document)).toBeNull();
    expect(isPlayerActive(document)).toBe(false);
  });

  // Shape seen on the live site: a title page with an unmuted-able trailer and an empty player container.
  it('with a player root, only videos inside it count', () => {
    mount(`<div class="hero">${video('trailer', 1280, 660)}</div><div id="player">${video('real', 0, 0, { playing: false })}</div>`);
    expect(findMainVideo(document, ['#player'])).toBeNull();
    mount(`<div class="hero">${video('trailer', 1280, 660)}</div><div id="player">${video('real', 1280, 720)}</div>`);
    expect(findMainVideo(document, ['#player'])?.id).toBe('real');
  });

  it('falls back to the generic rule when the adapter selector matches nothing or is invalid', () => {
    mount(video('main', 1280, 720));
    expect(findMainVideo(document, ['#gone', ':::bad'])?.id).toBe('main');
  });
});

describe('player keys', () => {
  it('maps only the known keys', () => {
    expect(playerKeyInfo('playPause')).toEqual({ code: 'Space', domKey: ' ' });
    expect(playerKeyInfo('seekBack')?.code).toBe('Left');
    expect(playerKeyInfo('seekForward')?.code).toBe('Right');
    expect(playerKeyInfo('close')).toEqual({ code: 'Escape', domKey: 'Escape' });
    expect(playerKeyInfo('backspace')?.code).toBe('Backspace');
    expect(playerKeyInfo('enter')).toEqual({ code: 'Enter', domKey: 'Enter', char: '\r' });
    for (const bad of ['Tab', 'F5', 'a', 'toString', '__proto__', '', 5, null, undefined, {}]) {
      expect(playerKeyInfo(bad)).toBeNull();
    }
  });

  it('knows every key a profile may name for a player, and nothing a profile may not', () => {
    for (const name of PLAYER_KEY_NAMES) expect(playerKeyInfo(name), name).not.toBeNull();
    expect(playerKeyInfo('k')).toEqual({ code: 'k', domKey: 'k' });
  });

  it("takes a site's own keys into account when deciding what is already the right key", () => {
    const keys = { playPause: 'k', back: 'j', forward: 'l' } as const;
    expect(isNativePlayerKey('k', { type: 'playPause' }, keys)).toBe(true);
    expect(isNativePlayerKey(' ', { type: 'playPause' }, keys)).toBe(false);
    expect(isNativePlayerKey('l', { type: 'seek', seconds: 10 }, keys)).toBe(true);
    expect(isNativePlayerKey('ArrowRight', { type: 'seek', seconds: 10 }, keys)).toBe(false);
  });

  it('maps actions to player keys', () => {
    expect(playerKeyFor({ type: 'playPause' })).toBe('playPause');
    expect(playerKeyFor({ type: 'seek', seconds: -10 })).toBe('seekBack');
    expect(playerKeyFor({ type: 'seek', seconds: 10 })).toBe('seekForward');
    expect(playerKeyFor({ type: 'select' })).toBeNull();
  });

  // Found on the live site: handling Space and then pressing Space delivered it twice, so pause undid itself.
  it('recognises a physical key that is already the right one', () => {
    expect(isNativePlayerKey(' ', { type: 'playPause' })).toBe(true);
    expect(isNativePlayerKey('ArrowRight', { type: 'seek', seconds: 10 })).toBe(true);
    expect(isNativePlayerKey('ArrowRight', { type: 'seek', seconds: -10 })).toBe(false);
    expect(isNativePlayerKey('Enter', { type: 'playPause' })).toBe(false);
    expect(isNativePlayerKey('MediaPlayPause', { type: 'playPause' })).toBe(false);
  });

  it('lets an expected key through exactly once', () => {
    const k = new InjectedKeys(1000);
    k.expect(' ', 0);
    expect(k.consume('ArrowLeft', 10)).toBe(false);
    expect(k.consume(' ', 10)).toBe(true);
    expect(k.consume(' ', 20)).toBe(false);
  });

  it('forgets an expected key that never arrived', () => {
    const k = new InjectedKeys(1000);
    k.expect('ArrowRight', 0);
    expect(k.consume('ArrowRight', 1001)).toBe(false);
  });
});

describe('player scope', () => {
  const size = (el: Element, w: number, h: number, left = 0, top = 0): void => {
    el.getBoundingClientRect = () => ({ width: w, height: h, left, top, right: left + w, bottom: top + h, x: left, y: top, toJSON: () => ({}) });
  };

  it('is the adapter root when the video is inside it', () => {
    mount(`<div id="player"><div>${video('real', 1280, 720)}</div></div>`);
    const v = document.getElementById('real') as HTMLVideoElement;
    expect(playerScope(v, ['#player']).id).toBe('player');
  });

  it('without an adapter, climbs to the highest ancestor that fits the viewport', () => {
    mount(`<main id="page"><div id="shell"><div id="inner">${video('real', 1280, 720)}</div></div></main>`);
    size(document.getElementById('inner')!, 1280, 720);
    size(document.getElementById('shell')!, 1280, 720);
    size(document.getElementById('page')!, 1280, 3000);
    const v = document.getElementById('real') as HTMLVideoElement;
    expect(playerScope(v).id).toBe('shell');
  });

  it('keeps navigation inside the scope and can start from a point', () => {
    mount(`<a href="#x" id="behind">x</a><div id="player"><button id="left">a</button><button id="mid">b</button></div>`);
    size(document.getElementById('behind')!, 100, 40, 600, 300);
    size(document.getElementById('left')!, 40, 40, 100, 650);
    size(document.getElementById('mid')!, 40, 40, 620, 650);
    Element.prototype.scrollIntoView = () => undefined; // jsdom has none
    const nav = new SpatialNavigator(document, { scope: () => document.getElementById('player') });
    expect(nav.candidates().map((e) => e.id)).toEqual(['left', 'mid']);
    expect(nav.moveFrom({ x: 640, y: 360 }, 'down')).toBe(true);
    expect(nav.focused?.id).toBe('mid');
    nav.move('left');
    expect(nav.focused?.id).toBe('left');
  });
});

describe('playerIsOwnPage', () => {
  it('is true when the player has an address of its own', () => {
    expect(playerIsOwnPage('https://example.com/browse/title-1', 'https://example.com/play/abc')).toBe(true);
  });
  it('is false for a player laid over the page it was started from', () => {
    expect(playerIsOwnPage('https://example.com/detail/1?x=1', 'https://example.com/detail/1?autoplay=1#t')).toBe(false);
  });
  it('is false when nothing was browsed first, or an address cannot be read', () => {
    expect(playerIsOwnPage(null, 'https://example.com/play/abc')).toBe(false);
    expect(playerIsOwnPage('nonsense', 'https://example.com/play/abc')).toBe(false);
  });
});

describe('isSeekBar', () => {
  const sized = (markup: string, width: number): Element => {
    document.body.innerHTML = markup;
    const el = document.body.firstElementChild!;
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: width, bottom: 20, width, height: 20, x: 0, y: 0, toJSON: () => ({}) });
    return el;
  };
  it('is a slider that spans most of the screen', () => {
    Object.defineProperty(window, 'innerWidth', { value: 960, configurable: true });
    expect(isSeekBar(sized('<div role="slider"></div>', 900), window)).toBe(true);
    expect(isSeekBar(sized('<input type="range">', 700), window)).toBe(true);
  });
  it('is not a volume slider or a wide button', () => {
    Object.defineProperty(window, 'innerWidth', { value: 960, configurable: true });
    expect(isSeekBar(sized('<div role="slider"></div>', 80), window)).toBe(false);
    expect(isSeekBar(sized('<button></button>', 900), window)).toBe(false);
  });
  it('is a thin strip across most of the screen that does not say what it is, and nothing shorter or plainly something else', () => {
    Object.defineProperty(window, 'innerWidth', { value: 960, configurable: true });
    expect(isSeekBar(sized('<div class="progress"></div>', 924), window)).toBe(true);
    expect(isSeekBar(sized('<div class="progress"></div>', 500), window)).toBe(false);
    expect(isSeekBar(sized('<a href="#"></a>', 924), window)).toBe(false);
    expect(isSeekBar(sized('<input type="text">', 924), window)).toBe(false);
    expect(isSeekBar(sized('<div role="button"></div>', 924), window)).toBe(false);
  });
});

describe('landing in a player', () => {
  const at = (html: string, rect: [number, number, number, number]): Element => {
    const holder = document.createElement('div');
    holder.innerHTML = html;
    const el = holder.firstElementChild as Element;
    const [left, top, width, height] = rect;
    el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) });
    return el;
  };
  const w = window.innerWidth;
  const h = window.innerHeight;

  it('does not count a button laid over the whole picture as a control', () => {
    expect(coversPicture(at('<button></button>', [0, 0, w, h]), window)).toBe(true);
    expect(coversPicture(at('<button></button>', [0, h - 80, w, 60]), window)).toBe(false);
    expect(coversPicture(at('<video controls></video>', [0, 0, w, h]), window)).toBe(false);
  });

  it('takes the button named Play or Pause in the lower part of the screen', () => {
    const close = at('<button aria-label="Close"></button>', [20, 20, 40, 40]);
    const back = at('<button aria-label="Back 10 seconds"></button>', [20, h - 60, 40, 40]);
    const next = at('<button aria-label="Play next episode"></button>', [80, h - 60, 40, 40]);
    const pause = at('<button aria-label="Pause"></button>', [w / 2, h - 60, 40, 40]);
    expect(playControl([close, back, next, pause], window)).toBe(pause);
  });

  it('with no name to go by takes the first button of the lowest row, never a slider', () => {
    const close = at('<button></button>', [20, 20, 40, 40]);
    const bar = at('<div role="slider"></div>', [0, h - 50, w, 4]);
    const first = at('<button></button>', [30, h - 40, 40, 40]);
    const second = at('<button></button>', [90, h - 40, 40, 40]);
    const above = at('<button></button>', [10, h - 120, 40, 40]);
    expect(playControl([close, bar, second, first, above], window)).toBe(first);
  });

  it('is nothing when the lower part of the screen has no buttons', () => {
    expect(playControl([at('<button></button>', [20, 20, 40, 40])], window)).toBe(null);
  });
});

describe('a player key for the channel that reaches frames', () => {
  it('names the key, its code and its number, with the character where the browser acts on one', () => {
    expect(cdpKey(playerKeyInfo('playPause'))).toEqual({ key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, text: ' ' });
    expect(cdpKey(playerKeyInfo('seekBack'))).toEqual({ key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 });
    expect(cdpKey(playerKeyInfo('close'))).toEqual({ key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    expect(cdpKey({ domKey: 'k' })).toEqual({ key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, nativeVirtualKeyCode: 75, text: 'k' });
  });
  it('is nothing for no key or one it does not know', () => {
    expect(cdpKey(null)).toBe(null);
    expect(cdpKey({ domKey: 'F13' })).toBe(null);
  });
});

describe('a key passed on from the page to the screen in front', () => {
  it('is named the way the app sends keys, and only the keys a screen uses', () => {
    expect(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Backspace', ' '].map(strayKeyCode)).toEqual(['Up', 'Down', 'Left', 'Right', 'Enter', 'Escape', 'Backspace', 'Space']);
    expect(strayKeyCode('a')).toBe('a');
    expect([strayKeyCode('Shift'), strayKeyCode('F5'), strayKeyCode('ContextMenu'), strayKeyCode('')]).toEqual([null, null, null, null]);
  });
});
