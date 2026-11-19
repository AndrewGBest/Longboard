// A text field with a list of suggestions under it, as the ARIA combobox
// pattern describes it: the field keeps the cursor, the arrow keys go to the
// field, and the page marks one suggestion as the current one. Seen on a
// video site's search (2026-11-19): moving the highlight onto a suggestion
// took the cursor out of the field, and the page drew its list afresh, so the
// suggestion that had the highlight was gone.
import { deepActiveElement } from './spatial/deep';

/** The field with the cursor, when it says it is a combobox whose list is open. */
export function openCombo(doc: Document): Element | null {
  const el = deepActiveElement(doc);
  if (!el || el.getAttribute('role') !== 'combobox' || el.getAttribute('aria-expanded') !== 'true') return null;
  return el.matches('input, textarea, [contenteditable=""], [contenteditable="true"]') ? el : null;
}

function byId(from: Element, id: string | null): Element | null {
  if (!id) return null;
  const root = from.getRootNode() as Document | ShadowRoot;
  return root.getElementById?.(id) ?? from.ownerDocument.getElementById(id);
}

/** The suggestion the page says is the current one, if any. */
export function activeOption(combo: Element): Element | null {
  const named = byId(combo, combo.getAttribute('aria-activedescendant'));
  if (named) return named;
  for (const id of `${combo.getAttribute('aria-controls') ?? ''} ${combo.getAttribute('aria-owns') ?? ''}`.split(/\s+/)) {
    const picked = byId(combo, id)?.querySelector('[role="option"][aria-selected="true"]');
    if (picked) return picked;
  }
  return null;
}
