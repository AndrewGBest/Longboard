// The window losing the screen to another program, and getting it back.

import type { Core } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface AwayPart {
  awayTimer: NodeJS.Timeout | undefined;
  returned: () => void;
}

export function createAway(core: Core): Omit<AwayPart, 'awayTimer'> {
  // A TV shows one thing at a time. When another app comes in front: what is
  // playing is paused, by the layer, with the site's own key; the app is
  // silenced; a fullscreen window is minimised. Sound returns with the
  // window; playback waits for the person.
  core.awayTimer = undefined;
  const away = (): void => {
    if (core.page.isDestroyed()) return;
    core.page.send('longboard:away');
    core.page.setAudioMuted(true);
    // Everything else on the page stops too, once the window has really lost
    // its place (not for a moment, as when one of its own lists opens).
    if (core.surface === 'page') core.freezeSoon(core.page);
    core.awayAt = Date.now();
    core.windowAway = true;
    core.tellFront();
    clearTimeout(core.awayTimer);
    core.awayTimer = setTimeout(() => {
      if (!core.win.isDestroyed() && core.win.isFullScreen() && !core.win.isFocused() && !core.win.isMinimized())
        core.win.minimize();
    }, 700);
  };
  const returned = (): void => {
    clearTimeout(core.awayTimer);
    core.awayAt = 0;
    core.windowAway = false;
    core.tellFront();
    if (!core.page.isDestroyed() && core.surface === 'page') {
      core.thaw(core.page);
      core.page.setAudioMuted(false);
    }
  };
  core.win.on('blur', away);
  core.win.on('minimize', away);
  core.win.on('hide', away);
  core.win.on('focus', returned);
  core.win.on('restore', returned);
  core.win.on('show', returned);
  return { returned };
}
