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
 * What Longboard says to a site whose profile says `view.named: false`: the
 * embedded Chromium's own identity and nothing after it, which is what
 * Longboard said everywhere until 2026-11-21. For a site that turns away
 * any identity with a word in it that it does not know (Andrew, 2026-11-22;
 * docs/DECISIONS.md). Every word of it is still true, and a profile cannot
 * put anything in the name's place: all it can say is "leave it out".
 */
export function unnamedUserAgent(defaultUa: string): string {
  return browserUserAgent(defaultUa, PRODUCT.name, '');
}

/** What a site's profile asks of the identity: the TV statement added, the name left out, or nothing. */
export type IdentityKind = 'tv' | 'unnamed' | null;

/**
 * Keeps what each website view says it is in step with where it is going.
 * `kindFor` says what the profile for an address asks. This is the one
 * place a view's identity is set; the checker (scripts/check-rules.mjs)
 * refuses it anywhere else.
 */
export function identityFor(honest: string, tv: string, unnamed: string, kindFor: (url: string) => IdentityKind): {
  of: (url: string) => string;
  header: (details: { url: string; resourceType: string; webContents?: Electron.WebContents | undefined; requestHeaders: Record<string, string> }) => Record<string, string>;
  follow: (wc: Electron.WebContents, url: string) => void;
} {
  const of = (url: string): string => {
    const kind = kindFor(url);
    return kind === 'tv' ? tv : kind === 'unnamed' ? unnamed : honest;
  };
  return {
    of,
    // What a request says: the page it is for decides, so everything such a
    // page fetches says the same as the page did.
    header: (details) => {
      const page = details.resourceType === 'mainFrame' ? details.url : details.webContents && !details.webContents.isDestroyed() ? details.webContents.getURL() : '';
      if (!page || kindFor(page) === null) return details.requestHeaders;
      const out: Record<string, string> = {};
      for (const [name, value] of Object.entries(details.requestHeaders)) if (name.toLowerCase() !== 'user-agent') out[name] = value;
      out['User-Agent'] = of(page);
      return out;
    },
    // What the page's own scripts are told.
    follow: (wc, url) => {
      const want = of(url);
      if (!wc.isDestroyed() && wc.getUserAgent() !== want) wc.setUserAgent(want);
    },
  };
}
