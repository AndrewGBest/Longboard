// The on-screen keyboard: opening it on a text field, and typing through the shell.
import { oskDock, OskModel } from '../../shared/osk';
import { playerKeyInfo } from '../../shared/player-keys';
import { looksLikeSearch } from '../search-field';
import { deepActiveElement } from '../spatial/deep';
import type { LayerCore } from './core';
import { GENERIC_SEARCH } from './core';

/** What this part adds for the other parts to use. */
export interface KeyboardPart {
  /** The keyboard's keys, and which one is highlighted. */
  osk: OskModel;
  oskOpen: boolean;
  /** The keyboard is up for a text field inside an embedded frame: the frame has the cursor, and the shell hands the keys over. */
  frameTyping: boolean;
  /** Draws the keyboard as it now is, or takes it off the screen when it is closed. */
  drawOsk: () => void;
  /** True for the site's search box: by the profile's selector, the usual ones, or the field's own markup. */
  isSearchField: (el: Element) => boolean;
  /** Brings the keyboard up for a text field. In a frame's layer, tells the shell of the field instead. */
  openOsk: (field: Element) => void;
  closeOsk: () => void;
  /** The shell says a click put the cursor in a text field inside a frame (or that it has left). */
  frameField: (field: { hint: string; top: number; bottom: number } | null) => void;
  /** OK on the highlighted key: types it through the shell. */
  pressOsk: () => void;
}

export function createKeyboard(core: LayerCore): Omit<KeyboardPart, 'oskOpen' | 'frameTyping'> {
  // The keyboard types through the shell, as a real keyboard would: the
  // page gets ordinary key presses and never a value set from here.
  const osk = new OskModel();
  core.oskOpen = false;
  /** The word on the keyboard's Enter key. */
  let oskSubmit = 'enter';
  let oskSide: 'top' | 'bottom' = 'bottom';
  core.frameTyping = false;
  const drawOsk = (): void =>
    core.overlay.keyboard(core.oskOpen ? osk.rows : null, { row: osk.row, index: osk.index }, oskSubmit, oskSide);
  const isSearchField = (el: Element): boolean => {
    try {
      if (el.matches([...core.rules.selectors.searchInput, ...GENERIC_SEARCH].join(','))) return true;
    } catch {
      // A profile's selector the browser cannot read: go by the field itself.
    }
    return looksLikeSearch(el);
  };
  const openOsk = (field: Element): void => {
    // Inside a frame the keyboard is the page's: the shell is told of the field.
    if (core.frame) {
      core.frame.field(field);
      return;
    }
    // The keyboard needs the arrows; the pointer gives them up.
    if (core.pointerOn) core.send({ kind: 'pointerOff' });
    if (!core.oskOpen) osk.reset();
    // The key says what it does: the page's own word for it when it gives
    // one (the standard enterkeyhint attribute), "search" in a search field.
    const hint = (field.getAttribute('enterkeyhint') ?? '').toLowerCase();
    oskSubmit = ['go', 'search', 'send', 'next', 'done'].includes(hint)
      ? hint
      : isSearchField(field)
        ? 'search'
        : 'enter';
    // Keep the keyboard off the field, so what is typed can be seen.
    const box = field.getBoundingClientRect();
    oskSide = oskDock({ top: box.top, bottom: box.bottom }, core.doc.defaultView?.innerHeight ?? 0);
    core.oskOpen = true;
    drawOsk();
  };
  const closeOsk = (): void => {
    if (!core.oskOpen) return;
    core.oskOpen = false;
    if (core.frameTyping) {
      core.frameTyping = false;
      core.send({ kind: 'frameFieldDone' });
    }
    drawOsk();
  };
  const frameField = (field: { hint: string; top: number; bottom: number } | null): void => {
    if (!field) {
      if (core.frameTyping) closeOsk();
      return;
    }
    if (core.pointerOn) core.send({ kind: 'pointerOff' });
    if (!core.oskOpen) osk.reset();
    oskSubmit = ['go', 'search', 'send', 'next', 'done'].includes(field.hint) ? field.hint : 'enter';
    // Where the field is on the screen, as nearly as can be known from here: the frame's place plus the field's place in it.
    const frame =
      core.doc.activeElement instanceof HTMLIFrameElement ? core.doc.activeElement.getBoundingClientRect() : null;
    oskSide = oskDock(
      { top: (frame?.top ?? 0) + field.top, bottom: (frame?.top ?? 0) + field.bottom },
      core.doc.defaultView?.innerHeight ?? 0,
    );
    core.frameTyping = true;
    core.oskOpen = true;
    drawOsk();
  };
  const pressOsk = (): void => {
    // The field may have changed under the keyboard since it was opened: the
    // page moved the cursor on to the password, or turned the field into one.
    const into = deepActiveElement(core.doc);
    if (into && core.keyboardBarred(into)) {
      closeOsk();
      return;
    }
    const key = osk.key;
    if (osk.switchPage()) {
      drawOsk();
      return;
    }
    if (key.kind === 'char' || key.kind === 'space') {
      core.send({ kind: 'typeText', text: key.text ?? '' });
      return;
    }
    // Delete, enter and the two cursor keys are real key presses in the field.
    const name =
      key.kind === 'backspace' ? 'backspace' : key.kind === 'left' ? 'left' : key.kind === 'right' ? 'right' : 'enter';
    const info = playerKeyInfo(name);
    if (!info) return;
    core.injected.expect(info.domKey, Date.now());
    core.send({ kind: 'playerKey', key: name });
    if (key.kind === 'submit') closeOsk();
  };
  return { osk, drawOsk, isSearchField, openOsk, closeOsk, frameField, pressOsk };
}
