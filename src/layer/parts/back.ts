// Back: closing what is open, leaving the player, then asking the shell to go back.
import { firstMatch } from '../profile/rules';
import { deepActiveElement } from '../spatial/deep';
import { playerIsOwnPage } from '../player';
import { MENU_ENTRY, openDialog, press } from '../spatial/navigator';
import type { LayerCore } from './core';
import { isTextEntry } from './core';

/** What this part adds for the other parts to use. */
export interface BackPart {
  refocusTimer: number | undefined;
  followTimer: number | undefined;
  coverTimer: number | undefined;
  /** A menu was seen to open in the player and no Escape has been sent for it yet. */
  playerMenuSeen: boolean;
  /** The address the user was last browsing at, outside the player. */
  browseUrl: string | null;
  back: () => void;
}

export function createBack(
  core: LayerCore,
): Omit<BackPart, 'refocusTimer' | 'followTimer' | 'coverTimer' | 'playerMenuSeen' | 'browseUrl'> {
  core.refocusTimer = undefined;
  core.followTimer = undefined;
  core.coverTimer = undefined;
  let lastCloseAt = 0;
  let backStreak = 0;
  /** A menu was seen to open in the player and no Escape has been sent for it yet. */
  core.playerMenuSeen = false;
  /** The address the user was last browsing at, outside the player. */
  core.browseUrl = null;
  const back = (): void => {
    const active = deepActiveElement(core.doc);
    if (isTextEntry(active)) {
      (active as HTMLElement).blur();
      // A field that takes the cursor straight back must not make Back useless.
      if (deepActiveElement(core.doc) !== active) return;
    }
    if (core.hooks?.back?.()) return;
    // Something the profile says Back closes first (a banner, a panel).
    const closer = core.visibleMatch(core.rules.selectors.dismiss);
    if (closer) {
      press(closer);
      return;
    }
    if (core.openToggle) {
      const { label, input } = core.openToggle;
      core.openToggle = null;
      if (label.isConnected && input.checked) {
        label.click();
        core.nav.focus(label);
        return;
      }
    }
    if (openDialog(core.doc)) {
      // The site closes its own pop-ups on Escape.
      core.pressKey('close');
      core.leaveDialog();
      return;
    }
    if (core.hoverHost) {
      // Close the menu and put focus back on the button that opened it.
      core.unhover();
      if (core.hoverTrigger?.isConnected) core.nav.focus(core.hoverTrigger);
      return;
    }
    if (core.inPlayer()) {
      // First Back leaves the controls and returns to the picture.
      if (core.onPlayerControl()) {
        core.nav.clear();
        return;
      }
      // A player in an embedded frame is left by leaving the frame: the page
      // round it is still there, and the highlight goes back to the frame.
      if (core.frame) {
        core.frame.exit('back');
        return;
      }
      const close = firstMatch(core.doc, core.rules.selectors.playerClose);
      if (close) {
        press(close);
        return;
      }
      // A player that is a page of its own is left like any page, once any
      // menu it has open is closed with the site's own Escape key.
      // A menu's entry can open a view with no entries of its own (a slider,
      // on Steamboat's service), so having seen the menu open counts until one
      // Escape has been sent for it.
      const menuOpen = core.playerMenuSeen || core.nav.candidates().some((el) => el.matches(MENU_ENTRY));
      core.playerMenuSeen = false;
      if (!menuOpen && playerIsOwnPage(core.browseUrl, core.view.location.href) && core.view.history.length > 1) {
        core.view.history.back();
        return;
      }
      // Ask the site's player with its own Escape key. With a menu open the
      // first Escape closes the menu and the next one the player, so history
      // is only the last resort: the third Back in a row that leaves the
      // player still open. Nothing is done on a timer; a closing player can
      // linger for a moment, and going back then would lose the title page.
      backStreak = Date.now() - lastCloseAt < 4000 ? backStreak + 1 : 1;
      lastCloseAt = Date.now();
      if (backStreak >= 3) {
        backStreak = 0;
        if (core.view.history.length > 1) core.view.history.back();
        return;
      }
      core.pressPlayerKey('close');
      return;
    }
    goBack();
  };
  // The shell does the going back: it knows whether there is a page to go
  // back to, and shows Home when there is not.
  const goBack = (): void => (core.frame ? core.frame.exit('back') : core.send({ kind: 'back' }));
  return { back };
}
