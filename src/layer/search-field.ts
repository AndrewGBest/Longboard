// Whether a text field is a site's search box, as far as its own markup
// says. Used for two things a search box gets and other fields do not: the
// keyboard's Enter key reads "search", and putting the keyboard away with
// nothing typed tells the site Escape, which is how a search box that has
// spread itself over the page's menu is closed again.

const SELECTOR = 'input[type="search"], [role="searchbox"], [role="search"] input, [role="search"] textarea, input[enterkeyhint="search"]';
/** Attributes that are read for the word; what was typed (`value`) and addresses are not. */
const SKIP = new Set(['value', 'href', 'src', 'style', 'autocomplete', 'type']);

export function looksLikeSearch(el: Element): boolean {
  try {
    if (el.matches(SELECTOR)) return true;
  } catch {
    // a browser that cannot read the selector: go by the attributes
  }
  // Sites name the box in whatever attribute they use for their own code
  // (a name, an id, a label, a placeholder, a test hook).
  for (const attr of Array.from(el.attributes)) {
    if (SKIP.has(attr.name)) continue;
    if (/search/i.test(attr.value)) return true;
  }
  return false;
}

/** True when nothing has been typed into the field. */
export function isEmptyField(el: Element): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value === '';
  return (el.textContent ?? '').trim() === '';
}
