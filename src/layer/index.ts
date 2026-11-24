// Entry point of the page-side layer. Runs in the preload's isolated world:
// it shares the DOM with the site but not its JavaScript, so the site cannot
// tamper with it and it does not modify the site's own scripts.
//
// startLayer puts the parts in parts/ together, starts the timers that
// belong to no one part, and returns what the preload may ask of the layer.
import { elementAt, matchesOf, pickChain } from './edit/selector';
import { installPurchaseGuard, isSpendControl } from './guard/purchase-guard';
import { startPolling } from './input/gamepad';
import { createBack } from './parts/back';
import type { Layer, LayerCore, LayerDeps } from './parts/core';
import { isTextEntry } from './parts/core';
import { createDialogs } from './parts/dialogs';
import { createDispatch } from './parts/dispatch';
import { createFrames } from './parts/frames';
import { createInput } from './parts/input';
import { createKeyboard } from './parts/keyboard';
import { createMoving } from './parts/moving';
import { createPage } from './parts/page';
import { createPageKeys } from './parts/page-keys';
import { createPlayerControls } from './parts/player-controls';
import { createSearch } from './parts/search';
import { isPlayerActive, playerScope } from './player';
import type { SiteRules } from './profile/rules';
import { deepActiveElement } from './spatial/deep';
import { HOST_TAG } from './ui/overlay';

export type { LayerDeps, Layer } from './parts/core';

/** Starts the layer on a page (or on one of Longboard's own screens) and returns the handle to it. */
export function startLayer(deps: LayerDeps): Layer {
  // Each part adds to `core` what the later ones (and, once running, the
  // earlier ones) use. The order matters: a part's set-up may use what the
  // parts above it made.
  const core = { deps } as LayerCore;
  Object.assign(core, createPage(core));
  Object.assign(core, createMoving(core));
  Object.assign(core, createFrames(core));
  Object.assign(core, createKeyboard(core));
  Object.assign(core, createPageKeys(core));
  Object.assign(core, createDialogs(core));
  Object.assign(core, createPlayerControls(core));
  Object.assign(core, createBack(core));
  Object.assign(core, createSearch(core));
  Object.assign(core, createDispatch(core));
  Object.assign(core, createInput(core));

  /** What the shell has said: this view is the one in front, or is behind another. */
  let toldFront: boolean | undefined;
  const stopPads = startPolling(
    core.view,
    core.mode,
    core.dispatch,
    core.options.buttons,
    {
      active: () => core.pointerOn,
      held: (dirs) => core.send({ kind: 'pointerHeld', dirs }),
    },
    () => toldFront,
  );

  // Tell the shell when video is playing so it can hold off the screensaver.
  let lastPlaying = false;
  let lastAwayAt = 0;
  const playbackTimer = core.view.setInterval(() => {
    // Minimised or behind another window: nothing to look after. Playback
    // was paused on the way out, and the shell must hear that it stopped.
    if (core.doc.hidden) {
      if (lastPlaying) {
        lastPlaying = false;
        core.send({ kind: 'playback', playing: false });
      }
      return;
    }
    const v = core.mainVideo();
    const playing = !!v && !v.paused && !v.ended;
    if (v && core.inPlayer() && !core.pointerOn) core.watchNativeVideo();
    // Mark the player so the stylesheet can hide controls the site has disabled.
    if (v && core.inPlayer()) playerScope(v, core.playerRoots).setAttribute('data-longboard-player', '');
    // Focus left over from the page behind must not carry into the player, and
    // the ring must not sit on the picture unless the user is on a control.
    // (onPlayerControl drops focus that is outside the player. Focus on a
    // control is kept: pausing and resuming from the control bar must not lose it.)
    if (playing && !core.onPlayerControl()) core.overlay.track(null);
    // A pop-up that opened on its own takes focus too.
    if (!playing) core.enterDialog();
    if (playing !== lastPlaying) {
      lastPlaying = playing;
      core.send({ kind: 'playback', playing });
    }
  }, 2000);

  const stopGuard = core.options.automation
    ? installPurchaseGuard(core.doc, core.rules.selectors.purchaseControls, () =>
        core.overlay.toast('Blocked: automation mode never activates purchase or sign-up controls'),
      )
    : (): void => undefined;

  return {
    dispatch: core.dispatch,
    notice: (text) => core.overlay.toast(text, 6000),
    loading: (on) => core.overlay.loading(on),
    frameField: core.frameField,
    frameIn: core.frameIn,
    frameExit: core.frameExit,
    framePlayer: () => !!core.frame && core.mainVideo() !== null,
    front: (on) => {
      toldFront = on ?? undefined;
    },
    dropHighlight: () => core.nav.clear(),
    takeHighlight: (stay) => {
      if (stay && core.nav.focused?.isConnected) return core.nav.focus(core.nav.focused);
      // A player that is running takes the keys with nothing highlighted,
      // as a player that fills the page does: OK plays and pauses, left and
      // right seek, up and down bring its controls up.
      if (core.frame && isPlayerActive(core.doc, core.playerRoots, core.playerShare())) {
        core.nav.clear();
        return true;
      }
      return (
        core.nav.focusFirstOnScreen() ||
        core.nav.focusFirstIn(core.doc.documentElement) ||
        (!!core.frame && core.mainVideo() !== null)
      );
    },
    phoneText: (id) => {
      const into = deepActiveElement(core.doc);
      if (!into || !isTextEntry(into)) {
        core.send({ kind: 'phoneNo', id });
        return;
      }
      // A scripted run never types a password or a one-time code, whatever the text came from (Hard rule 10).
      if (core.keyboardBarred(into)) return;
      // The phone is the keyboard now: the field has the keys, as with a real one, and the on-screen one goes away.
      core.typedInto = into;
      core.closeOsk();
      core.send({ kind: 'phoneOk', id });
    },
    away: () => {
      // The window is no longer in front. Pause through the site's own key,
      // and only if something is playing: the key is a toggle.
      // The shell may say it more than once for one departure (focus lost,
      // then minimised); a second key would start playback again.
      if (Date.now() - lastAwayAt < 3000) return;
      const v = core.mainVideo();
      if (v && core.inPlayer() && !v.paused && !v.ended) {
        lastAwayAt = Date.now();
        core.pressKey(core.siteKey('playPause'));
      }
    },
    pointer: (spot) => {
      const was = core.pointerOn;
      core.pointerOn = spot !== null;
      core.overlay.pointer(spot);
      if (core.pointerOn && !was) {
        // One indicator at a time: the ring goes while the pointer is out.
        core.closeOsk();
        core.nav.clear();
        core.doc.documentElement.classList.add('longboard-no-pointer');
      }
      if (!core.pointerOn && was) {
        // A click may have left the keys inside an embedded frame, where
        // this layer would never hear them. Take them back.
        const active = core.doc.activeElement;
        if (active instanceof HTMLIFrameElement && !core.frameTyping && !core.frameInside) active.blur();
      }
    },
    editPick: (x, y) => {
      const el = elementAt(core.doc, x, y);
      // Nothing of the layer's own, and nothing inside a frame, can be marked.
      if (!el || el.closest(HOST_TAG) || el === core.doc.documentElement || el === core.doc.body) {
        core.overlay.toast('Nothing there can be marked');
        return;
      }
      core.send({ kind: 'editPicked', chain: pickChain(el) });
    },
    editShow: (show) => {
      if (!show) {
        core.overlay.marks([]);
        return;
      }
      const list: Array<{ el: Element; kind: string }> = [];
      const add = (selector: string, kind: string): void => {
        for (const el of matchesOf(core.doc, selector))
          if (list.length < 120 && !el.closest(HOST_TAG)) list.push({ el, kind });
      };
      for (const kind of ['include', 'exclude', 'row', 'player'] as const)
        for (const selector of show.marks[kind]) add(selector, kind);
      if (show.picked) add(show.picked, 'picked');
      core.overlay.marks(list);
    },
    setRules: (next) => {
      // In place: the navigator and the player rules hold on to these lists.
      for (const key of Object.keys(core.rules.selectors) as Array<keyof SiteRules['selectors']>) {
        core.rules.selectors[key].length = 0;
        core.rules.selectors[key].push(...next.selectors[key]);
      }
      core.rules.groups.length = 0;
      core.rules.groups.push(...next.groups);
      core.rules.initial = next.initial;
      core.rules.generic = next.generic;
      core.navOptions.skip = [...next.selectors.rowPrev, ...next.selectors.rowNext];
      core.navOptions.initial = next.initial ?? undefined;
      core.navOptions.closeFirst = next.selectors.dismiss;
      core.navOptions.looksClickable = core.navOptions.readingScroll = core.navOptions.growPicturesOnly = next.generic;
      core.rules.playerKeys = next.playerKeys;
      core.rules.id = next.id;
      core.rules.name = next.name;
      core.rules.version = next.version;
    },
    mayClickAt: (x, y) => {
      const el = elementAt(core.doc, x, y);
      // What is inside a frame cannot be seen from here; the shell asks the frame's own guard.
      if (el instanceof HTMLIFrameElement) return 'frame';
      if (
        el &&
        !(el instanceof HTMLEmbedElement) &&
        !(el instanceof HTMLObjectElement) &&
        !isSpendControl(el, core.rules.selectors.purchaseControls, core.view.location.href)
      )
        return 'yes';
      core.overlay.toast('Blocked: automation mode never activates purchase or sign-up controls');
      return 'no';
    },
    typeIn: core.typeIn,
    candidates: () => core.nav.candidates(),
    focusFirstIn: (container) => core.nav.focusFirstIn(container),
    focus: (el) => core.nav.focus(el),
    stop: () => {
      core.view.removeEventListener('keydown', core.onKey, true);
      core.view.removeEventListener('blur', core.reclaim);
      core.doc.removeEventListener('focusin', core.onFocusIn, true);
      core.view.removeEventListener('mousemove', core.onPointer);
      core.view.removeEventListener('mousedown', core.onMouseDown, true);
      core.view.clearInterval(playbackTimer);
      core.view.clearInterval(core.searchPoll);
      core.view.clearInterval(core.controlsTimer);
      core.view.clearInterval(core.keepAlive);
      core.view.clearInterval(core.reclaimTimer);
      core.view.clearTimeout(core.refocusTimer);
      core.view.clearTimeout(core.followTimer);
      core.view.clearInterval(core.coverTimer);
      core.view.clearTimeout(core.dialogTimer);
      core.view.clearTimeout(core.hoverTimer);
      core.view.clearTimeout(core.edgeTimer);
      core.view.clearTimeout(core.scrollTimer);
      stopPads();
      stopGuard();
    },
  };
}
