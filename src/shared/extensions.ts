// Browser extensions from the Chrome Web Store. Pure, so the rules are
// unit-tested; main/extensions.ts does the downloading and loading.
//
// An extension is someone else's program, run with the person's say-so: it
// is downloaded only when they ask for it by name, and it is described to
// them, with what it will be able to do, before it is switched on.

/** An extension's name in the store: 32 letters from a to p. */
const ID = /^[a-p]{32}$/;
export function isExtensionId(text: unknown): text is string {
  return typeof text === 'string' && ID.test(text);
}

/** The extension a Chrome Web Store page is about, from its address; null for any other page. */
export function storeExtensionId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || (u.hostname !== 'chromewebstore.google.com' && u.hostname !== 'chrome.google.com')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const at = parts.indexOf('detail');
    if (at < 0) return null;
    const id = parts.slice(at + 1).find((p) => ID.test(p));
    return id ?? null;
  } catch {
    return null;
  }
}

/** The extension a page of an extension's own belongs to; null for any other address. */
export function extensionOfPage(url: string): string | null {
  const m = /^chrome-extension:\/\/([a-p]{32})\//.exec(url);
  return m ? m[1]! : null;
}

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
/** A page inside the extension's own folder, as its manifest names it; null when it names none or points outside. */
const ownPage = (value: unknown): string | null => {
  const page = text(value, 300).replace(/^\/+/, '');
  return page && !page.includes('..') && !/^[a-z][a-z0-9+.-]*:/i.test(page) ? page : null;
};

const ALL_SITES = /^(<all_urls>|\*:\/\/\*\/\*|https?:\/\/\*\/\*|file:\/\/\/\*)$/;

/** What an extension's manifest says about it, in the form Longboard shows. */
export interface ExtensionFacts {
  /** The page it shows from a browser's toolbar, and its settings page, inside its own folder. */
  popup: string | null;
  options: string | null;
  /** What it will be able to do, in plain words, most serious first. */
  can: string[];
}

/** Reads a manifest. Never throws; an unreadable one can do nothing and has no pages. */
export function extensionFacts(manifest: unknown): ExtensionFacts {
  const m = manifest && typeof manifest === 'object' ? (manifest as Record<string, unknown>) : {};
  const action = (m['action'] ?? m['browser_action']) as Record<string, unknown> | undefined;
  const optionsUi = m['options_ui'] as Record<string, unknown> | undefined;
  const permissions = [...list(m['permissions']), ...list(m['optional_permissions'])];
  const hosts = [...list(m['host_permissions']), ...list(m['optional_host_permissions']), ...permissions.filter((p) => p.includes('://') || p === '<all_urls>')];
  const scripts = Array.isArray(m['content_scripts']) ? m['content_scripts'].flatMap((c) => list((c as Record<string, unknown> | null)?.['matches'])) : [];
  const everywhere = [...hosts, ...scripts].some((h) => ALL_SITES.test(h));
  const sites = [...new Set([...hosts, ...scripts].filter((h) => !ALL_SITES.test(h)).map((h) => h.replace(/^[^:]+:\/\//, '').replace(/\/.*$/, '').replace(/^\*\./, '')))].filter(Boolean);
  const can: string[] = [];
  if (everywhere) can.push('Read and change every page you open');
  else if (sites.length) can.push(`Read and change pages on ${sites.slice(0, 4).join(', ')}${sites.length > 4 ? ` and ${sites.length - 4} more` : ''}`);
  const has = (...names: string[]): boolean => names.some((n) => permissions.includes(n));
  if (has('webRequest', 'declarativeNetRequest', 'declarativeNetRequestWithHostAccess')) can.push('See or block what pages ask the network for');
  if (has('cookies')) can.push('Read and change what sites have stored about you');
  if (has('history', 'tabs', 'webNavigation', 'activeTab')) can.push('See which pages you open');
  if (has('downloads')) can.push('Download files');
  if (has('clipboardRead')) can.push('Read what you copy');
  if (has('nativeMessaging')) can.push('Talk to programs on this machine');
  if (!can.length) can.push('Nothing on the pages you open');
  return { popup: ownPage(action?.['default_popup']), options: ownPage(optionsUi?.['page'] ?? m['options_page']), can };
}

/** An extension's name as its manifest gives it. A name that is a placeholder for a translation ("__MSG_name__") is given as empty. */
export function extensionName(manifest: unknown): string {
  const m = manifest && typeof manifest === 'object' ? (manifest as Record<string, unknown>) : {};
  const name = text(m['name'], 80);
  return /^__MSG_.+__$/.test(name) ? text(m['short_name'], 80).replace(/^__MSG_.+__$/, '') : name;
}
