// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scrollBy, scrollerFor, SCROLL_SHARE } from '../src/layer/generic/scroll';
import { findMainVideo, GENERIC_PLAYER_SHARE } from '../src/layer/player';
import { SpatialNavigator } from '../src/layer/spatial/navigator';
import { heldDirections, Btn } from '../src/layer/input/gamepad';

// jsdom has no layout engine, so each element's rectangle is read from data-rect="left,top,width,height".
function installLayout(): void {
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    const [left = 0, top = 0, width = 0, height = 0] = (this.getAttribute('data-rect') ?? '').split(',').map(Number);
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
  };
  Element.prototype.scrollIntoView = () => undefined;
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
}
const ids = (els: Element[]): string[] => els.map((e) => e.id).sort();
beforeEach(installLayout);

describe('finding what can be pressed on an unknown page', () => {
  it('offers the controls ordinary sites use', () => {
    document.body.innerHTML = `
      <details><summary id="summary" data-rect="0,0,200,30">More</summary></details>
      <span id="inline" onclick="1" data-rect="0,40,200,30">x</span>
      <div id="switch" role="switch" data-rect="0,80,60,30"></div>
      <div id="editable" contenteditable="true" data-rect="0,120,200,60"></div>
      <video id="video" controls data-rect="0,200,320,180"></video>
      <video id="bare" data-rect="0,400,320,180"></video>
      <div id="div" data-rect="0,600,200,30">just text</div>`;
    expect(ids(new SpatialNavigator(document).candidates())).toEqual(['editable', 'inline', 'summary', 'switch', 'video']);
  });

  it('offers a frame big enough to hold something, and no tracking pixel', () => {
    document.body.innerHTML = `
      <iframe id="player" data-rect="0,0,640,360"></iframe>
      <iframe id="pixel" data-rect="0,400,1,1"></iframe>
      <iframe id="strip" data-rect="0,420,300,20"></iframe>`;
    expect(ids(new SpatialNavigator(document).candidates())).toEqual(['player']);
  });

  it('finds things that only look clickable, when asked to', () => {
    document.body.innerHTML = `
      <div id="card" style="cursor:pointer" data-rect="0,0,200,100"><b id="inside" style="cursor:pointer" data-rect="10,10,100,20">Title</b></div>
      <div id="plain" data-rect="0,120,200,100">text</div>
      <a href="#" id="link" style="cursor:pointer" data-rect="0,240,200,30"><span id="in-link" style="cursor:pointer" data-rect="0,240,100,30">x</span></a>
      <div id="speck" style="cursor:pointer" data-rect="0,300,4,4"></div>`;
    expect(ids(new SpatialNavigator(document, { looksClickable: true }).candidates())).toEqual(['card', 'link']);
    expect(ids(new SpatialNavigator(document).candidates())).toEqual(['link']);
  });

  it('still sees the hand cursor while the layer is hiding the real pointer', () => {
    document.head.innerHTML = '<style>html.hide-it * { cursor: none !important; }</style>';
    document.body.innerHTML = '<div id="card" style="cursor:pointer" data-rect="0,0,200,100">x</div>';
    document.documentElement.classList.add('hide-it');
    expect(ids(new SpatialNavigator(document, { looksClickable: true, cursorHiddenClass: 'hide-it' }).candidates())).toEqual(['card']);
    expect(document.documentElement.classList.contains('hide-it')).toBe(true);
    document.documentElement.classList.remove('hide-it');
    document.head.innerHTML = '';
  });

  it('prefers a real control inside a clickable-looking wrapper', () => {
    document.body.innerHTML = `
      <div id="wrap" style="cursor:pointer" data-rect="0,0,300,100"><button id="real" data-rect="10,10,80,40">go</button></div>`;
    expect(ids(new SpatialNavigator(document, { looksClickable: true }).candidates())).toEqual(['real']);
  });

  it("leaves out a profile's excluded regions", () => {
    document.body.innerHTML = `
      <div class="banner"><a href="#" id="banner-link" data-rect="0,0,100,30">x</a></div>
      <a href="#" id="kept" data-rect="0,50,100,30">x</a>`;
    expect(ids(new SpatialNavigator(document, { exclude: ['.banner', ':::bad'] }).candidates())).toEqual(['kept']);
  });
});

describe('reading a page', () => {
  const page = `
    <a href="#" id="top" data-rect="0,10,100,30">x</a>
    <a href="#" id="near" data-rect="0,950,100,30">x</a>
    <a href="#" id="far" data-rect="0,4000,100,30">x</a>`;
  let scrolled: number[];
  const pageHeight = (scrollHeight: number): void => {
    const el = document.scrollingElement ?? document.documentElement;
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: scrollHeight ? window.innerHeight : 0, configurable: true });
    el.scrollBy = ((o: ScrollToOptions) => void scrolled.push(o.top ?? 0)) as typeof el.scrollBy;
  };
  beforeEach(() => {
    document.body.innerHTML = page;
    scrolled = [];
    pageHeight(6000);
  });
  afterEach(() => pageHeight(0));

  it('jumps to a target just past the edge of the screen', () => {
    const nav = new SpatialNavigator(document, { readingScroll: true });
    nav.focus(document.getElementById('top'));
    expect(nav.move('down')).toBe(true);
    expect(nav.focused?.id).toBe('near');
    expect(scrolled).toEqual([]);
  });

  it('scrolls toward a target further away than that, keeping its place', () => {
    const nav = new SpatialNavigator(document, { readingScroll: true });
    nav.focus(document.getElementById('near'));
    expect(nav.move('down')).toBe(true);
    expect(nav.focused?.id).toBe('near');
    expect(scrolled).toEqual([0.8 * window.innerHeight]);
  });

  it('jumps after all when nothing can scroll that way', () => {
    pageHeight(0);
    const nav = new SpatialNavigator(document, { readingScroll: true });
    nav.focus(document.getElementById('near'));
    expect(nav.move('down')).toBe(true);
    expect(nav.focused?.id).toBe('far');
  });

  it('picks up what has come wholly into view, without moving the page', () => {
    document.body.innerHTML = `
      <a href="#" id="above" data-rect="0,-300,100,30">x</a>
      <a href="#" id="cut" data-rect="0,-10,100,30">x</a>
      <a href="#" id="first" data-rect="300,100,100,30">x</a>
      <a href="#" id="first-left" data-rect="0,100,100,30">x</a>
      <a href="#" id="last" data-rect="0,500,100,30">x</a>
      <a href="#" id="below" data-rect="0,5000,100,30">x</a>`;
    let moved = 0;
    Element.prototype.scrollIntoView = () => void moved++;
    const nav = new SpatialNavigator(document);
    expect(nav.focusOnScreen('down')).toBe(true);
    expect(nav.focused?.id).toBe('first-left');
    expect(nav.focusOnScreen('up')).toBe(true);
    expect(nav.focused?.id).toBe('last');
    expect(moved).toBe(0);
    document.body.innerHTML = '<a href="#" id="below" data-rect="0,5000,100,30">x</a>';
    expect(new SpatialNavigator(document).focusOnScreen('down')).toBe(false);
  });
});

describe('scrolling when there is nothing to move to', () => {
  const scrollable = (el: Element, o: { scrollHeight: number; clientHeight: number; scrollTop?: number }): void => {
    Object.defineProperty(el, 'scrollHeight', { value: o.scrollHeight, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: o.clientHeight, configurable: true });
    el.scrollTop = o.scrollTop ?? 0;
  };

  it('scrolls the page when it has room, and says when it has none', () => {
    document.body.innerHTML = '<p id="p">text</p>';
    const page = document.scrollingElement ?? document.documentElement;
    scrollable(page, { scrollHeight: 3000, clientHeight: 600 });
    const calls: ScrollToOptions[] = [];
    page.scrollBy = ((o: ScrollToOptions) => void calls.push(o)) as typeof page.scrollBy;
    expect(scrollBy(document, null, 'down', true)).toBe(page);
    expect(calls).toEqual([{ top: SCROLL_SHARE * 600, left: 0, behavior: 'instant' }]);
    // At the top there is nowhere up to go.
    expect(scrollBy(document, null, 'up', true)).toBeNull();
    expect(scrollerFor(document, null, 'left')).toBeNull();
    scrollable(page, { scrollHeight: 0, clientHeight: 0 });
  });

  it('scrolls the pane the highlight is in before the page', () => {
    document.body.innerHTML = '<div id="pane" style="overflow-y:auto"><a href="#" id="link">x</a></div><div id="fixed" style="overflow-y:hidden"><a href="#" id="other">x</a></div>';
    const pane = document.getElementById('pane')!;
    scrollable(pane, { scrollHeight: 2000, clientHeight: 400, scrollTop: 100 });
    scrollable(document.getElementById('fixed')!, { scrollHeight: 2000, clientHeight: 400 });
    expect(scrollerFor(document, document.getElementById('link'), 'down')).toBe(pane);
    expect(scrollerFor(document, document.getElementById('link'), 'up')).toBe(pane);
    // Something that hides its overflow does not scroll, however tall its content.
    expect(scrollerFor(document, document.getElementById('other'), 'down')).toBeNull();
    // A pane at its end hands over to the page (which here has no room either).
    pane.scrollTop = 1600;
    expect(scrollerFor(document, document.getElementById('link'), 'down')).toBeNull();
  });
});

describe('a video counts as being watched only when it fills the screen, on a site with no profile', () => {
  const video = (rect: string): HTMLVideoElement => {
    document.body.innerHTML = `<video id="v" data-rect="${rect}"></video>`;
    return document.getElementById('v') as HTMLVideoElement;
  };

  it('ignores a video that is most of the page but not all of it', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    video(`0,0,${w},${Math.round(h * 0.7)}`);
    expect(findMainVideo(document, [], GENERIC_PLAYER_SHARE)).toBeNull();
    expect(findMainVideo(document, [])).not.toBeNull();
    const full = video(`0,0,${w},${h}`);
    expect(findMainVideo(document, [], GENERIC_PLAYER_SHARE)).toBe(full);
  });

  it('takes a small video the page has put in full screen', () => {
    const v = video('0,0,320,180');
    Object.defineProperty(document, 'fullscreenElement', { value: v, configurable: true });
    expect(findMainVideo(document, [], GENERIC_PLAYER_SHARE)).toBe(v);
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
  });
});

describe('held directions on a controller', () => {
  it('reads the D-pad and the stick', () => {
    expect(heldDirections(new Set([Btn.Up, Btn.Right]))).toEqual(['up', 'right']);
    expect(heldDirections(new Set([102, 101]))).toEqual(['down', 'left']);
    expect(heldDirections(new Set([Btn.A]))).toEqual([]);
  });
});
