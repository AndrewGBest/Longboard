// Mechanical enforcement of the Hard rules in CLAUDE.md. This catches the
// obvious slips; it does not replace reading the rules.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const problems = [];
const fail = (rule, file, why) => problems.push(`rule ${rule}: ${file}: ${why}`);

// Rule 1: no binaries or fonts that could be someone else's, no CDM.
const BANNED_EXT = new Set(['.so', '.dll', '.dylib', '.ttf', '.otf', '.woff', '.woff2', '.mp4', '.webm', '.mp3', '.wav', '.har', '.crx']);
// Rule 10: nothing captured from a session.
const BANNED_NAMES = /(^|\/)(cookies?(\.txt|\.json|\.sqlite)?|Login Data|Local State|spike-report\.json)$/i;

const TEXT_EXT = new Set(['.ts', '.mjs', '.js', '.json', '.css', '.html', '.yml', '.yaml']);
const SELF = 'scripts/check-rules.mjs';

const CODE_CHECKS = [
  // Rule 2
  [2, /libwidevine|widevinecdm|content_decryption_module|pywidevine|license_?server|getLicense|keyStatuses|MediaKeySession\b.*\.update/i, 'touches the CDM or licence exchange'],
  // Rule 3
  [3, /SMART-TV|SmartTV|Tizen|Web0S|webOS|BRAVIA|AFT[A-Z]|Android TV|PlayStation|Xbox|Cobalt\/|Windows NT|Macintosh|CrOS/, 'looks like a spoofed device or OS identity'],
  // Rule 3: no way to change the user agent per site or per request.
  [3, /setUserAgent\(|userAgent:\s|User-Agent/, 'sets a user agent somewhere other than the one honest fallback'],
  // Rule 4. Nothing changes a site's traffic. Refusing a request is the one
  // exception, and only the ad-blocking module may do it (see below).
  [4, /onBeforeSendHeaders|onHeadersReceived|onSendHeaders|interceptBuffer|registerHttpProtocol|protocol\.handle|setProxy|skipAd|sponsorblock/i, 'modifies a site\'s traffic'],
  [4, /\.(currentTime|playbackRate)\s*[-+]?=(?!=)|\.(play|pause)\(\)/, 'controls the site\'s video element directly instead of sending input'],
  // Rule 12
  [12, /sentry|google-analytics|gtag\(|posthog|mixpanel|crashReporter\.start/i, 'telemetry or crash upload'],
  // Rule 13
  [13, /contextIsolation:\s*false|sandbox:\s*false|nodeIntegration:\s*true|webSecurity:\s*false|exposeInMainWorld|allowRunningInsecureContent|certificate-error|setCertificateVerifyProc|ignore-certificate-errors/, 'weakens the shell sandbox'],
];

for (const file of files) {
  const ext = extname(file).toLowerCase();
  if (BANNED_EXT.has(ext)) fail(1, file, `binary or font file type ${ext} is not allowed in the repo`);
  if (BANNED_NAMES.test(file)) fail(10, file, 'looks like session data');
  if (file === SELF || file.startsWith('docs/') || file.endsWith('.md') || file === 'package-lock.json') continue;
  if (!TEXT_EXT.has(ext)) continue;
  const inTests = file.startsWith('test/');
  const text = readFileSync(file, 'utf8');
  for (const [rule, pattern, why] of CODE_CHECKS) {
    // Tests may name forbidden things in order to assert they are rejected.
    if (inTests && rule !== 13) continue;
    const m = pattern.exec(text);
    if (m) fail(rule, file, `${why} (matched "${m[0]}")`);
  }
}

// Rules 4 and 5: requests are refused in one module only, and that module
// does nothing but refuse. The ready-made Electron wrapper of the filtering
// library also injects scripts, styles and headers, so it is never used.
const FILTER_MODULE = 'src/main/adblock.ts';
for (const file of files) {
  if (file === SELF || file.startsWith('docs/') || file.endsWith('.md') || file.startsWith('test/')) continue;
  if (!TEXT_EXT.has(extname(file).toLowerCase())) continue;
  const text = readFileSync(file, 'utf8');
  if (/adblocker-electron|adblocker-webextension|adblocker-puppeteer|adblocker-playwright/.test(text)) fail(5, file, 'uses a filtering wrapper that changes pages, not only the request matcher');
  if (file === 'package-lock.json') continue;
  if (file !== FILTER_MODULE && /onBeforeRequest|@ghostery\/adblocker/.test(text) && file !== 'package.json') fail(4, file, 'filters requests outside the ad-blocking module');
  if (file === FILTER_MODULE) {
    const m = /redirectURL|responseHeaders|requestHeaders|insertCSS|executeJavaScript|getCosmeticsFilters|load(Cosmetic|GenericCosmetics|CSP)Filters:\s*true|enableHtmlFiltering:\s*true|loadExtendedSelectors:\s*true/.exec(text);
    if (m) fail(5, file, `the request filter does more than refuse requests (matched "${m[0]}")`);
  }
}

// Rule 6: branding.
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
for (const [key, val] of Object.entries({
  name: pkg.name,
  productName: pkg.build?.productName,
  appId: pkg.build?.appId,
  artifactName: pkg.build?.artifactName,
})) {
  if (typeof val === 'string' && /prime|amazon|amzn|fire\s?tv|netflix|youtube|google|disney|hulu|chrome|firefox|safari/i.test(val)) {
    fail(6, 'package.json', `${key} contains a trademark: "${val}"`);
  }
}

// Rules 7 and 8: built-in profiles are data, and their selectors need
// evidence. Each must name an outline file that is there, and must not carry
// scripts. (That the format refuses unknown keys, and that every selector
// matches the outline, is checked by the unit tests.)
for (const file of files.filter((f) => /^profiles\/[^/]+\/profile\.json$/.test(f))) {
  const p = JSON.parse(readFileSync(file, 'utf8'));
  if ('scripts' in p) fail(7, file, 'a version 1 profile cannot contain scripts');
  const outline = p.evidence?.outline;
  const folder = file.slice(0, file.lastIndexOf('/'));
  if (typeof outline !== 'string' || !files.includes(`${folder}/${outline}`)) fail(8, file, 'names no outline file that is in the repository');
  else {
    const lines = readFileSync(`${folder}/${outline}`, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    // An outline line is one token: free text, which would have spaces, cannot be in one.
    if (lines.some((l) => l.trim().includes(' '))) fail(8, `${folder}/${outline}`, 'has a line with a space in it: outlines hold structure only');
    if (lines.length === 0) fail(8, `${folder}/${outline}`, 'is empty');
  }
}
for (const file of files) {
  if (/(^|\/)adapters\//.test(file)) fail(8, file, 'site selectors live in profiles/, with their outline');
}

if (problems.length) {
  console.error(`Hard-rule check failed:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`Hard-rule check passed (${files.length} files).`);
