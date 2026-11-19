// Reader view: the words of an article, shown on a screen of Longboard's own
// in big type. The page itself is not changed in any way: its text is read
// (layer/reader.ts) and drawn somewhere else. Nothing leaves the machine and
// nothing is kept. Pure, so the checks are unit-tested.

export type ReaderKind = 'heading' | 'text' | 'item' | 'quote' | 'code';
export interface ReaderBlock {
  kind: ReaderKind;
  text: string;
}
export interface Article {
  title: string;
  blocks: ReaderBlock[];
}

export const MAX_BLOCKS = 800;
export const MAX_BLOCK_CHARS = 6000;
/** Less than this and what was found is a caption or a menu, not something to read. */
export const MIN_ARTICLE_CHARS = 500;
const KINDS: readonly string[] = ['heading', 'text', 'item', 'quote', 'code'];

/** What a page's layer says the article is, checked before it is shown. Null when it is not one. */
export function parseArticle(raw: unknown): Article | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r['blocks'])) return null;
  const blocks: ReaderBlock[] = [];
  let chars = 0;
  for (const item of r['blocks'].slice(0, MAX_BLOCKS)) {
    if (!item || typeof item !== 'object') continue;
    const b = item as Record<string, unknown>;
    if (typeof b['kind'] !== 'string' || !KINDS.includes(b['kind']) || typeof b['text'] !== 'string') continue;
    const text = b['text'].slice(0, MAX_BLOCK_CHARS);
    if (!text.trim()) continue;
    blocks.push({ kind: b['kind'] as ReaderKind, text });
    if (b['kind'] !== 'heading') chars += text.length;
  }
  if (chars < MIN_ARTICLE_CHARS) return null;
  return { title: typeof r['title'] === 'string' ? r['title'].replace(/\s+/g, ' ').trim().slice(0, 300) : '', blocks };
}
