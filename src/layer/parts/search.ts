// Search: finding the site's search field and putting the highlight in it.
import { press } from '../spatial/controls';
import { isVisible } from '../spatial/visibility';
import type { LayerCore } from './core';
import { GENERIC_SEARCH, GENERIC_SEARCH_OPEN, isTextEntry } from './core';

/** What this part adds for the other parts to use. */
export interface SearchPart {
  /** The first element that matches one of the selectors and can be seen. */
  visibleMatch: (selectors: readonly string[]) => Element | null;
  /** Puts the highlight on a text field and brings the keyboard up: the person has asked to type there. */
  typeIn: (field: Element) => void;
  /** The watch for a hidden search field to show, after the control that opens it was pressed. */
  searchPoll: number | undefined;
  /** Search was asked for: goes to the site's search field and brings the keyboard up. */
  openSearch: () => void;
}

export function createSearch(core: LayerCore): Omit<SearchPart, 'searchPoll'> {
  const visibleMatch = (selectors: readonly string[]): Element | null => {
    for (const sel of selectors) {
      try {
        for (const el of core.doc.querySelectorAll(sel)) if (isVisible(el, core.view)) return el;
      } catch {
        // A bad selector must never break navigation.
      }
    }
    return null;
  };
  const typeIn = (field: Element): void => {
    core.nav.focus(field);
    if (isTextEntry(field) && !core.keyboardBarred(field)) core.openOsk(field);
  };
  core.searchPoll = undefined;
  const openSearch = (): void => {
    const inputs = [...core.rules.selectors.searchInput, ...GENERIC_SEARCH];
    const input = visibleMatch(inputs);
    if (input) {
      typeIn(input);
      return;
    }
    // Some sites keep the search field hidden until a control is activated.
    // The control is clicked like any other; the field is focused once it shows.
    const opener = visibleMatch([...core.rules.selectors.searchOpen, ...GENERIC_SEARCH_OPEN]);
    if (!opener) return;
    press(opener);
    let tries = 0;
    core.view.clearInterval(core.searchPoll);
    core.searchPoll = core.view.setInterval(() => {
      const shown = visibleMatch(inputs);
      if (shown) typeIn(shown);
      if (shown || ++tries >= 15) core.view.clearInterval(core.searchPoll);
    }, 100);
  };
  return { visibleMatch, typeIn, openSearch };
}
