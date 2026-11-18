// Which addresses the page view may open, why one was refused, and what to
// tell the person at the screen. Pure: no Electron imports, so every rule
// here is unit-tested.
import { looksLikeSpendUrl } from '../layer/guard/purchase-guard';
import { PRODUCT } from '../shared/product';

export type BlockReason = 'not-web' | 'credentials' | 'automation-spend';

/**
 * Longboard opens web addresses: http and https. Files on this machine,
 * script and data addresses and the browser's own internal pages are never
 * opened in the page view (ARCHITECTURE.md section 2). An address carrying a
 * user name or password is refused too: it is a common disguise for a
 * look-alike site.
 */
export function blockReason(url: string, opts: { automation: boolean }): BlockReason | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'not-web';
  }
  // A blank page is what a site's own pop-up starts as.
  if (url === 'about:blank') return null;
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'not-web';
  if (!u.hostname) return 'not-web';
  if (u.username || u.password) return 'credentials';
  // Automation must never reach a payment or sign-up flow, even by URL.
  if (opts.automation && looksLikeSpendUrl(url)) return 'automation-spend';
  return null;
}

const MAX_DESCRIPTION = 80;

/** Host and path only. Queries and fragments can carry tokens, so they are never shown or logged. */
export function describeBlockedUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return '(unreadable address)';
  }
  if (!u.host) return `(${u.protocol} address)`;
  // An address refused only for not being https looks allowed without its scheme.
  const text = (u.protocol === 'https:' ? '' : `${u.protocol}//`) + u.host + u.pathname;
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION)}…` : text;
}

/** One line, shown as a toast over the page that stays on screen. */
export function blockedMessage(reason: BlockReason): string {
  if (reason === 'automation-spend') return 'Blocked: automation mode never opens purchase or sign-up pages';
  if (reason === 'credentials') return 'Blocked: that address carries a user name or password';
  return `Blocked: ${PRODUCT.name} only opens web addresses`;
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A self-contained notice page: no scripts, no remote resources. Every argument is escaped. */
function noticePage(title: string, heading: string, paragraphs: readonly string[], detail?: { label: string; value: string }): string {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Longboard: ${escapeHtml(title)}</title>
<style>
  html, body { height: 100%; margin: 0; background: #000; color: #eee; font: 3.6vh/1.5 system-ui, sans-serif; }
  main { box-sizing: border-box; height: 100%; max-width: 80vw; margin: 0 auto; display: flex; flex-direction: column; justify-content: center; gap: 2vh; }
  h1 { font-size: 6vh; margin: 0; }
  p { margin: 0; }
  code { font: 3.2vh ui-monospace, monospace; color: #9fd8c0; overflow-wrap: anywhere; }
  .hint { color: #aaa; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(heading)}</h1>
${paragraphs.map((p) => `  <p>${escapeHtml(p)}</p>`).join('\n')}
${detail ? `  <p>${escapeHtml(detail.label)}: <code>${escapeHtml(detail.value)}</code></p>` : ''}
  <p class="hint">Press Back to go back. Press Ctrl+Q to quit.</p>
</main>
</body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/**
 * A page to show when a navigation is refused before anything has loaded, so
 * the view is not left blank.
 */
export function noticePageUrl(reason: BlockReason, url: string): string {
  const why =
    reason === 'automation-spend'
      ? `${PRODUCT.name} was started with --automation, which refuses any page that looks like a purchase, subscription or sign-up flow. ` +
        `To use such a page, quit and start ${PRODUCT.name} without --automation.`
      : reason === 'credentials'
        ? `The address carries a user name or password in front of the site name. ${PRODUCT.name} does not open such addresses.`
        : `${PRODUCT.name} only opens web addresses (http and https). Files on this machine and internal pages are not opened.`;
  return noticePage('page blocked', 'This page was blocked', [why], { label: 'Blocked address', value: describeBlockedUrl(url) });
}

/**
 * Shown the moment the window opens, while the playback component is made
 * ready (a download on the first run). Without it nothing appears until that
 * finishes, and a slow or blocked download looks like an app that never started.
 */
export function startingPageUrl(): string {
  return noticePage('starting', 'Starting', ['Getting the playback component ready. On the first run this is a download and can take a moment.']);
}

/** Chromium's code for a navigation that was cancelled, which is what a refused navigation looks like. Not a failure. */
const ERR_ABORTED = -3;

/** True when a failed main-frame load should put up the "cannot reach" page and be retried. */
export function isLoadFailure(code: number, url: string): boolean {
  if (code === ERR_ABORTED || code >= 0) return false;
  return !url.startsWith('data:') && url !== 'about:blank';
}

/** Seconds to wait before retry number `attempt` (1, 2, 3...): quick at first, then every half minute. */
export function retryDelaySeconds(attempt: number): number {
  return Math.min(30, 5 * Math.max(1, Math.round(attempt)));
}

/**
 * Chromium's codes for a certificate that cannot be trusted: -200 to -299.
 * Such a page is never opened and there is no way to click through (Hard rule 13).
 */
export function isCertificateError(code: number): boolean {
  return code <= -200 && code > -300;
}

/** The page shown for a site whose certificate cannot be trusted. Not retried. */
export function certificatePageUrl(description: string): string {
  return noticePage(
    'not secure',
    'This site is not secure',
    ["The site's security certificate could not be verified, so the page was not opened. Longboard has no way around this, on purpose."],
    { label: 'What the browser reported', value: description.replace(/[^A-Za-z0-9_ :.-]/g, '').slice(0, 60) || 'no details' },
  );
}

/** The page shown while a site cannot be reached. */
export function offlinePageUrl(description: string, nextTrySeconds: number): string {
  return noticePage(
    'cannot connect',
    'Cannot reach this site',
    ['Check the address and the network connection.', `Trying again in ${Math.round(nextTrySeconds)} seconds, and it will keep trying.`],
    { label: 'What the browser reported', value: description.replace(/[^A-Za-z0-9_ :.-]/g, '').slice(0, 60) || 'no details' },
  );
}
