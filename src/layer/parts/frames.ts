// Frames inside the page: handing the highlight into one and taking it
// back, and putting a frame full screen while a player in it has the keys.
// A frame has a layer of its own (the preload starts it); the two speak
// through the shell.
import type { Direction } from '../../shared/actions';
import { scrollBy } from '../generic/scroll';
import { deepContains } from '../spatial/deep';
import type { LayerCore } from './core';

/** What this part adds for the other parts to use. */
export interface FramesPart {
  /** The highlight is inside this frame of the page (the frame has the keys and its own layer). */
  frameInside: HTMLIFrameElement | null;
  /** A frame the highlight has been asked into, until the shell says whether anything in it took it. */
  frameAsked: HTMLIFrameElement | null;
  /**
   * Into a frame: it is given the cursor, and the shell tells the layer
   * inside it to take the highlight. `stay`: carry on where it was.
   */
  enterFrame: (el: HTMLIFrameElement, stay: boolean) => void;
  /** The shell's answer: something in the frame took the highlight, nothing did, or what had it is gone. */
  frameIn: (state: 'in' | 'none' | 'lost', player?: boolean) => void;
  /** The highlight has left a frame of this page by `how`: carry on from the frame, that way. */
  frameExit: (how: Direction | 'back') => void;
}

export function createFrames(core: LayerCore): Omit<FramesPart, 'frameInside' | 'frameAsked'> {
  core.frameInside = null;
  core.frameAsked = null;
  const enterFrame = (el: HTMLIFrameElement, stay: boolean): void => {
    core.frameAsked = el;
    try {
      el.focus({ preventScroll: true });
      el.contentWindow?.focus();
    } catch {
      // A frame from another site may refuse; the shell's answer decides.
    }
    const box = el.getBoundingClientRect();
    core.send({
      kind: 'frameEnter',
      stay,
      at: {
        x: (Math.max(box.left, 0) + Math.min(box.right, core.view.innerWidth)) / 2,
        y: (Math.max(box.top, 0) + Math.min(box.bottom, core.view.innerHeight)) / 2,
      },
    });
  };
  /** The frame this page has put in full screen because a player in it took the keys. */
  let frameFull: HTMLIFrameElement | null = null;
  const leaveFull = (): void => {
    const el = frameFull;
    frameFull = null;
    if (!el || core.doc.fullscreenElement !== el) return;
    // Leaving full screen can hand the cursor back to the frame; the keys
    // are the page's again, so it is taken back once the screen has changed.
    core.doc.addEventListener(
      'fullscreenchange',
      () => {
        if (!core.frameInside && !core.frameAsked && core.doc.activeElement === el) {
          el.blur();
          core.view.focus();
        }
      },
      { once: true },
    );
    void core.doc.exitFullscreen().catch(() => undefined);
  };
  // While something of the page is shown full screen, a highlight on what
  // lies underneath is not drawn: the ring is drawn above everything, and
  // showed round an element behind the picture. (Seen at a TV, with a
  // player put full screen by its own button.) A frame or a video that is
  // itself the thing full screen gets no ring round the whole screen either.
  // The highlight is kept, and drawn again when the full screen ends.
  core.doc.addEventListener('fullscreenchange', () => {
    const full = core.doc.fullscreenElement;
    const f = core.nav.focused;
    if (!f) return;
    if (full) {
      const under =
        f === full ? full instanceof HTMLIFrameElement || full instanceof HTMLVideoElement : !deepContains(full, f);
      if (under) core.overlay.track(null);
    } else if (f.isConnected && !core.frameInside) core.overlay.track(f);
  });
  // Full screen can also end without this layer asking: the browser itself
  // ends it on Escape, which is Back on many remotes, and the key never
  // reaches a page. That is leaving the player all the same: the keys come
  // back to the page and the highlight to the frame.
  core.doc.addEventListener('fullscreenchange', () => {
    const el = frameFull;
    if (!el || core.doc.fullscreenElement === el) return;
    frameFull = null;
    if (core.frameInside !== el) return;
    core.frameInside = null;
    el.blur();
    core.view.focus();
    core.nav.focus(el);
  });
  const frameIn = (state: 'in' | 'none' | 'lost', player = false): void => {
    const el = core.frameAsked ?? core.frameInside;
    if (state === 'in') {
      core.frameInside = core.frameAsked ?? core.frameInside;
      core.frameAsked = null;
      core.overlay.track(null);
      // A player in a frame is watched full screen, as a TV shows anything:
      // inside a page its controls are small and may lie under the page's
      // own bars. (Seen on a video site: a bar pinned to the bottom of the
      // screen covered the embedded player's whole control row.) This is
      // the browser's own full screen for the frame, which the page allows
      // or refuses; Back leaves the frame and the full screen with it.
      if (player && !core.frame && core.frameInside && !core.doc.fullscreenElement && core.doc.fullscreenEnabled) {
        const into = core.frameInside;
        frameFull = into;
        void into.requestFullscreen().catch(() => {
          if (frameFull === into) frameFull = null;
        });
      }
      return;
    }
    leaveFull();
    core.frameAsked = null;
    core.frameInside = null;
    if (!el?.isConnected) return;
    if (core.doc.activeElement === el) {
      el.blur();
      core.view.focus();
    }
    core.nav.focus(el);
    if (state === 'none' && !core.frame) {
      // Nothing in it can take the highlight (a player, a map): the pointer, on it.
      const box = el.getBoundingClientRect();
      core.overlay.toast('Pointer mode: this part of the page needs the pointer');
      core.send({
        kind: 'pointer',
        x: (Math.max(box.left, 0) + Math.min(box.right, core.view.innerWidth)) / 2,
        y: (Math.max(box.top, 0) + Math.min(box.bottom, core.view.innerHeight)) / 2,
      });
    }
  };
  const frameExit = (how: Direction | 'back'): void => {
    const el =
      core.frameInside ?? (core.doc.activeElement instanceof HTMLIFrameElement ? core.doc.activeElement : null);
    core.frameInside = null;
    leaveFull();
    if (!el) return;
    el.blur();
    core.view.focus();
    core.nav.focus(el);
    if (how === 'back') {
      core.back();
      return;
    }
    if (core.nav.move(how)) return;
    // Nowhere to go from the frame either: out of this frame too, or back into the one just left.
    if (core.frame) {
      core.frame.exit(how);
      return;
    }
    // Up out of a frame that is the first thing on a website is Up at the
    // top of the page: the highlight stays on the frame and Up again opens
    // the menu. (Seen on a newspaper's front page, which starts with an
    // advertisement's frame: the highlight went back into the frame each
    // time, and the menu could not be had without a key for it.)
    if (how === 'up' && !core.hooks && core.view.scrollY <= 0) {
      const edge = core.topEdge.up(Date.now());
      if (edge === 'menu') core.send({ kind: 'menu' });
      else if (edge === 'hint') core.overlay.toast('Press Up again for the menu');
      return;
    }
    // A frame as big as the screen with the rest of the page out of sight
    // beyond it: the page is scrolled, as it is from anything else with
    // nowhere to go, and the highlight takes up what comes into view.
    // (Seen on two news sites that open with an advertisement's frame: the
    // highlight went back into the frame each time and never got past it.)
    if (!core.hooks && (how === 'up' || how === 'down')) {
      const scrolled = scrollBy(core.doc, el, how, false, core.pinnedLayer());
      if (scrolled) {
        core.view.clearTimeout(core.scrollTimer);
        core.scrollTimer = core.view.setTimeout(() => {
          const f = core.nav.focused;
          if (!f || core.nav.focusIsOffScreen() || !deepContains(scrolled, f)) core.nav.focusOnScreen(how, scrolled);
        }, 350);
        return;
      }
    }
    enterFrame(el, true);
  };
  return { enterFrame, frameIn, frameExit };
}
