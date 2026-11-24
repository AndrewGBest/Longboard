// What Longboard tells a site it is (Hard rule 3). This is the one module
// that may word an identity or set one on a view; scripts/check-rules.mjs
// refuses both anywhere else. Every site is told the truth except where a
// profile's keyword picks one of the two fixed, measured statements below.
// Neither a profile nor the person can supply or alter an identity.
import { PRODUCT } from '../shared/product';

/**
 * What every site is told unless its profile picks one of the two statements
 * below: the embedded Chromium's own user agent, which states the real
 * engine, version and system, without the toolkit's two tokens and with
 * Longboard's own name and version at the end.
 *
 * The name is there because leaving it out got Longboard refused: a sign-in
 * service that asks browsers to "identify themselves clearly" turned away
 * the nameless identity and accepted the named one, with nothing else
 * changed (docs/DECISIONS.md, 2026-11-21).
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
 * (`view.device: "tv"`).
 *
 * The first use of rule 3's exception, and the one place Longboard says it
 * is something it is not: it says its engine is the one TV apps run on
 * (Cobalt), in that engine's own layout, which is public:
 *
 *   Mozilla/5.0 (<system>) Cobalt/<version> (unlike Gecko) v8/<version>-jit
 *   gles Starboard/<number>, <maker>_<kind>_<chip>_<year>/<version>
 *   (<brand>, <model>)
 *
 * What is untrue in it: the engine's name and version, and the Starboard
 * number. Everything else is Longboard's own and true: the system, the
 * script engine's real version, and the device part (Longboard as maker
 * and brand, "TV" as what it is running as, this machine's kind of chip,
 * the year this copy was built, Longboard's version, the system as the
 * model). No other maker's device, console or phone is named, and no
 * serial or device ID is invented.
 *
 * Why, measured on the video site's TV app on 2026-11-23 (docs/DECISIONS.md):
 * told the truth about the engine, the site serves its lowest tier of three
 * and no page animation; told this, the first tier, with animation.
 *
 * A profile cannot change a letter of it: all a profile can say is "tv".
 * It is never used to get past DRM, a paywall or a region limit (rule 2).
 *
 * `honest` is what `browserUserAgent` returns; the system is read from it.
 */
export function tvUserAgent(
  honest: string,
  product: string,
  version: string,
  system: string,
  chip: string,
  year: string,
  v8: string,
): string {
  const os = /^Mozilla\/5\.0 \(([^)]*)\)/.exec(honest)?.[1] ?? 'X11; Linux x86_64';
  return `Mozilla/5.0 (${os}) ${TV_ENGINE} (unlike Gecko) v8/${v8}-jit gles ${TV_ENGINE_API}, ${product}_TV_${chip}_${year}/${version} (${product}, ${system})`;
}

/**
 * What Longboard says to a site whose profile asks for the layout it gives
 * browsers on TVs (`view.device: "tv-browser"`): everything it always says,
 * with the plain words for a television that has a browser added at the end.
 *
 * The second use of rule 3's exception, and a smaller one than the first:
 * the engine, its version, the system and Longboard's name all stay as
 * they are. What is added is a description of the kind of device, which is
 * true where Longboard is used as intended and not on a desk. The words
 * are a generic term, no maker's product; several makers' TV browsers
 * happen to use them too.
 *
 * Why, measured signed in on a cloud-gaming site on 2026-11-23
 * (docs/DECISIONS.md): without the words the site's side bar keeps the
 * arrow keys and the highlight cannot reach the games; with them the site
 * serves a layout with larger controls, no side bar, and every row in
 * reach. Of seven endings tried only this term, hyphenated or not, did it.
 *
 * A profile cannot change a letter of it, and it is never used to get past
 * DRM, a paywall or a region limit (rule 2).
 */
export function tvBrowserUserAgent(honest: string): string {
  return `${honest} ${TV_BROWSER_WORDS}`;
}
/** The words `tvBrowserUserAgent` adds. The rule checker allows them in this one line only. */
export const TV_BROWSER_WORDS = 'Smart-TV';

/**
 * The TV engine's name and version, and the number of its system interface,
 * as a current TV app states them (the values the open-source program
 * VacuumTube gives, read 2026-11-23). They age: when the video site stops
 * serving its first tier, look here first.
 */
export const TV_ENGINE = 'Cobalt/27.lts.3.1040976-gold';
export const TV_ENGINE_API = 'Starboard/18';

/** The kind of chip, as plain letters and digits: "x8664", "arm64". */
export function chipName(arch: string): string {
  const plain = (arch === 'x64' ? 'x86_64' : arch).replace(/[^A-Za-z0-9]/g, '');
  return plain || 'unknown';
}

// Put in by scripts/build.mjs when the shell is bundled.
declare const LONGBOARD_BUILD_YEAR: string | undefined;
/** The year this copy was built; this year, when run from source without a build. */
export function buildYear(): string {
  return typeof LONGBOARD_BUILD_YEAR === 'string' && /^\d{4}$/.test(LONGBOARD_BUILD_YEAR)
    ? LONGBOARD_BUILD_YEAR
    : String(new Date().getUTCFullYear());
}

/** The system's plain name, as the honest identity already says it. */
export function systemName(honest: string): string {
  return /Linux/.test(honest)
    ? 'Linux'
    : /Mac OS X/.test(honest)
      ? 'macOS'
      : /Windows/.test(honest)
        ? 'Windows'
        : 'Unknown';
}

/**
 * Keeps what each website view says it is in step with where it is going.
 * `deviceFor` says which statement an address's profile asks for, if any:
 * "tv" gets `tv`, "tv-browser" gets `tvBrowser`, null gets `honest`.
 *
 * Returns three functions: `of` is the identity for an address, `header`
 * puts it on a request, and `follow` sets it on a view. This is the one
 * place a view's identity is set; the checker (scripts/check-rules.mjs)
 * refuses it anywhere else.
 */
export function identityFor(
  honest: string,
  tv: string,
  tvBrowser: string,
  deviceFor: (url: string) => 'tv' | 'tv-browser' | null,
): {
  of: (url: string) => string;
  header: (details: {
    url: string;
    resourceType: string;
    webContents?: Electron.WebContents | undefined;
    requestHeaders: Record<string, string>;
  }) => Record<string, string>;
  follow: (wc: Electron.WebContents, url: string) => void;
} {
  const of = (url: string): string => {
    const device = deviceFor(url);
    return device === 'tv' ? tv : device === 'tv-browser' ? tvBrowser : honest;
  };
  return {
    of,
    // The page a request is for decides what it says, so everything a page
    // fetches says the same as the page did.
    header: (details) => {
      const page =
        details.resourceType === 'mainFrame'
          ? details.url
          : details.webContents && !details.webContents.isDestroyed()
            ? details.webContents.getURL()
            : '';
      const want = page ? of(page) : honest;
      if (want === honest) return details.requestHeaders;
      const out: Record<string, string> = {};
      for (const [name, value] of Object.entries(details.requestHeaders))
        if (name.toLowerCase() !== 'user-agent') out[name] = value;
      out['User-Agent'] = want;
      return out;
    },
    // What the page's own scripts read (`navigator.userAgent`).
    follow: (wc, url) => {
      const want = of(url);
      if (!wc.isDestroyed() && wc.getUserAgent() !== want) wc.setUserAgent(want);
    },
  };
}
