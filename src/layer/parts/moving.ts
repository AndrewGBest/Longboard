// Moving the highlight in a page: the arrows, menus that open on hover, and
// scrolling when there is nowhere to go. Also a few things the other parts
// read: whether pointer mode is on, a drop-down that may be open, the last press.
import type { Direction } from '../../shared/actions';
import { scrollBy } from '../generic/scroll';
import { TopEdge } from '../input/top-edge';
import { pageVideo, passedOver } from '../player';
import { isSidewaysSlider, press } from '../spatial/controls';
import { deepActiveElement, deepContains } from '../spatial/deep';
import { edgeControl } from '../spatial/scrolling';
import { isVisible } from '../spatial/visibility';
import type { LayerCore } from './core';
import { BIG_FRAME_SHARE } from './core';

/** What this part adds for the other parts to use. */
export interface MovingPart {
  /** When the person last pressed OK or clicked: a text field the page focuses soon after is one they asked for. */
  lastPressAt: number;
  /** How long after a press a text field the page focuses still counts as asked for, in milliseconds. */
  PRESS_ANSWER_MS: 1500;
  /** The text field a plugged-in keyboard has typed into; while it has focus the keys are the field's. */
  typedInto: Element | null;
  /** Pointer mode is on. The shell moves the pointer and clicks; the layer draws it and stays out of the way. */
  pointerOn: boolean;
  /** A drop-down that OK opened as the browser's own list, and that may still be open. */
  nativeList: HTMLSelectElement | null;
  /** True while that list may be open: a controller's buttons are then turned into the list's keys. */
  listOpen: () => boolean;
  /** What holds a menu the pointer was rested on a button to open. While it is there the highlight stays inside it. */
  hoverHost: Element | null;
  /** The button the pointer was rested on. */
  hoverTrigger: Element | null;
  /** The wait in hoverIfStillCollapsed. */
  hoverTimer: number | undefined;
  /** Takes the pointer away again, which closes the menu it opened. */
  unhover: () => void;
  /** Asks the shell to rest the pointer on `target`, for a menu that opens only on hover. */
  hoverOn: (target: Element) => void;
  /** After a press on a button that says it is collapsed: if it still says so a moment later, the pointer is rested on it. */
  hoverIfStillCollapsed: (target: Element) => void;
  /**
   * A link that is also the button of a collapsed menu: Enter opens the menu
   * instead of following the link, so the menu's entries can be reached. The
   * menu is open after that, and Enter on the link follows it as usual.
   */
  opensMenuFirst: (target: Element) => boolean;
  /** The wait after a carousel's arrow was pressed, before the highlight takes up the new slide. */
  edgeTimer: number | undefined;
  /** The wait after a scroll, before the highlight takes up what came into view. */
  scrollTimer: number | undefined;
  /** Counts presses of Up at the top of a page: the second opens the menu. */
  topEdge: TopEdge;
  /** An arrow on a page being browsed: moves the highlight, or failing that scrolls, turns a carousel or leaves the frame. */
  moveInPage: (dir: Direction) => void;
  /**
   * True while the user is on one of the player's own controls (reached with
   * up or down). The controls hide themselves after a while; focus is dropped
   * when that happens, which returns the keys to playback.
   */
  onPlayerControl: () => boolean;
}

export function createMoving(
  core: LayerCore,
): Omit<
  MovingPart,
  | 'lastPressAt'
  | 'typedInto'
  | 'pointerOn'
  | 'nativeList'
  | 'hoverHost'
  | 'hoverTrigger'
  | 'hoverTimer'
  | 'edgeTimer'
  | 'scrollTimer'
> {
  core.lastPressAt = 0;
  const PRESS_ANSWER_MS = 1500;
  core.typedInto = null;

  // Pointer mode. The shell owns it: it moves the pointer and clicks with
  // ordinary mouse events, so it works in embedded frames this layer cannot
  // see into. The layer only draws the pointer and stays out of the way.
  core.pointerOn = false;

  // One of the browser's own lists may be open (a drop-down). While it is,
  // the browser gives it the keyboard's keys directly; a game controller's
  // buttons come through this layer and have to be turned into those keys.
  // There is no event for the list closing, so this is "may be": it is
  // dropped on the first key that reaches the page, and when focus moves on.
  core.nativeList = null;
  const listOpen = (): boolean => {
    if (core.nativeList && deepActiveElement(core.doc) !== core.nativeList) core.nativeList = null;
    return core.nativeList !== null;
  };

  // Some menus open only when the pointer rests on their button. If Enter on
  // a button that says it is collapsed leaves it collapsed, the shell is asked
  // to put the pointer there. The pointer is taken away again on Back, or
  // when focus leaves the button and whatever it opened.
  core.hoverHost = null;
  core.hoverTrigger = null;
  core.hoverTimer = undefined;
  const unhover = (): void => {
    if (!core.hoverHost) return;
    core.hoverHost = null;
    core.ignorePointerUntil = Date.now() + 500;
    core.send({ kind: 'hover', x: 1, y: 1 });
  };
  const hoverOn = (target: Element): void => {
    const r = target.getBoundingClientRect();
    core.hoverHost = target.parentElement ?? target;
    core.hoverTrigger = target;
    core.ignorePointerUntil = Date.now() + 500;
    core.send({ kind: 'hover', x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
  };
  const hoverIfStillCollapsed = (target: Element): void => {
    if (target.getAttribute('aria-expanded') !== 'false') return;
    const page = core.view.location.href;
    core.view.clearTimeout(core.hoverTimer);
    core.hoverTimer = core.view.setTimeout(() => {
      // Not if the click went somewhere: the menu belongs to the page that was left.
      if (core.view.location.href !== page) return;
      if (target.isConnected && target.getAttribute('aria-expanded') === 'false') hoverOn(target);
    }, 300);
  };
  const opensMenuFirst = (target: Element): boolean =>
    target instanceof HTMLAnchorElement && target.getAttribute('aria-expanded') === 'false' && core.hoverHost === null;

  core.edgeTimer = undefined;
  core.scrollTimer = undefined;
  const topEdge = new TopEdge();
  const moveInPage = (dir: Direction): void => {
    // A slider takes left and right itself, as the keys they are.
    const slider = core.nav.focused;
    if (
      slider &&
      isSidewaysSlider(slider) &&
      (dir === 'left' || dir === 'right') &&
      deepActiveElement(core.doc) === slider
    ) {
      core.pressKey(dir === 'left' ? 'seekBack' : 'seekForward');
      return;
    }
    if (dir !== 'up') topEdge.reset();
    const cameFrom = core.nav.focused;
    const wasAt = cameFrom ? cameFrom.getBoundingClientRect().top + core.view.scrollY : 0;
    const wasTo = cameFrom ? cameFrom.getBoundingClientRect().bottom + core.view.scrollY : 0;
    const inPage = (el: Element): { top: number; bottom: number } => ({
      top: el.getBoundingClientRect().top + core.view.scrollY,
      bottom: el.getBoundingClientRect().bottom + core.view.scrollY,
    });
    const stopAtPicture = (picture: Element): void => {
      core.nav.clear();
      picture.scrollIntoView({ block: 'center', behavior: 'instant' });
    };
    // On a long page with a big player in it, the picture is the next stop
    // when it is the next thing that way and nothing of it can be landed on
    // (its controls are hidden most of the time). Nothing is highlighted,
    // the picture is brought to the middle, and the keys are the player's:
    // OK, left and right; up and down bring its controls up.
    if ((dir === 'up' || dir === 'down') && cameFrom && core.playerInPage()) {
      const picture = pageVideo(core.doc);
      if (picture) {
        const p = inPage(picture);
        const ahead = dir === 'down' ? p.top >= wasTo - 4 : p.bottom <= wasAt + 4;
        // Is anything of the page between here and the picture's nearer edge?
        const nearEdge = dir === 'down' ? p.top : p.bottom;
        const before = (el: Element): boolean => {
          if (el === cameFrom) return false;
          const b = inPage(el);
          const mid = (b.top + b.bottom) / 2;
          return dir === 'down' ? mid > wasTo && mid < nearEdge : mid < wasAt && mid > nearEdge;
        };
        if (ahead && !core.nav.candidates(true).some(before)) {
          stopAtPicture(picture);
          return;
        }
      }
    }
    let moved = core.nav.move(dir);
    // And a move that went from one side of the picture to the other
    // without stopping is taken back to the picture.
    if (
      moved &&
      (dir === 'up' || dir === 'down') &&
      cameFrom &&
      core.nav.focused &&
      core.nav.focused !== cameFrom &&
      core.playerInPage()
    ) {
      const picture = pageVideo(core.doc);
      if (picture && passedOver({ top: wasAt, bottom: wasTo }, inPage(core.nav.focused), inPage(picture), dir)) {
        stopAtPicture(picture);
        return;
      }
    }
    // Up that does not end higher is not up. (Seen on a meetings site: a
    // "skip" link hidden in the top bar moves to a place lower down when it
    // gets the cursor; Up went to it and back without end, and the top was
    // never reached.) Such a thing is not landed on again, and Up is tried
    // once more from where it started.
    for (
      let tries = 0;
      tries < 3 && moved && dir === 'up' && cameFrom?.isConnected && core.nav.focused && core.nav.focused !== cameFrom;
      tries++
    ) {
      if (core.nav.focused.getBoundingClientRect().top + core.view.scrollY < wasAt - 1) break;
      core.jumpers.add(core.nav.focused);
      core.nav.focus(cameFrom);
      moved = core.nav.move(dir);
    }
    // Sideways out of an open menu: close it and carry on along the bar.
    if (!moved && core.hoverHost && (dir === 'left' || dir === 'right')) {
      const trigger = core.hoverTrigger;
      unhover();
      if (trigger?.isConnected) core.nav.focus(trigger);
      moved = core.nav.move(dir);
    }
    if (moved) return;
    // On a frame that fills most of the screen (a sign-in prompt from the
    // service's own sign-in site) the arrows have nothing to move to here:
    // the highlight goes into the frame, as OK on the frame would have it.
    const framed = core.nav.focused;
    if (!core.hooks && framed instanceof HTMLIFrameElement) {
      const b = framed.getBoundingClientRect();
      const shown =
        Math.max(0, Math.min(b.right, core.view.innerWidth) - Math.max(b.left, 0)) *
        Math.max(0, Math.min(b.bottom, core.view.innerHeight) - Math.max(b.top, 0));
      if (shown >= BIG_FRAME_SHARE * core.view.innerWidth * core.view.innerHeight) {
        core.enterFrame(framed, false);
        return;
      }
    }
    // Longboard's own lists go round at their ends.
    if (core.hooks?.edge?.(dir)) return;
    // Left or right with nowhere to go: press the strip's own arrow, if the
    // profile names it. A carousel that swaps slides leaves focus on something
    // no longer shown, so focus then moves to the new slide.
    const from = core.nav.focused;
    const hit =
      from && (dir === 'left' || dir === 'right')
        ? edgeControl(from, dir === 'left' ? core.rules.selectors.rowPrev : core.rules.selectors.rowNext, core.view)
        : null;
    if (!hit) {
      // Nothing to move to: scroll, and take up whatever comes into view.
      // Sideways only inside something that scrolls sideways itself; a page
      // a little wider than the screen must not slide about under the arrows.
      const sideways = dir === 'left' || dir === 'right';
      const here = from && isVisible(from, core.view) && !core.nav.focusIsOffScreen() ? from : null;
      // In a layer pinned over the page, the page behind stays where it is.
      const scrolled = !sideways || here ? scrollBy(core.doc, here, dir, false, core.pinnedLayer()) : null;
      if (scrolled) {
        core.view.clearTimeout(core.scrollTimer);
        core.scrollTimer = core.view.setTimeout(() => {
          const f = core.nav.focused;
          // The highlight follows the reading: it moves on when what had it
          // has gone out of sight, or was never in what is being scrolled.
          if (!f || core.nav.focusIsOffScreen() || !deepContains(scrolled, f)) core.nav.focusOnScreen(dir, scrolled);
        }, 350);
        return;
      }
      // Inside a frame, a press with nowhere to go leaves it for what holds it.
      if (core.frame) {
        core.frame.exit(dir);
        return;
      }
      // Up at the very top of a website: pressed again, it opens the menu,
      // which a remote may have no key for. Not on Longboard's own screens.
      if (dir === 'up' && !core.hooks) {
        const edge = topEdge.up(Date.now());
        if (edge === 'menu') {
          core.send({ kind: 'menu' });
          return;
        }
        if (edge === 'hint') core.overlay.toast('Press Up again for the menu');
      }
      // Nowhere to go: say so, rather than seeming not to have heard the key.
      if (from) core.overlay.feedback(dir);
      return;
    }
    press(hit.control);
    core.view.clearTimeout(core.edgeTimer);
    // Twice: the new slide can still be sliding in at the first look, and
    // what was picked then may itself be put away when it settles.
    const settle = (again: boolean): void => {
      core.edgeTimer = core.view.setTimeout(() => {
        const f = core.nav.focused;
        if (!f || !isVisible(f, core.view)) core.nav.focusFirstIn(hit.container);
        if (again) settle(false);
      }, 700);
    };
    settle(true);
  };

  const onPlayerControl = (): boolean => {
    const f = core.nav.focused;
    // Outside the player this must answer without touching focus: it is also
    // asked by timers, and clearing here would drop focus on a browse page.
    if (!f || !core.inPlayer()) return false;
    const within = core.scope();
    if (within && deepContains(within, f) && isVisible(f, core.view)) return true;
    core.nav.clear();
    return false;
  };
  return {
    PRESS_ANSWER_MS,
    listOpen,
    unhover,
    hoverOn,
    hoverIfStillCollapsed,
    opensMenuFirst,
    topEdge,
    moveInPage,
    onPlayerControl,
  };
}
