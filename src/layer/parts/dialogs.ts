// Pop-ups and dialogs: the highlight goes in when one opens and comes back when it closes.
import { deepContains } from '../spatial/deep';
import { isVisible, openDialog } from '../spatial/navigator';
import type { LayerCore } from './core';

/** What this part adds for the other parts to use. */
export interface DialogsPart {
  /** Moves focus into a pop-up that has opened, if it is not there already. */
  openToggle: { label: HTMLLabelElement; input: HTMLInputElement } | null;
  dialogTimer: number | undefined;
  enterDialog: () => boolean;
  /** After asking a pop-up to close: once it has gone, focus returns to what opened it. */
  leaveDialog: () => void;
}

export function createDialogs(core: LayerCore): Omit<DialogsPart, 'openToggle' | 'dialogTimer'> {
  /** Moves focus into a pop-up that has opened, if it is not there already. */
  core.openToggle = null;
  let beforeDialog: Element | null = null;
  core.dialogTimer = undefined;
  const enterDialog = (): boolean => {
    const dialog = openDialog(core.doc);
    if (!dialog) return false;
    const f = core.nav.focused;
    // Not while the keyboard is typing into a frame of the dialog: taking
    // the highlight there takes the cursor out of the field. (Seen on a
    // film service's sign-in prompt: the keyboard closed as it opened.)
    if (!core.frameTyping && !core.frameInside && !core.frameAsked && (!f || !deepContains(dialog, f))) {
      beforeDialog = f;
      core.nav.focusFirstIn(dialog);
    }
    return true;
  };
  /** After asking a pop-up to close: once it has gone, focus returns to what opened it. */
  const leaveDialog = (): void => {
    core.view.clearTimeout(core.dialogTimer);
    core.dialogTimer = core.view.setTimeout(() => {
      if (openDialog(core.doc)) return;
      const back = beforeDialog;
      beforeDialog = null;
      if (back?.isConnected && isVisible(back, core.view)) core.nav.focus(back);
    }, 600);
  };
  return { enterDialog, leaveDialog };
}
