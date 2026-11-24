// Turns what a person typed into "go to address or search" into an address.
// Pure, so every rule is unit-tested.

/** Where words are searched for as shipped; `%s` is replaced by the words. `"search"` in config.json changes it (DECISIONS.md, 2026-11-18). */
export const DEFAULT_SEARCH = 'https://www.google.com/search?q=%s';

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
/** A host name: labels joined by dots, ending in a label that starts with a letter. */
const HOSTNAME = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/i;

/** This machine, or a bare network address: the hosts that are opened over http when no scheme is typed. */
function isLocal(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost') || IPV4.test(host) || host.startsWith('[');
}

function parseWeb(text: string): URL | null {
  try {
    const u = new URL(text);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname ? u : null;
  } catch {
    return null;
  }
}

/** A search template is usable when it is an https address with one `%s`. */
export function isSearchTemplate(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 300 || value.split('%s').length !== 2) return false;
  try {
    return new URL(value.replace('%s', 'x')).protocol === 'https:';
  } catch {
    return false;
  }
}

/** The address that searches for `words`. A template that is not usable falls back to the shipped one. */
export function searchUrl(words: string, template: string = DEFAULT_SEARCH): string {
  return (isSearchTemplate(template) ? template : DEFAULT_SEARCH).replace('%s', encodeURIComponent(words));
}

/**
 * The address to open for `input`, or null when nothing was typed.
 *
 * - An http or https address is taken as it is.
 * - Something shaped like a host name ("example.com", "example.com/page",
 *   "localhost:8080") becomes an address: https, or http for this machine
 *   and bare network addresses, where https is rarely set up.
 * - Anything else is searched for, including text with another scheme in
 *   front ("javascript:", "file:"): those are never opened.
 */
export function resolveAddress(input: string, searchTemplate: string = DEFAULT_SEARCH): string | null {
  const text = input.trim().slice(0, 2000);
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) {
    const u = parseWeb(text);
    if (u && !/\s/.test(text)) return u.toString();
    return searchUrl(text, searchTemplate);
  }
  if (!/\s/.test(text)) {
    const hostPart = (text.split(/[/?#]/)[0] ?? '').toLowerCase();
    const host = hostPart.startsWith('[') ? hostPart.replace(/\]:\d{1,5}$/, ']') : hostPart.replace(/:\d{1,5}$/, '');
    const looksLikeHost = !hostPart.includes('@') && (isLocal(host) ? host !== '' : HOSTNAME.test(host));
    if (looksLikeHost) {
      const u = parseWeb(`${isLocal(host) ? 'http' : 'https'}://${text}`);
      if (u) return u.toString();
    }
  }
  return searchUrl(text, searchTemplate);
}

/** The site an address belongs to, as shown on a tile: the host without "www.". Empty when unreadable. */
export function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * The key a site's settings are stored under: its host, lower-cased, without
 * "www.". Null for anything that is not a web address.
 */
export function siteKey(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}
