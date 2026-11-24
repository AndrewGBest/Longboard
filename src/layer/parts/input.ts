// Listening to the page: keys, focus and the mouse. Every key pressed comes
// to onKey first, which decides whether it is Longboard's or the site's.
import { isNativePlayerKey } from '../../shared/player-keys';
import { keyToAction, ownRemoteKey } from '../input/keys';
import { deepActiveElement } from '../spatial/deep';
import { HOST_TAG } from '../ui/overlay';
import type { LayerCore } from './core';
import { isTextEntry } from './core';

/** What this part adds for the other parts to use. */
export interface InputPart {
  // The listeners, kept so that stopping the layer can take them off again.
  /** A key was pressed: turned into an action and carried out, or left to the site. */
  onKey: (e: KeyboardEvent) => void;
  /** Takes the keys back from an embedded frame that has taken them for itself. */
  reclaim: () => void;
  /** A real click counts as a press: a text field focused just after it is one the person asked for. */
  onMouseDown: (e: MouseEvent) => void;
  /** The page gave something its focus: the highlight goes along when that is what the page meant. */
  onFocusIn: (e: FocusEvent) => void;
  /** The mouse moved: the real pointer is shown again. */
  onPointer: () => void;
}

export function createInput(core: LayerCore): InputPart {
  // In an app that answers the remote itself, Up pressed again where the
  // app has nowhere further up still opens the menu: a remote may have no
  // key for it. Whether the app went anywhere is seen from outside: what
  // has its focus, where that is, and the address, a moment after the key.
  // Not while a video is being watched, where Up is the player's.
  const ownRemoteUp = (key: string): void => {
    if (key !== 'ArrowUp' || core.inPlayer()) {
      core.topEdge.reset();
      return;
    }
    const at = Date.now();
    const mark = (): string => {
      const el = deepActiveElement(core.doc);
      const r = el?.getBoundingClientRect();
      return `${core.view.location.href} ${core.view.scrollY} ${el?.tagName ?? ''} ${r ? [r.left, r.top, r.width, r.height].map(Math.round).join(',') : ''}`;
    };
    const before = mark();
    const held = deepActiveElement(core.doc);
    core.view.setTimeout(() => {
      if (deepActiveElement(core.doc) !== held || mark() !== before) {
        core.topEdge.reset();
        return;
      }
      const edge = core.topEdge.up(at);
      if (edge === 'menu') core.send({ kind: 'menu' });
      else if (edge === 'hint') core.overlay.toast('Press Up again for the menu');
    }, 200);
  };

  const onKey = (e: KeyboardEvent): void => {
    // Only keys that were really pressed (by a person, or by a script through
    // the browser's own input channel). A key event the page made up is not one.
    if (!e.isTrusted) return;
    // A key the layer asked the shell to press: it belongs to the site.
    if (e.isTrusted && core.injected.consume(e.key, Date.now())) return;
    // A real keyboard is in use: typing a character puts the on-screen one away.
    // Not Space: on some remotes that is the OK button, and it must press the highlighted key.
    // Backspace in a text field deletes, as it always has; it is only Back elsewhere.
    if (e.isTrusted && e.key === 'Backspace' && !core.oskOpen && isTextEntry(deepActiveElement(core.doc))) return;
    const typing = e.isTrusted && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.altKey && !e.metaKey;
    if (typing && isTextEntry(deepActiveElement(core.doc))) {
      // From here on the field has the keys, as in any browser, until focus moves.
      core.typedInto = deepActiveElement(core.doc);
      core.closeOsk();
      return;
    }
    // An open list takes its keys itself and the page never sees them. A
    // key that arrives here therefore means the list has closed.
    core.nativeList = null;
    const action = keyToAction(e, core.mode(), core.options.keys);
    if (!action) return;
    // In the player, a key that is already the site's own key for the action
    // goes straight to the site, untouched.
    if (isNativePlayerKey(e.key, action, core.rules.playerKeys) && core.inPlayer()) return;
    // An app made for TVs answers the remote itself. With Longboard's own
    // things out of the way (keyboard, menu, pointer), the arrows and OK are
    // the site's, and so is Back when it is a key such an app knows as Back.
    if (core.rules.ownRemote && !core.oskOpen && !core.pointerOn && ownRemoteKey(action.type, e.key)) {
      ownRemoteUp(e.key);
      return;
    }
    e.preventDefault();
    // Immediate: the site may also listen on the window, and must not see a
    // key the layer has taken.
    e.stopImmediatePropagation();
    core.dispatch(action);
  };
  core.view.addEventListener('keydown', onKey, true);

  // An embedded frame that takes the keys for itself would leave the remote
  // dead: nothing pressed would reach here again. Outside pointer mode (where
  // a click into a frame is the point) the keys are taken back.
  const reclaim = (): void => {
    core.view.setTimeout(() => {
      const active = core.doc.activeElement;
      if (
        core.pointerOn ||
        core.frameTyping ||
        core.frameInside ||
        core.frameAsked ||
        !(active instanceof HTMLIFrameElement)
      )
        return;
      active.blur();
      core.view.focus();
    }, 0);
  };
  core.view.addEventListener('blur', reclaim);
  // The blur is not always heard: a frame can have the keys before this
  // page's window is the one in front. (Seen on a news site reached by a
  // redirect: an advertisement's frame had them from the start and no press
  // of the remote did anything.) So it is also looked for now and then.
  core.view.setInterval(() => {
    if (
      !core.pointerOn &&
      !core.frameTyping &&
      !core.frameInside &&
      !core.frameAsked &&
      core.doc.visibilityState === 'visible' &&
      core.doc.activeElement instanceof HTMLIFrameElement
    )
      reclaim();
  }, 1000);

  // A text field the page focused by itself (a sign-in page puts the cursor
  // in its first field): take it as the remote's focus too, so the ring is on
  // it and the on-screen keyboard is up without a key press.
  const adoptField = (el: Element | null): void => {
    // Not the highlight's own arrival on a field: only focus given by the
    // page, or by a click in pointer mode, says that typing is wanted.
    if (core.nav.focusing) return;
    if (!el || !isTextEntry(el) || el.closest(HOST_TAG)) return;
    if (core.nav.focused !== el) core.nav.focus(el);
    // The keyboard comes up only when the page is answering something the
    // person just did (OK on a search button, a click on the field). A page
    // that puts the cursor in a field as it loads, as search pages do, gets
    // the highlight there and no more; OK then brings the keyboard up.
    if (Date.now() - core.lastPressAt < core.PRESS_ANSWER_MS && !core.oskOpen && !core.keyboardBarred(el))
      core.openOsk(el);
  };
  const onMouseDown = (e: MouseEvent): void => {
    if (e.isTrusted) core.lastPressAt = Date.now();
  };
  core.view.addEventListener('mousedown', onMouseDown, true);
  const onFocusIn = (e: FocusEvent): void => {
    const el = e.target instanceof Element ? e.target : null;
    // The page drew again what had the highlight and gave the new one its
    // focus: the highlight goes with it, rather than vanish until a key is pressed.
    if (el && !core.nav.focusing && !el.closest(HOST_TAG)) {
      // A moment later: the new one is given focus before the old one is taken away.
      core.view.setTimeout(() => {
        // Only back to what the highlight came from: a page that focuses
        // something else as it draws is not telling the highlight where to go.
        if (el.isConnected && core.doc.activeElement === el) core.nav.comeBack(core.nav.candidates(true), el);
      }, 50);
    }
    adoptField(el);
  };
  core.doc.addEventListener('focusin', onFocusIn, true);
  adoptField(deepActiveElement(core.doc));

  const onPointer = (): void => {
    // The shell's own nudge (revealControls in player-controls.ts, and the hover menus) is not the user reaching for a mouse.
    if (core.pointerOn || Date.now() < core.ignorePointerUntil) return;
    core.doc.documentElement.classList.remove('longboard-no-pointer');
  };
  core.view.addEventListener('mousemove', onPointer, { passive: true });
  return { onKey, reclaim, onMouseDown, onFocusIn, onPointer };
}
