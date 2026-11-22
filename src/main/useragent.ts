import { PRODUCT } from '../shared/product';

/**
 * The browser identity we send: the embedded Chromium's own user agent,
 * which states the real engine, the real version and the real OS, without
 * the toolkit's two tokens and with Longboard's own name and version at
 * the end. It never claims to be another browser, engine, system or
 * maker's device, and there is no way to switch it (Hard rule 3).
 *
 * Until 2026-11-21 the name was left out, so that Longboard looked like any
 * Chromium. That turned out to be the less honest choice and the one that
 * got it refused: a sign-in service that asks browsers to "identify
 * themselves clearly" turned away the nameless identity and accepted the
 * named one (docs/DECISIONS.md, tried with nothing else changed). Andrew
 * chose to name it to every site.
 */
export function browserUserAgent(defaultUa: string, product: string = PRODUCT.name, version = ''): string {
  const plain = defaultUa
    .replace(/\s?Electron\/\S+/g, '')
    .replace(new RegExp(`\\s?${PRODUCT.packageName}\\/\\S+`, 'gi'), '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return version ? `${plain} ${product}/${version}` : plain;
}

/**
 * What Longboard says to a site whose profile asks for its TV interface
 * (`view.device: "tv"`): the same identity, followed by one more
 * statement that is also true, that this is Longboard running as a TV.
 * Rule 3 as amended by Andrew on 2026-11-21 (docs/DECISIONS.md).
 *
 * The shape "<name>_TV/<version> (<name>, <system>)" was found by trying
 * the site's own TV page: it is the least that page accepts. The browser,
 * engine, version and system before it are untouched, no other maker,
 * model, chipset or serial is named, and a profile cannot change a letter
 * of it: all a profile can say is "tv".
 */
export function tvUserAgent(honest: string, product: string, version: string, system: string): string {
  return `${honest}, ${product}_TV/${version} (${product}, ${system})`;
}

/** The system's plain name, as the honest identity already says it. */
export function systemName(honest: string): string {
  return /Linux/.test(honest) ? 'Linux' : /Mac OS X/.test(honest) ? 'macOS' : /Windows/.test(honest) ? 'Windows' : 'Unknown';
}

/**
 * Keeps what each website view says it is in step with where it is going.
 * `tvFor` says whether an address has a profile asking for the TV
 * interface. This is the one place a view's identity is set; the checker
 * (scripts/check-rules.mjs) refuses it anywhere else.
 */
export function identityFor(honest: string, tv: string, tvFor: (url: string) => boolean): {
  of: (url: string) => string;
  header: (details: { url: string; resourceType: string; webContents?: Electron.WebContents | undefined; requestHeaders: Record<string, string> }) => Record<string, string>;
  follow: (wc: Electron.WebContents, url: string) => void;
} {
  const of = (url: string): string => (tvFor(url) ? tv : honest);
  return {
    of,
    // What a request says: the page it is for decides, so everything a TV
    // page fetches says the same as the page did.
    header: (details) => {
      const page = details.resourceType === 'mainFrame' ? details.url : details.webContents && !details.webContents.isDestroyed() ? details.webContents.getURL() : '';
      if (!page || !tvFor(page)) return details.requestHeaders;
      const out: Record<string, string> = {};
      for (const [name, value] of Object.entries(details.requestHeaders)) if (name.toLowerCase() !== 'user-agent') out[name] = value;
      out['User-Agent'] = tv;
      return out;
    },
    // What the page's own scripts are told.
    follow: (wc, url) => {
      const want = of(url);
      if (!wc.isDestroyed() && wc.getUserAgent() !== want) wc.setUserAgent(want);
    },
  };
}
