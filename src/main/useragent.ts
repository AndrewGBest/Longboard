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
 * (`view.device: "tv"`).
 *
 * **This is the one place Longboard says it is something it is not**, by
 * Andrew's decision of 2026-11-23: "If reporting as a different browser
 * enhances the experience then you can do that. Otherwise report
 * truthfully." Here it says its engine is the one TV apps run on (Cobalt),
 * in that engine's own layout, which is public:
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
 */
export function tvUserAgent(honest: string, product: string, version: string, system: string, chip: string, year: string, v8: string): string {
  const os = /^Mozilla\/5\.0 \(([^)]*)\)/.exec(honest)?.[1] ?? 'X11; Linux x86_64';
  return `Mozilla/5.0 (${os}) ${TV_ENGINE} (unlike Gecko) v8/${v8}-jit gles ${TV_ENGINE_API}, ${product}_TV_${chip}_${year}/${version} (${product}, ${system})`;
}

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

declare const LONGBOARD_BUILD_YEAR: string | undefined;
/** The year this copy was built (set by scripts/build.mjs); this year, when run from source without a build. */
export function buildYear(): string {
  return typeof LONGBOARD_BUILD_YEAR === 'string' && /^\d{4}$/.test(LONGBOARD_BUILD_YEAR) ? LONGBOARD_BUILD_YEAR : String(new Date().getUTCFullYear());
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
