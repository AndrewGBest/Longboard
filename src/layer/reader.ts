// Finds the article on a page and reads its words, for the reader view
// (shared/reader.ts). Only reads: nothing on the page is changed, hidden or
// moved. No site is known by name here; the article is wherever most of the
// page's paragraphs are.
import { MAX_BLOCK_CHARS, MAX_BLOCKS, type Article, type ReaderBlock, type ReaderKind } from '../shared/reader';

/** Parts of a page that are never the article. */
const NOT_ARTICLE =
  'nav, aside, footer, form, script, style, noscript, template, svg, canvas, video, audio, iframe, button, select, textarea, input, figure, dialog, [hidden], [aria-hidden="true"], [role="navigation"], [role="complementary"], [role="banner"], [role="contentinfo"], [role="search"], [role="dialog"]';
const BLOCKS: Record<string, ReaderKind> = {
  H1: 'heading',
  H2: 'heading',
  H3: 'heading',
  H4: 'heading',
  H5: 'heading',
  H6: 'heading',
  P: 'text',
  LI: 'item',
  BLOCKQUOTE: 'quote',
  PRE: 'code',
  DT: 'heading',
  DD: 'text',
};
/** Elements that hold blocks of their own: one of these inside a list item or a quote means it is read piece by piece. */
const HOLDS_BLOCKS = 'p, ul, ol, div, h1, h2, h3, h4, h5, h6, blockquote, pre, table';
/** A paragraph shorter than this says little about where the article is. */
const MIN_PARAGRAPH = 40;
/** Text straight inside an element that is not a paragraph counts as one when there is this much of it. */
const MIN_LOOSE_TEXT = 80;

const tidy = (text: string | null, keepLines = false): string =>
  keepLines ? (text ?? '').replace(/\r/g, '').replace(/^\n+|\s+$/g, '') : (text ?? '').replace(/\s+/g, ' ').trim();

/**
 * The element the article is in, or null when the page has no paragraphs to
 * speak of. It starts from the element with the most paragraph text straight
 * inside it, and goes outward while the element around it holds a good deal
 * more (an article split into sections).
 */
function articleRoot(doc: Document): Element | null {
  const direct = new Map<Element, number>();
  const within = new Map<Element, number>();
  for (const p of doc.querySelectorAll('p')) {
    if (p.closest(NOT_ARTICLE)) continue;
    const length = tidy(p.textContent).length;
    if (length < MIN_PARAGRAPH || !p.parentElement) continue;
    direct.set(p.parentElement, (direct.get(p.parentElement) ?? 0) + length);
    for (
      let up: Element | null = p.parentElement;
      up && up !== doc.body && up !== doc.documentElement;
      up = up.parentElement
    )
      within.set(up, (within.get(up) ?? 0) + length);
  }
  let best: Element | null = null;
  let most = 0;
  for (const [element, score] of direct) {
    if (score > most) {
      best = element;
      most = score;
    }
  }
  if (!best) return null;
  for (
    let up = best.parentElement;
    up && within.has(up) && (within.get(up) ?? 0) >= 1.3 * (within.get(best) ?? most);
    up = up.parentElement
  )
    best = up;
  // The page's own word for the article, when it uses one, also holds the headline.
  return best.closest('article') ?? best.closest('main, [role="main"]') ?? best;
}

/** The article on the page, or null when no element holds any text to speak of. */
export function readArticle(doc: Document): Article | null {
  const root = articleRoot(doc);
  if (!root) return null;
  const blocks: ReaderBlock[] = [];
  const add = (kind: ReaderKind, text: string): void => {
    if (text.length > 1 && blocks.length < MAX_BLOCKS) blocks.push({ kind, text: text.slice(0, MAX_BLOCK_CHARS) });
  };
  const visit = (element: Element): void => {
    if (blocks.length >= MAX_BLOCKS || element.matches(NOT_ARTICLE)) return;
    const kind = BLOCKS[element.tagName];
    if (kind === 'code') return add(kind, tidy(element.textContent, true));
    if (
      kind &&
      !(
        (element.tagName === 'LI' || element.tagName === 'BLOCKQUOTE' || element.tagName === 'DD') &&
        element.querySelector(HOLDS_BLOCKS)
      )
    ) {
      return add(kind, tidy(element.textContent));
    }
    // Words lying straight in a box that holds no blocks of its own: some sites write paragraphs that way.
    if (!kind && !element.querySelector(`${HOLDS_BLOCKS}, li, dt, dd`)) {
      const text = tidy(element.textContent);
      if (text.length >= MIN_LOOSE_TEXT) add('text', text);
      return;
    }
    for (const child of element.children) visit(child);
  };
  visit(root);
  const heading = root.querySelector('h1') ?? doc.querySelector('h1');
  return { title: tidy(heading?.textContent ?? '') || tidy(doc.title), blocks };
}
