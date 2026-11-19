// A site's own icon, on its way from the site to a file on disk. The bytes a
// site sends are never decoded by the shell: they are handed, as a data:
// address, to Longboard's own sandboxed screen, which draws the picture and
// hands back a PNG it made itself. These are the checks on each side. Pure.

export const MAX_ICON_BYTES = 2_000_000;
/** The PNG that comes back is small: a square of ICON_SIZE pixels. */
export const ICON_SIZE = 128;
const MAX_PNG_BYTES = 400_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** What a site sent as its icon, as a data: address for a picture element, or null when it cannot be one. */
export function iconDataUrl(bytes: Buffer, contentType: string | null): string | null {
  if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES) return null;
  const said = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  // Anything that is not declared as a picture is offered as one anyway (many sites mislabel icons); the browser works out which kind.
  const type = /^image\/[a-z0-9.+-]{1,40}$/.test(said) ? said : 'image/x-icon';
  return `data:${type};base64,${bytes.toString('base64')}`;
}

/** The PNG Longboard's own screen made from an icon, or null when what came back is not one. */
export function pngFromDataUrl(value: unknown): Buffer | null {
  const prefix = 'data:image/png;base64,';
  if (typeof value !== 'string' || !value.startsWith(prefix)) return null;
  const body = value.slice(prefix.length);
  if (body.length === 0 || body.length > MAX_PNG_BYTES * 1.4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return null;
  const bytes = Buffer.from(body, 'base64');
  if (bytes.length > MAX_PNG_BYTES || bytes.length < PNG_SIGNATURE.length + 12 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  return bytes;
}

/** One of the icons a page says are its own (a `link` element), or its web-app manifest. */
export interface IconLink {
  href: string;
  /** The link's `rel`, lower case: "icon", "apple-touch-icon", "manifest"... */
  rel: string;
  /** The link's `sizes`, as written: "180x180", "any", or nothing. */
  sizes: string;
}
const MAX_LINKS = 24;
const isWeb = (url: unknown): url is string => typeof url === 'string' && url.length <= 2000 && /^https?:\/\//i.test(url);

/** What a page reported about its icons, checked. Anything unusable is dropped. */
export function parseIconLinks(raw: unknown): IconLink[] {
  if (!Array.isArray(raw)) return [];
  const out: IconLink[] = [];
  for (const item of raw.slice(0, MAX_LINKS)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (!isWeb(r['href']) || typeof r['rel'] !== 'string') continue;
    out.push({ href: r['href'], rel: r['rel'].toLowerCase().slice(0, 80), sizes: typeof r['sizes'] === 'string' ? r['sizes'].slice(0, 80) : '' });
  }
  return out;
}

/** The largest size in a `sizes` value ("48x48 96x96"), in pixels; 0 when it names none. "any" is a drawing that fits every size. */
export function declaredSize(sizes: string): number {
  if (/\bany\b/i.test(sizes)) return 512;
  let best = 0;
  for (const m of sizes.matchAll(/(\d{1,4})x(\d{1,4})/gi)) best = Math.max(best, Math.min(Number(m[1]), Number(m[2])));
  return best;
}

const relHas = (rel: string, word: string): boolean => rel.split(/\s+/).includes(word);

/** The address of the page's web-app manifest, when it names one. */
export function manifestLink(links: readonly IconLink[]): string | null {
  return links.find((l) => relHas(l.rel, 'manifest'))?.href ?? null;
}

/** The icons a web-app manifest lists, with their sizes. `manifestUrl` is where the manifest came from: its addresses are relative to it. */
export function manifestIcons(manifest: unknown, manifestUrl: string): Array<{ url: string; size: number }> {
  const list = manifest && typeof manifest === 'object' ? (manifest as Record<string, unknown>)['icons'] : null;
  if (!Array.isArray(list)) return [];
  const out: Array<{ url: string; size: number }> = [];
  for (const item of list.slice(0, 40)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r['src'] !== 'string' || r['src'].length > 2000) continue;
    // An icon made only to be cut to a shape ("maskable") has its picture in the middle of a wide border.
    const purpose = typeof r['purpose'] === 'string' ? r['purpose'].toLowerCase().split(/\s+/) : ['any'];
    if (!purpose.includes('any')) continue;
    try {
      const url = new URL(r['src'], manifestUrl).href;
      if (isWeb(url)) out.push({ url, size: declaredSize(typeof r['sizes'] === 'string' ? r['sizes'] : '') });
    } catch {
      // not an address
    }
  }
  return out;
}

/**
 * The addresses to try for a site's icon, best first. A Home tile is drawn
 * ICON_SIZE pixels wide on a TV, so the best is the smallest picture that is
 * at least that big; after those come the smaller ones, biggest first, then
 * what the browser itself found, and last the place icons have always been.
 */
export function iconCandidates(links: readonly IconLink[], fromManifest: ReadonlyArray<{ url: string; size: number }>, favicons: readonly string[], pageUrl: string): string[] {
  const sized: Array<{ url: string; size: number }> = [...fromManifest];
  for (const link of links) {
    const touch = relHas(link.rel, 'apple-touch-icon') || relHas(link.rel, 'apple-touch-icon-precomposed');
    if (!touch && !relHas(link.rel, 'icon')) continue;
    // Without a size: a touch icon is by custom 180 pixels, an ordinary one small.
    sized.push({ url: link.href, size: declaredSize(link.sizes) || (touch ? 180 : 32) });
  }
  const big = sized.filter((i) => i.size >= ICON_SIZE).sort((a, b) => a.size - b.size);
  const small = sized.filter((i) => i.size < ICON_SIZE).sort((a, b) => b.size - a.size);
  const out: string[] = [];
  const add = (url: string): void => {
    if (isWeb(url) && !out.includes(url)) out.push(url);
  };
  for (const i of [...big, ...small]) add(i.url);
  for (const url of favicons) add(url);
  try {
    add(new URL('/favicon.ico', pageUrl).href);
  } catch {
    // not an address
  }
  return out.slice(0, 10);
}
