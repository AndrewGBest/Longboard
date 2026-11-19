// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readArticle } from '../src/layer/reader';
import { MAX_BLOCKS, parseArticle } from '../src/shared/reader';

const words = (n: number, w = 'word'): string => Array.from({ length: n }, (_, i) => `${w}${i}`).join(' ');
const page = (html: string, title = 'A made-up page'): Document => {
  document.title = title;
  document.body.innerHTML = html;
  return document;
};

describe('finding the article on a page', () => {
  it('reads the headline, paragraphs, lists and quotes in order, and leaves the rest', () => {
    const before = `
      <nav><p>${words(60, 'menu')}</p></nav>
      <main><article>
        <h1>The headline</h1>
        <p>${words(40, 'first')}</p>
        <aside><p>${words(50, 'related')}</p></aside>
        <h2>A part</h2>
        <ul><li>one thing</li><li>another thing</li></ul>
        <blockquote>Somebody said this.</blockquote>
        <pre>line one\n  line two</pre>
        <figure><figcaption>A caption that is not read</figcaption></figure>
        <button>Share</button>
        <p>${words(40, 'second')}</p>
      </article></main>
      <footer><p>${words(60, 'footer')}</p></footer>`;
    const doc = page(before);
    const html = doc.body.innerHTML;
    const article = readArticle(doc)!;
    expect(article.title).toBe('The headline');
    expect(article.blocks.map((b) => b.kind)).toEqual(['heading', 'text', 'heading', 'item', 'item', 'quote', 'code', 'text']);
    expect(article.blocks[6]!.text).toBe('line one\n  line two');
    const all = article.blocks.map((b) => b.text).join(' ');
    for (const left of ['menu1', 'related1', 'footer1', 'caption', 'Share']) expect(all).not.toContain(left);
    // Reading changes nothing on the page.
    expect(doc.body.innerHTML).toBe(html);
  });
  it('finds an article that has no element named for it, by where the paragraphs are', () => {
    const article = readArticle(page(`<div id="side"><p>${words(12)}</p></div><div id="story"><div><p>${words(50, 'a')}</p><p>${words(50, 'b')}</p></div><div><p>${words(50, 'c')}</p></div></div>`, 'Its title'))!;
    expect(article.title).toBe('Its title');
    expect(article.blocks.length).toBe(3);
  });
  it('reads words that lie straight in a box as a paragraph', () => {
    const article = readArticle(page(`<article><p>${words(30)}</p><div>${words(30, 'loose')}</div><div>short</div></article>`))!;
    expect(article.blocks.map((b) => b.text.slice(0, 6))).toEqual(['word0 ', 'loose0']);
  });
  it('finds nothing on a page of links and buttons', () => {
    expect(readArticle(page('<nav><a href="/a">A</a></nav><div><button>Play</button><p>Short.</p></div>'))).toBeNull();
  });
});

describe('what is shown as an article', () => {
  const blocks = [{ kind: 'heading', text: 'T' }, { kind: 'text', text: 'x'.repeat(600) }];
  it('is what the layer found, when there is enough to read', () => {
    expect(parseArticle({ title: '  A   title ', blocks })).toEqual({ title: 'A title', blocks });
  });
  it('is nothing when there is too little, or it is not an article at all', () => {
    expect(parseArticle({ title: 'x', blocks: [{ kind: 'heading', text: 'y'.repeat(900) }, { kind: 'text', text: 'few words' }] })).toBeNull();
    for (const bad of [null, 5, 'x', {}, { blocks: 'all' }]) expect(parseArticle(bad)).toBeNull();
  });
  it('drops what is not text of a known kind, and is never endless', () => {
    const got = parseArticle({ blocks: [{ kind: 'script', text: 'x'.repeat(900) }, { kind: 'text', text: 5 }, ...blocks, { kind: 'text', text: '   ' }] })!;
    expect(got.blocks).toEqual(blocks);
    expect(parseArticle({ blocks: Array.from({ length: 5000 }, () => ({ kind: 'text', text: 'some words' })) })!.blocks.length).toBe(MAX_BLOCKS);
    expect(parseArticle({ blocks: [{ kind: 'text', text: 'y'.repeat(50_000) }] })!.blocks[0]!.text.length).toBe(6000);
  });
});
