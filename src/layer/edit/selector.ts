// Writes selectors for the profile editor: from the element a person pointed
// at, a chain of selectors for it and for each of its containers, each one
// written to match every element of the same kind (every card, not this
// card). Only structure is read: tag names, classes, a few structural
// attributes. Nothing here reads text.
import type { PickedStep } from '../../shared/editor';
import { composedParent, deepQueryAll } from '../spatial/deep';

const MAX_CHAIN = 6;
/** A class or id that looks made by hand, not generated: generated ones change with every build of a site. */
const PLAIN = /^[A-Za-z][A-Za-z0-9_-]{0,40}$/;
function looksGenerated(token: string): boolean {
  if (/\d{3,}/.test(token)) return true;
  return token.split(/[-_]/).some((part) => {
    // Letters and digits shuffled together ("1a2b3c4"), or a run of mixed-case letters ("UEsHTy").
    const shuffled = part.length >= 5 && (part.match(/\d/g)?.length ?? 0) >= 2 && /[A-Za-z]/.test(part);
    const mixedCase = part.length >= 6 && /^[A-Za-z0-9]+$/.test(part) && /[a-z]/.test(part) && /[A-Z]/.test(part.slice(1));
    return shuffled || mixedCase;
  });
}

function usableClasses(el: Element): string[] {
  return [...el.classList].filter((c) => PLAIN.test(c) && !looksGenerated(c) && !c.startsWith('longboard')).slice(0, 2);
}

const quote = (value: string): string => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** A selector for elements like `el`, by what marks its kind; null when nothing does. */
function byKind(el: Element, allowId = true): string | null {
  const tag = el.tagName.toLowerCase();
  const attribute = (attr: string): string | null => {
    const value = el.getAttribute(attr);
    return value && value.length <= 60 && !/\s/.test(value) ? `${tag}[${attr}=${quote(value)}]` : null;
  };
  // A test id is put there by the site's own people to name a kind of thing,
  // and outlives restyling; it comes before classes, which on many sites are
  // machine-made in ways that cannot be told from words (seen on a news site).
  const named = attribute('data-testid') ?? attribute('data-test-id');
  if (named) return named;
  const classes = usableClasses(el);
  if (classes.length) return `${tag}.${classes.join('.')}`;
  const role = attribute('role');
  if (role) return role;
  // An id names one thing, which is right for a player or a bar and wrong for "things like this".
  if (allowId && el.id && PLAIN.test(el.id) && !looksGenerated(el.id)) return `${tag}#${el.id}`;
  return null;
}

/**
 * A selector for elements like `el`. When nothing on the element says what
 * kind it is, it is named by its container: "the links directly inside X".
 */
export function selectorLike(el: Element): string {
  const own = byKind(el);
  if (own) return own;
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  const around = parent && parent !== el.ownerDocument.body && parent !== el.ownerDocument.documentElement ? byKind(parent, false) : null;
  return around ? `${around} > ${tag}` : tag;
}

/** Every element a selector matches, inside open shadow roots too (where the navigator also looks). */
export function matchesOf(doc: Document, selector: string): Element[] {
  try {
    return deepQueryAll(doc, selector);
  } catch {
    return [];
  }
}

/**
 * What is drawn at a point, looking into open shadow roots: on a site built
 * from web components the document only knows the outermost component.
 */
export function elementAt(doc: Document, x: number, y: number): Element | null {
  let el = doc.elementFromPoint(x, y);
  for (let i = 0; el?.shadowRoot && i < 20; i++) {
    const inner = el.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  return el;
}

/**
 * The chain for an element: itself, then each container out to the page,
 * leaving out steps that say the same as the one before.
 */
export function pickChain(el: Element): PickedStep[] {
  const doc = el.ownerDocument;
  const chain: PickedStep[] = [];
  for (let node: Element | null = el; node && node !== doc.body && node !== doc.documentElement && chain.length < MAX_CHAIN; node = composedParent(node)) {
    const selector = selectorLike(node);
    if (chain[chain.length - 1]?.selector === selector) continue;
    const matches = matchesOf(doc, selector).length;
    if (matches > 0) chain.push({ selector, matches });
  }
  return chain;
}
