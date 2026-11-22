// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boxOf } from '../src/layer/spatial/box';
import { compareWithTabStops } from '../src/layer/diagnostics/referee';
import { coveredByScreen, coveringLayer, edgeControl, FOCUS_ATTR, openDialog, scrollWithinList, SpatialNavigator, ZOOM_ATTR } from '../src/layer/spatial/navigator';

// jsdom has no layout engine, so each element's rectangle is read from data-rect="left,top,width,height".
function installLayout(): void {
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    const [left = 0, top = 0, width = 0, height = 0] = (this.getAttribute('data-rect') ?? '').split(',').map(Number);
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
  };
  Element.prototype.scrollIntoView = () => undefined;
}

const card = (id: string, x: number, y: number, extra = ''): string =>
  `<a href="#" id="${id}" data-rect="${x},${y},100,60" ${extra}>x</a>`;

beforeEach(() => {
  installLayout();
  document.body.innerHTML = `
    <nav>${card('home', 0, 0)}${card('store', 120, 0)}</nav>
    <div id="row1">${card('a1', 0, 100)}${card('a2', 120, 100)}${card('a3', 240, 100)}</div>
    <div id="row2">${card('b1', 0, 200)}${card('b2', 120, 200)}</div>
    ${card('hidden', 360, 100, 'style="display:none"')}
    <div aria-hidden="true">${card('inert', 360, 200)}</div>
    <longboard-overlay>${card('ours', 480, 100)}</longboard-overlay>
    <div role="button" id="wrapper" data-rect="0,300,300,80"><button id="inner" data-rect="10,310,80,40">go</button></div>
    <button id="tiny" data-rect="600,0,1,1">.</button>
    <button id="off" disabled data-rect="600,100,100,60">off</button>`;
});

const ids = (els: Element[]): string[] => els.map((e) => e.id).sort();

describe('SpatialNavigator', () => {
  it('collects only visible, enabled, non-layer controls and prefers inner controls', () => {
    const nav = new SpatialNavigator(document, { ignoreWithin: 'longboard-overlay' });
    expect(ids(nav.candidates())).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'home', 'inner', 'store']);
  });

  it('starts at the top-left and walks the grid', () => {
    const seen: string[] = [];
    const nav = new SpatialNavigator(document, { ignoreWithin: 'longboard-overlay', onFocusChange: (el) => seen.push(el?.id ?? '-') });
    nav.move('down');
    nav.move('down');
    nav.move('right');
    nav.move('right');
    nav.move('down');
    nav.move('left');
    expect(seen).toEqual(['home', 'a1', 'a2', 'a3', 'b2', 'b1']);
    expect(document.querySelectorAll(`[${FOCUS_ATTR}]`)).toHaveLength(1);
    expect(document.activeElement?.id).toBe('b1');
  });

  it('stays put at an edge', () => {
    const nav = new SpatialNavigator(document, { ignoreWithin: 'longboard-overlay' });
    nav.move('down');
    expect(nav.move('left')).toBe(false);
    expect(nav.focused?.id).toBe('home');
  });

  it('activates the focused control', () => {
    const nav = new SpatialNavigator(document, { ignoreWithin: 'longboard-overlay' });
    let clicked = 0;
    document.getElementById('home')!.addEventListener('click', (e) => {
      e.preventDefault();
      clicked += 1;
    });
    expect(nav.activate()).toBe(false);
    nav.move('down');
    expect(nav.activate()).toBe(true);
    expect(clicked).toBe(1);
  });

  it('recovers when the focused element is removed', () => {
    const nav = new SpatialNavigator(document, { ignoreWithin: 'longboard-overlay' });
    nav.move('down');
    document.getElementById('home')!.remove();
    expect(nav.focused).toBeNull();
    // Carries on from where it was, not from the top again.
    nav.move('down');
    expect(nav.focused?.id).toBe('a1');
  });

  it('carries on from what the page put in place of the highlighted control', () => {
    const nav = new SpatialNavigator(document, { ignoreWithin: 'longboard-overlay' });
    nav.focus(document.getElementById('a2'));
    document.getElementById('a2')!.outerHTML = card('a2new', 122, 101);
    expect(nav.focused).toBeNull();
    nav.move('right');
    expect(nav.focused?.id).toBe('a3');
  });

  // Shape seen on a photo site: resting on a small picture brings up a card
  // about its owner, and the card closes as soon as focus goes into it.
  it('goes back to what opened a card that closed under it, and passes the card over after that', () => {
    const nav = new SpatialNavigator(document, { ignoreWithin: 'longboard-overlay' });
    nav.focus(document.getElementById('home'));
    nav.move('down');
    expect(nav.focused?.id).toBe('a1');
    const open = (): void => document.body.insertAdjacentHTML('beforeend', `<div id="pop">${card('follow', 10, 165)}</div>`);
    open();
    nav.move('down');
    expect(nav.focused?.id).toBe('follow');
    document.getElementById('pop')!.remove();
    expect(nav.focused).toBeNull();
    // The page gives its focus back to the picture; the highlight goes with it.
    expect(nav.comeBack(nav.candidates(), document.getElementById('a1')!)).toBe(true);
    expect(nav.focused?.id).toBe('a1');
    open();
    nav.move('down');
    expect(nav.focused?.id).toBe('b1');
  });

  // Shape seen on a music site: an app of panes, the window's own scrolling shut off.
  it('does not move a page that has shut its own scrolling off', () => {
    Object.defineProperty(window, 'innerHeight', { value: 540, configurable: true });
    document.body.insertAdjacentHTML('beforeend', card('deep', 0, 900));
    const calls: unknown[] = [];
    window.scrollTo = ((o: unknown) => calls.push(o)) as typeof window.scrollTo;
    const nav = new SpatialNavigator(document, { ignoreWithin: 'longboard-overlay' });
    nav.focus(document.getElementById('deep'));
    expect(calls).toEqual([]);
    document.body.style.overflowY = 'hidden';
    nav.focus(document.getElementById('b1'));
    nav.focus(document.getElementById('deep'));
    document.body.style.overflowY = '';
    expect(calls.at(-1)).toEqual({ top: 0, left: 0, behavior: 'instant' });
    // Still cut off a moment later (the app is taller than the screen): then the page is moved, just far enough.
    const by: unknown[] = [];
    window.scrollBy = ((o: unknown) => by.push(o)) as typeof window.scrollBy;
    vi.useFakeTimers();
    nav.focus(document.getElementById('b1'));
    document.body.style.overflowY = 'hidden';
    nav.focus(document.getElementById('deep'));
    vi.advanceTimersByTime(400);
    vi.useRealTimers();
    document.body.style.overflowY = '';
    expect(by).toEqual([{ top: 428, behavior: 'instant' }]);
  });

  it('finds its own way back when the page says nothing', () => {
    const nav = new SpatialNavigator(document, { ignoreWithin: 'longboard-overlay' });
    nav.focus(document.getElementById('home'));
    nav.move('down');
    document.body.insertAdjacentHTML('beforeend', `<div id="pop">${card('follow', 10, 165)}</div>`);
    nav.move('down');
    document.getElementById('pop')!.remove();
    nav.move('down');
    expect(nav.focused?.id).toBe('b1');
  });

  it('uses adapter selectors for extra focusable elements', () => {
    document.body.insertAdjacentHTML('beforeend', '<div class="tile" id="tile" data-rect="0,500,100,60"></div>');
    const nav = new SpatialNavigator(document, { extraFocusable: ['.tile'] });
    expect(ids(nav.candidates())).toContain('tile');
  });
});

describe('row memory', () => {
  // Two sideways-scrolling rows and a plain grid row under them. Row A has been scrolled: its first card is off to the left.
  const strip = (id: string, cards: string, top: number): string => `<div id="${id}" data-rect="0,${top},400,60" style="overflow-x: auto">${cards}</div>`;
  const scrollable = (id: string): void => {
    const el = document.getElementById(id)!;
    Object.defineProperty(el, 'scrollWidth', { value: 2000, configurable: true });
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
  };

  beforeEach(() => {
    document.body.innerHTML =
      strip('rowA', `${card('a0', -130, 100)}${card('a1', 0, 100)}${card('a2', 120, 100)}${card('a3', 240, 100)}`, 100) +
      strip('rowB', `${card('b0', 0, 200)}${card('b1', 120, 200)}${card('b2', 240, 200)}`, 200) +
      `<div id="grid">${card('g0', 0, 300)}${card('g1', 120, 300)}${card('g2', 240, 300)}</div>`;
    scrollable('rowA');
    scrollable('rowB');
  });

  it('enters a fresh row at its first item on screen', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('a3'));
    nav.move('down');
    expect(nav.focused?.id).toBe('b0');
  });

  it('returns to where the user was in a row', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('a3'));
    nav.move('down');
    nav.move('up');
    expect(nav.focused?.id).toBe('a3');
    nav.move('down');
    nav.move('right');
    nav.move('right');
    nav.move('up');
    nav.move('down');
    expect(nav.focused?.id).toBe('b2');
  });

  it('never enters a row at an item scrolled off its left edge', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('b0'));
    nav.move('up');
    expect(nav.focused?.id).toBe('a1');
  });

  it('does not take a page-sized clipping container for a row', () => {
    Object.defineProperty(window, 'innerHeight', { value: 540, configurable: true });
    document.body.innerHTML = `<div id="pageBox" data-rect="0,0,960,2600" style="overflow-x: hidden">${card('top', 0, 0)}${card('g0', 0, 300)}${card('g1', 240, 300)}${card('below', 240, 400)}</div>`;
    const box = document.getElementById('pageBox')!;
    Object.defineProperty(box, 'scrollWidth', { value: 2000, configurable: true });
    Object.defineProperty(box, 'clientWidth', { value: 960, configurable: true });
    Object.defineProperty(box, 'clientHeight', { value: 2600, configurable: true });
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('below'));
    nav.move('up');
    expect(nav.focused?.id).toBe('g1');
  });

  it('leaves plain grids geometric', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('b2'));
    nav.move('down');
    expect(nav.focused?.id).toBe('g2');
  });

  it('does not interfere with sideways movement inside a row', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('a1'));
    nav.move('right');
    expect(nav.focused?.id).toBe('a2');
  });
});

describe('carousels', () => {
  // Shape seen on the live site: slides stacked in one place, all but one inside a transparent wrapper, with arrows beside the list.
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: 540, configurable: true });
    document.body.innerHTML = `
      <nav data-rect="0,0,960,40">${card('home', 0, 0)}</nav>
      <div id="hero" data-rect="0,40,960,360">
        <button id="prev" class="arrow prev" data-rect="0,200,30,30">p</button>
        <ul>
          <li style="opacity: 0"><div>${card('s1', 60, 300)}</div></li>
          <li><div>${card('s2', 60, 300)}${card('s2more', 200, 300)}</div></li>
        </ul>
        <button id="next" class="arrow next" data-rect="925,200,30,30">n</button>
      </div>
      <main id="page" data-rect="0,0,960,3000"><div id="plain">${card('lonely', 0, 500)}</div></main>`;
  });

  it('ignores controls inside a transparent ancestor', () => {
    const nav = new SpatialNavigator(document);
    expect(ids(nav.candidates())).not.toContain('s1');
    expect(ids(nav.candidates())).toContain('s2');
  });

  it('ignores a backdrop link stretched behind other controls', () => {
    document.getElementById('hero')!.insertAdjacentHTML('beforeend', '<a href="#" id="backdrop" data-rect="0,40,960,360">x</a>');
    const nav = new SpatialNavigator(document);
    expect(ids(nav.candidates())).not.toContain('backdrop');
    expect(ids(nav.candidates())).toContain('s2');
  });

  it('keeps a link that has one small control inside its box', () => {
    document.body.insertAdjacentHTML('beforeend', '<a href="#" id="title" data-rect="84,600,534,44">x</a><button id="dots" data-rect="254,605,34,20">.</button>');
    const nav = new SpatialNavigator(document);
    expect(ids(nav.candidates())).toEqual(expect.arrayContaining(['title', 'dots']));
  });

  it('measures a link in running text by the blocks it holds, but not by what is pinned elsewhere', () => {
    document.body.innerHTML =
      '<a href="#" id="title" style="display:inline" data-rect="84,181,534,44">' +
      '<div style="display:inline-block" data-rect="84,168,162,38">site</div>' +
      '<h3 style="display:inline-block" data-rect="84,206,534,33">title</h3>' +
      '<span style="position:absolute" data-rect="695,180,36,36">&gt;</span></a>';
    expect(boxOf(document.getElementById('title')!)).toEqual({ left: 84, top: 168, right: 618, bottom: 239 });
  });

  it('going down lands on a result, not on the small button inside its box', () => {
    document.body.innerHTML =
      '<a href="#" id="above" style="display:block" data-rect="84,100,300,30">x</a>' +
      '<a href="#" id="title" style="display:block" data-rect="84,170,534,70">x</a><button id="dots" data-rect="254,186,34,20">.</button>' +
      '<a href="#" id="below" style="display:block" data-rect="84,300,300,30">x</a>';
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('above'));
    nav.move('down');
    expect(nav.focused?.id).toBe('title');
    nav.move('left');
    expect(nav.focused?.id).toBe('dots');
    nav.move('down');
    expect(nav.focused?.id).toBe('below');
    nav.move('up');
    expect(nav.focused?.id).toBe('title');
  });

  it('keeps a card that is one link with a small button inside it, and still drops a wrapper filled by its link', () => {
    document.body.innerHTML =
      '<a href="#" id="story" style="display:block" data-rect="84,63,316,332">x<span role="button" id="more" data-rect="379,260,19,19">.</span></a>' +
      '<div role="button" id="shell" data-rect="500,63,300,200"><a href="#" id="link" style="display:block" data-rect="500,63,300,200">x</a></div>';
    const nav = new SpatialNavigator(document);
    expect(ids(nav.candidates())).toEqual(['link', 'more', 'story']);
    document.body.insertAdjacentHTML('beforeend', '<a href="#" id="next" style="display:block" data-rect="84,420,316,100">x</a>');
    nav.focus(document.getElementById('story'));
    nav.move('down');
    expect(nav.focused?.id).toBe('next');
    nav.focus(document.getElementById('story'));
    nav.move('right');
    expect(nav.focused?.id).toBe('more');
  });

  it('keeps a link that runs over two lines of text, though its box takes in other links', () => {
    document.body.innerHTML =
      '<p><a href="#" id="one" data-rect="300,2,60,18">x</a><a href="#" id="two" data-rect="400,2,60,18">x</a>' +
      '<a href="#" id="runs" data-rect="24,0,905,44">x</a><a href="#" id="three" data-rect="200,24,60,18">x</a></p>';
    const runs = document.getElementById('runs')!;
    runs.getClientRects = () => [{}, {}] as unknown as DOMRectList;
    const nav = new SpatialNavigator(document);
    expect(ids(nav.candidates())).toEqual(['one', 'runs', 'three', 'two']);
  });

  it('still drops a small link with several controls on it', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<a href="#" id="under" data-rect="84,600,534,44">x</a><button id="one" data-rect="254,605,34,20">.</button><button id="two" data-rect="354,605,34,20">.</button>',
    );
    const nav = new SpatialNavigator(document);
    expect(ids(nav.candidates())).not.toContain('under');
  });

  it('never focuses the arrows when the adapter names them', () => {
    const nav = new SpatialNavigator(document, { skip: ['.arrow', ':::bad'] });
    expect(ids(nav.candidates())).toEqual(['home', 'lonely', 's2', 's2more']);
  });

  it('finds the arrow of the strip the focus is in', () => {
    const hit = edgeControl(document.getElementById('s2more')!, ['.next'], window);
    expect(hit?.control.id).toBe('next');
    expect(hit?.container.id).toBe('hero');
    expect(edgeControl(document.getElementById('s2')!, ['.prev'], window)?.control.id).toBe('prev');
  });

  // Seen on the live site: the arrows sit in a transparent wrapper until hovered, and a tall list lies between the slide and them.
  it('uses an arrow that is laid out but transparent, past a tall ancestor without arrows', () => {
    document.getElementById('next')!.outerHTML = '<span style="opacity: 0"><button id="next" class="arrow next" data-rect="925,200,30,30">n</button></span>';
    document.querySelector('#hero ul')!.setAttribute('data-rect', '0,40,960,1083');
    expect(edgeControl(document.getElementById('s2more')!, ['.next'], window)?.control.id).toBe('next');
  });

  it('does not reach into another strip through a page-sized ancestor', () => {
    document.getElementById('page')!.append(document.getElementById('hero')!);
    expect(edgeControl(document.getElementById('lonely')!, ['.next'], window)).toBeNull();
  });

  it('can focus the first control of the slide now showing', () => {
    const nav = new SpatialNavigator(document, { skip: ['.arrow'] });
    nav.focusFirstIn(document.getElementById('hero')!);
    expect(nav.focused?.id).toBe('s2');
  });
});

describe('focus zoom', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 960, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 540, configurable: true });
    document.body.innerHTML =
      card('small', 0, 0) +
      '<a href="#" id="banner" data-rect="0,100,960,300">x</a>' +
      '<input id="field" type="search" data-rect="0,420,200,40">';
  });

  it('marks a focused card and unmarks it when focus moves on or is cleared', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('small'));
    expect(document.getElementById('small')!.hasAttribute(ZOOM_ATTR)).toBe(true);
    nav.focus(document.getElementById('banner'));
    expect(document.querySelectorAll(`[${ZOOM_ATTR}]`)).toHaveLength(0);
    nav.focus(document.getElementById('small'));
    nav.clear();
    expect(document.querySelectorAll(`[${ZOOM_ATTR}]`)).toHaveLength(0);
  });

  it('grows the whole card when the focused link is a layer over it', () => {
    document.body.innerHTML = '<section data-rect="0,0,960,200"><article id="cardbox" data-rect="10,10,200,113"><img data-rect="10,10,200,113"><a href="#" id="layer" data-rect="10,10,200,113">x</a></article></section>';
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('layer'));
    expect(document.getElementById('cardbox')!.hasAttribute(ZOOM_ATTR)).toBe(true);
    expect(document.querySelectorAll(`[${ZOOM_ATTR}]`)).toHaveLength(1);
    nav.clear();
    expect(document.querySelectorAll(`[${ZOOM_ATTR}]`)).toHaveLength(0);
  });

  it('does not grow a link in running text', () => {
    document.body.innerHTML = '<p data-rect="0,0,900,30"><a href="#" id="word" style="display:inline" data-rect="40,4,80,22">word</a></p>';
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('word'));
    expect(document.querySelectorAll(`[${ZOOM_ATTR}]`)).toHaveLength(0);
  });

  it('on a site with no profile grows only what holds a picture', () => {
    document.body.innerHTML =
      '<a href="#" id="words" style="display:block" data-rect="0,0,300,40">words</a>' +
      '<a href="#" id="iconed" style="display:block" data-rect="0,50,300,40"><img data-rect="0,50,24,24">words</a>' +
      '<a href="#" id="pictured" style="display:block" data-rect="0,100,200,140"><img data-rect="0,100,200,113">words</a>';
    const nav = new SpatialNavigator(document, { growPicturesOnly: true });
    const grown = (id: string): boolean => {
      nav.focus(document.getElementById(id));
      return document.getElementById(id)!.hasAttribute(ZOOM_ATTR);
    };
    expect([grown('words'), grown('iconed'), grown('pictured')]).toEqual([false, false, true]);
  });

  it('does not grow banners or text fields', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('banner'));
    expect(document.getElementById('banner')!.hasAttribute(ZOOM_ATTR)).toBe(false);
    nav.focus(document.getElementById('field'));
    expect(document.getElementById('field')!.hasAttribute(ZOOM_ATTR)).toBe(false);
  });
});

describe('scrolling to the focused control', () => {
  it('goes to the top of the page for anything on the first screenful, and centres rows below it', () => {
    Object.defineProperty(window, 'innerHeight', { value: 540, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    document.body.innerHTML = card('inBanner', 40, 300) + card('lower', 40, 900);
    const calls: string[] = [];
    window.scrollTo = ((opts: ScrollToOptions) => calls.push(`top:${opts.top}`)) as typeof window.scrollTo;
    Element.prototype.scrollIntoView = function (this: Element, opts?: ScrollIntoViewOptions | boolean): void {
      calls.push(`${this.id}:${typeof opts === 'object' ? opts.block : ''}`);
    };
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('inBanner'));
    nav.focus(document.getElementById('lower'));
    expect(calls).toEqual(['top:0', 'lower:center']);
  });
});

describe('styled radios and checkboxes', () => {
  // Shape seen in the live site's player menus: an invisible input inside a visible label.
  beforeEach(() => {
    document.body.innerHTML = `
      <label id="optA" data-rect="600,100,240,32"><input type="radio" name="s" id="rA" style="opacity: 0" data-rect="600,108,13,13"><div>x</div></label>
      <label id="optB" data-rect="600,140,240,32"><input type="radio" name="s" id="rB" style="opacity: 0" data-rect="600,148,13,13"><div>x</div></label>
      <label id="plain" data-rect="600,180,240,32"><input type="checkbox" id="visibleBox" data-rect="600,188,13,13"> x</label>
      <label id="textLabel" data-rect="600,220,240,32">not a control</label>`;
  });

  it('focuses the label when its input is invisible, and the input when it is not', () => {
    const nav = new SpatialNavigator(document);
    expect(ids(nav.candidates())).toEqual(['optA', 'optB', 'visibleBox']);
  });

  // Shape seen on the live site's season selector.
  it('focuses a label tied by "for" to a toggle parked off screen, and not labels for other things', () => {
    document.body.innerHTML = `
      <input type="checkbox" id="parked" data-rect="-99955,100,13,13">
      <label for="parked" id="seasons" aria-hidden="true" data-rect="44,100,141,48">x</label>
      <input type="checkbox" id="real" data-rect="300,100,20,20">
      <label for="real" id="besideReal" data-rect="330,100,100,20">x</label>
      <input type="search" id="q" data-rect="500,100,200,30">
      <label for="q" id="forText" data-rect="500,60,100,20">x</label>
      <label for="missing" id="dangling" data-rect="700,100,100,20">x</label>`;
    const nav = new SpatialNavigator(document);
    expect(ids(nav.candidates())).toEqual(['q', 'real', 'seasons']);
    nav.focus(document.getElementById('seasons'));
    nav.activate();
    expect((document.getElementById('parked') as HTMLInputElement).checked).toBe(true);
  });

  it('selects the option when its label is activated', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('optB'));
    nav.activate();
    expect((document.getElementById('rB') as HTMLInputElement).checked).toBe(true);
  });

  it('can pick up focus nearest to a point', () => {
    const nav = new SpatialNavigator(document);
    nav.focusNearest({ x: 700, y: 150 });
    expect(nav.focused?.id).toBe('optB');
  });
});

describe('moving from a point', () => {
  // A player whose bottom controls are disabled: only the top bar can be reached.
  const bar = `
    <button id="close" data-rect="20,16,40,40">x</button>
    <button id="subs" data-rect="710,16,40,40">s</button>
    <input type="range" id="volume" data-rect="500,65,30,150">
    <button id="pause" disabled data-rect="455,470,50,50">p</button>`;

  it('goes to the control in that direction when there is one', () => {
    document.body.innerHTML = bar + '<button id="next" data-rect="820,485,110,30">n</button>';
    const nav = new SpatialNavigator(document);
    nav.moveFrom({ x: 480, y: 270 }, 'down');
    expect(nav.focused?.id).toBe('next');
  });

  it('takes the nearest button, not the first control or a slider, when nothing lies that way', () => {
    document.body.innerHTML = bar;
    const nav = new SpatialNavigator(document);
    expect(nav.moveFrom({ x: 480, y: 270 }, 'down')).toBe(true);
    expect(nav.focused?.id).toBe('subs');
  });
});

describe('a thin slider', () => {
  const row = `
    <button id="play" data-rect="6,503,60,26">p</button>
    <div id="bar" role="slider" tabindex="0" data-rect="84,514,597,4"></div>
    <button id="sound" data-rect="688,503,26,26">s</button>
    <div id="dot" role="slider" tabindex="0" data-rect="300,300,6,6"></div>
    <button id="line" data-rect="100,100,597,4">l</button>`;

  it('is a target when its track is long, however thin; a thin button or a dot is not', () => {
    document.body.innerHTML = row;
    const nav = new SpatialNavigator(document);
    expect(ids(nav.candidates())).toEqual(['bar', 'play', 'sound']);
  });

  it('is what down from the middle of the picture lands on', () => {
    document.body.innerHTML = row;
    const nav = new SpatialNavigator(document);
    nav.moveFrom({ x: 480, y: 270 }, 'down');
    expect(nav.focused?.id).toBe('bar');
  });

  it('hands on to the nearest control in its own row when down is pressed again', () => {
    document.body.innerHTML = row;
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('bar'));
    expect(nav.move('down')).toBe(true);
    expect(nav.focused?.id).toBe('sound');
    nav.move('left');
    expect(nav.focused?.id).toBe('bar');
  });

  it('moves down as anything does when nothing shares its row', () => {
    document.body.innerHTML = `
      <div id="bar" role="slider" tabindex="0" data-rect="40,440,880,3"></div>
      <button id="play" data-rect="40,470,40,40">p</button><button id="next" data-rect="100,470,40,40">n</button>`;
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('bar'));
    nav.move('down');
    expect(nav.focused?.id).toBe('play');
    nav.move('up');
    expect(nav.focused?.id).toBe('bar');
  });
});

describe('transparent hit areas', () => {
  it('keeps one target where a link and a transparent button share a box', () => {
    document.body.innerHTML = `
      <div><a href="#" id="cardLink" data-rect="10,10,217,122">x</a><button id="ghostButton" style="opacity: 0" data-rect="10,11,217,122">x</button></div>
      <div><button id="onlyGhost" style="opacity: 0" data-rect="300,10,217,122">x</button></div>`;
    const nav = new SpatialNavigator(document);
    expect(ids(nav.candidates())).toEqual(['cardLink', 'onlyGhost']);
  });

  it('focuses a picture-sized transparent link, but not transparent inputs, small ones or ones in a hidden container', () => {
    document.body.innerHTML = `
      <a href="#" id="overlay" style="opacity: 0" data-rect="0,0,275,155">x</a>
      <a href="#" id="hoverOnly" style="opacity: 0; pointer-events: none" data-rect="0,200,275,155">x</a>
      <a href="#" id="speck" style="opacity: 0" data-rect="300,0,30,30">x</a>
      <input id="ghost" type="checkbox" style="opacity: 0" data-rect="300,200,40,40">
      <div style="opacity: 0"><a href="#" id="inHidden" data-rect="0,400,275,155">x</a></div>`;
    const nav = new SpatialNavigator(document);
    expect(ids(nav.candidates())).toEqual(['hoverOnly', 'overlay']);
  });
});

describe('pinned bars', () => {
  // The page has scrolled: a sticky tab strip sits at the top of the screen, and the row above is partly off screen.
  beforeEach(() => {
    document.body.innerHTML = `
      <div style="position: sticky">${card('tab', 40, 60)}</div>
      ${card('rowAbove', 40, -30)}
      ${card('here', 40, 240)}
      ${card('rowBelow', 40, 400)}`;
  });

  it('goes to page content above rather than the pinned bar', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('here'));
    nav.move('up');
    expect(nav.focused?.id).toBe('rowAbove');
  });

  it('never takes the bar across the top for "down", though it lies below a highlight left above the screen', () => {
    Object.defineProperty(window, 'innerHeight', { value: 540, configurable: true });
    document.getElementById('rowBelow')!.remove();
    document.getElementById('here')!.remove();
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('rowAbove'));
    expect(nav.move('down')).toBe(false);
    expect(nav.focused?.id).toBe('rowAbove');
  });

  it('reaches the pinned bar when no page content is left above', () => {
    document.getElementById('rowAbove')!.remove();
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('here'));
    nav.move('up');
    expect(nav.focused?.id).toBe('tab');
  });

  it('leaves the pinned bar normally', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('tab'));
    nav.move('down');
    expect(nav.focused?.id).toBe('here');
  });
});

describe('focus on something that has been put away', () => {
  it('is treated as no focus: the next press starts from the page', () => {
    Object.defineProperty(window, 'innerWidth', { value: 960, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 540, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    document.body.innerHTML = `
      <div style="position: fixed">${card('profile', 10, 0)}</div>
      <div id="menu">${card('entry', 10, 60)}</div>
      ${card('first', 40, 240)}
      ${card('far', 800, 240)}`;
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('entry'));
    // The menu closes: its entry stays in the document with no box.
    document.getElementById('entry')!.setAttribute('data-rect', '0,0,0,0');
    nav.move('down');
    expect(nav.focused?.id).toBe('first');
  });
});

describe('the first press on a page', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 960, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 540, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    document.body.innerHTML = `
      <div style="position: fixed">${card('profile', 10, 0)}${card('home', 200, 0)}</div>
      ${card('play', 50, 400)}
      ${card('later', 200, 400)}`;
  });

  it('goes to the page content, not the pinned bar', () => {
    const nav = new SpatialNavigator(document);
    nav.move('down');
    expect(nav.focused?.id).toBe('play');
  });

  it('prefers the main button to a small icon above it', () => {
    document.getElementById('play')!.insertAdjacentHTML('beforebegin', '<button id="mute" data-rect="850,135,56,56">x</button>');
    const nav = new SpatialNavigator(document);
    nav.move('down');
    expect(nav.focused?.id).toBe('play');
  });

  it('takes the main button just below the screen over an icon on it', () => {
    document.getElementById('later')!.remove();
    document.getElementById('play')!.setAttribute('data-rect', '50,554,113,52');
    document.body.insertAdjacentHTML('beforeend', '<button id="mute" data-rect="850,135,56,56">x</button>');
    const nav = new SpatialNavigator(document);
    nav.move('down');
    expect(nav.focused?.id).toBe('play');
  });

  it('never offers a dot too small to aim at', () => {
    document.body.insertAdjacentHTML('beforeend', '<button id="dot" data-rect="500,300,6,6">x</button><button id="dash" data-rect="520,300,28,9">x</button>');
    const ids = new SpatialNavigator(document).candidates().map((el) => el.id);
    expect(ids).not.toContain('dot');
    expect(ids).not.toContain('dash');
  });

  it('goes to the bar when the press is Up', () => {
    const nav = new SpatialNavigator(document);
    nav.move('up');
    expect(nav.focused?.id).toBe('profile');
  });

  it('falls back to the bar when the page has nothing else yet', () => {
    document.getElementById('play')!.remove();
    document.getElementById('later')!.remove();
    const nav = new SpatialNavigator(document);
    nav.move('down');
    expect(nav.focused?.id).toBe('profile');
  });
});

describe('pinned bars, sideways', () => {
  // A pinned strip of tabs lies across the row that has scrolled under it
  // (the home page's section tabs, seen on Steamboat's service).
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 960, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 540, configurable: true });
    document.body.innerHTML = `
      <div style="position: sticky">${card('tab', 330, 90)}</div>
      <div id="strip">${card('c1', 40, 100)}${card('c2', 260, 100)}${card('c3', 480, 100)}</div>`;
  });

  it('moves along the page content, not onto the bar lying across it', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('c2'));
    nav.move('right');
    expect(nav.focused?.id).toBe('c3');
    nav.move('left');
    nav.move('left');
    expect(nav.focused?.id).toBe('c1');
  });

  it('outside a scrolling row, reaches the bar when no page content lies that way', () => {
    document.getElementById('c3')!.remove();
    document.getElementById('c1')!.remove();
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('c2'));
    nav.move('right');
    expect(nav.focused?.id).toBe('tab');
  });

  it('at the end of a scrolling row, stays put so the row can turn', () => {
    document.getElementById('c3')!.remove();
    const strip = document.getElementById('strip')!;
    strip.style.overflowX = 'auto';
    Object.defineProperty(strip, 'scrollWidth', { value: 2000, configurable: true });
    Object.defineProperty(strip, 'clientWidth', { value: 900, configurable: true });
    Object.defineProperty(strip, 'clientHeight', { value: 60, configurable: true });
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('c2'));
    expect(nav.move('right')).toBe(false);
    expect(nav.focused?.id).toBe('c2');
  });
});

describe('following a jump', () => {
  it('knows when focus is off screen and can pick the first page control on screen', () => {
    Object.defineProperty(window, 'innerWidth', { value: 960, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 540, configurable: true });
    document.body.innerHTML = `
      <div style="position: sticky">${card('pinnedTab', 40, 0)}</div>
      ${card('leftBehind', 40, -1600)}
      ${card('cutOff', 40, 500)}
      ${card('second', 300, 200)}
      ${card('first', 40, 200)}`;
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('leftBehind'));
    expect(nav.focusIsOffScreen()).toBe(true);
    nav.focusFirstOnScreen();
    expect(nav.focused?.id).toBe('first');
    expect(nav.focusIsOffScreen()).toBe(false);
  });
});

describe('pop-ups', () => {
  it('ignores a dialog that something else covers', () => {
    document.body.innerHTML = `<div role="dialog" aria-modal="true" id="under" data-rect="250,40,460,500">${card('x', 300, 100)}</div><div id="playerOnTop"></div>`;
    const original = document.elementFromPoint;
    document.elementFromPoint = () => document.getElementById('playerOnTop');
    expect(openDialog(document)).toBeNull();
    document.elementFromPoint = () => document.getElementById('x');
    expect(openDialog(document)?.id).toBe('under');
    document.elementFromPoint = original;
  });

  it('finds an open modal dialog and ignores closed or non-modal ones', () => {
    document.body.innerHTML = `
      ${card('behind', 0, 0)}
      <div role="dialog" aria-modal="true" id="closed" data-rect="0,0,0,0"></div>
      <div role="dialog" id="notModal" data-rect="10,10,300,300"></div>
      <div role="dialog" aria-modal="true" id="open" data-rect="250,40,460,500">${card('close', 600, 60)}${card('action', 300, 400)}</div>`;
    expect(openDialog(document)?.id).toBe('open');
    const nav = new SpatialNavigator(document, { scope: () => openDialog(document) });
    expect(ids(nav.candidates())).toEqual(['action', 'close']);
    document.getElementById('open')!.remove();
    expect(openDialog(document)).toBeNull();
    expect(ids(nav.candidates())).toEqual(['behind']);
  });
});

describe('a held key on a page that loads more as it scrolls', () => {
  // Two rows loaded so far, then a long gap, then the footer.
  const page = `
    <a href="#" id="r1" data-rect="0,100,100,60">x</a>
    <a href="#" id="r2" data-rect="0,300,100,60">x</a>
    <a href="#" id="footer" data-rect="0,2500,100,30">x</a>`;
  let scrolled: number[];
  beforeEach(() => {
    document.body.innerHTML = page;
    scrolled = [];
    // The page is taller than the screen and can scroll (jsdom has no layout of its own).
    pageSize(4000, window.innerHeight);
    const el = document.scrollingElement ?? document.documentElement;
    el.scrollBy = ((o: ScrollToOptions) => void scrolled.push(o.top ?? 0)) as typeof el.scrollBy;
    window.scrollTo = (() => undefined) as typeof window.scrollTo;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    pageSize(0, 0);
  });
  const pageSize = (scrollHeight: number, clientHeight: number): void => {
    const el = document.scrollingElement ?? document.documentElement;
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  };

  const at = (ms: number): void => void vi.spyOn(Date, 'now').mockReturnValue(ms);

  it('scrolls toward a far target instead of jumping to it', () => {
    const nav = new SpatialNavigator(document);
    at(10_000);
    nav.focus(document.getElementById('r1'));
    nav.move('down');
    at(10_050);
    expect(nav.move('down')).toBe(true);
    expect(nav.focused?.id).toBe('r2');
    expect(scrolled).toEqual([0.8 * window.innerHeight]);
  });

  it('jumps after all when nothing can scroll toward the target (it sits in a pane that is at its end)', () => {
    pageSize(0, 0);
    const nav = new SpatialNavigator(document);
    at(10_000);
    nav.focus(document.getElementById('r1'));
    nav.move('down');
    at(10_050);
    nav.move('down');
    expect(nav.focused?.id).toBe('footer');
    expect(scrolled).toEqual([]);
  });

  it('still jumps on a single press', () => {
    const nav = new SpatialNavigator(document);
    at(10_000);
    nav.focus(document.getElementById('r2'));
    at(20_000);
    nav.move('down');
    expect(nav.focused?.id).toBe('footer');
    expect(scrolled).toEqual([]);
  });

  it('carries on from what is on screen when the focused element is replaced part-way down', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('r2'));
    document.getElementById('r2')!.remove();
    // The page is scrolled down: the first row is above the screen.
    document.getElementById('r1')!.setAttribute('data-rect', '0,-900,100,60');
    document.body.insertAdjacentHTML('beforeend', '<a href="#" id="fresh" data-rect="0,320,100,60">x</a>');
    Object.defineProperty(window, 'scrollY', { value: 1200, configurable: true });
    at(30_000);
    nav.move('down');
    expect(nav.focused?.id).toBe('fresh');
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });
});

describe('coveredByScreen', () => {
  const setup = (topId: string): Element => {
    document.body.innerHTML = `
      <div id="page" data-rect="0,0,1024,3000"><a href="#" id="play" data-rect="30,360,400,60"><span id="label" data-rect="60,370,100,20">x</span></a>
        <div id="badge" data-rect="30,360,60,20">new</div></div>
      <div id="player" data-rect="0,0,1024,768"><div id="spinner" data-rect="480,350,60,60">o</div></div>`;
    document.elementFromPoint = () => document.getElementById(topId);
    return document.getElementById('play')!;
  };

  it('is false while the control itself, or a small thing on it, is in front', () => {
    expect(coveredByScreen(setup('label'), window)).toBe(false);
    expect(coveredByScreen(setup('badge'), window)).toBe(false);
  });

  it('is true once something screen-sized is in front, or a part of it', () => {
    expect(coveredByScreen(setup('player'), window)).toBe(true);
    expect(coveredByScreen(setup('spinner'), window)).toBe(true);
  });
});

describe('scrollWithinList', () => {
  const list = (): HTMLElement => {
    document.body.innerHTML = `<div id="list" style="overflow-y: auto" data-rect="500,200,400,200">${card('shown', 500, 250)}${card('below', 500, 460)}</div>`;
    const el = document.getElementById('list')!;
    Object.defineProperty(el, 'scrollHeight', { value: 600, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: 200, configurable: true });
    return el;
  };

  it('scrolls the list to an entry outside its box', () => {
    const el = list();
    scrollWithinList(document.getElementById('below')!, window);
    // The entry's middle (490) is brought to the box's middle (300).
    expect(el.scrollTop).toBe(190);
  });

  it('leaves the list alone when the entry can be seen', () => {
    const el = list();
    scrollWithinList(document.getElementById('shown')!, window);
    expect(el.scrollTop).toBe(0);
  });

  it('does nothing for a control that is in no scrolling list', () => {
    document.body.innerHTML = card('plain', 0, 900);
    expect(() => scrollWithinList(document.getElementById('plain')!, window)).not.toThrow();
  });
});

describe('inside a menu', () => {
  it('up and down stay among its entries while there is one that way', () => {
    document.body.innerHTML = `
      <div>${card('one', 500, 100, 'role="menuitem"')}${card('two', 500, 170, 'role="menuitem"')}${card('three', 500, 400, 'role="menuitem"')}</div>
      ${card('behind', 520, 250)}
      ${card('below', 500, 480)}`;
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('two'));
    nav.move('down');
    expect(nav.focused?.id).toBe('three');
    nav.move('down');
    expect(nav.focused?.id).toBe('below');
  });
});

describe('visibility with a shared memory of ancestors', () => {
  it('gives the same answers as without it', () => {
    document.body.innerHTML = `
      <div><div>${card('a', 0, 0)}${card('b', 120, 0)}</div></div>
      <div style="opacity: 0"><div>${card('c', 0, 100)}${card('d', 120, 100)}</div></div>`;
    const nav = new SpatialNavigator(document);
    expect(nav.candidates().map((el) => el.id)).toEqual(['a', 'b']);
  });
});

describe('the referee', () => {
  it('counts a Tab stop as reached by itself, by what it holds, by what holds it or by what lies on it, and names the rest by kind only', () => {
    installLayout();
    document.body.innerHTML =
      '<a href="#" id="plain" data-rect="0,0,100,40">secret words</a>' +
      '<div tabindex="0" id="shell" data-rect="0,50,300,80"><a href="#" id="inside" data-rect="10,60,80,40">x</a></div>' +
      '<a href="#" id="lost" data-rect="0,200,200,40">more secret words</a>' +
      '<a href="#" id="speck" data-rect="0,300,1,1">skip</a>' +
      '<span id="hand" data-rect="0,400,100,40">x</span>';
    const el = (id: string): Element => document.getElementById(id)!;
    const said = compareWithTabStops([el('plain'), el('shell'), el('lost'), el('speck')], [el('plain'), el('inside'), el('hand')], window);
    expect(said).toEqual({ stops: 4, seen: 3, reached: 2, missed: [{ what: 'a', size: '200x40' }], beyond: 1 });
    expect(JSON.stringify(said)).not.toContain('secret');
  });
});

describe('a link parked above the top of the page', () => {
  it('is not somewhere the highlight can go', () => {
    document.body.innerHTML = '<a href="#main" id="skip" data-rect="16,-1000,128,40">Skip</a><input id="q" data-rect="278,16,308,24"><a href="#a" id="a" data-rect="278,100,100,30">A</a>';
    const nav = new SpatialNavigator(document, { ignoreWithin: 'longboard-overlay' });
    expect(nav.candidates().map((el) => el.id)).toEqual(['q', 'a']);
  });

  it('but something scrolled out of a list of its own still is', () => {
    document.body.innerHTML = '<div id="list" data-rect="0,0,300,200"><a href="#a" id="gone" data-rect="0,-60,100,30">A</a><a href="#b" id="b" data-rect="0,20,100,30">B</a></div>';
    Object.defineProperty(document.getElementById('list')!, 'scrollTop', { value: 80 });
    const nav = new SpatialNavigator(document, { ignoreWithin: 'longboard-overlay' });
    expect(nav.candidates().map((el) => el.id)).toEqual(['gone', 'b']);
  });
});

describe('a link cut off at the bottom of a banner fixed to the screen', () => {
  it('is not somewhere the highlight can go, while one on screen in the same banner is', () => {
    Object.defineProperty(window, 'innerHeight', { value: 540, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 960, configurable: true });
    document.body.innerHTML = '<a href="#p" id="page" data-rect="20,100,200,30">P</a><div id="banner" style="position: fixed" data-rect="450,90,500,700"><a href="#a" id="shown" data-rect="460,120,200,30">A</a><a href="#b" id="cut" data-rect="460,700,200,30">B</a></div><a href="#q" id="below" data-rect="20,900,200,30">Q</a>';
    const nav = new SpatialNavigator(document, { ignoreWithin: 'longboard-overlay' });
    expect(nav.candidates().map((el) => el.id)).toEqual(['page', 'shown', 'below']);
  });
});

describe('what counts as a dialog in front of the page', () => {
  const size = (w: number, h: number): void => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
  };
  it('not a side menu parked off the edge of the screen, though it says it is modal', () => {
    size(960, 540);
    document.body.innerHTML = '<div id="side" role="dialog" aria-modal="true" data-rect="-365,0,365,540"><a href="#x" data-rect="-340,20,200,30">X</a></div>';
    expect(openDialog(document)).toBeNull();
  });
  it('not a small notice in a corner', () => {
    size(960, 540);
    document.body.innerHTML = '<div id="note" role="dialog" aria-modal="true" data-rect="524,224,420,300"><a href="#x" data-rect="540,300,200,30">X</a></div>';
    expect(openDialog(document)).toBeNull();
  });
  it('but one over the middle of the screen, however small, and one that takes much of it', () => {
    size(960, 540);
    document.body.innerHTML = '<div id="mid" role="dialog" aria-modal="true" data-rect="380,200,200,140"></div>';
    expect(openDialog(document)?.id).toBe('mid');
    document.body.innerHTML = '<div id="sheet" role="dialog" aria-modal="true" data-rect="0,300,960,240"></div>';
    expect(openDialog(document)?.id).toBe('sheet');
  });
});

describe('something scrolled out of sight in a pane of its own', () => {
  const html = `
    <div id="list" style="overflow-y: auto" data-rect="8,139,280,156">
      <a href="#a" id="card" data-rect="36,240,126,32">A</a>
      <a href="#b" id="hidden" data-rect="36,439,142,32">B</a>
    </div>
    <a href="#l" id="last" data-rect="32,400,60,22">L</a>`;
  it('is not below a link that lies outside the pane', () => {
    document.body.innerHTML = html;
    const nav = new SpatialNavigator(document, { ignoreWithin: 'longboard-overlay' });
    nav.focus(document.getElementById('last'));
    expect(nav.move('down')).toBe(false);
    expect(nav.focused?.id).toBe('last');
  });
  it('but is below the card above it in the same pane', () => {
    document.body.innerHTML = html;
    const nav = new SpatialNavigator(document, { ignoreWithin: 'longboard-overlay' });
    document.getElementById('last')!.remove();
    nav.focus(document.getElementById('card'));
    expect(nav.move('down')).toBe(true);
    expect(nav.focused?.id).toBe('hidden');
  });
});

describe('a layer fixed over the whole screen with nothing to say it is a dialog', () => {
  const size = (): void => {
    Object.defineProperty(window, 'innerWidth', { value: 960, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 540, configurable: true });
  };
  afterEach(() => {
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
  });
  it('is what is in front when the pointer meets it everywhere and it has something to press', () => {
    size();
    document.body.innerHTML = '<a href="#p" id="behind" data-rect="20,100,200,30">P</a><div id="gate" style="position: fixed" data-rect="0,0,960,540"><button id="yes" data-rect="300,200,300,44">Yes</button></div>';
    (document as { elementFromPoint?: unknown }).elementFromPoint = () => document.getElementById('gate');
    expect(coveringLayer(document)?.id).toBe('gate');
  });
  it('is not, when the page shows through somewhere, or it holds nothing to press', () => {
    size();
    document.body.innerHTML = '<a href="#p" id="behind" data-rect="20,100,200,30">P</a><div id="gate" style="position: fixed" data-rect="0,0,960,540"><button id="yes" data-rect="300,200,300,44">Yes</button></div>';
    (document as { elementFromPoint?: unknown }).elementFromPoint = (x: number) => (x < 300 ? document.getElementById('behind') : document.getElementById('gate'));
    expect(coveringLayer(document)).toBeNull();
    document.getElementById('yes')!.remove();
    (document as { elementFromPoint?: unknown }).elementFromPoint = () => document.getElementById('gate');
    expect(coveringLayer(document)).toBeNull();
  });
});

describe('what a site has shut away or keeps in a pane of its own', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: 540, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 960, configurable: true });
  });

  // Shape seen on a music site: the player's bar is closed to no height and cuts off its buttons, which keep their boxes.
  it('never goes to a control inside a box closed up to nothing', () => {
    document.body.innerHTML = `${card('a', 0, 100)}<div id="bar" data-rect="0,300,960,0" style="overflow-y: hidden"><div><button id="play" data-rect="0,280,40,40">p</button></div></div>${card('b', 0, 400)}`;
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('a'));
    nav.move('down');
    expect(nav.focused?.id).toBe('b');
  });

  // Shape seen on a film service: shelves in a pane that scrolls, a notice under the pane.
  it('scrolls a pane on, and stays in it, while it has more to show', () => {
    document.body.innerHTML = `<div id="pane" data-rect="0,0,960,400" style="overflow-y: auto">${card('one', 0, 300)}${card('two', 0, 700)}</div>${card('notice', 0, 420)}`;
    const pane = document.getElementById('pane')!;
    let top = 0;
    Object.defineProperty(pane, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(pane, 'clientHeight', { value: 400, configurable: true });
    const place = (id: string, y: number): void => document.getElementById(id)!.setAttribute('data-rect', `0,${y - top},100,60`);
    const scrollTo = (y: number): void => {
      top = Math.max(0, Math.min(600, y));
      place('one', 300);
      place('two', 700);
    };
    Object.defineProperty(pane, 'scrollTop', { get: () => top, set: scrollTo, configurable: true });
    pane.scrollBy = ((o: ScrollToOptions) => scrollTo(top + (o.top ?? 0))) as typeof pane.scrollBy;
    pane.scrollTo = (() => undefined) as typeof pane.scrollTo;
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('one'));
    // "two" is cut off below the pane, so the notice is nearest. It is offered once.
    nav.move('down');
    expect([top, nav.focused?.id]).toEqual([0, 'notice']);
    nav.move('up');
    expect(nav.focused?.id).toBe('one');
    // After that the pane is scrolled instead.
    nav.move('down');
    expect(top).toBe(320);
    expect(nav.focused?.id).toBe('one');
    nav.move('down');
    expect(nav.focused?.id).toBe('two');
    // The pane is taken to its end first; then the notice is reached.
    nav.move('down');
    expect([top, nav.focused?.id]).toEqual([600, 'two']);
    nav.move('down');
    expect(nav.focused?.id).toBe('notice');
  });

  // Shape seen on a streaming site: a cookie notice across the bottom of the screen, cards going on under and below it.
  it('offers a notice pinned to the bottom when the next thing down lies under it, and lets the page be walked on', () => {
    document.body.innerHTML = `${card('c1', 0, 100)}${card('c2', 0, 300)}${card('c3', 0, 440)}${card('c4', 0, 900)}
      <div style="position: fixed"><div role="dialog" id="notice" data-rect="0,400,960,140"><button id="settings" data-rect="650,420,140,40">s</button><button id="accept" data-rect="650,470,140,40">a</button></div></div>`;
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('c1'));
    nav.move('down');
    expect(nav.focused?.id).toBe('c2');
    // c3 is next, and lies under the notice.
    nav.move('down');
    expect(nav.focused?.id).toBe('settings');
    nav.move('down');
    expect(nav.focused?.id).toBe('accept');
    nav.move('up');
    nav.move('up');
    expect(nav.focused?.id).toBe('c2');
  });

  it('offers such a notice once when the next thing down is off the screen, and not again', () => {
    document.body.innerHTML = `${card('c1', 0, 100)}${card('c4', 0, 900)}${card('c5', 0, 1000)}
      <div style="position: fixed"><div role="dialog" id="notice" data-rect="0,400,960,140"><button id="accept" data-rect="650,470,140,40">a</button></div></div>`;
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('c1'));
    nav.move('down');
    expect(nav.focused?.id).toBe('accept');
    nav.focus(document.getElementById('c1'));
    nav.move('down');
    expect(nav.focused?.id).toBe('c4');
  });

  // Shape seen on a film service: the notice hangs under the top bar, over the top of the page.
  it('offers a pinned notice that lies between the highlight and what would be next', () => {
    document.body.innerHTML = `${card('bar', 700, 20)}${card('field', 260, 360)}
      <div style="position: fixed"><div role="dialog" id="notice" data-rect="50,90,860,140"><button id="more" data-rect="80,170,125,42">m</button><button id="close" data-rect="868,138,44,44">x</button></div></div>`;
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('bar'));
    nav.move('down');
    expect(nav.focused?.id).toBe('close');
    nav.focus(document.getElementById('field'));
    nav.move('up');
    expect(['more', 'close']).toContain(nav.focused?.id);
  });

  // Shape seen on a film service: a notice whose button, link and X are at three heights.
  it('reaches everything inside one notice sideways, though it lies higher or lower', () => {
    document.body.innerHTML = `${card('page', 0, 400)}
      <div style="position: fixed"><div role="dialog" id="notice" data-rect="50,90,860,140"><a href="#" id="here" data-rect="745,112,27,15">h</a><button id="more" data-rect="80,169,125,42">m</button><button id="close" data-rect="868,100,44,44">x</button></div></div>`;
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('more'));
    nav.move('right');
    expect(nav.focused?.id).toBe('here');
    nav.move('right');
    expect(nav.focused?.id).toBe('close');
    nav.move('left');
    expect(nav.focused?.id).toBe('here');
    nav.move('left');
    expect(nav.focused?.id).toBe('more');
    // Not out of the notice: nothing lies further left in it.
    nav.move('left');
    expect(nav.focused?.id).toBe('more');
  });

  // Shape seen on a film service: shelves in a pane that scrolls, and under the pane a strip asking which country.
  it('offers a strip under a scrolling pane once, when what is next in the pane is out of sight', () => {
    document.body.innerHTML = `<div id="pane" data-rect="0,0,960,400" style="overflow-y: auto">${card('one', 0, 300)}${card('two', 0, 700)}</div><div id="strip" data-rect="0,400,960,140"><button id="close" data-rect="20,450,20,20">x</button><button id="go" data-rect="800,440,140,40">go</button></div>`;
    const pane = document.getElementById('pane')!;
    Object.defineProperty(pane, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(pane, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(pane, 'scrollTop', { value: 0, writable: true, configurable: true });
    pane.scrollBy = (() => undefined) as typeof pane.scrollBy;
    pane.scrollTo = (() => undefined) as typeof pane.scrollTo;
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('one'));
    // "two" is below the pane's edge; the strip's button is in view.
    nav.move('down');
    expect(nav.focused?.id).toBe('close');
    nav.move('right');
    expect(nav.focused?.id).toBe('go');
    // The second time the pane goes on (here it scrolls toward its next thing), and the strip is left alone.
    nav.focus(document.getElementById('one'));
    nav.move('down');
    expect(['one', 'two']).toContain(nav.focused?.id);
  });
});
