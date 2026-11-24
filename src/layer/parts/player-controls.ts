// A playing video: showing the player's controls and moving among them.
import { type Direction } from '../../shared/actions';
import { deepActiveElement } from '../spatial/deep';
import { isSeekBar, playControl } from '../player';
import { isSidewaysSlider } from '../spatial/navigator';
import type { LayerCore } from './core';

/** What this part adds for the other parts to use. */
export interface PlayerControlsPart {
  ignorePointerUntil: number;
  controlsTimer: number | undefined;
  lastControlKeyAt: number;
  keepAlive: number;
  moveInPlayer: (dir: Direction) => void;
}

export function createPlayerControls(
  core: LayerCore,
): Omit<PlayerControlsPart, 'ignorePointerUntil' | 'controlsTimer' | 'lastControlKeyAt'> {
  // Up or down in the player: show the site's controls (they appear when the
  // pointer moves) and put focus on the nearest one in that direction.
  core.ignorePointerUntil = 0;
  core.controlsTimer = undefined;
  const revealControls = (): void => {
    core.ignorePointerUntil = Date.now() + 500;
    core.send({ kind: 'revealControls' });
  };
  // The site hides its controls soon after the pointer stops (under two
  // seconds on the live site; a movement every second holds them). While the
  // user is on one, keep them up, so focus does not vanish mid-thought; give
  // up after a while without a key so the picture is not covered forever.
  const CONTROLS_LINGER_MS = 20_000;
  core.lastControlKeyAt = 0;
  const keepAlive = core.view.setInterval(() => {
    if (core.doc.hidden) return;
    if (Date.now() - core.lastControlKeyAt < CONTROLS_LINGER_MS && core.onPlayerControl()) revealControls();
  }, 1000);
  const moveInPlayer = (dir: Direction): void => {
    core.lastControlKeyAt = Date.now();
    revealControls();
    if (core.onPlayerControl()) {
      // On the progress bar, left and right are sent to the site as its seek
      // keys: nothing lies beside a bar that spans the screen. (On Steamboat's
      // site the focused bar answers them with its own small steps.)
      const f = core.nav.focused;
      if (f && (dir === 'left' || dir === 'right') && isSeekBar(f, core.view)) {
        core.pressPlayerKey(dir === 'left' ? 'seekBack' : 'seekForward');
        return;
      }
      // Any other slider that lies sideways (a volume track) takes them as the keys they are.
      if (f && (dir === 'left' || dir === 'right') && isSidewaysSlider(f) && deepActiveElement(core.doc) === f) {
        core.pressKey(dir === 'left' ? 'seekBack' : 'seekForward');
        return;
      }
      if (core.nav.move(dir)) return;
      // At the top or bottom of a player that is part of a longer page, up
      // and down go on into the page: for this one move everything is in reach.
      if ((dir === 'up' || dir === 'down') && core.playerInPage()) {
        // What comes next may be more than a screen away. A page being read
        // is scrolled toward something that far, a step at a time; out of a
        // player the highlight goes straight to it.
        const from = core.nav.focused;
        core.leavingPlayer = true;
        const out = core.nav.move(dir, true);
        core.leavingPlayer = false;
        if (out && core.nav.focused !== from) return;
      }
      core.overlay.feedback(dir);
      return;
    }
    // The controls are created and faded in after the pointer moves; wait for them.
    let tries = 0;
    core.view.clearInterval(core.controlsTimer);
    core.controlsTimer = core.view.setInterval(() => {
      // Up brings the controls up with the highlight on the play button;
      // the nearest thing above the middle is the player's Close. Down goes
      // to what is below the middle, the progress bar first where there is one.
      const all = core.inPlayer() ? core.nav.candidates() : [];
      const play = dir === 'up' ? playControl(all, core.view) : null;
      const done =
        !core.inPlayer() ||
        (all.length > 0 &&
          (play
            ? core.nav.focus(play)
            : core.nav.moveFrom({ x: core.view.innerWidth / 2, y: core.view.innerHeight / 2 }, dir)));
      if (done || ++tries >= 15) core.view.clearInterval(core.controlsTimer);
    }, 100);
  };
  return { keepAlive, moveInPlayer };
}
