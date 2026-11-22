// End-to-end tests: the real app, started with --automation, driven over the
// DevTools Protocol against invented fixture pages served from this machine.
// Run with `npm run e2e` (needs a display; `xvfb-run -a npm run e2e` headless).
import { createServer } from 'node:http';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, fail, failureCount, launch, root, serveFixtures, sleep, until } from './harness.mjs';

// A made-up catalogue: an index and the one profile it lists, with the
// profile's real checksum, and a second entry whose checksum is wrong.
const fixtureProfile = readFileSync(join(root, 'test/fixtures/profiles/profile-test.json'));
const catalogueIndex = JSON.stringify({
  'longboard-index': 1,
  profiles: [
    { id: 'fixture-site', version: '1.0.0', path: 'profiles/profile.test/profile.json', sha256: createHash('sha256').update(fixtureProfile).digest('hex') },
    { id: 'tampered', version: '1.0.0', path: 'profiles/tampered.test/profile.json', sha256: '0'.repeat(64) },
  ],
  verifiedSites: ['profile.test'],
});

/** A small plain-coloured PNG made here, to stand for a site's own icon. */
function pngSquare(size, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => (buf.reduce((c, byte) => crcTable[(c ^ byte) & 0xff] ^ (c >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0;
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3).map((_, i) => [r, g, b][i % 3])]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: size }, () => row)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0))]);
}
const siteIcon = pngSquare(32, [40, 120, 200]);

/** The package a release has for this machine's kind of processor. */
const packageName = `Longboard-${process.arch === 'arm64' ? 'arm64' : 'x86_64'}.AppImage`;
/** What stands for a newer package in the update checks. */
const newPackage = Buffer.from('#!/bin/sh\n# a made-up newer package\n'.repeat(200));
/** What the made-up site was asked for, for the download checks. */
const asks = { suggest: [], file: 0, made: 0, slow: [], adverts: 0, bigIcon: 0, maskIcon: 0 };
const site = await serveFixtures({
  // A page that takes its time, as a far-away site does.
  '/slow-page': (_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>slow</title><a href="/home.html" id="there">the words</a><img src="/slow.png" alt="">'),
  '/slow.png': (_req, res) => setTimeout(() => res.writeHead(200, { 'content-type': 'image/png' }).end(siteIcon), 3500),
  // A made-up search site's suggestions, in the shape the real ones answer in.
  '/suggest': (req, res) => {
    const q = new URL(req.url, 'http://x').searchParams.get('q') ?? '';
    asks.suggest.push(q);
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify([q, [`${q} today`, `${q} tomorrow`]]));
  },
  // What a request said it was, for the checks on the identity sent to a site with a TV interface.
  '/agent': (req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(req.headers['user-agent'] ?? '')),
  '/favicon.ico': (_req, res) => res.writeHead(200, { 'content-type': 'image/png' }).end(siteIcon),
  '/catalogue/index.json': (_req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(catalogueIndex),
  '/catalogue/profiles/profile.test/profile.json': (_req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(fixtureProfile),
  '/catalogue/profiles/tampered.test/profile.json': (_req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(fixtureProfile),
  // A start page that redirects somewhere automation refuses, as a service
  // does for a signed-out visitor.
  '/signed-out': (_req, res) => res.writeHead(302, { location: '/signup/landing?token=SECRET' }).end(),
  // Something a browser would save to disk.
  '/file.bin': (_req, res) => {
    asks.file += 1;
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename=x.bin', 'content-length': 4 }).end('data');
  },
  // A second of silence, as a sound file: something a page can try to play.
  '/quiet.wav': (_req, res) => {
    const samples = 8000;
    const head = Buffer.alloc(44);
    head.write('RIFF', 0); head.writeUInt32LE(36 + samples, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
    head.writeUInt32LE(8000, 24); head.writeUInt32LE(8000, 28); head.writeUInt16LE(1, 32); head.writeUInt16LE(8, 34); head.write('data', 36); head.writeUInt32LE(samples, 40);
    res.writeHead(200, { 'content-type': 'audio/wav' }).end(Buffer.concat([head, Buffer.alloc(samples, 128)]));
  },
  // A made-up filter list, and what the page with advertising asks for.
  '/filters.txt': (_req, res) => res.writeHead(200, { 'content-type': 'text/plain' }).end('[Adblock Plus 2.0]\n! Title: made-up list for the tests\n/advert/*\nlocalhost,127.0.0.1##a\n'),
  '/advert/ad.js': (_req, res) => {
    asks.adverts += 1;
    res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }).end('window.__seen.push("advert");');
  },
  '/advert/banner.png': (_req, res) => {
    asks.adverts += 1;
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' }).end(siteIcon);
  },
  // A web-app manifest and the big icon it lists, for a Home tile.
  '/pwa/app.webmanifest': (_req, res) =>
    res.writeHead(200, { 'content-type': 'application/manifest+json' }).end(JSON.stringify({ name: 'Made up', icons: [{ src: 'mask.png', sizes: '512x512', purpose: 'maskable' }, { src: 'icon-192.png', sizes: '192x192' }] })),
  '/pwa/icon-192.png': (_req, res) => {
    asks.bigIcon += 1;
    res.writeHead(200, { 'content-type': 'image/png' }).end(pngSquare(192, [200, 60, 40]));
  },
  '/pwa/mask.png': (_req, res) => {
    asks.maskIcon += 1;
    res.writeHead(200, { 'content-type': 'image/png' }).end(siteIcon);
  },
  // A made-up release feed and the package it describes.
  '/releases/latest': (req, res) =>
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({ tag_name: 'v99.0.0', draft: false, prerelease: false, assets: [{ name: packageName, browser_download_url: `http://${req.headers.host}/releases/package`, size: newPackage.length, digest: `sha256:${createHash('sha256').update(newPackage).digest('hex')}` }] }),
    ),
  '/releases/tampered': (req, res) =>
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({ tag_name: 'v99.0.0', assets: [{ name: packageName, browser_download_url: `http://${req.headers.host}/releases/package`, size: newPackage.length, digest: `sha256:${'0'.repeat(64)}` }] }),
    ),
  '/releases/package': (_req, res) => res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(newPackage),
  // What a request arrived with, by header name.
  '/headers': (req, res) => res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(req.headers)),
  '/site.js': (_req, res) => res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }).end('window.__seen.push("site");'),
  // A file made in answer to a form: it cannot be asked for a second time.
  '/made.bin': (req, res) => {
    if (req.method !== 'POST') return res.writeHead(405).end();
    asks.made += 1;
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename=made.bin', 'content-length': 4 }).end('form');
  },
  // A file that comes slowly: half now, the rest when the test says.
  '/slow.bin': (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename=slow.bin', 'content-length': 200000 });
    // Enough of it that the browser knows it is a file and not a page.
    res.write('h'.repeat(100000));
    asks.slow.push(res);
  },
  '/signup/landing': (_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>should never load</title>'),
});
/**
 * Says yes to the question on screen. The highlight starts on the answer
 * that changes nothing, and a yes in the question's first moments is not
 * counted, so this waits, moves up to the yes, and presses OK.
 */
async function sayYes(chrome, wait = 500) {
  await sleep(750);
  await chrome.press('ArrowUp');
  await chrome.press('Enter', wait);
}
/** From the menu's first page to its page about the site in front: app, profile, what the site may do. */
async function siteMenu(chrome) {
  for (let i = 0; i < 20 && (await chrome.focused()) !== 'menu-site'; i++) await chrome.press('ArrowDown');
  await chrome.press('Enter', 400);
}
const logs = [];

/** Runs one scenario with its own app; a crash in it fails the run and the app's log is kept. */
// `npm run e2e -- words` runs only the scenarios whose names contain one of the words.
// `--part=2/3` runs every third scenario starting with the second: the whole
// suite in pieces, for a machine too short of memory to run it in one go.
const part = /^--part=(\d+)\/(\d+)$/.exec(process.argv.slice(2).find((a) => a.startsWith('--part=')) ?? '');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--part='));
let ordinal = 0;
async function scenario(name, options, body) {
  if (only.length && !only.some((word) => name.includes(word))) return;
  if (part && ordinal++ % Number(part[2]) !== Number(part[1]) - 1) return;
  console.log(`\n# ${name}`);
  const before = failureCount();
  const app = await launch(options);
  try {
    await body(app);
  } catch (err) {
    fail(`${name}: ${String(err)}`);
  } finally {
    if (failureCount() > before) logs.push(`--- ${name} ---\n${app.log}`);
    await app.close();
  }
}

await scenario('a page driven with the arrows', { url: `${site.origin}/home.html` }, async (app) => {
  const page = await app.page(site.origin);
  const { evaluate, press, focused } = page;
  await sleep(800);
  check('layer overlay is present', await evaluate('!!document.querySelector("longboard-overlay")'), true);
  check('page cannot see any app API', await evaluate('typeof window.require + typeof window.longboard + typeof window.electron + typeof window.ipcRenderer'), 'undefinedundefinedundefinedundefined');

  await press('ArrowDown');
  check('first press focuses the top-left control', await focused(), 'nav-home');
  await press('ArrowDown');
  check('down enters the first row', await focused(), 't1');
  await press('ArrowRight');
  await press('ArrowRight');
  check('right walks the row', await focused(), 't3');
  await press('ArrowRight');
  check('right at the end of a row stays put', await focused(), 't3');
  check('and the ring bumps toward the edge as feedback', await page.ringClass(), 'ring bump-right');
  await press('ArrowDown');
  check('down moves to the next row', await focused(), 'u2');
  await press('Enter');
  check('select clicks the focused card', await evaluate('window.__clicks'), ['u2']);
  check('and the ring gives a press pulse', await page.ringClass(), 'ring pulse');

  await press('ArrowDown');
  check('down reaches the nearest button', await focused(), 'rent');
  await press('Enter');
  check('rent is never delivered in automation mode', await evaluate('window.__clicks'), ['u2']);
  await press('ArrowLeft');
  check('left moves along the button row', await focused(), 'play');
  await press('Enter');
  check('play is delivered', await evaluate('window.__clicks'), ['u2', 'play']);
  await press('ArrowRight');
  await press('ArrowRight');
  check('right never jumps diagonally out of a row', await focused(), 'rent');

  const ua = await evaluate('navigator.userAgent');
  check('the user agent names the real engine and system, and Longboard once, by its own name', [/Electron/i.test(ua), /Linux/.test(ua) && /Chrome\//.test(ua), ua.match(/longboard\/[\d.]+/gi)], [false, true, [`Longboard/${JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version}`]]);

  // On-screen keyboard: the search key focuses the field and a remote can type into it.
  await press('/');
  await sleep(300);
  check('search key focuses the search field', await evaluate('document.activeElement?.id'), 'search');
  await press('Enter'); // "a"
  await press('ArrowRight');
  await press('ArrowDown');
  await press('Enter'); // "l", under "b"
  await sleep(300);
  check('the on-screen keyboard types into the field', await evaluate('document.getElementById("search").value'), 'al');
  for (let i = 0; i < 3; i++) await press('ArrowDown'); // bottom row: the symbols key, under "l"
  for (let i = 0; i < 3; i++) await press('ArrowRight'); // past the two cursor keys
  await press('Enter'); // "space"
  await press('ArrowRight');
  await press('Enter'); // "delete"
  await press('Enter');
  await sleep(300);
  check('space and delete work', await evaluate('document.getElementById("search").value'), 'a');
  // Capitals and symbols: shift then "a", then the symbols face and "@".
  for (let i = 0; i < 5; i++) await press('ArrowLeft');
  await press('Enter'); // shift
  for (let i = 0; i < 4; i++) await press('ArrowUp');
  await press('ArrowRight');
  await press('Enter'); // "B"
  for (let i = 0; i < 4; i++) await press('ArrowDown'); // the symbols key, under "B"
  await press('Enter'); // symbols face; highlight is on "abc"
  for (let i = 0; i < 3; i++) await press('ArrowUp');
  await press('ArrowRight');
  await press('Enter'); // "@", second key of the second row
  await sleep(300);
  check('capitals and symbols can be typed', await evaluate('document.getElementById("search").value'), 'aB@');
  await press('Escape');
  await press('Escape');
  check('back closes the keyboard and then leaves the field', await evaluate('document.activeElement?.id ?? ""'), '');

  // A field the page focuses by itself (as search and sign-in pages do when
  // they load) gets the highlight, and the keyboard on OK.
  await evaluate('document.getElementById("search").value = ""; document.getElementById("search").focus()');
  await sleep(200);
  check('a field the page focused becomes the remote focus, without a keyboard over the page', [await focused(), await page.keyboardShown()], ['search', false]);
  await press('Enter', 300); // brings the keyboard up
  await press('Enter', 300); // "a"
  check('OK brings the keyboard up on it', [await page.keyboardShown(), await evaluate('document.getElementById("search").value')], [true, 'a']);
  await evaluate('document.getElementById("search").value = ""');
  await press('Escape');
  await press('Escape');

  // A pop-up the page opens takes the focus, keeps it, and gives it back.
  for (let i = 0; i < 8 && (await focused()) !== 'info'; i++) await press('ArrowDown');
  check('the pop-up button can be reached', await focused(), 'info');
  await press('Enter');
  await sleep(1200);
  check('focus moves into the pop-up', ['dlg-close', 'dlg-ok'].includes(await focused()), true);
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowDown', 'ArrowDown']) await press(key);
  check('and cannot leave it for the page behind', ['dlg-close', 'dlg-ok'].includes(await focused()), true);
  await press('Escape');
  await sleep(900);
  check('Back closes the pop-up and focus returns to its button', [await evaluate('!!document.getElementById("dialog")'), await focused()], [false, 'info']);

  // A refused navigation must be visible: the page stays, a toast appears, the terminal says why.
  const disguised = site.origin.replace('http://', 'http://user:pw@');
  await evaluate(`location.href = "${disguised}/home.html?token=SECRET"; 0`);
  await sleep(500);
  check('an address carrying a user name does not load', await evaluate('location.href'), `${site.origin}/home.html`);
  check('a blocked navigation shows a toast', await page.toastText(), 'Blocked: that address carries a user name or password');
  check('a blocked navigation is logged without its query or the password', [/blocked navigation \(credentials\): http:\/\/127\.0\.0\.1:\d+\/home\.html\n/.test(app.log), /SECRET|user:pw/.test(app.log)], [true, false]);

  // What the engine tells sites about surround-sound audio it cannot decode
  // on Linux. This check holds the answer as it is today, wrong, so that the
  // day an engine update or a fix changes it, this fails and STATUS.md and
  // DECISIONS.md ("the engine says it can play AC-3") get brought up to date.
  const audio = await evaluate(`(async () => {
    const out = {};
    for (const codec of ['mp4a.40.2', 'ac-3', 'ec-3']) {
      const type = 'audio/mp4; codecs="' + codec + '"';
      const media = await navigator.mediaCapabilities.decodingInfo({ type: 'media-source', audio: { contentType: type, channels: 6, bitrate: 384000, samplerate: 48000 } });
      out[codec] = [MediaSource.isTypeSupported(type), document.createElement('audio').canPlayType(type), media.supported];
    }
    return out;
  })()`);
  check('ordinary (AAC) audio is supported', audio['mp4a.40.2'], [true, 'probably', true]);
  check('KNOWN WRONG: the engine says it can play AC-3 and E-AC-3, which on Linux it cannot decode', [audio['ac-3'], audio['ec-3']], [[true, 'probably', true], [true, 'probably', true]]);

  // What a page makes up is not a key press, and a web component does not hide a purchase button.
  const before = await focused();
  await evaluate('window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); document.dispatchEvent(new KeyboardEvent("keydown", { key: "q", ctrlKey: true, bubbles: true })); 0');
  await sleep(300);
  check('a key event the page made up moves nothing and quits nothing', await focused(), before);
  await evaluate(`(() => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<button id="buy"><span>Buy now</span></button><button id="fine">Fine</button>';
    window.__shadow = [];
    root.getElementById('buy').addEventListener('click', () => window.__shadow.push('buy'));
    root.getElementById('fine').addEventListener('click', () => window.__shadow.push('fine'));
    root.querySelector('span').click();
    root.getElementById('fine').click();
    host.remove();
  })(); 0`);
  check('a purchase button inside a web component is still not pressed in a scripted run', await evaluate('__shadow'), ['fine']);

  // Nothing that is not a web address opens, and nothing is granted that the policy does not list.
  await evaluate('window.open("file:///etc/passwd"); 0');
  await sleep(400);
  check('a file address does not open', await evaluate('location.href'), `${site.origin}/home.html`);
  await evaluate('window.__w = window.open("about:blank"); window.open(""); 0');
  await sleep(400);
  check('an empty window a script means to fill in later does not blank the site', [await evaluate('location.href'), await evaluate('__w')], [`${site.origin}/home.html`, null]);
  check('a kind of access Longboard never gives is refused without a question', await evaluate('navigator.permissions.query({ name: "idle-detection" }).then((p) => p.state, () => "refused")').then((v) => v !== 'granted'), true);

  // Quit is handled by the shell, so it must work whatever the page is doing.
  void page.keyDown('q', { code: 'KeyQ', windowsVirtualKeyCode: 81, nativeVirtualKeyCode: 81, modifiers: 2 }).catch(() => undefined);
  check('Ctrl+Q quits the app', await Promise.race([app.exited, sleep(4000).then(() => false)]), true);
});

await scenario('a site asks to be allowed something', { url: `${site.origin}/home.html`, args: ['--use-fake-device-for-media-stream'] }, async (app) => {
  const page = await app.page(site.origin);
  const chrome = await app.chrome();
  const { evaluate } = page;
  const question = () => chrome.evaluate('[...document.querySelectorAll("#panel h1, #panel p")].map((n) => n.ariaLabel ?? n.textContent).join(" | ")');
  const asked = () => until(() => chrome.evaluate('document.querySelector("#panel h1")?.textContent ?? null'), (t) => t === 'Allow this?', 50);
  const answers = () => JSON.parse(readFileSync(join(app.userData, 'sites.json'), 'utf8'))['127.0.0.1']?.answers;
  const locate = 'window.__geo = new Promise((r) => navigator.geolocation.getCurrentPosition(() => r("allowed"), (e) => r(e.code === 1 ? "refused" : "allowed, but no position"))); 0';
  await sleep(800);

  await evaluate(locate);
  check('asking for the location puts a question on screen', await asked(), 'Allow this?');
  check('which says who is asking and for what, in plain words', (await question()).includes('127.0.0.1 wants to know where this device is.'), true);
  check('with the highlight on "Do not allow", and the page still waiting', [await chrome.focused(), await evaluate('Promise.race([__geo, new Promise((r) => setTimeout(() => r("waiting"), 300))])')], ['prompt-deny', 'waiting']);
  await chrome.press('Escape', 500);
  check('Back refuses this once and remembers nothing', [await evaluate('__geo'), existsSync(join(app.userData, 'sites.json'))], ['refused', false]);

  await evaluate(locate);
  await asked();
  await chrome.press('Enter', 500);
  check('"Do not allow" refuses and is remembered for the site', [await evaluate('__geo'), await answers()], ['refused', { location: 'denied' }]);
  await evaluate(locate);
  await sleep(500);
  check('so the next time it is refused without asking again', [await evaluate('__geo'), await chrome.evaluate('document.visibilityState')], ['refused', 'hidden']);

  // Two things at once, allowed.
  await evaluate('window.__cam = navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((s) => { s.getTracks().forEach((t) => t.stop()); return "allowed"; }, (e) => e.name); 0');
  await asked();
  check('camera and microphone are asked about together', (await question()).includes('127.0.0.1 wants to use the camera and use the microphone.'), true);
  await chrome.press('ArrowUp');
  await chrome.press('Enter', 400);
  check('a yes pressed the moment the question appears is not counted', [await chrome.evaluate('document.querySelector("#panel h1")?.textContent'), await answers()], ['Allow this?', { location: 'denied' }]);
  await sleep(700);
  await chrome.press('Enter', 800);
  check('"Allow" gives the page what it asked for, and is remembered', [await evaluate('__cam'), await answers()], ['allowed', { location: 'denied', camera: 'granted', microphone: 'granted' }]);
  await evaluate('window.__cam = navigator.mediaDevices.getUserMedia({ video: true }).then((s) => { s.getTracks().forEach((t) => t.stop()); return "allowed"; }, (e) => e.name); 0');
  await sleep(600);
  check('so the camera alone is then given without a question', [await evaluate('__cam'), await chrome.evaluate('document.visibilityState')], ['allowed', 'hidden']);

  await evaluate('window.__note = Notification.requestPermission(); 0');
  await asked();
  await sayYes(chrome);
  check('notifications are asked about and can be allowed', await evaluate('__note'), 'granted');

  // The menu shows the answers and can forget them.
  await page.press('ContextMenu', 500);
  await siteMenu(chrome);
  const menu = await chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)');
  check('the menu says what the site may and may not do', [menu.includes('Allowed to: use the camera, use the microphone, show notifications'), menu.includes('Not allowed to: know where this device is')], [true, true]);
  for (let i = 0; i < 16 && (await chrome.focused()) !== 'menu-forget'; i++) await chrome.press('ArrowDown');
  check('the entry that forgets them can be reached', await chrome.focused(), 'menu-forget');
  await chrome.press('Enter', 500);
  check('and can forget them', existsSync(join(app.userData, 'sites.json')) ? JSON.parse(readFileSync(join(app.userData, 'sites.json'), 'utf8')) : {}, {});
  await evaluate('location.reload(); 0');
  await sleep(1000);
  await evaluate(locate);
  check('after which the site has to ask again', await asked(), 'Allow this?');
  await chrome.press('Escape', 400);
});

await scenario('downloads', { url: `${site.origin}/home.html` }, async (app) => {
  const page = await app.page(site.origin);
  const chrome = await app.chrome();
  const folder = join(app.userData, 'downloads');
  const asked = () => until(() => chrome.evaluate('document.querySelector("#panel h1")?.textContent ?? null'), (t) => t === 'Download this file?', 50);
  await sleep(800);
  await page.evaluate('location.href = "/file.bin"; 0');
  check('a download is asked about first', await asked(), 'Download this file?');
  const text = await chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)');
  check('the question names the file, its size, where it is from and where it will go', [text.includes('x.bin4 bytes, from 127.0.0.1.'), text.includes(`It will be saved in ${folder}.`)], [true, true]);
  check('nothing is saved before the answer', existsSync(join(folder, 'x.bin')), false);
  await sayYes(chrome, 300);
  check('"Download" saves it and says so', await until(() => page.toastText(), (t) => /^Saved/.test(t ?? ''), 60), `Saved x.bin in ${folder}`);
  check('the file is there, whole, and the page did not go anywhere', [existsSync(join(folder, 'x.bin')) && readFileSync(join(folder, 'x.bin'), 'utf8'), await page.evaluate('location.pathname')], ['data', '/home.html']);

  await page.evaluate('location.href = "/file.bin"; 0');
  await asked();
  check('the same file again gets a new name, and writes over nothing', (await chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)')).includes('x (2).bin'), true);
  await chrome.press('Enter', 600);
  check('"Cancel" saves nothing', [existsSync(join(folder, 'x (2).bin')), readFileSync(join(folder, 'x.bin'), 'utf8')], [false, 'data']);

  await page.evaluate('location.href = "/file.bin"; 0');
  await asked();
  await chrome.press('Escape', 600);
  check('and so does Back', [existsSync(join(folder, 'x (2).bin')), await chrome.evaluate('document.visibilityState')], [false, 'hidden']);
  const waiting = join(app.userData, 'downloads-waiting');
  check('each time the site was asked once, and nothing refused is left lying about', [asks.file, existsSync(waiting) ? readdirSync(waiting) : []], [3, []]);

  // A file that only exists in answer to a form.
  await page.evaluate('(() => { const f = document.createElement("form"); f.method = "post"; f.action = "/made.bin"; document.body.append(f); f.submit(); f.remove(); })(); 0');
  await asked();
  await sayYes(chrome, 300);
  check('a file made in answer to a form is saved, and the form was sent once', [await until(() => existsSync(join(folder, 'made.bin')) && readFileSync(join(folder, 'made.bin'), 'utf8'), (v) => v === 'form', 60), asks.made], ['form', 1]);

  // A file that takes its time, and the list of downloads.
  await page.evaluate('location.href = "/slow.bin"; 0');
  await asked();
  await sayYes(chrome, 300);
  check('a slow download says it has started', await until(() => page.toastText(), (t) => /^Downloading/.test(t ?? ''), 60), 'Downloading slow.bin');
  await page.press('ContextMenu', 500);
  check('the menu has a Downloads entry saying one is under way', await chrome.evaluate('(document.getElementById("menu-downloads")?.ariaLabel ?? document.getElementById("menu-downloads")?.textContent)'), 'Downloads (1 under way)');
  for (let i = 0; i < 16 && (await chrome.focused()) !== 'menu-downloads'; i++) await chrome.press('ArrowDown');
  await chrome.press('Enter', 500);
  const lines = () => chrome.evaluate('[...document.querySelectorAll("#panel .where")].map((p) => p.ariaLabel ?? p.textContent)');
  check('the list shows how far it has got, and the earlier ones', ((l) => [/^slow\.bin: \d+% of 195 KB$/.test(l[0]), ...l.slice(1)])(await until(lines, (l) => /^slow\.bin: [1-9]\d?% of/.test(l[0] ?? ''), 40)), [true, 'made.bin: Saved', 'x.bin: Saved']);
  check('nothing is in the downloads folder until it is whole', existsSync(join(folder, 'slow.bin')), false);
  asks.slow.pop().end('r'.repeat(100000));
  check('when the rest comes it is saved whole, and the list says so', [await until(lines, (l) => l[0] === 'slow.bin: Saved', 60), readFileSync(join(folder, 'slow.bin'), 'utf8') === 'h'.repeat(100000) + 'r'.repeat(100000)], [['slow.bin: Saved', 'made.bin: Saved', 'x.bin: Saved'], true]);
  await chrome.press('Escape', 500);

  await page.evaluate('location.href = "/slow.bin"; 0');
  await asked();
  await sayYes(chrome);
  await page.press('ContextMenu', 500);
  for (let i = 0; i < 16 && (await chrome.focused()) !== 'menu-downloads'; i++) await chrome.press('ArrowDown');
  await chrome.press('Enter', 500);
  check('one under way can be cancelled from the list', await chrome.focused(), 'dl-cancel-6');
  await chrome.press('Enter', 500);
  check('cancelled, it says so and leaves nothing behind', [(await until(lines, (l) => l[0] === 'slow (2).bin: Cancelled', 40))[0], existsSync(join(folder, 'slow (2).bin')), readdirSync(waiting)], ['slow (2).bin: Cancelled', false, []]);
  asks.slow.pop()?.destroy();
});

await scenario('Home, the address field, the menu and Back', { env: { LONGBOARD_TIPS: '1' } }, async (app) => {
  const chrome = await app.chrome();
  await until(() => chrome.focused(), (id) => id === 'go');
  check('the app starts on Home with the highlight on "go to address"', [await chrome.evaluate('document.querySelector("#home h1")?.textContent'), await chrome.focused()], ['Longboard', 'go']);
  check('Home has no script and no app API in its page', await chrome.evaluate('document.scripts.length + typeof window.require + typeof window.ipcRenderer'), '0undefinedundefined');
  check('no keyboard is shown before it is asked for', await chrome.keyboardShown(), false);

  // A remote with no menu key: the menu is a button on Home. There is no line of key names at the foot (Andrew, 2026-11-19).
  check('Home has no legend', await chrome.evaluate('!!document.getElementById("hint")'), false);
  await chrome.press('ArrowUp', 300);
  check('Up from the address bar reaches the Menu button', await chrome.focused(), 'home-menu');
  await chrome.press('Enter', 500);
  check('OK on it opens the menu', await chrome.evaluate('!!document.getElementById("menu-tabs")'), true);
  await chrome.press('Escape', 400);
  check('Back closes it, on Home again', [await chrome.evaluate('!!document.getElementById("menu-tabs")'), await chrome.focused()], [false, 'go']);

  await chrome.press('Enter', 400);
  check('OK on it opens the address field with the on-screen keyboard', [await chrome.evaluate('document.activeElement?.id'), await chrome.keyboardShown()], ['address', true]);
  await chrome.press('Enter', 300); // "a" on the on-screen keyboard
  check('the on-screen keyboard types into it', await chrome.evaluate('document.getElementById("address").value'), 'a');
  await chrome.press('Escape', 200);
  check('Back puts the keyboard away and stays in the field', [await chrome.keyboardShown(), await chrome.evaluate('document.activeElement?.id')], [false, 'address']);
  await chrome.press('Backspace', 200);
  // The rest of the address is typed as a plugged-in keyboard would.
  await chrome.type(`${site.origin.replace('http://', '')}/home.html`);
  await chrome.press('Enter', 300);
  const page = await app.page(`${site.origin}/home.html`);
  check('typing an address and pressing Enter opens it', !!page, true);
  if (!page) return;
  await until(() => page.evaluate('document.visibilityState'), (v) => v === 'visible');
  check('the website is in front and Home is put away', [await page.evaluate('document.visibilityState'), await chrome.evaluate('document.visibilityState')], ['visible', 'hidden']);
  check('the first website of a run says how to get the menu', await until(() => page.toastText(), (t) => !!t, 60), 'For the menu, press Up twice at the top of the page');
  await page.press('ArrowDown');
  check('the arrows drive the page', await page.focused(), 'nav-home');
  await page.press('BrowserHome', 600);
  check('a remote\'s Home button goes Home', [await chrome.evaluate('document.visibilityState'), await chrome.evaluate('!!document.getElementById("resume")')], ['visible', true]);
  await chrome.press('Escape', 600);
  check('and Back on Home returns to the page, where the highlight was', [await page.evaluate('document.visibilityState'), await page.focused()], ['visible', 'nav-home']);

  // A remote with no menu key, on a website: Up at the top, then Up again.
  await page.press('ArrowUp', 500);
  check('Up at the top of the page says how to get the menu, and does not open it', [await page.toastText(), await chrome.evaluate('!!document.querySelector("#panel h1")')], ['Press Up again for the menu', false]);
  await page.press('ArrowUp', 600);
  check('Up again opens the menu', await chrome.evaluate('document.querySelector("#panel h1")?.textContent'), 'Menu');
  await chrome.press('Escape', 500);
  check('Back closes it and the highlight is where it was', [await chrome.evaluate('!!document.querySelector("#panel h1")'), await page.focused()], [false, 'nav-home']);
  check('having opened the menu on a website, it is not said again', JSON.parse(readFileSync(join(app.userData, 'tips.json'), 'utf8')), { menu: true });

  // The menu.
  await page.press('ContextMenu', 500);
  check('the menu key opens the menu panel beside the page', [await chrome.evaluate('document.querySelector("#panel h1")?.textContent'), await chrome.evaluate('document.visibilityState'), await page.evaluate('document.visibilityState')], ['Menu', 'visible', 'visible']);
  check('the highlight starts on Home, not in the address field', [await chrome.focused(), await chrome.keyboardShown()], ['menu-home', false]);
  check('Back is greyed out on the first page', await chrome.evaluate('document.getElementById("menu-back").disabled'), true);
  await chrome.press('ArrowDown');
  check('down skips what cannot be pressed', await chrome.focused(), 'menu-reload');
  await chrome.press('ArrowDown');
  await chrome.press('ArrowRight');
  await chrome.press('ArrowRight');
  check('the zoom buttons can be reached', await chrome.focused(), 'menu-zoom-in');
  const widthBefore = await page.evaluate('innerWidth');
  await chrome.press('Enter', 500);
  check('Bigger makes the page bigger and the menu stays open', [(await page.evaluate('innerWidth')) < widthBefore, await chrome.evaluate('(document.getElementById("menu-zoom-reset")?.ariaLabel ?? document.getElementById("menu-zoom-reset")?.textContent)'), await chrome.focused()], [true, '110%', 'menu-zoom-in']);
  check('the choice is saved for the site', JSON.parse(readFileSync(join(app.userData, 'sites.json'), 'utf8')), { '127.0.0.1': { zoom: 1.1 } });
  await chrome.press('ArrowLeft');
  await chrome.press('Enter', 500);
  check('pressing the percentage puts it back', [await page.evaluate('innerWidth'), await chrome.evaluate('(document.getElementById("menu-zoom-reset")?.ariaLabel ?? document.getElementById("menu-zoom-reset")?.textContent)')], [widthBefore, '100%']);
  await chrome.press('Escape', 400);
  check('Back closes the menu and the keys return to the page', [await chrome.evaluate('document.visibilityState'), await page.evaluate('document.hasFocus()')], ['hidden', true]);
  await page.press('ArrowDown');
  check('the page is driven again', await page.focused(), 't1');

  // About.
  await page.press('ContextMenu', 500);
  for (let i = 0; i < 20 && (await chrome.focused()) !== 'menu-about'; i++) await chrome.press('ArrowDown');
  await chrome.press('Enter', 400);
  check('About shows the notice', (await chrome.evaluate('document.querySelector("#panel p")?.textContent')).includes('not affiliated'), true);
  await chrome.press('Escape', 400);

  // A link, then Back, then Back again from the first page.
  await page.evaluate('location.href = "/article.html"; 0');
  const article = await until(() => page.evaluate('location.pathname'), (p) => p === '/article.html');
  check('a link opens in the same view', article, '/article.html');
  await sleep(500);
  await page.press('Escape', 600);
  check('Back goes back a page', await until(() => page.evaluate('location.pathname'), (p) => p === '/home.html'), '/home.html');
  await sleep(700);
  await page.press('Escape', 600);
  check('Back on the first page goes Home', [await chrome.evaluate('document.visibilityState'), await chrome.evaluate('!!document.getElementById("home")')], ['visible', true]);
  check('the site is on Home as a tile, with its title, and has the highlight', [await chrome.evaluate('document.querySelector("#tiles .site")?.textContent'), await chrome.evaluate('document.querySelector("#tiles .title")?.textContent'), await chrome.focused()], ['127.0.0.1', 'Longboard fixture: generic streaming home', 'tile-0']);
  check('and is remembered on disk', JSON.parse(readFileSync(join(app.userData, 'home.json'), 'utf8')).recents.map((r) => r.url), [`${site.origin}/home.html`]);

  check("the tile shows the site's own icon, fetched from the site", await until(() => chrome.evaluate('!!document.querySelector("#tiles img.icon")?.src.startsWith("data:image/png;base64,")'), (v) => v === true), true);
  const iconsNow = () => (existsSync(join(app.userData, 'icons')) ? readdirSync(join(app.userData, 'icons')) : []);
  check('the icon is kept under a name that does not say which site', iconsNow().map((f) => /^site-[0-9a-f]{16}\.png$/.test(f)), [true]);

  await chrome.press('Enter', 600);
  check('the tile opens the site again', await until(() => page.evaluate('document.visibilityState + location.pathname'), (v) => v === 'visible/home.html'), 'visible/home.html');

  // Taking the tile off Home: the menu, opened with the highlight on the tile.
  await sleep(700);
  await page.press('Escape', 600);
  await until(() => chrome.focused(), (id) => id === 'tile-0');
  await chrome.press('ContextMenu', 500);
  check('the menu opened on a tile offers to remove it', await chrome.evaluate('(document.getElementById("menu-remove-tile")?.ariaLabel ?? document.getElementById("menu-remove-tile")?.textContent)'), 'Remove 127.0.0.1 from Home');
  for (let i = 0; i < 6 && (await chrome.focused()) !== 'menu-remove-tile'; i++) await chrome.press('ArrowDown');
  await chrome.press('Enter', 500);
  check('removing it takes the tile, the saved entry and the icon away', [await chrome.evaluate('document.querySelectorAll("#tiles .tile").length'), await chrome.evaluate('document.getElementById("panel")'), JSON.parse(readFileSync(join(app.userData, 'home.json'), 'utf8')).recents, iconsNow()], [0, null, [], []]);
  await chrome.press('ContextMenu', 500);
  check('with the highlight on nothing that can be removed, the menu does not offer it', [await chrome.focused() !== null, await chrome.evaluate('document.getElementById("menu-remove-tile")')], [true, null]);
});

await scenario('words typed into the address field are searched for', { config: { search: 'https://search.invalid/find?q=%s' } }, async (app) => {
  const chrome = await app.chrome();
  await until(() => chrome.focused(), (id) => id === 'go');
  await chrome.press('Enter', 400);
  await chrome.press('Escape', 200); // the on-screen keyboard away; a plugged-in keyboard types
  await chrome.type('two words');
  await chrome.press('Enter', 300);
  // search.invalid can never resolve, so nothing leaves this machine; the notice names what was asked for.
  const notice = await app.view((u) => u.startsWith('data:'));
  const text = notice ? await until(() => notice.evaluate('document.body?.innerText ?? ""'), (t) => /Cannot reach/.test(t)) : '';
  check('the configured search address is opened with the words', [/Cannot reach this site/.test(text), /page failed to load .*: search\.invalid\/find\n/.test(app.log)], [true, true]);
  check('a search is not put on Home', existsSync(join(app.userData, 'home.json')), false);
  if (notice) {
    await sleep(400);
    await notice.press('Escape', 600);
    check('Back from the notice returns Home', await chrome.evaluate('document.visibilityState'), 'visible');
  }
});

await scenario('a start page that automation refuses', { url: `${site.origin}/signed-out` }, async (app) => {
  const notice = await app.view((u) => u.startsWith('data:'));
  check('a blocked start page is replaced by a notice page', !!notice, true);
  if (notice) {
    // The view opens on a "Starting" notice; wait for the one under test.
    const text = await until(() => notice.evaluate('document.body?.innerText ?? ""'), (t) => t && !t.startsWith('Starting'), 100);
    check(
      'the notice names the blocked address, the cause and the way out, and no query',
      [text.includes('/signup/landing'), text.includes('--automation'), text.includes('Ctrl+Q'), text.includes('SECRET')],
      [true, true, true, false],
    );
  }
  if (notice) {
    await sleep(400);
    await notice.press('Escape', 600);
    const chrome = await app.chrome();
    check('Back from it goes Home, not to the "Starting" notice', await chrome.evaluate('document.visibilityState + !!document.getElementById("home")'), 'visibletrue');
  }
  check('the blocked start page is logged', /blocked navigation \(automation-spend\): http:\/\/127\.0\.0\.1:\d+\/signup\/landing\n/.test(app.log), true);
});

// A made-up player. Player control must reach the page as real key presses,
// exactly once each, and the page's own controls must be usable.
// The user config has one remapped key and one mistake that must be reported and ignored.
await scenario('a full-screen video', { url: `${site.origin}/player.html`, config: { keys: { F4: 'playPause', F6: 'explode' } } }, async (app) => {
  const page = await app.page(site.origin);
  const { evaluate, focused } = page;
  const press = (key, wait = 400) => page.press(key, wait);
  await sleep(1500);
  check('the fixture player is playing', await evaluate('!document.getElementById("v").paused && document.getElementById("v").currentTime > 0'), true);

  await press(' ');
  check('a physical Space reaches the player once and pauses', await evaluate('[__p.space, document.getElementById("v").paused]'), [1, true]);
  await press('Enter');
  check('Enter becomes one Space key press and resumes', await evaluate('[__p.space, document.getElementById("v").paused]'), [2, false]);
  await press('F4');
  await press('F4');
  check('a key remapped in config.json works, and a bad entry is reported', [await evaluate('__p.space'), /config\.json: key "F6": unknown action/.test(app.log)], [4, true]);
  await press('ArrowRight');
  await press('ArrowLeft');
  check('seek keys reach the player once each', await evaluate('[__p.left, __p.right]'), [1, 1]);
  check('the layer did not move the picture itself', await evaluate('document.querySelector("[data-longboard-focus]") === null'), true);

  await press('ArrowDown', 900);
  check('down reveals the player controls and focuses one', [await focused(), (await evaluate('__p.moves')) > 0, await evaluate('document.hasFocus()')], ['pp', true, true]);
  await sleep(3000);
  check('the controls stay up while one has focus', await focused(), 'pp');
  await press('ArrowRight');
  check('arrows move between controls instead of seeking', [await focused(), await evaluate('__p.right')], ['more', 1]);
  await press('Enter', 900);
  await press('ArrowUp');
  check('a styled option in the opened menu takes focus', ['optA', 'optB'].includes(await focused()), true);
  await press('Enter');
  check('and can be chosen', ['A', 'B'].includes(await evaluate('__p.option')), true);
  check('the page behind the player was never focused', await evaluate('document.activeElement?.id !== "behind"'), true);

  await press('Escape');
  check('first Back returns to the picture', [await focused(), await evaluate('__p.closed')], [null, 0]);
  await press('Escape', 600);
  check('second Back closes the open menu', await evaluate('[__p.escape, __p.closed]'), [1, 0]);
  await press('Escape', 600);
  check('third Back closes the player and stays on the page', await evaluate('[__p.closed, location.pathname.endsWith("player.html")]'), [1, true]);
});

// A made-up player whose progress bar is a track three pixels high with
// buttons at either end. The bar must be reachable and movable with a remote.
await scenario('a thin progress bar in a player', { url: `${site.origin}/scrub.html` }, async (app) => {
  const page = await app.page(site.origin);
  const { evaluate, focused } = page;
  const press = (key, wait = 500) => page.press(key, wait);
  await sleep(1500);
  await press('ArrowRight');
  check('with nothing highlighted, right is the player\'s own key', [await focused(), await evaluate('__s.windowKeys')], [null, 1]);
  await press('ArrowDown', 900);
  check('down lands on the progress bar, thin as it is', await focused(), 'bar');
  await press('ArrowRight');
  await press('ArrowRight');
  await press('ArrowLeft');
  check('left and right move the bar, once each, and the highlight stays on it', [await focused(), await evaluate('__s.at'), await evaluate('__s.windowKeys')], ['bar', 55, 1]);
  await press('ArrowDown');
  check('down again goes to a button in the bar\'s row', ['play', 'sound'].includes(await focused()), true);
  const first = await focused();
  await press(first === 'play' ? 'ArrowRight' : 'ArrowLeft');
  check('and from there the arrows come back to the bar', await focused(), 'bar');
  await press('Escape', 700);
  check('Back returns to the bare picture', await focused(), null);
  await press('ArrowUp', 900);
  check('up brings the highlight to the play button, not the close button or the whole picture', await focused(), 'play');
  await press('ArrowUp');
  await press('ArrowUp');
  check('the button laid over the whole picture is never landed on', await focused(), 'x');
});

await scenario('a long article: reading with the arrows', { url: `${site.origin}/article.html` }, async (app) => {
  const page = await app.page(site.origin);
  const { evaluate, press, focused } = page;
  await sleep(800);
  const screen = await evaluate('innerHeight');
  await press('ArrowDown');
  check('the first press takes the first link', await focused(), 'top-home');
  // Down the page to the first link in the text: the page must scroll there a
  // screen at a time, never jump over what lies between.
  let biggest = 0;
  let last = await evaluate('scrollY');
  let presses = 0;
  for (; presses < 12 && (await focused()) !== 'mid-link'; presses++) {
    await press('ArrowDown', 600);
    const now = await evaluate('scrollY');
    biggest = Math.max(biggest, now - last);
    last = now;
  }
  check('down reaches the link in the middle of the text', await focused(), 'mid-link');
  check('by scrolling no more than a screen per press', [presses >= 2, biggest <= screen], [true, true]);
  check('and the link it lands on is on screen', await evaluate('(() => { const r = document.getElementById("mid-link").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()'), true);
  for (let i = 0; i < 20 && (await focused()) !== 'foot-contact'; i++) await press('ArrowDown', 500);
  check('and carries on to the end of the page', [await focused(), await evaluate('Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2')], ['foot-contact', true]);
  await press('ArrowDown', 500);
  check('at the very end the ring bumps instead', await page.ringClass(), 'ring bump-down');
  for (let i = 0; i < 12 && (await focused()) !== 'late-link'; i++) await press('ArrowUp', 500);
  check('up reads back the same way', await focused(), 'late-link');
});

await scenario('a web app whose window does not scroll', { url: `${site.origin}/app.html` }, async (app) => {
  const page = await app.page(site.origin);
  const { evaluate, press, focused } = page;
  await sleep(800);
  await press('ArrowDown');
  check('the first press takes the bar (there is nothing else on screen)', await focused(), 'inbox');
  for (let i = 0; i < 6 && (await focused()) !== 'deep'; i++) await press('ArrowDown', 600);
  check('down reaches a link deep in the scrolling pane', [await focused(), (await evaluate('document.getElementById("pane").scrollTop')) > 0, await evaluate('scrollY')], ['deep', true, 0]);
  for (let i = 0; i < 4; i++) await press('ArrowDown', 500);
  check('and scrolls the pane to its end when there is nothing more to move to', await evaluate('(() => { const p = document.getElementById("pane"); return Math.ceil(p.scrollTop + p.clientHeight) >= p.scrollHeight - 2; })()'), true);
});

// The shapes of a page of results. Found by Andrew on the first evening at
// a TV: on a search engine's results the title of each result could not be
// reached, and the box round what could be was cut through its words.
await scenario('a page of results', { url: `${site.origin}/results.html`, args: ['--zoom=1'] }, async (app) => {
  const page = await app.page(site.origin);
  const { evaluate, press, focused } = page;
  await sleep(800);
  const walk = [];
  for (let i = 0; i < 7; i++) {
    await press('ArrowDown', 350);
    walk.push(await focused());
  }
  check('each press of Down lands on the next result, never on the small button beside one', walk, ['top', 'first', 'sub1', 'sub2', 'second', 'story', 'last']);
  for (let i = 0; i < 5; i++) await press('ArrowUp', 350);
  check('and Up comes back the same way', await focused(), 'first');
  await sleep(500);
  const ring = await page.overlay(({ cls, style }) => (/(^| )ring( |$)/.test(cls) ? style : undefined));
  const px = (name) => Number(new RegExp(`(?:^|[; ])${name}: (-?[\\d.]+)px`).exec(ring ?? '')?.[1]);
  const held = await evaluate(`(() => { const y = scrollY; return ['.site', '.name'].map((s) => { const r = document.querySelector('#first ' + s).getBoundingClientRect(); return [r.top + y, r.bottom + y]; }); })()`);
  check('the box goes round the whole of a result, not through its words', [px('top') <= held[0][0], px('top') + px('height') >= held[1][1]], [true, true]);
  check('a link in a line of text does not grow, and what is pinned in it stays where it was', await evaluate(`(() => { document.querySelector('[data-longboard-focus]'); return document.querySelectorAll('[data-longboard-zoom]').length; })()`), 0);
  await press('ArrowLeft', 350);
  check('the small button is still reached, sideways', await focused(), 'first-more');
  await press('ArrowDown', 350);
  check('and Down from it goes on down the page', await focused(), 'sub1');
  // The referee: everywhere Tab stops, the highlight can reach.
  const said = await page.referee();
  check('everything the Tab key stops at can be reached with the arrows', [said.stops, said.seen, said.reached, said.missed], [10, 10, 10, []]);
});

// At a scale of 1: drawn bigger, the browser's own drop-down list opens
// under where the virtual screen's mouse pointer happens to start, and the
// entry under the pointer is the one the arrows move from. Measured: with
// the pointer moved anywhere else first, the scaled run chooses the same
// entry as this one. STATUS.md lists what that means on a TV.
await scenario('a search field with suggestions, and a top bar', { url: `${site.origin}/combo.html`, args: ['--zoom=1'] }, async (app) => {
  const page = await app.page(`${site.origin}/combo.html`);
  if (!page) return fail('the page did not open');
  const chrome = await app.chrome();
  await sleep(700);
  await page.press('ArrowDown', 300);
  await page.press('ArrowUp', 400);
  check('Up goes to the top bar, not to the link parked above the page', await page.focused(), 'logo');
  await page.press('ArrowUp', 500);
  check('Up at the top has nowhere to go: the parked link is not a target, and what is beside is not above', [await page.focused(), await page.toastText()], ['logo', 'Press Up again for the menu']);
  await page.press('ArrowUp', 600);
  check('so Up again opens the menu', await chrome.evaluate('document.querySelector("#panel h1")?.textContent'), 'Menu');
  await chrome.press('Escape', 500);
  await page.press('ArrowRight', 300);
  check('Right goes along the bar to the search field', await page.focused(), 'q');
  await page.press('Enter', 600);
  check('OK on it brings the keyboard', await page.keyboardShown(), true);
  await page.press('Enter', 400);
  await page.press('Escape', 600);
  check('a letter typed opens the suggestions, and they stay when the keyboard is put away', [await page.keyboardShown(), await page.evaluate('document.getElementById("q").getAttribute("aria-expanded") + " " + document.getElementById("q").value.length')], [false, 'true 1']);
  const marked = () => page.evaluate('[document.activeElement?.id, document.getElementById("q").getAttribute("aria-activedescendant")]');
  await page.press('ArrowDown', 500);
  check('Down marks the first suggestion, with the cursor still in the field', await marked(), ['q', 'opt-0']);
  await page.press('ArrowDown', 500);
  check('Down again marks the second', await marked(), ['q', 'opt-1']);
  const ring = await page.overlay(({ cls, style }) => (/\bring\b/.test(cls) ? style : undefined));
  const optTop = await page.evaluate('Math.round(document.getElementById("opt-1").getBoundingClientRect().top)');
  check('the ring is on the marked suggestion', Math.abs(Number(/top: ([\d.]+)px/.exec(ring ?? '')?.[1]) - optTop) <= 12, true);
  await page.press('ArrowUp', 500);
  check('Up goes back to the first', await marked(), ['q', 'opt-0']);
  await page.press('Enter', 500);
  check('OK chooses the marked suggestion, and does not bring the keyboard', [await page.evaluate('window.__chosen'), await page.keyboardShown()], ['one', false]);
  await page.press('ArrowDown', 500);
  check('with the list closed, Down moves on down the page', await page.focused(), 'first');
  await page.press('ArrowUp', 500);
  check('Up from there passes over the link that jumps lower when it gets the cursor', await page.focused(), 'logo');
  check('a side menu parked off the screen, calling itself a modal dialog, did not take the page away', await page.inLayer('globalThis.longboardReferee.targets().length > 4'), true);
  await page.evaluate('document.getElementById("stuck").focus(); 0');
  await sleep(400);
  await page.press('ArrowDown', 700);
  check('a field whose "open list" does nothing with the keys does not hold the highlight: Down moves on', await page.focused(), 'after');
  await page.evaluate('document.getElementById("stuck").focus(); 0');
  await sleep(400);
  await page.press('ArrowUp', 700);
  check('and so does Up', await page.focused(), 'second');
});

await scenario('a question laid over the whole page, with nothing to say it is a dialog', { url: `${site.origin}/gate.html`, args: ['--zoom=1'] }, async (app) => {
  const page = await app.page(`${site.origin}/gate.html`);
  if (!page) return fail('the page did not open');
  await sleep(700);
  await page.press('ArrowDown', 300);
  check('the first press lands in the layer in front, not on the page behind it', await page.focused(), 'yes');
  await page.press('ArrowDown', 300);
  await page.press('ArrowDown', 300);
  await page.press('ArrowLeft', 300);
  check('and the highlight stays in it', await page.focused(), 'no');
  await page.press('ArrowUp', 300);
  await page.press('Enter', 600);
  check('answering it takes the layer away', await page.evaluate('!document.getElementById("gate")'), true);
  await page.press('ArrowDown', 400);
  await page.press('ArrowDown', 400);
  check('and then the page can be walked', ['one', 'two', 'three'].includes(await page.focused()), true);
});

await scenario('a form, and things that only look clickable', { url: `${site.origin}/form.html`, args: ['--zoom=1'] }, async (app) => {
  const page = await app.page(site.origin);
  const { evaluate, press, focused } = page;
  const value = (id) => evaluate(`document.getElementById("${id}").value`);
  await sleep(800);
  await press('ArrowDown', 300);
  check('the first press lands on the text field, and no keyboard gets in the way', [await focused(), await page.keyboardShown()], ['name', false]);
  await press('Enter', 300);
  check('OK on it brings the keyboard up', await page.keyboardShown(), true);
  await press('Enter', 300);
  check('and it types', await value('name'), 'a');
  await press('ArrowRight', 200);
  await press('Enter', 300);
  for (let i = 0; i < 4; i++) await press('ArrowDown', 200);
  await press('ArrowRight', 200);
  await press('Enter', 300);
  check('the keyboard\'s left arrow moves the cursor in the field, and the keyboard stays', [await value('name'), await evaluate('document.getElementById("name").selectionStart'), await page.keyboardShown()], ['ab', 1, true]);
  for (let i = 0; i < 4; i++) await press('ArrowUp', 200);
  await press('Enter', 300);
  check('what is typed next goes in where the cursor is', await value('name'), 'acb');
  for (let i = 0; i < 4; i++) await press('ArrowDown', 200);
  await press('ArrowRight', 200);
  await press('Enter', 300);
  check('and the right arrow moves it on', await evaluate('document.getElementById("name").selectionStart'), 3);
  if (process.env.OSK_SHOT) { const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }); (await import('node:fs')).writeFileSync(process.env.OSK_SHOT, Buffer.from(data, 'base64')); }
  await press('Escape');
  check('Back puts the keyboard away', await page.keyboardShown(), false);
  await press('ArrowDown');
  check('down goes to the drop-down', await focused(), 'colour');
  await press('Enter', 500);
  await press('ArrowDown', 300);
  await press('Enter', 400);
  check("OK opens the browser's own list, the arrows move in it and OK chooses", await value('colour'), 'green');
  await press('ArrowDown');
  check('after which the arrows move the highlight again', await focused(), 'agree');
  await press('Enter');
  check('a checkbox is ticked', await evaluate('document.getElementById("agree").checked'), true);
  await press('ArrowDown');
  await press('ArrowRight');
  await press('Enter');
  check('a radio button is chosen', [await focused(), await evaluate('document.getElementById("large").checked')], ['large', true]);
  await press('ArrowDown');
  check('down goes to the slider', await focused(), 'level');
  await press('ArrowRight', 300);
  await press('ArrowRight', 300);
  check('left and right move a slider', await value('level'), '7');
  await press('ArrowDown', 300);
  check('down passes over the text box without the keyboard', [await focused(), await page.keyboardShown()], ['notes', false]);
  // A plugged-in keyboard just types, and then the keys are the field's.
  await page.type('h ');
  await sleep(200);
  check('a real keyboard types straight into it, spaces included', [await value('notes'), await page.keyboardShown()], ['h ', false]);
  await press('ArrowDown');
  await press('Enter');
  check('the form can be sent', [await focused(), await evaluate('__f.submitted')], ['send', 1]);
  await press('ArrowDown');
  check('a card that is clickable only by script and cursor takes the highlight', await focused(), 'card1');
  await press('Enter');
  await press('ArrowRight');
  await press('Enter');
  await press('ArrowRight');
  check('and is pressed; what is not clickable is passed over', [await evaluate('__f.clicks'), await focused()], [['card1', 'card2'], 'card2']);
  await press('ArrowLeft');
  await press('ArrowDown');
  await press('Enter');
  check('an element with an inline handler works', [await focused(), await evaluate('__f.clicks.at(-1)')], ['old', 'old']);
  await press('ArrowDown');
  await press('Enter');
  check('a disclosure opens', [await focused(), await evaluate('document.getElementById("more").open')], ['summary', true]);
});

await scenario('a video with the browser\'s own controls', { url: `${site.origin}/video.html` }, async (app) => {
  const page = await app.page(site.origin);
  const { evaluate, press, focused } = page;
  const paused = () => evaluate('document.getElementById("v").paused');
  await sleep(1200);
  check('the video is playing as part of the page', await evaluate('!document.getElementById("v").paused && document.getElementById("v").currentTime > 0'), true);
  await press('ArrowDown');
  await press('ArrowDown');
  check('while it is only part of the page the arrows move the highlight, and can land on it', await focused(), 'v');
  await press('ArrowDown');
  check('and move on past it', await focused(), 'theatre');
  await press('Enter', 2500);
  check('once it fills the screen the highlight is put away', [await evaluate('document.body.classList.contains("theatre")'), await focused()], [true, null]);
  await press(' ', 500);
  check('Space pauses it', await paused(), true);
  await press('Enter', 500);
  check('OK resumes it', await paused(), false);
  check('with ordinary key presses, not by calling the video', (await evaluate('__v.keys')).filter((k) => k === ' ').length, 2);
});

await scenario('the highlight inside a frame from another site', { url: `${site.origin}/frames.html` }, async (app) => {
  const page = await app.page(`${site.origin}/frames.html`);
  const { evaluate, press, focused } = page;
  const messages = () => evaluate('__frame.messages');
  const inFrame = () => evaluate('document.activeElement?.id');
  await sleep(1000);
  await press('ArrowDown');
  await press('ArrowDown');
  check('the highlight can land on an embedded frame', await focused(), 'frame');
  await press('Enter', 900);
  check('OK on it sends the highlight into the frame: the frame has the keys, and no pointer is needed', [await inFrame(), await page.pointerAt()], ['frame', null]);
  // In the frame: a text field on the left, two buttons to its right, a password field below it.
  const at = async () => (await messages()).filter((m) => m.startsWith('at ')).at(-1);
  await press('Enter', 600);
  check('it starts on the first thing in the frame, and OK presses it', [await at(), (await messages()).filter((m) => m.startsWith('clicked'))], ['at inside', ['clicked 1']]);
  await press('ArrowRight', 500);
  await press('Enter', 700);
  check('the arrows move among what is in the frame; a purchase control there is not pressed in a scripted run', [await at(), (await messages()).includes('bought')], ['at buy', false]);
  await press('ArrowLeft', 400);
  await press('ArrowLeft', 400);
  await press('Enter', 900);
  check('OK on a text field in the frame brings the page\'s keyboard up', [await at(), await page.keyboardShown()], ['at name', true]);
  await press('Enter', 500);
  await press('ArrowRight', 300);
  await press('Enter', 500);
  const typed = (await messages()).filter((m) => m.startsWith('typed '));
  check('its keys type into the field in the frame', [typed.length, typed.at(-1)?.length], [2, 'typed '.length + 2]);
  check('and the arrows moved along the keyboard, not into the frame', (await messages()).filter((m) => m.startsWith('key Arrow')), []);
  await press('Escape', 700);
  check('Back puts the keyboard away, and the keys are the frame\'s again', [await page.keyboardShown(), await inFrame(), await page.pointerAt()], [false, 'frame', null]);
  // As in the page itself: a field that has been typed in keeps the arrows until Back leaves it.
  await press('Escape', 500);
  // A scripted run never types a password (Hard rule 10): no keyboard for that field.
  await press('ArrowDown', 500);
  await press('Enter', 900);
  check('in a scripted run no keyboard comes up for a password field in the frame', [await at(), await page.keyboardShown()], ['at secret', false]);
  await press('ArrowDown', 900);
  check('a press with nowhere to go in the frame leaves it, that way', await focused(), 'below');
  await press('ArrowUp', 500);
  await press('ArrowUp', 500);
  check('and the page is walked as before', await focused(), 'above');
});

await scenario('a frame with nothing in it to select', { url: `${site.origin}/frames.html?inner=inner-picture.html` }, async (app) => {
  const page = await app.page(`${site.origin}/frames.html`);
  const { evaluate, press, focused } = page;
  await sleep(1000);
  await press('ArrowDown');
  await press('ArrowDown');
  check('the highlight lands on the frame', await focused(), 'frame');
  await press('Enter', 1500);
  check('OK on it falls back to the pointer, on the frame, and says so', [(await page.pointerAt()) !== null, await page.toastText()], [true, 'Pointer mode: this part of the page needs the pointer']);
  await press('Enter', 600);
  check('and OK presses what is under the pointer', await evaluate('__frame.messages'), ['pressed']);
});

await scenario('a prompt that is a frame over the whole page', { url: `${site.origin}/frame-prompt.html` }, async (app) => {
  const page = await app.page(`${site.origin}/frame-prompt.html`);
  const { press } = page;
  await sleep(1200);
  await press('ArrowDown', 700);
  await press('ArrowDown', 900);
  check('the arrows go into the prompt by themselves, with no pointer', [await page.evaluate('document.activeElement?.id'), await page.pointerAt()], ['frame', null]);
  // The prompt calls itself a dialog, and the highlight is kept in dialogs: that must not take the cursor out of the frame.
  await sleep(1500);
  await press('ArrowLeft', 500);
  await press('Enter', 2500);
  check('OK on a text field there brings the keyboard up, and it stays up', await page.keyboardShown(), true);
  await press('Enter', 600);
  check('and its keys type into the field', (await page.evaluate('__frame.messages')).filter((m) => m.startsWith('typed ')).length, 1);
});

await scenario('a dialog the browser draws in front of everything', { url: `${site.origin}/modal.html` }, async (app) => {
  const page = await app.page(`${site.origin}/modal.html`);
  const { press, focused } = page;
  // What is in the browser's top layer, back to front: the last is what is seen.
  const front = async () => {
    const { nodeIds } = await page.cdp.send('DOM.getTopLayerElements');
    const names = [];
    for (const nodeId of nodeIds) names.push((await page.cdp.send('DOM.describeNode', { nodeId })).node.localName);
    return names.filter((n) => n !== '::backdrop').at(-1);
  };
  await sleep(800);
  await page.cdp.send('DOM.getDocument', { depth: 0 });
  await press('ArrowDown', 300);
  await press('Enter', 900);
  check('the highlight goes into the dialog', await focused(), 'yes');
  check('and Longboard\'s own drawings are in front of it, not under it', await front(), 'longboard-overlay');
});

await scenario('pointer mode', { url: `${site.origin}/frames.html` }, async (app) => {
  const page = await app.page(`${site.origin}/frames.html`);
  const { evaluate, press, focused } = page;
  const messages = async () => (await evaluate('__frame.messages')).filter((m) => !m.startsWith('at '));
  await sleep(1000);
  check('no pointer is shown to begin with', await page.pointerAt(), null);
  await press('ArrowDown');
  await press('ArrowDown');
  check('the highlight can land on an embedded frame', await focused(), 'frame');
  await press('F2', 500);
  const box = await evaluate('(() => { const r = document.getElementById("frame").getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })()');
  check('the pointer key brings the pointer, and it can be walked onto the frame', await page.pointTo((box.l + box.r) / 2, (box.t + box.b) / 2), true);
  const start = await page.pointerAt();
  check('with the ring put away', await focused(), null);
  await press('Enter', 600);
  check('OK clicks what is under the pointer, inside the frame', await messages(), ['clicked 1']);

  // The guard reaches into the frame: a purchase button there is not pressed either.
  check('the pointer can be walked to another button in the frame', await page.pointTo(start.x + 200, start.y), true);
  await press('Enter', 700);
  check('a purchase control inside the frame is not clicked in automation mode', [await messages(), await page.toastText()], [['clicked 1'], 'Blocked: automation mode never activates purchase or sign-up controls']);
  await page.pointTo(start.x, start.y);

  // Moving: a tap is a small step, a held key travels.
  const before = await page.pointerAt();
  await press('ArrowRight', 200);
  const tapped = await page.pointerAt();
  check('a tap moves the pointer a little', [tapped.x > before.x, tapped.x - before.x < 20, tapped.y === before.y], [true, true, true]);
  check('and no further', (await sleep(500), await page.pointerAt()), tapped);
  await page.hold('ArrowLeft', 900);
  await sleep(250);
  const held = await page.pointerAt();
  check('a held key moves it a long way', tapped.x - held.x > 100, true);
  check('and it stops when the key is let go', (await sleep(300), (await page.pointerAt()).x), held.x);
  check('the arrows went to the pointer, not into the frame', (await messages()).filter((m) => m.startsWith('key Arrow')), []);

  // Leaving: the same key, or Back; the keys come back to the page.
  await press('F2', 400);
  check('the pointer key puts the pointer away', await page.pointerAt(), null);
  await press('ArrowDown', 300);
  check('and the arrows move the highlight again, though the click left the keys in the frame', (await focused()) !== null, true);
  await press('F2', 400);
  check('the pointer key brings it back, in the middle of the screen', ((at, w, h) => !!at && Math.abs(at.x - w / 2) <= 1 && Math.abs(at.y - h / 2) <= 1)(await page.pointerAt(), await evaluate('innerWidth'), await evaluate('innerHeight')), true);
  await press('Escape', 400);
  check('Back puts it away too', await page.pointerAt(), null);
});

await scenario('pointer mode: edges, the menu and the guard', { url: `${site.origin}/home.html` }, async (app) => {
  const page = await app.page(site.origin);
  const { evaluate, press } = page;
  await sleep(800);
  const pointTo = page.pointTo;
  const centre = (id) => evaluate(`(() => { const r = document.getElementById("${id}").getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; })()`);

  await press('F2', 400);
  const play = await centre('play');
  check('the pointer can be walked to a button', await pointTo(play.x, play.y), true);
  await press('Enter', 500);
  check('and OK presses it, as a mouse click', await evaluate('__clicks'), ['play']);
  const rent = await centre('rent');
  await pointTo(rent.x, rent.y);
  await press('Enter', 500);
  check('a purchase control is not clicked in automation mode', [await evaluate('__clicks'), await page.toastText()], [['play'], 'Blocked: automation mode never activates purchase or sign-up controls']);

  // The menu knows about it.
  const chrome = await app.chrome();
  await press('ContextMenu', 500);
  check('the menu says pointer mode is on', await chrome.evaluate('(document.getElementById("menu-pointer")?.ariaLabel ?? document.getElementById("menu-pointer")?.textContent)'), 'Pointer mode: on');
  for (let i = 0; i < 8 && (await chrome.focused()) !== 'menu-pointer'; i++) await chrome.press('ArrowDown');
  await chrome.press('Enter', 500);
  check('and switches it off', await page.pointerAt(), null);

  // Pushing against the bottom edge scrolls the page.
  await evaluate('document.body.insertAdjacentHTML("beforeend", "<div style=\\"height:3000px\\"></div>"); 0');
  await press('F2', 400);
  await page.hold('ArrowDown', 2200);
  await sleep(400);
  const at = await page.pointerAt();
  check('holding down runs the pointer to the bottom edge and then scrolls the page', [at.y >= (await evaluate('innerHeight')) - 2, (await evaluate('scrollY')) > 100], [true, true]);

  // A text field takes the keyboard, and the keyboard takes the arrows.
  await evaluate('scrollTo(0, 0); 0');
  await sleep(300);
  const search = await centre('search');
  await pointTo(search.x, search.y);
  await press('Enter', 600);
  check('clicking a text field ends pointer mode and brings up the keyboard', [await page.pointerAt(), await page.keyboardShown(), await evaluate('document.activeElement?.id')], [null, true, 'search']);
});

// Profiles. The fixture site answers to the made-up name profile.test (mapped
// to this machine), because a profile names sites by domain.
const port = new URL(site.origin).port;
const profiled = `http://profile.test:${port}/profiled.html`;
const mapHost = '--host-resolver-rules=MAP profile.test 127.0.0.1';

await scenario('a site with no profile, then with one', { url: profiled, args: [mapHost] }, async (app) => {
  const page = await app.page('http://profile.test');
  const { evaluate, press, focused } = page;
  await sleep(800);
  await press('ArrowDown');
  check('with no profile the first press takes the banner link, and the tiles cannot be reached', await focused(), 'banner-link');
  await press('ArrowDown');
  check('down goes past the tiles to the first real control', ['stray', 'footer-link', 'panel-close'].includes(await focused()), true);
  const chrome = await app.chrome();
  await press('ContextMenu', 500);
  check('the menu warns that a page sent over plain http is not secure', (await chrome.evaluate('(document.getElementById("not-secure")?.ariaLabel ?? document.getElementById("not-secure")?.textContent) ?? ""')).startsWith('Not secure:'), true);
  await siteMenu(chrome);
  check('the menu says there is no profile', (await chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)')).includes('No profile for this site: generic mode'), true);
  check('and offers nothing to export', await chrome.evaluate('!!document.getElementById("menu-export")'), false);
});

// Rule 3 as amended on 2026-11-21: a profile may say its site has an interface
// for TVs. Longboard then adds, for that site only, that it is running as a
// TV; and the site answers the remote itself.
await scenario(
  'a site with an interface for TVs',
  {
    // The site's front page is asked for; the profile says its TV interface starts elsewhere.
    url: `http://profile.test:${port}/`,
    args: [mapHost],
    seed: (data) => {
      mkdirSync(join(data, 'profiles'), { recursive: true });
      copyFileSync(join(root, 'test/fixtures/profiles/tvapp.json'), join(data, 'profiles/tvapp.json'));
    },
  },
  async (app) => {
    const page = await app.page('http://profile.test');
    const { evaluate, press } = page;
    await sleep(800);
    check('asking for the site\'s front page opens its interface for TVs', await evaluate('location.pathname'), '/tvapp.html');
    const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
    const said = await evaluate('navigator.userAgent');
    const cut = said.lastIndexOf(', Longboard_TV');
    const [honest, added] = cut < 0 ? [said, ''] : [said.slice(0, cut), said.slice(cut + 2)];
    check('the page is told Longboard is running as a TV, after everything it says anyway', [/^Mozilla\/5\.0 \(X11; Linux [^)]+\) AppleWebKit\/[\d.]+ \(KHTML, like Gecko\) Chrome\/[\d.]+ Safari\/[\d.]+ Longboard\/[\d.]+$/.test(honest), added], [true, `Longboard_TV/${version} (Longboard, Linux)`]);
    check('no other browser, engine, maker or system is named', /Cobalt|Tizen|Web0S|SMART|PlayStation|Xbox|Android|Windows|Macintosh/i.test(said), false);
    check('what it fetches says the same', await evaluate('fetch("/agent").then((r) => r.json())'), said);
    await press('ArrowRight');
    await press('ArrowRight');
    check('the arrows are the app\'s own: it moves its mark, and Longboard highlights nothing', [await evaluate('where()'), await evaluate('seen.join()'), await evaluate('!!document.querySelector("[data-longboard-focus]")')], [2, 'ArrowRight,ArrowRight', false]);
    // Up where the app has nowhere further up: pressed again, it opens the menu, as on any site.
    await press('ArrowUp', 500);
    check('Up with nowhere to go in the app says how to reach the menu', await page.toastText(), 'Press Up again for the menu');
    await press('ArrowUp', 700);
    const menuChrome = await app.chrome();
    check('and Up again opens it', await menuChrome.evaluate('document.querySelector("#panel h1")?.textContent ?? null'), 'Menu');
    await menuChrome.press('Escape', 500);
    // Long enough for the words from before to have gone.
    await until(() => page.toastText(), (t) => !t, 60);
    await press('ArrowDown');
    await press('ArrowUp', 500);
    check('an Up the app did something with is the app\'s alone', [await evaluate('document.activeElement.id'), await page.toastText()], ['', null]);
    await sleep(4200);
    await press('ArrowDown');
    await press('Enter', 400);
    check('in a scripted run OK still never presses a sign-up button', [await evaluate('document.activeElement.id'), await evaluate('pressed'), /never activates purchase or sign-up/.test((await page.toastText()) ?? '')], ['join', 0, true]);
    // Any other address of the site goes to the interface for TVs too, keeping only what the profile says that interface understands.
    await evaluate('location.href = "/home.html?v=abc123&other=1"');
    await sleep(1500);
    check('any other page of the site opens the interface for TVs, with the video it named', await evaluate('location.pathname + location.search'), '/tvapp.html?v=abc123');
    // The way out: the site menu's switch.
    const chrome = await app.chrome();
    const reachRow = async (id) => {
      for (let i = 0; i < 30 && (await chrome.focused()) !== id; i++) await chrome.press('ArrowDown');
      return chrome.focused();
    };
    await press('ContextMenu', 500);
    await siteMenu(chrome);
    check('the site menu has a switch for the site\'s profile, on', [await reachRow('menu-site-profile'), await chrome.evaluate('(document.getElementById("menu-site-profile")?.ariaLabel ?? document.getElementById("menu-site-profile")?.textContent)')], ['menu-site-profile', "Use this site's profile: on"]);
    await chrome.press('Enter', 1500);
    check('switched off, the site\'s front page is opened as any browser gets it', [await evaluate('location.pathname'), await evaluate('navigator.userAgent'), JSON.parse(readFileSync(join(app.userData, 'sites.json'), 'utf8'))['profile.test']], ['/', honest, { profile: false }]);
    await evaluate('location.href = "/home.html"');
    await sleep(1200);
    check('and its pages open as asked, told only the usual, as is what they fetch', [await evaluate('location.pathname'), await evaluate('navigator.userAgent'), await evaluate('fetch("/agent").then((r) => r.json())')], ['/home.html', honest, honest]);
    await press('ContextMenu', 500);
    await siteMenu(chrome);
    check('the switch is still there, off', [await reachRow('menu-site-profile'), await chrome.evaluate('(document.getElementById("menu-site-profile")?.ariaLabel ?? document.getElementById("menu-site-profile")?.textContent)')], ['menu-site-profile', "Use this site's profile: off"]);
    await chrome.press('Enter', 1500);
    check('switched on again, the page it was on gives way to the interface for TVs', [await evaluate('location.pathname'), /Longboard_TV/.test(await evaluate('navigator.userAgent'))], ['/tvapp.html', true]);
  },
);

await scenario(
  'a profile of your own',
  {
    url: profiled,
    args: [mapHost, '--size=1280x720', '--zoom='],
    seed: (data) => {
      mkdirSync(join(data, 'profiles'), { recursive: true });
      copyFileSync(join(root, 'test/fixtures/profiles/profile-test.json'), join(data, 'profiles/fixture.json'));
      // A file that is not a valid profile must be reported and ignored, not stop anything.
      writeFileSync(join(data, 'profiles/scripted.json'), JSON.stringify({ longboard: 1, id: 'scripted', scripts: ['evil.js'] }));
    },
  },
  async (app) => {
    const page = await app.page('http://profile.test');
    const { evaluate, press, focused } = page;
    await sleep(800);
    check('a file with scripts in it is refused and said so', /scripted\.json is not a usable profile: profiles cannot contain scripts/.test(app.log), true);
    check('the page is drawn at the size the profile asks for', await evaluate('innerWidth'), 640);
    check('and the edge of the screen the profile asks for is kept clear', await evaluate('[Math.round(innerWidth * devicePixelRatio), Math.round(innerHeight * devicePixelRatio)]'), [1152, 648]);
    await press('ArrowDown');
    check('the highlight starts where the profile says', await focused(), 'a3');
    await press('Enter');
    check('a tile only the profile knows about can be pressed', await evaluate('__t.clicks'), ['a3']);
    await press('ArrowRight');
    check('right at the end of a row stays in the row', await focused(), 'a3');
    await press('ArrowDown');
    await press('ArrowLeft');
    check('down goes to the next row', await focused(), 'b1');
    await press('ArrowUp');
    check('and up comes back to where the highlight was in the first row', await focused(), 'a3');
    await press('ArrowUp');
    check('the excluded banner is never highlighted', await focused(), 'a3');
    // The site changes its address without loading a page, off the paths the profile is for and back.
    await evaluate('history.pushState({}, "", "/elsewhere"); 0');
    check('when the address leaves what the profile is for, the page is driven without it', (await until(() => evaluate('innerWidth'), (w) => w > 900)) > 900, true);
    await evaluate('history.pushState({}, "", "/profiled.html"); 0');
    check('and with it again when the address comes back', [await until(() => evaluate('innerWidth'), (w) => w === 640), await focused()], [640, 'a3']);
    await press('ArrowDown');
    await press('ArrowUp');
    check('its rows work as before', await focused(), 'a3');

    // Pointer mode in a view that does not start at the corner of the screen.
    await press('F2', 400);
    const a1 = await evaluate('(() => { const r = document.getElementById("a1").getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()');
    check('with the edges kept clear the pointer can still be walked to a tile', await page.pointTo(a1.x, a1.y), true);
    await press('Enter', 600);
    check('and OK clicks the tile under it', (await evaluate('__t.clicks')).at(-1), 'a1');
    await press('F2', 400);

    await press('Escape', 400);
    check('Back first closes what the profile says it closes', [await evaluate('!!document.getElementById("panel")'), await evaluate('location.pathname')], [false, '/profiled.html']);

    const chrome = await app.chrome();
    await press('ContextMenu', 500);
    await siteMenu(chrome);
    check('the menu names the profile and where it came from', (await chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)')).includes('Profile: Fixture Site (your own)'), true);
    for (let i = 0; i < 12 && (await chrome.focused()) !== 'menu-export'; i++) await chrome.press('ArrowDown');
    await chrome.press('Enter', 600);
    const exported = join(app.userData, 'exports/fixture-site.longboard-profile.json');
    check('the profile can be exported as one file', [existsSync(exported), existsSync(exported) && JSON.parse(readFileSync(exported, 'utf8')).id], [true, 'fixture-site']);
    check('and the screen says where it went', (await page.toastText())?.startsWith('Profile saved as '), true);
  },
);

await scenario(
  'the reviewed catalogue, and a profile someone gave you',
  {
    url: profiled,
    args: [mapHost, `--catalogue=${site.origin}/catalogue/index.json`],
    seed: (data) => {
      // What a USB stick or the import folder would hold: the same profile under another name and version.
      mkdirSync(join(data, 'import'), { recursive: true });
      const given = { ...JSON.parse(fixtureProfile.toString()), id: 'given-profile', name: 'Given Profile', version: '2.0.0' };
      writeFileSync(join(data, 'import/given.longboard-profile.json'), JSON.stringify(given));
    },
  },
  async (app) => {
    const page = await app.page('http://profile.test');
    const chrome = await app.chrome();
    await until(() => app.log, (log) => /catalogue: \d+ profile/.test(log), 100);
    check('the catalogue is fetched in the background, checked, and what fails its checksum is left out', [/catalogue: 1 profile\(s\), 1 verified site\(s\)/.test(app.log), /tampered\.test\/profile\.json does not match its checksum/.test(app.log)], [true, true]);
    check('it is kept in the data folder', existsSync(join(app.userData, 'catalogue/profiles/profile.test/profile.json')), true);
    // The page was opened before the download finished: it picks the profile up when it is next loaded.
    await page.press('ContextMenu', 500);
    for (let i = 0; i < 6 && (await chrome.focused()) !== 'menu-reload'; i++) await chrome.press('ArrowDown');
    await chrome.press('Enter', 1200);
    await page.press('ArrowDown');
    check('a reviewed profile is used without asking', await page.focused(), 'a3');
    await page.press('ContextMenu', 500);
    await siteMenu(chrome);
    check('and the menu says it is reviewed', (await chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)')).includes('Profile: Fixture Site (reviewed)'), true);

    // Importing.
    await chrome.press('Escape', 400);
    for (const id of ['menu-settings', 'settings-profiles', 'set-import']) {
      for (let i = 0; i < 24 && (await chrome.focused()) !== id; i++) await chrome.press('ArrowDown');
      await chrome.press('Enter', id === 'set-import' ? 700 : 400);
    }
    check('profiles are imported from the import folder', [(await page.toastText())?.startsWith('Imported: Given Profile'), existsSync(join(app.userData, 'imported/given-profile.json'))], [true, true]);
    await page.evaluate('location.reload(); 0');
    const asked = await until(() => chrome.evaluate('document.querySelector("#panel h1")?.textContent'), (t) => t === 'Use this profile?', 60);
    check('an imported profile is not used silently: the next visit asks', asked, 'Use this profile?');
    check('the question says what it is and which sites it applies to', (await chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)')).includes('"Given Profile" (version 2.0.0)') && (await chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)')).includes('profile.test'), true);
    check('with the highlight on the answer that changes nothing', await chrome.focused(), 'prompt-deny');
    await sayYes(chrome, 1500);
    await page.press('ContextMenu', 600);
    await siteMenu(chrome);
    check('after "Use it" the site is driven by the imported profile, and the menu says nobody reviewed it', (await chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)')).includes('Profile: Given Profile (imported, not reviewed)'), true);
    check('and the answer is remembered, for that file and no other', Object.entries(JSON.parse(readFileSync(join(app.userData, 'imported-answers.json'), 'utf8'))).map(([k, v]) => [/^given-profile@2\.0\.0#[0-9a-f]{32}$/.test(k), v]), [[true, 'yes']]);

    // Home shows what Longboard has for a site.
    await chrome.press('Escape', 400);
    for (let i = 0; i < 6 && (await chrome.focused()) !== 'menu-home'; i++) await chrome.press('ArrowUp');
    await chrome.press('Enter', 600);
  },
);

await scenario('the profile editor', { url: profiled, args: [mapHost] }, async (app) => {
  const page = await app.page('http://profile.test');
  const chrome = await app.chrome();
  const { evaluate, press } = page;
  const reach = async (id, key = 'ArrowDown') => {
    for (let i = 0; i < 20 && (await chrome.focused()) !== id; i++) await chrome.press(key);
    return chrome.focused();
  };
  /** How many of the editor's boxes of one kind are drawn on the page. */
  const boxes = async (kind) => {
    let n = 0;
    await page.overlay(({ cls }) => {
      if (new RegExp(`^mark ${kind}$`).test(cls)) n += 1;
      return undefined;
    });
    return n;
  };
  const text = (id) => chrome.evaluate(`(document.getElementById("${id}")?.ariaLabel ?? document.getElementById("${id}")?.textContent) ?? null`);
  await sleep(800);
  await press('ContextMenu', 500);
  await siteMenu(chrome);
  check('with no profile the menu offers to make one', await text('menu-edit'), 'Make a profile for this site');
  await reach('menu-edit');
  await chrome.press('Enter', 700);
  check('which brings up the pointer and says what to do', [(await page.pointerAt()) !== null, (await page.toastText())?.startsWith('Profile editor:')], [true, true]);

  const tile = await evaluate('(() => { const r = document.getElementById("a1").getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; })()');
  check('the pointer can be put on a tile', await page.pointTo(tile.x, tile.y), true);
  await press('Enter', 700);
  check('OK does not press it: it is picked, by its kind, and every one like it is counted', [await evaluate('__t.clicks'), await chrome.evaluate('document.querySelector("#panel .where")?.textContent')], [[], 'div.tile: 5 on this page, shown with a dashed box']);
  check('and all of them are boxed on the page', await boxes('picked'), 5);
  check('the highlight is on the first choice', [await chrome.focused(), await text('edit-include')], ['edit-include', 'Can be selected: no']);
  check('nothing can be saved before anything is marked', await chrome.evaluate('document.getElementById("edit-save").disabled'), true);
  await chrome.press('Enter', 500);
  check('choosing it marks every tile as something that can be selected', [await text('edit-include'), await boxes('include')], ['Can be selected: yes', 5]);

  await reach('edit-wider');
  await chrome.press('Enter', 500);
  check('Wider moves out to what holds the tiles', await chrome.evaluate('document.querySelector("#panel .where")?.textContent'), 'div.strip: 2 on this page, shown with a dashed box');
  check('with nothing wider left, the highlight goes back to the top of the panel', [await chrome.evaluate('document.getElementById("edit-wider").disabled'), await chrome.focused()], [true, 'edit-include']);
  await reach('edit-row');
  await chrome.press('Enter', 500);
  check('which can be marked as a row', [await text('edit-row'), await boxes('row')], ['This is a row: yes', 2]);

  // Back goes back to pointing; the banner is marked as never selected.
  await chrome.press('Escape', 500);
  check('Back returns to pointing, with the marks still shown', [await chrome.evaluate('document.visibilityState'), (await page.pointerAt()) !== null, await boxes('include')], ['hidden', true, 5]);
  const banner = await evaluate('(() => { const r = document.querySelector(".banner").getBoundingClientRect(); return { x: r.left + 20, y: (r.top + r.bottom) / 2 }; })()');
  await page.pointTo(banner.x, banner.y);
  await press('Enter', 700);
  await reach('edit-exclude');
  await chrome.press('Enter', 500);
  check('something else can be marked as never selected', [await chrome.evaluate('document.querySelector("#panel .where")?.textContent'), await text('edit-exclude'), await boxes('exclude')], ['div.banner: 1 on this page, shown with a dashed box', 'Never select: yes', 1]);

  await reach('edit-save');
  await chrome.press('Enter', 1200);
  const file = join(app.userData, 'profiles/profile-test.json');
  const saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  check('Save writes an ordinary profile to your own profiles', [saved.id, saved.match, saved.focus], ['profile-test', { hosts: ['profile.test', '*.profile.test'] }, { include: ['div.tile'], exclude: ['div.banner'], groups: [{ name: 'row-1', selector: 'div.strip', axis: 'horizontal', remember: true }] }]);
  const outlineFile = join(app.userData, 'profiles', saved.evidence?.outline ?? 'missing');
  const outline = existsSync(outlineFile) ? readFileSync(outlineFile, 'utf8') : '';
  check('with an outline of the page as its evidence, holding structure and no text', [/^\s*div#a1\.tile$/m.test(outline), /made-up cookies|Read more|Stray/.test(outline), outline.split('\n').filter((l) => l && !l.startsWith('#')).some((l) => l.trim().includes(' '))], [true, false, false]);
  check('the editor is put away and says where the file went', [await page.pointerAt(), await boxes('include'), (await page.toastText())?.startsWith('Profile saved as ')], [null, 0, true]);

  // The page is driven by it at once, and it is still there on the next visit.
  await press('ArrowDown');
  check('the tiles can be reached now, and the banner cannot', /^[ab][123]$/.test(await page.focused()), true);
  await press('Enter');
  check('and pressed', (await evaluate('__t.clicks')).length, 1);
  await evaluate('location.reload(); 0');
  await sleep(1200);
  await press('ArrowDown');
  check('the same after loading the page again', /^[ab][123]$/.test(await page.focused()), true);
  await press('ContextMenu', 500);
  await siteMenu(chrome);
  check('the menu names it as your own, and offers to edit it', [(await chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)')).includes('Profile: profile.test (your own)'), await text('menu-edit')], [true, 'Edit the profile for this site']);
});

await scenario('the profile editor, changing your mind', { url: profiled, args: [mapHost] }, async (app) => {
  const page = await app.page('http://profile.test');
  const chrome = await app.chrome();
  const reach = async (id, key = 'ArrowDown') => {
    for (let i = 0; i < 20 && (await chrome.focused()) !== id; i++) await chrome.press(key);
  };
  await sleep(800);
  await page.press('ContextMenu', 500);
  await siteMenu(chrome);
  await reach('menu-edit');
  await chrome.press('Enter', 700);
  const tile = await page.evaluate('(() => { const r = document.getElementById("b1").getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; })()');
  await page.pointTo(tile.x, tile.y);
  await page.press('Enter', 700);
  await chrome.press('Enter', 500); // can be selected
  await page.press('ArrowDown', 100).catch(() => undefined);
  await reach('edit-discard');
  await chrome.press('Enter', 700);
  check('"Finish without saving" writes nothing', existsSync(join(app.userData, 'profiles/profile-test.json')), false);
  await page.press('ArrowDown');
  await page.press('ArrowDown');
  check('and the page is driven as it was before: the tiles cannot be reached', /^[ab][123]$/.test((await page.focused()) ?? ''), false);
});

await scenario('ad blocking', { url: `${site.origin}/ads.html`, args: [`--filters=${site.origin}/filters.txt`, `--catalogue=${site.origin}/catalogue/index.json`, mapHost] }, async (app) => {
  const page = await app.page(site.origin);
  const chrome = await app.chrome();
  const { evaluate } = page;
  const reach = async (id) => {
    for (let i = 0; i < 20 && (await chrome.focused()) !== id; i++) await chrome.press('ArrowDown');
    return chrome.focused();
  };
  const line = () => chrome.evaluate('document.querySelector("#menu-adblock .sub")?.textContent ?? null');
  const loaded = () => until(() => evaluate('document.readyState === "complete" && Array.isArray(window.__seen) ? window.__seen.join() : null'), (v) => v !== null, 60);
  // The list arrives in the background; the first page may have been loaded before it.
  await until(() => app.log, (log) => /ad blocking: 1 filter list\(s\) fetched/.test(log), 80);
  check('the filter list is fetched in the background and said so in the terminal', /ad blocking: 1 filter list\(s\) fetched/.test(app.log), true);
  asks.adverts = 0;
  await evaluate('location.reload(); 0');
  await sleep(500);
  check('on an ordinary site, what the list names is never asked for, and the rest of the page loads', [await loaded(), asks.adverts, await evaluate('document.getElementById("banner").naturalWidth')], ['site', 0, 0]);
  check('nothing on the page is hidden or changed: the link a hiding filter names is still there', await evaluate('[getComputedStyle(document.getElementById("one")).display !== "none", document.querySelectorAll("script, style").length]'), [true, 4]);
  await page.press('ContextMenu', 500);
  check('the menu shows the switch, on, and how many requests were refused', [await chrome.evaluate('(document.getElementById("menu-adblock")?.ariaLabel ?? document.getElementById("menu-adblock")?.textContent)'), await line()], ['Ad blocking: on', '2 requests refused on this page.']);
  check('nothing was saved about the site: the switch has not been touched', existsSync(join(app.userData, 'sites.json')), false);
  check('the switch can be reached', await reach('menu-adblock'), 'menu-adblock');
  await chrome.press('Enter', 900);
  check('turning it off is kept for the site and loads the page again with everything on it', [JSON.parse(readFileSync(join(app.userData, 'sites.json'), 'utf8')), await loaded(), asks.adverts], [{ '127.0.0.1': { adBlocking: false } }, 'advert,site', 2]);
  check('the menu stays open and says it is off by choice', [await chrome.evaluate('(document.getElementById("menu-adblock")?.ariaLabel ?? document.getElementById("menu-adblock")?.textContent)'), await line(), await chrome.focused()], ['Ad blocking: off', 'Off for this site: your choice.', 'menu-adblock']);
  await chrome.press('Enter', 900);
  check('and on again', [JSON.parse(readFileSync(join(app.userData, 'sites.json'), 'utf8')), await loaded(), asks.adverts], [{ '127.0.0.1': { adBlocking: true } }, 'site', 2]);
  await chrome.press('Escape', 400);

  // A verified site: the made-up catalogue lists profile.test.
  await until(() => app.log, (log) => /catalogue: \d+ profile\(s\), 1 verified site/.test(log), 80);
  asks.adverts = 0;
  await evaluate(`location.href = "http://profile.test:${port}/ads.html"; 0`);
  const verifiedPage = await app.page('http://profile.test');
  check('a verified site opens', !!verifiedPage, true);
  if (!verifiedPage) return;
  await sleep(600);
  check('on a verified site nothing is refused to begin with', [await until(() => verifiedPage.evaluate('document.readyState === "complete" && Array.isArray(window.__seen) ? window.__seen.join() : null'), (v) => v !== null, 60), asks.adverts], ['advert,site', 2]);
  await verifiedPage.press('ContextMenu', 500);
  check('the menu says the switch starts off there, and why', [await chrome.evaluate('(document.getElementById("menu-adblock")?.ariaLabel ?? document.getElementById("menu-adblock")?.textContent)'), await line()], ['Ad blocking: off', 'Off to start with: this site is on the list of sites where it starts off.']);
  await reach('menu-adblock');
  await chrome.press('Enter', 900);
  check('the person can still turn it on there', [JSON.parse(readFileSync(join(app.userData, 'sites.json'), 'utf8'))['profile.test'], await until(() => verifiedPage.evaluate('document.readyState === "complete" && Array.isArray(window.__seen) ? window.__seen.join() : null'), (v) => v === 'site', 60), await chrome.evaluate('(document.getElementById("menu-adblock")?.ariaLabel ?? document.getElementById("menu-adblock")?.textContent)')], [{ adBlocking: true }, 'site', 'Ad blocking: on']);
});

await scenario('ad blocking off for every site, and a kind of access nobody may ask for', { url: `${site.origin}/ads.html`, config: { adBlocking: 'off', neverAsk: ['location'] }, args: [`--filters=${site.origin}/filters.txt`] }, async (app) => {
  const page = await app.page(site.origin);
  const chrome = await app.chrome();
  await sleep(1500);
  check('with ad blocking off in Settings nothing is fetched and nothing is refused', [/ad blocking:/.test(app.log), await page.evaluate('window.__seen.join()')], [false, 'advert,site']);
  await page.evaluate('window.__geo = new Promise((r) => navigator.geolocation.getCurrentPosition(() => r("allowed"), (e) => r(e.code === 1 ? "refused" : "other"))); 0');
  await sleep(600);
  check('a kind of access Settings says no site may ask for is refused without a question', [await page.evaluate('__geo'), await chrome.evaluate('document.visibilityState')], ['refused', 'hidden']);
  await page.press('ContextMenu', 500);
  check("the menu's switch says so and cannot be pressed", [await chrome.evaluate('document.getElementById("menu-adblock")?.disabled'), await chrome.evaluate('document.querySelector("#menu-adblock .sub")?.textContent')], [true, 'Ad blocking is off everywhere. Settings can turn it on.']);
});

for (const [name, config] of [
  ['ad blocking on for every site', { adBlocking: 'everywhere' }],
  ['a reviewed site the person took off the list', { adBlockingStartsOn: ['profile.test'] }],
]) {
  await scenario(name, { url: `http://profile.test:${port}/ads.html`, config, args: [`--filters=${site.origin}/filters.txt`, `--catalogue=${site.origin}/catalogue/index.json`, mapHost] }, async (app) => {
    const page = await app.page('http://profile.test');
    const chrome = await app.chrome();
    await until(() => app.log, (log) => /filter list\(s\) fetched/.test(log) && /1 verified site/.test(log), 80);
    await page.evaluate('location.reload(); 0');
    await sleep(600);
    check('on a site from the reviewed list, what the filter list names is refused all the same', await until(() => page.evaluate('document.readyState === "complete" && Array.isArray(window.__seen) ? window.__seen.join() : null'), (v) => v !== null, 60), 'site');
    await page.press('ContextMenu', 500);
    check('and the menu shows the switch on, and still the person\'s to turn off', [await chrome.evaluate('(document.getElementById("menu-adblock")?.ariaLabel ?? document.getElementById("menu-adblock")?.textContent)'), await chrome.evaluate('document.getElementById("menu-adblock")?.disabled')], ['Ad blocking: on', false]);
  });
}

await scenario(
  'opening with the last site',
  { config: { startWith: 'last' }, seed: (data) => writeFileSync(join(data, 'home.json'), JSON.stringify({ recents: [{ url: `${site.origin}/article.html`, title: 'An article', at: 5 }] })) },
  async (app) => {
    const page = await app.page(`${site.origin}/article.html`);
    check('Longboard starts on the site opened most recently', [!!page, await page?.evaluate('document.visibilityState')], [true, 'visible']);
  },
);

await scenario('a page that is not in front stands still', { url: `${site.origin}/video.html`, args: ['--autoplay-policy=no-user-gesture-required'] }, async (app) => {
  const page = await app.page(site.origin);
  const chrome = await app.chrome();
  await sleep(1200);
  // A second thing that makes sound, which no player key knows about.
  await page.evaluate(`(() => {
    const ac = new AudioContext(); const osc = ac.createOscillator(); const out = ac.createMediaStreamDestination(); const quiet = ac.createGain(); quiet.gain.value = 0.0001;
    osc.connect(quiet); quiet.connect(out); osc.start();
    const a = document.createElement('audio'); a.id = 'a'; a.srcObject = out.stream; document.body.append(a); a.play();
    window.__ticks = 0; setInterval(() => window.__ticks++, 100);
  })(); 0`);
  await sleep(600);
  const playing = () => page.evaluate('[document.getElementById("v").paused, document.getElementById("a").paused]');
  check('a video in the page and a sound are playing', await playing(), [false, false]);
  await page.press('Escape', 300);
  check('Back on the first page goes Home', await until(() => chrome.evaluate('document.visibilityState'), (v) => v === 'visible'), 'visible');
  check('and a moment later everything on the page behind has stopped: the video, the sound', await until(playing, (p) => p[0] && p[1], 40), [true, true]);
  const ticks = await page.evaluate('__ticks');
  await sleep(700);
  check('and its clocks', await page.evaluate('__ticks'), ticks);
  await chrome.press('ContextMenu', 500);
  for (let i = 0; i < 6 && (await chrome.focused()) !== 'menu-resume'; i++) await chrome.press('ArrowDown');
  await chrome.press('Enter', 600);
  await sleep(700);
  check('back in front the page runs again and can be seen, and playing waits for the person', [await page.evaluate('document.visibilityState'), (await page.evaluate('__ticks')) > ticks, await playing()], ['visible', true, [true, true]]);
  await page.press('ArrowDown');
  check('and it is driven as before', (await page.focused()) !== null, true);
});

await scenario('saved pages, suggestions, finding words, and a private tab', { url: `${site.origin}/article.html` }, async (app) => {
  const page = await app.page(`${site.origin}/article.html`);
  const chrome = await app.chrome();
  const home = () => JSON.parse(readFileSync(join(app.userData, 'home.json'), 'utf8'));
  const reach = async (id, key = 'ArrowDown') => {
    for (let i = 0; i < 24 && (await chrome.focused()) !== id; i++) await chrome.press(key);
    return chrome.focused();
  };
  await sleep(900);
  check('sound a page starts by itself plays, as Longboard ships', await page.evaluate('new Audio("/quiet.wav").play().then(() => "played", (e) => e.name)'), 'played');
  check('a page sent privately, or from this machine, gets no warning', (await page.press('ContextMenu', 500), await chrome.evaluate('document.getElementById("not-secure")')), null);

  // Keeping the page on Home.
  await siteMenu(chrome);
  await reach('menu-save');
  await chrome.press('Enter', 500);
  check('"Keep this page on Home" keeps it, and says so', [home().saved, await chrome.toastText()], [[{ url: `${site.origin}/article.html`, title: 'Longboard fixture: long article' }], 'This page is kept on Home']);
  check('and the menu then offers to take it off', await chrome.evaluate('(document.getElementById("menu-unsave")?.ariaLabel ?? document.getElementById("menu-unsave")?.textContent)'), 'Take this page off Home');

  // Finding words.
  await reach('menu-find');
  await chrome.press('Enter', 500);
  check('"Find words on this page" opens a field and two buttons', [await chrome.evaluate('document.querySelector("#panel h1")?.textContent'), await chrome.evaluate('!!document.getElementById("find-text")')], ['Find on this page', true]);
  await reach('find-text', 'ArrowUp');
  await chrome.press('Enter', 400);
  await chrome.press('Escape', 200);
  await chrome.type('link');
  await chrome.press('Enter', 700);
  const first = await until(() => chrome.toastText(), (t) => /^\d+ of \d+$/.test(t ?? ''), 40);
  check('typing words and pressing Enter finds them and says how many there are', [/^1 of [2-9]\d*$/.test(first ?? ''), await chrome.focused()], [true, 'find-next']);
  await chrome.press('Enter', 700);
  check('Next goes to the next place', /^2 of /.test((await until(() => chrome.toastText(), (t) => /^2 of /.test(t ?? ''), 40)) ?? ''), true);
  await chrome.press('Escape', 500);

  // Home: the saved page, and suggestions under the address field.
  await sleep(600);
  await page.press('Escape', 700);
  await until(() => chrome.evaluate('document.visibilityState'), (v) => v === 'visible');
  check('Home has a Saved pages section with the page in it', [await chrome.evaluate('document.querySelector("#saved .site")?.textContent'), await chrome.focused()], ['Longboard fixture: long article', 'saved-0']);
  await reach('go', 'ArrowUp');
  await chrome.press('Enter', 400);
  await chrome.press('Escape', 200);
  await chrome.type('long art');
  const offered = await until(() => chrome.evaluate('[...document.querySelectorAll("#suggestions button")].map((b) => b.ariaLabel ?? b.textContent)'), (l) => l.length > 0, 40);
  check('typing in the address field offers places already known that match', offered, ['Longboard fixture: long article (127.0.0.1)']);
  await chrome.press('ArrowDown');
  check('down from the field goes to the suggestion, and the field stays', [await chrome.focused(), await chrome.evaluate('document.getElementById("address")?.value')], ['suggest-0', 'long art']);
  await chrome.press('Enter', 700);
  check('pressing it opens that page', await until(() => page.evaluate('document.visibilityState + location.pathname'), (v) => v === 'visible/article.html'), 'visible/article.html');

  // A private tab.
  await page.evaluate('document.cookie = "who=shared; path=/"; 0');
  await sleep(500);
  await page.press('ContextMenu', 500);
  await reach('menu-tabs');
  await chrome.press('Enter', 500);
  await chrome.press('ArrowRight');
  check('Tabs offers a private tab beside a new one', await chrome.focused(), 'tab-private');
  await chrome.press('Enter', 600);
  check('a private tab starts on Home and says what it is', [await chrome.evaluate('document.getElementById("private-badge")?.textContent'), (await chrome.evaluate('(document.getElementById("private")?.ariaLabel ?? document.getElementById("private")?.textContent) ?? ""')).startsWith('Nothing opened in this tab is kept')], ['Private tab', true]);
  const before = { visits: JSON.parse(readFileSync(join(app.userData, 'history.json'), 'utf8')).visits.length, recents: home().recents.length };
  await reach('go', 'ArrowUp');
  await chrome.press('Enter', 400);
  await chrome.press('Escape', 200);
  await chrome.type(`${site.origin.replace('http://', '')}/form.html`);
  await chrome.press('Enter', 500);
  const priv = await app.page(`${site.origin}/form.html`);
  check('an address opens in it', !!priv, true);
  if (!priv) return;
  await until(() => priv.evaluate('document.readyState'), (v) => v === 'complete');
  await sleep(500);
  check('it does not see what the other tabs\' sites stored', await priv.evaluate('document.cookie'), '');
  await priv.evaluate('document.cookie = "who=private; path=/"; 0');
  check('and nothing opened in it is written down: no history, no recent site', [JSON.parse(readFileSync(join(app.userData, 'history.json'), 'utf8')).visits.length, home().recents.length], [before.visits, before.recents]);
  await priv.press('ContextMenu', 500);
  await reach('menu-tabs');
  await chrome.press('Enter', 500);
  const tabs = await chrome.evaluate('[...document.querySelectorAll("#panel button[id^=tab-]")].map((b) => b.ariaLabel ?? b.textContent)');
  check('the list of tabs marks it as private', tabs.filter((t) => t.includes('Private: ')).length, 2);
  await reach('tab-1');
  await chrome.press('ArrowRight');
  await chrome.press('Enter', 700);
  check('closing it leaves the other tab with what it had, and nothing from the private one', [await page.evaluate('document.cookie'), await page.evaluate('document.visibilityState')], ['who=shared', 'visible']);
});

await scenario('a site\'s own icon for its tile: the big one its manifest lists', { url: `${site.origin}/pwa.html` }, async (app) => {
  const page = await app.page(`${site.origin}/pwa.html`);
  const chrome = await app.chrome();
  const reach = async (id, key = 'ArrowDown') => {
    for (let i = 0; i < 24 && (await chrome.focused()) !== id; i++) await chrome.press(key);
    return chrome.focused();
  };
  const icons = () => (existsSync(join(app.userData, 'icons')) ? readdirSync(join(app.userData, 'icons')).sort() : []);
  const width = (file) => readFileSync(join(app.userData, 'icons', file)).readUInt32BE(16);
  await sleep(1000);
  await page.press('ContextMenu', 500);
  await siteMenu(chrome);
  await reach('menu-save');
  await chrome.press('Enter', 500);
  const first = await until(icons, (l) => l.length === 1, 60);
  check('a page kept on Home gets its icon from the site', [first.length, first[0]?.startsWith('site-')], [1, true]);
  await chrome.press('Escape', 300);
  await chrome.press('Escape', 500);
  check('the icon fetched is the big one the manifest lists, not the small one in the page or the one made for cutting to a shape', [asks.bigIcon > 0, asks.maskIcon, width(first[0])], [true, 0, 128]);
  // Added as an app, the app's tile gets the same.
  await page.press('ContextMenu', 500);
  await reach('menu-add-app');
  await chrome.press('Enter', 500);
  await reach('app-add');
  await chrome.press('Enter', 500);
  const both = await until(icons, (l) => l.length === 2, 60);
  check('a site added as an app gets its icon too', both.some((f) => !f.startsWith('site-')), true);
  await sleep(600);
  await page.press('Escape', 700);
  await until(() => chrome.evaluate('document.visibilityState'), (v) => v === 'visible');
  check('and Home draws the tile with it', await until(() => chrome.evaluate('!!document.querySelector("#apps img.icon")'), (v) => v === true, 30), true);
});

await scenario('a desktop site, the reader view, and asking not to be tracked', { url: `${site.origin}/article.html` }, async (app) => {
  const page = await app.page(`${site.origin}/article.html`);
  const chrome = await app.chrome();
  const reach = async (id, key = 'ArrowDown') => {
    for (let i = 0; i < 30 && (await chrome.focused()) !== id; i++) await chrome.press(key);
    return chrome.focused();
  };
  const sent = async () => {
    const h = await page.evaluate('fetch("/headers").then((r) => r.json()).then((h) => JSON.stringify([h.dnt ?? null, h["sec-gpc"] ?? null, h["user-agent"]]))');
    return JSON.parse(h);
  };
  await sleep(900);
  const usual = { width: await page.evaluate('innerWidth'), agent: await page.evaluate('navigator.userAgent') };
  check('nothing is added to what a site is sent, as Longboard ships', (await sent()).slice(0, 2), [null, null]);

  // Desktop site.
  await page.press('ContextMenu', 500);
  await siteMenu(chrome);
  check('the site menu offers a desktop site', [await reach('menu-desktop'), await chrome.evaluate('(document.getElementById("menu-desktop")?.ariaLabel ?? document.getElementById("menu-desktop")?.textContent)')], ['menu-desktop', 'Desktop site: off']);
  await chrome.press('Enter', 600);
  const wide = await until(() => page.evaluate('innerWidth'), (w) => w !== usual.width, 30);
  check('turned on, the site gets the width of a desk screen', [wide > usual.width, wide >= 1270, await chrome.evaluate('(document.getElementById("menu-desktop")?.ariaLabel ?? document.getElementById("menu-desktop")?.textContent)')], [true, true, 'Desktop site: on']);
  check('and Longboard says it is who it said it was', [await page.evaluate('navigator.userAgent'), JSON.parse(readFileSync(join(app.userData, 'sites.json'), 'utf8'))['127.0.0.1']], [usual.agent, { desktop: true }]);
  await chrome.press('Enter', 600);
  check('turned off, the site is as it was', await until(() => page.evaluate('innerWidth'), (w) => w === usual.width, 30), usual.width);

  // Reader view.
  const before = await page.evaluate('document.body.innerHTML.length');
  await reach('menu-reader');
  await chrome.press('Enter', 900);
  const shown = await until(() => chrome.evaluate('document.querySelector("#reader-text h1")?.textContent ?? null'), (t) => t !== null, 30);
  check('reader view shows the article under its headline', shown, 'A long page with little to press');
  const read = await chrome.evaluate('[...document.querySelectorAll("#reader-text > p:not(.where)")].map((p) => p.ariaLabel ?? p.textContent)');
  check('with its paragraphs, and without the links around it', [read[0]?.startsWith('This paragraph is filler.'), read.length > 3, read.join(' ').includes('Front page')], [true, true, false]);
  check('it fills the screen, starting on Close', [await chrome.evaluate('innerWidth > 1000 || innerWidth === screen.width'), await chrome.focused()], [true, 'reader-close']);
  const size = () => chrome.evaluate('getComputedStyle(document.getElementById("reader-text")).fontSize');
  const small = await size();
  await chrome.press('ArrowRight');
  await chrome.press('ArrowRight');
  await chrome.press('Enter', 300);
  check('"Bigger words" makes the words bigger', [await chrome.focused(), parseFloat(await size()) > parseFloat(small)], ['reader-bigger', true]);
  await chrome.press('ArrowDown', 700);
  check('Down moves through the words', await until(() => chrome.evaluate('document.getElementById("panel").scrollTop > 0'), (v) => v === true, 20), true);
  await chrome.press('Escape', 600);
  check('Back closes it, and the page was not changed', [await chrome.evaluate('document.getElementById("reader-text")'), await page.evaluate('document.body.innerHTML.length')], [null, before]);
  await page.evaluate('location.href = "/home.html"; 0');
  await sleep(900);
  await page.press('ContextMenu', 500);
  await siteMenu(chrome);
  await reach('menu-reader');
  await chrome.press('Enter', 900);
  check('a page with no article says so', await page.toastText(), 'No article to read was found on this page');

  // Ask sites not to track.
  await page.press('ContextMenu', 500);
  await reach('menu-settings');
  await chrome.press('Enter', 400);
  await reach('settings-privacy');
  await chrome.press('Enter', 400);
  await reach('set-dnt');
  await chrome.press('Enter', 500);
  check('Settings has "ask sites not to track", and turning it on says so', [await chrome.evaluate('(document.getElementById("set-dnt")?.ariaLabel ?? document.getElementById("set-dnt")?.textContent)'), JSON.parse(readFileSync(join(app.userData, 'config.json'), 'utf8')).doNotTrack], ['Ask sites not to track you or sell your data: yes', true]);
  const signalled = await sent();
  check('then every request carries the two signals, and Longboard still says who it is', signalled, ['1', '1', usual.agent]);
  await chrome.press('Enter', 500);
  check('turned off, they are no longer sent', (await sent()).slice(0, 2), [null, null]);
});

await scenario('the parental lock', { url: `${site.origin}/home.html` }, async (app) => {
  const page = await app.page(site.origin);
  const chrome = await app.chrome();
  const title = () => chrome.evaluate('document.querySelector("#panel h1")?.textContent ?? null');
  const asked = () => chrome.evaluate('document.querySelector("#panel h1 + p")?.textContent ?? null');
  const reach = async (id, key = 'ArrowDown') => {
    for (let i = 0; i < 30 && (await chrome.focused()) !== id; i++) await chrome.press(key);
    return chrome.focused();
  };
  /** Presses the digit the highlight is on four times. */
  const four = async () => {
    for (let i = 0; i < 4; i++) await chrome.press('Enter', 250);
    await sleep(500);
  };
  const lockFile = () => (existsSync(join(app.userData, 'lock.json')) ? readFileSync(join(app.userData, 'lock.json'), 'utf8') : null);
  await sleep(900);
  await page.press('ContextMenu', 500);
  await reach('menu-settings');
  await chrome.press('Enter', 500);
  check('with no PIN, Settings opens without one', await title(), 'Settings');
  await reach('settings-lock');
  await chrome.press('Enter', 400);
  await reach('lock-set');
  await chrome.press('Enter', 500);
  check('"Set a PIN" asks for four digits, starting on 1', [await title(), await asked(), await chrome.focused()], ['PIN', 'Choose a PIN: four digits', 'pin-1']);
  await four();
  check('then for the same again', [await asked(), await chrome.evaluate('(document.getElementById("pin-dots")?.ariaLabel ?? document.getElementById("pin-dots")?.textContent)')], ['Enter the same PIN again', '0 of 4 digits entered']);
  await chrome.press('ArrowRight');
  await four();
  check('a different second entry starts over', [await asked(), await chrome.toastText(), lockFile()], ['Choose a PIN: four digits', 'Those two were not the same. Choose again', null]);
  await reach('pin-1', 'ArrowLeft');
  await four();
  await four();
  const kept = lockFile();
  check('the same twice sets it, and the PIN itself is not what is kept', [await chrome.toastText(), await title(), kept !== null && !kept.includes('1111'), Object.keys(JSON.parse(kept ?? '{}')).sort()], ['The PIN is set', 'Parental lock', true, ['hash', 'homeOnly', 'salt']]);
  await reach('lock-home-only');
  await chrome.press('Enter', 400);
  check('"only the sites on Home" can be turned on', [await chrome.evaluate('(document.getElementById("lock-home-only")?.ariaLabel ?? document.getElementById("lock-home-only")?.textContent)'), JSON.parse(lockFile()).homeOnly], ['Only the sites on Home open without the PIN: yes', true]);
  await chrome.press('Escape', 300);
  await chrome.press('Escape', 500);

  // Nothing is on Home, so the page that was open gives way, and no other opens.
  const locked = () => page.evaluate('document.title + "|" + document.querySelector("h1")?.textContent');
  check('then a page that is not on Home gives way to a notice saying so', await until(locked, (t) => t.startsWith('Longboard: page blocked'), 30), 'Longboard: page blocked|This page was blocked');
  await page.press('ContextMenu', 500);
  await reach('menu-address', 'ArrowUp');
  await chrome.press('Enter', 400);
  await chrome.press('Escape', 200);
  await chrome.type(`${site.origin.replace('http://', '')}/article.html`);
  await chrome.press('Enter', 600);
  check('opening a site that is not on Home asks for the PIN', [await title(), (await asked() ?? '').endsWith('is not on Home. Enter the PIN to unlock every site')], ['PIN', true]);
  await chrome.press('Escape', 500);
  check('and without it the site is not opened', (await locked()).startsWith('Longboard: page blocked'), true);

  // Settings now asks.
  await page.press('ContextMenu', 500);
  await reach('menu-settings');
  await chrome.press('Enter', 500);
  check('Settings asks for the PIN', [await title(), await asked()], ['PIN', 'Enter the PIN to open Settings']);
  await chrome.press('ArrowRight');
  await four();
  check('a wrong PIN is refused, and says so', [await title(), await chrome.toastText()], ['PIN', 'Wrong PIN']);
  await chrome.press('Escape', 500);
  check('Back leaves without opening Settings', await chrome.evaluate('document.getElementById("panel")'), null);

  // Unlocking.
  await page.press('ContextMenu', 500);
  check('the menu offers to unlock every site', [await reach('menu-lock'), await chrome.evaluate('(document.getElementById("menu-lock")?.ariaLabel ?? document.getElementById("menu-lock")?.textContent)')], ['menu-lock', 'Unlock every site (PIN)']);
  await chrome.press('Enter', 500);
  await four();
  check('the right PIN unlocks', (await page.toastText() ?? '').startsWith('Unlocked until you lock again'), true);
  await page.evaluate(`location.href = "${site.origin}/article.html"; 0`);
  check('and then any site opens', await until(() => page.evaluate('location.pathname'), (v) => v === '/article.html', 30), '/article.html');
  await sleep(600);
  await page.press('ContextMenu', 500);
  await reach('menu-lock');
  check('until "Lock again" is pressed', await chrome.evaluate('(document.getElementById("menu-lock")?.ariaLabel ?? document.getElementById("menu-lock")?.textContent)'), 'Lock again: only the sites on Home');
  await chrome.press('Enter', 700);
  check('after which the page gives way again, and Back leads nowhere', [await until(locked, (t) => t.startsWith('Longboard: page blocked'), 30), await page.evaluate('history.length')], ['Longboard: page blocked|This page was blocked', 1]);
  await page.press('ContextMenu', 500);
  await reach('menu-settings');
  await chrome.press('Enter', 500);
  await four();
  check('the right PIN opens Settings', await title(), 'Settings');
});

const oldPackage = (data) => ({ APPIMAGE: (mkdirSync(join(data, 'pkg'), { recursive: true }), writeFileSync(join(data, 'pkg', 'Longboard.AppImage'), 'the old package'), join(data, 'pkg', 'Longboard.AppImage')) });
await scenario('a new version is fetched, checked and put in place', { args: [`--updates=${site.origin}/releases/latest`], env: oldPackage }, async (app) => {
  const chrome = await app.chrome();
  const file = join(app.userData, 'pkg', 'Longboard.AppImage');
  const reach = async (id) => {
    for (let i = 0; i < 30 && (await chrome.focused()) !== id; i++) await chrome.press('ArrowDown');
    return chrome.focused();
  };
  const state = await until(() => (existsSync(join(app.userData, 'update.json')) ? JSON.parse(readFileSync(join(app.userData, 'update.json'), 'utf8')) : {}), (s) => s.installed, 60);
  check('a newer release is noticed and installed at start', state.installed, '99.0.0');
  check('the package this copy was started from is now the new one, and can be run', [readFileSync(file).equals(newPackage), (statSync(file).mode & 0o111) !== 0, readdirSync(join(app.userData, 'pkg'))], [true, true, ['Longboard.AppImage']]);
  await until(() => chrome.focused(), (id) => id === 'go');
  await chrome.press('ContextMenu', 500);
  await reach('menu-settings');
  await chrome.press('Enter', 400);
  await reach('settings-updates');
  await chrome.press('Enter', 400);
  const said = await chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)');
  check('Settings says so, and says what is asked of whom', [said.includes('Version 99.0.0 is in place: close and open Longboard to use it.'), said.includes('asks GitHub whether there is a newer release'), await chrome.evaluate('(document.getElementById("set-updates")?.ariaLabel ?? document.getElementById("set-updates")?.textContent)')], [true, true, 'New versions are: installed by themselves']);
  await reach('set-updates');
  await chrome.press('Enter', 400);
  await chrome.press('Enter', 400);
  check('and can turn looking off', [await chrome.evaluate('(document.getElementById("set-updates")?.ariaLabel ?? document.getElementById("set-updates")?.textContent)'), JSON.parse(readFileSync(join(app.userData, 'config.json'), 'utf8')).updates], ['New versions are: not looked for', 'off']);
});
await scenario('a new version that is not what the release says is left alone', { args: [`--updates=${site.origin}/releases/tampered`], env: oldPackage }, async (app) => {
  await app.chrome();
  const state = await until(() => (existsSync(join(app.userData, 'update.json')) ? JSON.parse(readFileSync(join(app.userData, 'update.json'), 'utf8')) : {}), (s) => s.checkedAt, 60);
  await sleep(500);
  check('a package whose checksum is not the one stated is not installed', [state.installed ?? null, state.available, readFileSync(join(app.userData, 'pkg', 'Longboard.AppImage'), 'utf8'), readdirSync(join(app.userData, 'pkg'))], [null, '99.0.0', 'the old package', ['Longboard.AppImage']]);
  check('and the log says why', /could not be installed .*not the one the release describes/.test(app.log), true);
});

// A store extension is known by a key in its manifest, and its name in the store is made from that key.
// A key is made up here for the made-up extension.
const fixtureKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'der' });
const fixtureExtensionId = [...createHash('sha256').update(fixtureKey).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
await scenario('an extension', {
  url: `${site.origin}/home.html`,
  seed: (data) => {
    const to = join(data, 'Extensions', fixtureExtensionId, '1.0.0_0');
    mkdirSync(to, { recursive: true });
    for (const f of ['mark.js', 'options.html']) copyFileSync(join(root, 'test/fixtures/extension', f), join(to, f));
    writeFileSync(join(to, 'manifest.json'), JSON.stringify({ ...JSON.parse(readFileSync(join(root, 'test/fixtures/extension/manifest.json'), 'utf8')), key: fixtureKey.toString('base64') }));
  },
}, async (app) => {
  const page = await app.page(site.origin);
  const chrome = await app.chrome();
  const reach = async (id) => {
    for (let i = 0; i < 30 && (await chrome.focused()) !== id; i++) await chrome.press('ArrowDown');
    return chrome.focused();
  };
  await sleep(1200);
  check('an installed extension runs on the pages that are opened', await until(() => page.evaluate('document.documentElement.getAttribute("data-fixture-extension")'), (v) => v === 'ran', 30), 'ran');
  check('a page that is not an extension\'s page in the store is not offered one', (await page.press('ContextMenu', 500), await siteMenu(chrome), await chrome.evaluate('document.getElementById("menu-add-extension")')), null);
  await chrome.press('Escape', 300);
  await reach('menu-settings');
  await chrome.press('Enter', 400);
  check('Settings counts the extensions', await chrome.evaluate('(document.getElementById("settings-extensions")?.ariaLabel ?? document.getElementById("settings-extensions")?.textContent)'), 'Extensions (1)');
  await reach('settings-extensions');
  await chrome.press('Enter', 400);
  const listed = await chrome.evaluate('[...document.querySelectorAll("#panel button")].map((b) => b.ariaLabel ?? b.textContent)');
  check('and lists each with a way to open it and to remove it', listed.slice(0, 3), ['Open the Chrome Web Store', 'Open "Longboard fixture extension"', 'Remove "Longboard fixture extension"']);
  await reach('ext-open-0');
  await chrome.press('Enter', 1200);
  const own = await app.view((u) => u.startsWith('chrome-extension://') && u.endsWith('/options.html'), 40);
  check('"Open" shows the extension\'s own page in the tab', own && (await own.evaluate('document.title')), 'Fixture extension settings');
  if (!own) return;
  await sleep(600);
  // Extensions written for `browser` rather than `chrome` must find the same interfaces under both names.
  check('its page finds under "browser" what it finds under "chrome"', await own.evaluate('typeof browser === "object" && typeof chrome.windows === "object" ? browser.windows === chrome.windows && browser.tabs === chrome.tabs : "one of the two is missing"'), true);
  await own.press('ArrowRight', 300);
  await own.press('ArrowRight', 300);
  check('and the arrows move on it as on any page', await own.evaluate('document.querySelector("[data-longboard-focus]")?.id ?? null'), 'two');
  await own.press('ContextMenu', 500);
  await reach('menu-settings');
  await chrome.press('Enter', 400);
  await reach('settings-extensions');
  await chrome.press('Enter', 400);
  await reach('ext-remove-0');
  await chrome.press('Enter', 300);
  check('removing asks for a second press', await chrome.evaluate('(document.getElementById("ext-remove-0")?.ariaLabel ?? document.getElementById("ext-remove-0")?.textContent)'), 'Press again to remove "Longboard fixture extension"');
  await chrome.press('Enter', 900);
  check('and then it is gone, from Settings and from disk', [await until(() => chrome.evaluate('document.querySelector("#panel")?.textContent.includes("None are installed.")'), (v) => v === true, 30), existsSync(join(app.userData, 'Extensions', fixtureExtensionId))], [true, false]);
});

await scenario('settings that change how sites are shown', { url: `${site.origin}/video.html`, config: { theme: 'dark', httpsOnly: true, autoplay: false }, args: [mapHost] }, async (app) => {
  const page = await app.page(site.origin);
  await sleep(1200);
  check('sites are asked for their dark look when Settings says so', await page.evaluate('matchMedia("(prefers-color-scheme: dark)").matches'), true);
  check('sound and video do not start by themselves when Settings says not to', await page.evaluate('new Audio("/quiet.wav").play().then(() => "played", (e) => e.name)'), 'NotAllowedError');
  await page.evaluate(`location.href = "http://profile.test:${port}/home.html"; 0`);
  await sleep(900);
  check('with "only pages sent privately" on, a plain http page is not opened, and says why', [await page.evaluate('location.host'), await page.toastText()], [new URL(site.origin).host, 'Not opened: that page is not sent privately (http). Settings can allow such pages']);
});

await scenario('tabs', { url: `${site.origin}/home.html` }, async (app) => {
  const first = await app.page(`${site.origin}/home.html`);
  const chrome = await app.chrome();
  const names = () => chrome.evaluate('[...document.querySelectorAll("#panel button[id^=tab-]")].map((b) => b.id + "=" + (b.ariaLabel ?? b.textContent))');
  const openTabs = async (from) => {
    await from.press('ContextMenu', 500);
    for (let i = 0; i < 24 && (await chrome.focused()) !== 'menu-tabs'; i++) await chrome.press('ArrowDown');
    await chrome.press('Enter', 500);
  };
  await sleep(800);
  await first.press('ArrowDown');
  await openTabs(first);
  check('the menu has Tabs, which starts with the one page that is open', await names(), ['tab-new=New tab', 'tab-private=New private tab', 'tab-0=Longboard fixture: generic streaming home (127.0.0.1): in front now']);
  for (let i = 0; i < 4 && (await chrome.focused()) !== 'tab-new'; i++) await chrome.press('ArrowUp');
  await chrome.press('Enter', 600);
  check('a new tab starts on Home, with the first page still there behind it', [await chrome.evaluate('!!document.getElementById("home")'), await chrome.focused(), await first.evaluate('document.visibilityState + location.pathname')], [true, 'go', 'hidden/home.html']);
  await chrome.press('Enter', 400);
  await chrome.press('Escape', 200);
  await chrome.type(`${site.origin.replace('http://', '')}/article.html`);
  await chrome.press('Enter', 400);
  const second = await app.page(`${site.origin}/article.html`);
  check('an address typed there opens in the new tab', !!second, true);
  if (!second) return;
  await until(() => second.evaluate('document.visibilityState'), (v) => v === 'visible');
  check('and the first tab keeps its page, out of sight, with the highlight where it was', [await first.evaluate('location.pathname + document.visibilityState'), await first.focused()], ['/home.htmlhidden', 'nav-home']);

  await sleep(500);
  await openTabs(second);
  check('Tabs lists both, and says which is in front', (await names()).map((n) => n.replace(/=.*\((127[^)]*)\)/, '=($1)')), ['tab-new=New tab', 'tab-private=New private tab', 'tab-0=(127.0.0.1)', 'tab-close-0=(127.0.0.1)', 'tab-1=(127.0.0.1): in front now', 'tab-close-1=(127.0.0.1)']);
  for (let i = 0; i < 8 && (await chrome.focused()) !== 'tab-0'; i++) await chrome.press('ArrowDown');
  await chrome.press('Enter', 600);
  check('pressing a tab brings it in front', [await first.evaluate('document.visibilityState'), await second.evaluate('document.visibilityState')], ['visible', 'hidden']);
  await first.press('ArrowDown');
  check('and it is driven as before', (await first.focused()) !== null, true);

  await openTabs(first);
  for (let i = 0; i < 8 && (await chrome.focused()) !== 'tab-1'; i++) await chrome.press('ArrowDown');
  await chrome.press('ArrowRight');
  await chrome.press('Enter', 600);
  check('a tab can be closed from the list, which leaves the other where it was', [await names(), await first.evaluate('location.pathname')], [['tab-new=New tab', 'tab-private=New private tab', 'tab-0=Longboard fixture: generic streaming home (127.0.0.1): in front now', 'tab-reopen=Open the tab closed last'], '/home.html']);
  check('the closed tab is gone, not hidden', await second.evaluate('1').then(() => 'still there', () => 'gone'), 'gone');
});

await scenario('history', { url: `${site.origin}/home.html` }, async (app) => {
  const page = await app.page(site.origin);
  const chrome = await app.chrome();
  const saved = () => JSON.parse(readFileSync(join(app.userData, 'history.json'), 'utf8')).visits.map((v) => new URL(v.url).pathname);
  await sleep(800);
  await page.evaluate('location.href = "/article.html"; 0');
  await until(() => page.evaluate('location.pathname + document.readyState'), (v) => v === '/article.htmlcomplete');
  await sleep(500);
  check('each page opened is kept, newest first, on this machine', saved(), ['/article.html', '/home.html']);
  await page.press('ContextMenu', 500);
  for (let i = 0; i < 24 && (await chrome.focused()) !== 'menu-tabs'; i++) await chrome.press('ArrowDown');
  await chrome.press('ArrowRight');
  await chrome.press('Enter', 500);
  const lines = await chrome.evaluate('[...document.querySelectorAll("#panel button.row[id^=visit-]")].map((b) => b.ariaLabel ?? b.textContent)');
  check('the menu has History, which lists them with their titles and when', [lines.length, /\(127\.0\.0\.1\), today$/.test(lines[0] ?? ''), lines[1]], [2, true, 'Longboard fixture: generic streaming home (127.0.0.1), today']);
  await chrome.press('ArrowDown');
  await chrome.press('Enter', 600);
  check('pressing one opens it', await until(() => page.evaluate('location.pathname'), (p) => p === '/home.html'), '/home.html');
  check('and it moves to the front', (await sleep(400), saved()), ['/home.html', '/article.html']);
});

await scenario('no history when it is turned off, and a language for sites', { url: `${site.origin}/home.html`, config: { history: false, language: 'fr' } }, async (app) => {
  const page = await app.page(site.origin);
  await sleep(1000);
  check('with history off nothing is written down', existsSync(join(app.userData, 'history.json')), false);
  check('sites are asked for the language chosen in Settings', await page.evaluate('[navigator.language, navigator.languages[0]]'), ['fr', 'fr']);
});

await scenario('Settings', { seed: (data) => mkdirSync(join(data, 'downloads', 'films'), { recursive: true }) }, async (app) => {
  const chrome = await app.chrome();
  const file = () => JSON.parse(readFileSync(join(app.userData, 'config.json'), 'utf8'));
  const text = (id) => chrome.evaluate(`document.getElementById(${JSON.stringify(id)})?.ariaLabel ?? document.getElementById(${JSON.stringify(id)})?.textContent ?? null`);
  const title = () => chrome.evaluate('document.querySelector("#panel h1")?.textContent ?? null');
  const reach = async (id) => {
    for (let i = 0; i < 24 && (await chrome.focused()) !== id; i++) await chrome.press('ArrowDown');
    return chrome.focused();
  };
  const open = async (id) => {
    await reach(id);
    await chrome.press('Enter', 400);
  };
  await until(() => chrome.focused(), (id) => id === 'go');
  await chrome.press('ContextMenu', 500);
  await open('menu-settings');
  check('the menu opens Settings on its first page', [await title(), await chrome.focused()], ['Settings', 'settings-general']);

  await chrome.press('Enter', 400);
  check('a page of Settings opens', [await title(), await chrome.focused()], ['Search and starting', 'set-search']);
  await chrome.press('Enter', 400);
  check('the search setting opens a list of search sites to choose from', [await title(), await chrome.evaluate('[...document.querySelectorAll("#panel button[id^=pick-]")].map((b) => b.ariaLabel ?? b.textContent)')], ['Search with', ['Google', 'DuckDuckGo', 'Bing', 'Brave Search', 'Cancel']]);
  await open('pick-1');
  check('choosing one goes back, shows it, and keeps it in config.json', [await title(), await text('set-search'), file().search], ['Search and starting', 'Search with: DuckDuckGo', 'https://duckduckgo.com/?q=%s']);
  await chrome.press('ArrowUp');
  check('a list goes round: up from the top is the bottom', await chrome.focused(), 'settings-back');
  await chrome.press('ArrowDown');
  check('and down from the bottom is the top', await chrome.focused(), 'set-search');
  await open('set-start');
  check('opening with the last site can be chosen', [await text('set-start'), file().startWith], ['Open with: the last site', 'last']);
  await chrome.press('Escape', 400);
  check('Back goes up to the first page, not out of Settings', await title(), 'Settings');

  await open('settings-display');
  await chrome.press('ArrowRight');
  await chrome.press('ArrowRight');
  check('the size buttons can be reached', await chrome.focused(), 'set-size-up');
  await chrome.press('Enter', 400);
  check('Bigger makes everything bigger, for every site', [await text('set-size-reset'), file().pageSize], ['110%', 1.1]);
  await open('set-decode');
  check('video decoding on the graphics chip can be asked for', [await text('set-decode'), file().hardwareDecode], ['Decode video on the graphics chip: yes', true]);
  await chrome.press('Escape', 400);

  await open('settings-ads');
  check('ad blocking starts as a switch for each site', await text('set-ads'), 'Ad blocking: each site has its own switch');
  await chrome.press('Enter', 400);
  check('pressing it lists the three ways, each with what it means, and marks the one in use', [await chrome.evaluate('[...document.querySelectorAll("#panel button[id^=pick-]")].map((b) => b.ariaLabel ?? b.textContent)'), (await chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)')).includes('A site you switch off yourself from the menu stays off.')], [['Each site has its own switch (in use)', 'On for every site', 'Off for every site', 'Cancel'], true]);
  await open('pick-1');
  check('it can be turned on for every site', [await text('set-ads'), file().adBlocking], ['Ad blocking: on for every site', 'everywhere']);
  await chrome.press('Enter', 400);
  await open('pick-2');
  check('or off for every site', [await text('set-ads'), file().adBlocking], ['Ad blocking: off for every site', 'off']);
  await chrome.press('Enter', 400);
  await chrome.press('Escape', 400);
  check('Back on the list changes nothing', [await title(), file().adBlocking], ['Ad blocking', 'off']);
  await chrome.press('Enter', 400);
  await open('pick-0');
  check('or back to each site\'s own switch, which is not written down as a choice', [await text('set-ads'), 'adBlocking' in file()], ['Ad blocking: each site has its own switch', false]);
  check('the filter list is said to be what it is and where it comes from', (await chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)')).includes('Filter list: EasyList, not downloaded yet. Downloaded from easylist.to every four days.'), true);

  await open('set-ads-list');
  const entries = () => chrome.evaluate('[...document.querySelectorAll("#panel button[id^=starts-off-]")].map((b) => b.ariaLabel ?? b.textContent)');
  check('the list of sites where it starts off shows the reviewed sites', await entries(), ['primevideo.com (reviewed list: press to take off)', 'tv.apple.com (reviewed list: press to take off)', 'youtube.com (reviewed list: press to take off)']);
  await open('starts-off-2');
  check('pressing a reviewed site takes it off, and says whose doing that was', [await entries(), file().adBlockingStartsOn], [['primevideo.com (reviewed list: press to take off)', 'tv.apple.com (reviewed list: press to take off)', 'youtube.com (taken off by you: press to put back)'], ['youtube.com']]);
  await chrome.press('Enter', 400);
  check('pressing it again puts it back', [(await entries())[2], 'adBlockingStartsOn' in file()], ['youtube.com (reviewed list: press to take off)', false]);
  for (let i = 0; i < 6 && (await chrome.focused()) !== 'starts-off-add'; i++) await chrome.press('ArrowUp');
  await chrome.press('Enter', 400);
  check('OK on the field brings the keyboard up', [await chrome.evaluate('document.activeElement?.id'), await chrome.keyboardShown()], ['starts-off-add', true]);
  await chrome.press('Escape', 200);
  await chrome.type('https://WWW.Example.org/some/page');
  await chrome.press('Enter', 500);
  check('a site typed as a person would type it is added to the list', [await entries(), file().adBlockingStartsOff], [['example.org (added by you: press to remove)', 'primevideo.com (reviewed list: press to take off)', 'tv.apple.com (reviewed list: press to take off)', 'youtube.com (reviewed list: press to take off)'], ['example.org']]);
  await open('starts-off-0');
  check('and pressing it removes it again', [(await entries()).length, 'adBlockingStartsOff' in file()], [3, false]);
  for (let i = 0; i < 6 && (await chrome.focused()) !== 'starts-off-add'; i++) await chrome.press('ArrowUp');
  await chrome.press('Enter', 400);
  await chrome.press('Escape', 200);
  await chrome.type('not a site');
  await chrome.press('Enter', 500);
  check('something that is not a site name is not added, and says why', [(await entries()).length, await chrome.toastText()], [3, 'That is not a site name. Try something like example.com']);
  await chrome.press('Escape', 400);
  check('Back from the list goes to ad blocking', await title(), 'Ad blocking');
  await chrome.press('Escape', 400);

  // Saved sign-ins need the system's keyring, and a scripted run never comes near a password (Hard rule 10).
  await open('settings-passwords');
  check('Settings has Passwords, which says plainly when the system has no keyring to keep them with', [await chrome.evaluate('document.querySelector("#panel h1")?.textContent'), await chrome.evaluate('document.querySelector("#panel p.lead")?.textContent'), await chrome.evaluate('!!document.getElementById("set-passwords")')], ['Passwords', 'Passwords cannot be kept on this system.', false]);
  check('and nothing was written for them', existsSync(join(app.userData, 'passwords.json')), false);
  await chrome.press('Escape', 400);

  await open('settings-access');
  await open('ask-camera');
  check('a kind of access can be closed to every site', [await text('ask-camera'), file().neverAsk], ['Sites may ask to use the camera: no', ['camera']]);
  await chrome.press('Escape', 400);

  await open('settings-privacy');
  check('Settings says what Longboard downloads by itself', ((t) => ['no usage data', 'Longboard-Profiles repository', 'easylist.to'].map((w) => t.includes(w)))(await chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)')), [true, true, true]);
  await open('clear-data');
  check('a scripted run is not let near the button that signs out of every site', [await text('clear-data'), await chrome.toastText()], ['Sign out of every site and clear what sites have stored', 'Blocked: automation mode never activates purchase or sign-up controls']);
  await open('clear-sites');
  check("forgetting every site's settings asks first", await text('clear-sites'), "Press again to forget every site's settings");
  await chrome.press('Enter', 600);
  check('and the second press does it', await until(() => chrome.toastText(), (t) => /^Forgotten/.test(t ?? ''), 40), "Forgotten: every site's answers, size and ad-blocking switch");
  await chrome.press('Escape', 400);

  await open('settings-privacy');
  await open('set-history');
  check('keeping a history can be turned off', [await text('set-history'), file().history], ['Keep a history of pages opened: no', false]);
  await chrome.press('Escape', 400);

  await open('settings-general');
  await open('set-language');
  await open('pick-1');
  check('a language for sites can be chosen from a list by name', [await text('set-language'), file().language], ['Language sites are asked for: English (United States)', 'en-US']);
  await chrome.press('Escape', 400);

  await open('settings-downloads');
  check('Downloads says where files go', (await chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)')).includes(`Files are saved in ${join(app.userData, 'downloads')}.`), true);
  await chrome.press('Enter', 500);
  check('the folder chooser opens on the folder in use and lists the folders in it', [await title(), await chrome.evaluate('[...document.querySelectorAll("#panel button[id^=folder-]")].map((b) => b.ariaLabel ?? b.textContent)')], ['Choose a folder', ['Save downloads in this folder', 'Up to the folder above', 'Open: films', 'Cancel']]);
  await open('folder-0');
  check('a folder can be gone into', (await chrome.evaluate('document.querySelector("#panel .where")?.textContent')), join(app.userData, 'downloads', 'films'));
  for (let i = 0; i < 6 && (await chrome.focused()) !== 'folder-use'; i++) await chrome.press('ArrowUp');
  await chrome.press('Enter', 500);
  check('and chosen: it is kept, and the chooser goes away', [file().downloads, await title()], [join(app.userData, 'downloads', 'films'), 'Downloads']);
  await chrome.press('Escape', 400);

  await open('settings-remote');
  await open('button-back');
  check('giving a button a job asks for the button', (await chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)')).includes('Press the button to use for "Back". Back cancels.'), true);
  await chrome.press('ArrowDown', 400);
  check('an arrow cannot be given another job, and says so', [await chrome.toastText(), 'keys' in file()], ['That button cannot be used for this', false]);
  await open('button-back');
  await chrome.press('F7', 500);
  check('the next button pressed gets the job, and is kept', [await text('button-back'), file().keys], ['Back: also F7', { F7: 'back' }]);
  await chrome.press('F7', 500);
  check('and does it straight away: here, Back to the first page of Settings', await title(), 'Settings');
  await open('settings-remote');
  await open('unbutton-back');
  check('the extra buttons can be taken away again', [await text('button-back'), file().keys], ['Back: add a button', {}]);
  await chrome.press('Escape', 400);

  await open('settings-reset');
  await chrome.press('Enter', 500);
  check('putting everything back takes two presses and leaves no settings behind', file(), { keys: {} });
  await chrome.press('Escape', 400);
  check('Back on the first page closes Settings', await chrome.evaluate('document.getElementById("panel")'), null);
});

await scenario('a site added as an app', { url: `${site.origin}/home.html` }, async (app) => {
  const page = await app.page(site.origin);
  const chrome = await app.chrome();
  const panelText = () => chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent) ?? ""');
  const reach = async (id, key = 'ArrowDown') => {
    for (let i = 0; i < 16 && (await chrome.focused()) !== id; i++) await chrome.press(key);
    return chrome.focused();
  };
  await sleep(1000);
  await page.evaluate('document.cookie = "who=shared; path=/"; 0');
  await page.press('ContextMenu', 500);
  check('the menu offers, on its first page, to add the site as an app', await reach('menu-add-app'), 'menu-add-app');
  await chrome.press('Enter', 500);
  check('which asks for a name, starting from the page\'s own', [await chrome.evaluate('document.querySelector("#panel h1")?.textContent'), await chrome.evaluate('document.getElementById("app-name").value')], ['Add as an app', 'Longboard fixture: generic streaming home']);
  check('with the highlight on the first choice, sign-ins shared', [await chrome.focused(), await chrome.evaluate('(document.getElementById("app-session")?.ariaLabel ?? document.getElementById("app-session")?.textContent)')], ['app-session', 'Sign-ins: shared with the rest of Longboard']);
  await chrome.press('Enter', 300);
  check('OK changes it to its own sign-ins and stays there', [await chrome.focused(), await chrome.evaluate('(document.getElementById("app-session")?.ariaLabel ?? document.getElementById("app-session")?.textContent)')], ['app-session', 'Sign-ins: its own, apart from the rest']);
  await chrome.press('ArrowDown');
  check("the TV's app list is offered, and wanted unless said otherwise", await chrome.evaluate('(document.getElementById("app-launcher")?.ariaLabel ?? document.getElementById("app-launcher")?.textContent)'), "Also in the TV's app list: yes");
  await reach('app-add');
  await chrome.press('Enter', 1200);
  check('Add says what it did', await page.toastText(), 'Added "Longboard fixture: generic streaming home" to Home and to the TV\'s app list. Open it from Home to use its own sign-ins');
  const saved = JSON.parse(readFileSync(join(app.userData, 'apps.json'), 'utf8')).apps;
  check('the app is saved', saved, [{ id: '127-0-0-1', url: `${site.origin}/home.html`, name: 'Longboard fixture: generic streaming home', ownSession: true, launcher: true }]);
  const entryFile = join(app.userData, 'xdg/applications/io.github.andrewgbest.Longboard.app-127-0-0-1.desktop');
  const entry = existsSync(entryFile) ? readFileSync(entryFile, 'utf8') : '';
  check('an entry for the app list is written, starting Longboard with the app', [/^Name=Longboard fixture: generic streaming home$/m.test(entry), /^Exec=.+ --app=127-0-0-1$/m.test(entry), /^Type=Application$/m.test(entry)], [true, true, true]);
  const iconFile = join(app.userData, 'icons/127-0-0-1.png');
  check("the site's own icon was fetched from the site and is what the entry shows", [existsSync(iconFile), entry.includes(`Icon=${iconFile}`)], [true, true]);

  await page.press('ContextMenu', 500);
  check('the menu now offers to remove it instead', [(await panelText()).includes('Remove the app'), (await panelText()).includes('Add this site as an app')], [true, false]);
  await reach('menu-home', 'ArrowUp');
  await chrome.press('Enter', 600);
  check('Home has an Apps section with the tile first, showing the site\'s icon', [await chrome.evaluate('document.querySelector("#home h2")?.textContent'), await chrome.focused(), await chrome.evaluate('document.querySelector("#apps img.icon")?.src.startsWith("data:image/png;base64,")'), await chrome.evaluate('document.querySelector("#apps .mark")?.textContent')], ['Apps', 'app-0', true, 'Own sign-ins']);
  await chrome.press('Enter', 600);
  const own = await app.frontPage(site.origin);
  check('the tile opens the site', !!own, true);
  if (!own) return;
  await sleep(600);
  check('in a session of its own: what the shared session stored is not there', await own.evaluate('document.cookie'), '');
  await own.evaluate('document.cookie = "who=app; path=/"; 0');
  await own.press('ArrowDown');
  check('and the arrows drive it like any page', await own.focused(), 'nav-home');

  // Removing it.
  await own.press('ContextMenu', 500);
  await reach('menu-remove-app');
  await chrome.press('Enter', 900);
  check('removing the app takes away the tile, the entry and the icon', [JSON.parse(readFileSync(join(app.userData, 'apps.json'), 'utf8')).apps, existsSync(entryFile), existsSync(iconFile)], [[], false, false]);
  check('and goes Home, since the app that was in front is gone', [await chrome.evaluate('document.visibilityState'), await chrome.evaluate('!!document.getElementById("home")'), await chrome.evaluate('document.getElementById("panel")')], ['visible', true, null]);
  const shared = await app.page(site.origin);
  check('the shared session still has what it stored', await shared?.evaluate('document.cookie'), 'who=shared');
});

await scenario(
  'started from the TV\'s app list',
  {
    args: ['--app=fixture-app'],
    seed: (data) => writeFileSync(join(data, 'apps.json'), JSON.stringify({ apps: [{ id: 'fixture-app', url: `${site.origin}/article.html`, name: 'Fixture', ownSession: false, launcher: true }] })),
  },
  async (app) => {
    const page = await app.page(`${site.origin}/article.html`);
    check('--app opens that app straight away', !!page, true);
    if (!page) return;
    await sleep(600);
    await page.press('Escape', 600);
    const chrome = await app.chrome();
    check('and Back from its first page goes to Home, where its tile is', [await chrome.evaluate('document.visibilityState'), await chrome.evaluate('document.querySelector("#apps .site")?.textContent')], ['visible', 'Fixture']);
  },
);

// Run as a Flatpak, Longboard has a data folder of its own that no desktop
// reads. An app's entry goes to the desktop's folder all the same, started
// the way a Flatpak is started; and one added by a version that got this
// wrong is written there at the next start.
await scenario(
  'an app in the app list when Longboard is a Flatpak',
  {
    url: `${site.origin}/home.html`,
    env: (data) => ({ FLATPAK_ID: 'io.example.Boxed', HOST_XDG_DATA_HOME: join(data, 'host-share') }),
    seed: (data) => writeFileSync(join(data, 'apps.json'), JSON.stringify({ apps: [{ id: 'made-up', url: `${site.origin}/home.html`, name: 'Made up', ownSession: false, launcher: true }] })),
  },
  async (app) => {
    await app.page(`${site.origin}/home.html`);
    const file = join(app.userData, 'host-share/applications/io.github.andrewgbest.Longboard.app-made-up.desktop');
    await until(() => existsSync(file), (there) => there, 30);
    const entry = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const icon = /^Icon=(.*)$/m.exec(entry)?.[1] ?? '';
    check('at start the entry is written where the desktop looks, not in the box\'s own folder', [existsSync(file), existsSync(join(app.userData, 'xdg/applications/io.github.andrewgbest.Longboard.app-made-up.desktop'))], [true, false]);
    check('it starts Longboard the way a Flatpak is started', /^Exec=flatpak run io\.example\.Boxed --app=made-up$/m.test(entry), true);
    check('and its picture is a file kept in the data folder, not one inside the package', [icon.startsWith(app.userData), existsSync(icon)], [true, true]);
  },
);

await scenario('an app that does not exist', { args: ['--app=no-such-app'] }, async (app) => {
  const chrome = await app.chrome();
  await until(() => chrome.focused(), (id) => id === 'go');
  check('--app with an unknown name shows Home and says so in the terminal', [await chrome.focused(), /there is no app called "no-such-app"/.test(app.log)], ['go', true]);
});

await scenario('Forward, a page that is slow to come, "Carry on", a keyboard\'s shortcuts, and the history searched', { url: `${site.origin}/home.html` }, async (app) => {
  const page = await app.page(`${site.origin}/home.html`);
  const chrome = await app.chrome();
  const path = () => page.evaluate('location.pathname');
  const loadingShown = (view) => view.overlay(({ cls }) => (/(^| )loading( |$)/.test(cls) ? /\bshow\b/.test(cls) : undefined));
  /** A key with Ctrl held, as a plugged-in keyboard sends it. */
  const ctrl = async (view, key, code, vk, shift = false) => {
    // Not waited on for ever: Ctrl+W closes the very view the key was sent to, and then nothing answers.
    const sent = (async () => {
      await view.keyDown(key, { code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: shift ? 10 : 2 });
      await view.keyUp(key);
    })().catch(() => undefined);
    await Promise.race([sent, sleep(1500)]);
    await sleep(700);
  };
  await sleep(900);
  page.evaluate('location.href = "/article.html"').catch(() => undefined);
  await until(path, (p) => p === '/article.html');
  await sleep(600);

  // Back, then Forward.
  await page.press('ContextMenu', 500);
  check('on the newest page Forward is greyed out and Back is not', [await chrome.evaluate('document.getElementById("menu-forward").disabled'), await chrome.evaluate('document.getElementById("menu-back").disabled')], [true, false]);
  await chrome.press('ArrowDown');
  check('down from Home is Back', await chrome.focused(), 'menu-back');
  await chrome.press('Enter', 600);
  check('Back goes back', await until(path, (p) => p === '/home.html'), '/home.html');
  await sleep(600);
  await page.press('ContextMenu', 500);
  check('and then Forward can be pressed', await chrome.evaluate('document.getElementById("menu-forward").disabled'), false);
  await chrome.press('ArrowDown');
  for (let i = 0; i < 3 && (await chrome.focused()) !== 'menu-forward'; i++) await chrome.press('ArrowLeft');
  await chrome.press('Enter', 600);
  check('Forward goes forward again', await until(path, (p) => p === '/article.html'), '/article.html');
  await sleep(600);

  // A page that is slow to come.
  check('a page that has come shows no line along the top', await loadingShown(page), false);
  page.evaluate('location.href = "/slow-page"').catch(() => undefined);
  await until(path, (p) => p === '/slow-page', 80);
  check('while a page is still coming, a line along the top says so', await until(() => loadingShown(page), (v) => v === true, 20), true);
  await page.press('ContextMenu', 500);
  check('and the menu offers Stop in place of Reload', await chrome.evaluate('document.getElementById("menu-reload")?.textContent'), 'Stop');
  await chrome.press('Escape', 300);
  check('once it has all come the line goes', await until(() => loadingShown(page), (v) => v === false, 80), false);
  await page.press('ContextMenu', 500);
  check('and the menu offers Reload again', await chrome.evaluate('document.getElementById("menu-reload")?.textContent'), 'Reload');
  await chrome.press('Escape', 300);

  // Home keeps the page one press away.
  await page.press('ContextMenu', 500);
  await chrome.press('Enter', 600);
  check('Home has "Carry on" for the page left behind it', await chrome.evaluate('document.getElementById("resume")?.ariaLabel'), 'Carry on at 127.0.0.1');
  for (let i = 0; i < 6 && (await chrome.focused()) !== 'resume'; i++) await chrome.press('ArrowDown');
  await chrome.press('Enter', 600);
  check('pressing it brings the page back', await until(() => page.evaluate('document.visibilityState'), (v) => v === 'visible'), 'visible');

  // A keyboard's shortcuts.
  await ctrl(page, 't', 'KeyT', 84);
  check('Ctrl+T opens a new tab, which starts on Home', [await chrome.evaluate('!!document.getElementById("home")'), await chrome.evaluate('document.querySelector("#top .badge")?.textContent'), await page.evaluate('document.visibilityState')], [true, '2 tabs', 'hidden']);
  await ctrl(chrome, 'l', 'KeyL', 76);
  check('Ctrl+L goes straight into the address field', await chrome.evaluate('document.activeElement?.id'), 'address');
  await chrome.press('Escape', 200);
  await chrome.type(`${site.origin.replace('http://', '')}/app.html`);
  await chrome.press('Enter', 500);
  const second = await app.page(`${site.origin}/app.html`);
  check('an address typed there opens in the new tab', !!second, true);
  if (!second) return;
  await until(() => second.evaluate('document.visibilityState'), (v) => v === 'visible');
  await sleep(600);
  await ctrl(second, 'w', 'KeyW', 87);
  check('Ctrl+W closes the tab and the other comes in front', [await second.evaluate('1').then(() => 'still there', () => 'gone'), await until(() => page.evaluate('document.visibilityState'), (v) => v === 'visible')], ['gone', 'visible']);
  await ctrl(page, 'T', 'KeyT', 84, true);
  const again = await app.frontPage(`${site.origin}/app.html`);
  check('Ctrl+Shift+T opens the tab closed last', !!again, true);
  if (!again) return;
  await sleep(600);

  // The history, searched, and one page taken out of it.
  await ctrl(again, 'h', 'KeyH', 72);
  check('Ctrl+H opens the history, under the day', [await chrome.evaluate('document.querySelector("#panel h1")?.textContent'), await chrome.evaluate('document.querySelector("#visits h2")?.textContent')], ['History', 'Today']);
  const rows = () => chrome.evaluate('[...document.querySelectorAll("#visits button.row")].map((b) => b.ariaLabel)');
  const all = await rows();
  for (let i = 0; i < 6 && (await chrome.focused()) !== 'history-find'; i++) await chrome.press('ArrowUp');
  await chrome.press('Enter', 400);
  await chrome.press('Escape', 200);
  await chrome.type('long article');
  await sleep(300);
  const found = await rows();
  check('words typed above the list leave only the pages that have them', [all.length > found.length, found.length, /long article/.test(found[0] ?? '')], [true, 1, true]);
  await chrome.press('ArrowDown');
  await chrome.press('ArrowRight');
  check('each page has a cross beside it', /^visit-forget-\d+$/.test((await chrome.focused()) ?? ''), true);
  await chrome.press('Enter', 500);
  const kept = JSON.parse(readFileSync(join(app.userData, 'history.json'), 'utf8')).visits.map((v) => new URL(v.url).pathname);
  check('which takes that page out of the history, and no other', [kept.includes('/article.html'), kept.includes('/home.html')], [false, true]);
});

await scenario('suggestions from the search site, when they are turned on', { config: { search: 'https://search.invalid/find?q=%s', searchSuggestions: `${site.origin}/suggest?q=%s` } }, async (app) => {
  const chrome = await app.chrome();
  await until(() => chrome.focused(), (id) => id === 'go');
  const shown = () => chrome.evaluate('[...document.querySelectorAll("#suggestions button")].map((b) => b.textContent)');
  await chrome.press('Enter', 400);
  await chrome.press('Escape', 200);
  asks.suggest.length = 0;
  await chrome.type('127.0.0.1/private');
  await sleep(900);
  check('an address being typed is not sent to the search site', asks.suggest, []);
  for (let i = 0; i < 17; i++) await chrome.press('Backspace', 20);
  await chrome.type('rain');
  check('words being typed are, and what it suggests is offered under the field', await until(shown, (l) => l.length === 2, 40), ['rain today', 'rain tomorrow']);
  check('it was asked about the words, not about each letter', asks.suggest.at(-1) === 'rain' && asks.suggest.length <= 3, true);
  await chrome.press('ArrowDown');
  await chrome.press('Enter', 600);
  const went = await app.view((u) => u.startsWith('data:') || u.includes('search.invalid'), 40);
  check('pressing one searches for it', !!went, true);
});

await scenario('no suggestions are asked for as Longboard ships', { config: { search: 'https://search.invalid/find?q=%s' } }, async (app) => {
  const chrome = await app.chrome();
  await until(() => chrome.focused(), (id) => id === 'go');
  await chrome.press('Enter', 400);
  await chrome.press('Escape', 200);
  asks.suggest.length = 0;
  await chrome.type('rain');
  await sleep(900);
  check('with the setting off nothing typed goes anywhere', [asks.suggest, await chrome.evaluate('document.querySelectorAll("#suggestions button").length')], [[], 0]);
});

{
  // The key a phone would get from the code on the screen; a scripted run brings its own.
  const nacl = (await import('tweetnacl')).default;
  const url64 = (bytes) => Buffer.from(bytes).toString('base64url');
  const phoneKey = nacl.randomBytes(32);
  let n = 0;
  const sealed = (message, key = phoneKey) => {
    const nonce = nacl.randomBytes(24);
    return url64(Buffer.concat([nonce, nacl.secretbox(new TextEncoder().encode(JSON.stringify({ n: ++n, ...message })), nonce, key)]));
  };
  await scenario('typing from a phone', { args: ['--phone-at=127.0.0.1', `--phone-key=${url64(phoneKey)}`] }, async (app) => {
    const chrome = await app.chrome();
    await until(() => chrome.focused(), (id) => id === 'go');
    await chrome.press('ContextMenu', 500);
    check('the menu has "Type from a phone", which is off until asked for', await chrome.evaluate('document.getElementById("menu-phone")?.ariaLabel'), 'Type from a phone');
    for (let i = 0; i < 12 && (await chrome.focused()) !== 'menu-phone'; i++) await chrome.press('ArrowDown');
    await chrome.press('Enter', 800);
    const words = await chrome.evaluate('document.getElementById("panel")?.textContent ?? ""');
    const at = /http:\/\/127\.0\.0\.1:\d+/.exec(words)?.[0];
    check('it shows a code to scan and the address, without the key', [await chrome.evaluate('document.querySelector("#scan-code path")?.getAttribute("d")?.length > 500'), !!at, words.includes(url64(phoneKey)), await chrome.evaluate('document.getElementById("phone-state")?.textContent')], [true, true, false, "Point your phone's camera at this code."]);
    if (!at) return;
    const post = (body) => fetch(`${at}/send`, { method: 'POST', body }).then((r) => r.status);
    check('the phone is given a page and its script', [(await (await fetch(`${at}/`)).text()).includes('Longboard remote'), (await (await fetch(`${at}/app.js`)).text()).length > 5000], [true, true]);
    check('what is not sealed with the key from the code is refused', [await post('hello'), await post(sealed({ t: 'text', v: 'intruder' }, nacl.randomBytes(32)))], [403, 403]);
    check('a phone that has the key gets through, and the TV says so', [await post(sealed({ t: 'hello' })), await until(() => chrome.evaluate('document.getElementById("phone-state")?.textContent'), (t) => t === 'A phone is connected.')], [204, 'A phone is connected.']);
    await chrome.press('Enter', 500);
    check('"Done" puts the panel away and leaves it on', [await chrome.evaluate('document.getElementById("panel")'), await chrome.focused()], [null, 'go']);

    await post(sealed({ t: 'text', v: 'nothing selected' }));
    check('text sent with no text field selected goes nowhere, and the TV says to choose one', await until(() => chrome.toastText(), (t) => /Choose a text field/.test(t ?? '')), 'Choose a text field on the TV first, then send again');
    await chrome.press('Enter', 400);
    await chrome.press('Escape', 200);
    await post(sealed({ t: 'text', v: 'films tonight' }));
    check('with the address field selected, what the phone sends is typed into it', await until(() => chrome.evaluate('document.getElementById("address")?.value'), (v) => v === 'films tonight'), 'films tonight');
    await post(sealed({ t: 'key', v: 'delete' }));
    check('the phone\'s Delete takes a letter off', await until(() => chrome.evaluate('document.getElementById("address")?.value'), (v) => v === 'films tonigh'), 'films tonigh');
    await post(sealed({ t: 'key', v: 'enter' }));
    check('and its Enter opens what was typed', !!(await app.view((u) => u.startsWith('data:') || u.includes('search.invalid'), 40)), true);

    await chrome.press('ContextMenu', 500).catch(() => undefined);
  });
}

// Recognising speech needs the model and a microphone, neither of which a
// test machine has; what is checked here is that nothing is fetched unasked.
await scenario('speaking: the model is asked about, and not fetched unless agreed to', {}, async (app) => {
  const chrome = await app.chrome();
  await until(() => chrome.focused(), (id) => id === 'go');
  await chrome.press('ContextMenu', 500);
  for (let i = 0; i < 12 && (await chrome.focused()) !== 'menu-voice'; i++) await chrome.press('ArrowDown');
  check('the menu has "Speak"', await chrome.focused(), 'menu-voice');
  await chrome.press('Enter', 700);
  check('the first time, it asks before fetching the speech model, and says how big it is and where from', [await chrome.evaluate('document.querySelector("#panel h1")?.textContent'), /51 MB.*download\.moonshine\.ai/.test(await chrome.evaluate('document.querySelector("#panel p.lead")?.textContent ?? ""')), await chrome.focused()], ['Fetch the speech model?', true, 'prompt-deny']);
  await chrome.press('Enter', 500);
  check('"Not now" fetches nothing', [await chrome.evaluate('document.getElementById("panel")'), existsSync(join(app.userData, 'voice-model'))], [null, false]);
});

// The site cannot be reached at first. The view must say so, keep trying,
// and load the page once it is there.
{
  const probe = createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  const sitePort = probe.address().port;
  await new Promise((r) => probe.close(r));
  let late;
  await scenario('a site that cannot be reached', { url: `http://127.0.0.1:${sitePort}/` }, async (app) => {
    const notice = await app.view((u) => u.startsWith('data:'));
    check('an unreachable start page is replaced by a notice', !!notice, true);
    if (notice) {
      const text = await until(() => notice.evaluate('document.body?.innerText ?? ""'), (t) => t && !t.startsWith('Starting'), 100);
      check('the notice says the site cannot be reached and that it will retry', [text.includes('Cannot reach'), /Trying again in \d+ seconds/.test(text)], [true, true]);
    }
    late = createServer((_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>back</title><p id="up">up</p>'));
    await new Promise((r) => late.listen(sitePort, '127.0.0.1', r));
    check('the page loads by itself once the site is reachable', !!(await app.page(`http://127.0.0.1:${sitePort}`)), true);
  });
  late?.close();
}

// Another program asks for the list of games the person owns at a store they
// are signed in to (main/handback.ts). The store here is invented: a sign-in
// page that signs in by itself, a front page that says who is signed in the
// way the real one does, and the list.
{
  const config = (signedIn) => JSON.stringify(signedIn ? { logged_in: true, steamid: '76561198000000001' } : { logged_in: false }).replace(/"/g, '&quot;');
  const signedIn = (req) => /(^|;\s*)who=me/.test(req.headers.cookie ?? '');
  const html = (res, body) => res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><title>Pretend store</title>${body}`);
  const asked = [];
  const store = await serveFixtures({
    '/pretend/login/': (_req, res) => html(res, '<h1>Sign in</h1><script>setTimeout(() => { document.cookie = "who=me; path=/"; location.href = "/pretend/"; }, 2500);</script>'),
    '/pretend/': (req, res) => html(res, `<div id="application_config" data-config="{}" data-userinfo="${config(signedIn(req))}"></div><h1 id="front">Front page</h1>`),
    '/pretend/dynamicstore/userdata/': (req, res) => {
      asked.push(signedIn(req));
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ rgOwnedApps: signedIn(req) ? [570, 440] : [], rgWishlist: [10], secret: 'not passed on' }));
    },
  });
  // The same store after it has changed how its front page says who is signed in.
  const changed = await serveFixtures({
    '/changed/login/': (_req, res) => html(res, '<h1>Sign in</h1><script>setTimeout(() => { document.cookie = "who=me; path=/"; location.href = "/changed/"; }, 2500);</script>'),
    '/changed/': (req, res) => html(res, signedIn(req) ? '<div id="app" data-user="me"></div><h1 id="front">Front page, done another way</h1>' : `<div id="application_config" data-userinfo="${config(false)}"></div>`),
    '/changed/dynamicstore/userdata/': (req, res) => {
      asked.push(signedIn(req));
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"rgOwnedApps":[570]}');
    },
  });
  const handBack = (file, at = `${store.origin}/pretend`) => ['--hand-back=steam-library', `--hand-back-to=${file}`, `--hand-back-site=${at}`];
  const question = (chrome) => until(() => chrome.evaluate('document.querySelector("#panel h1")?.textContent'), (t) => t === 'Share this?', 80);
  const folder = mkdtempSync(join(tmpdir(), 'longboard-hand-back-'));
  const yesFile = join(folder, 'yes.json');
  const noFile = join(folder, 'no.json');

  await scenario('handing back the list of games owned', { args: handBack(yesFile) }, async (app) => {
    const file = yesFile;
    const chrome = await app.chrome();
    check('the sign-in page of the store is opened', !!(await app.page(`${store.origin}/pretend/login/`)), true);
    check('nothing is asked or fetched while nobody is signed in', [await chrome.evaluate('document.querySelector("#panel h1")?.textContent ?? null'), asked.length, existsSync(file)], [null, 0, false]);
    check('once signed in, the person is asked', await question(chrome), 'Share this?');
    const words = await chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)');
    check('in plain words: what is asked for, and what is not shared', [words.includes('the list of games and tools you own on Steam'), words.includes('Your password and your sign-in to Steam are not')], [true, true]);
    check('with the highlight on the answer that changes nothing', await chrome.focused(), 'prompt-deny');
    check('and nothing fetched or written before the answer', [asked.length, existsSync(file)], [0, false]);
    await sayYes(chrome, 300);
    await until(() => existsSync(file), (there) => there, 60);
    check('a yes writes the account number and the ids owned, and nothing else the store said', existsSync(file) ? readFileSync(file, 'utf8') : null, '{"steamid":"76561198000000001","owned":[570,440]}');
    check('fetched as the signed-in browser, once', asked, [true]);
    check('for this user only', (statSync(file).mode & 0o077) === 0, true);
  });

  asked.length = 0;
  await scenario('declining to hand back the list of games owned', { args: handBack(noFile) }, async (app) => {
    const file = noFile;
    const chrome = await app.chrome();
    check('the person is asked', await question(chrome), 'Share this?');
    await sleep(750);
    await chrome.press('Enter', 400);
    await until(() => existsSync(file), (there) => there, 40);
    check('a no is written as a no, and the list is never fetched', [existsSync(file) ? readFileSync(file, 'utf8') : null, asked.length], ['{"declined":true}', 0]);
  });

  // The request arriving while Longboard is already running: the second copy passes it on and leaves.
  asked.length = 0;
  const lateFile = join(folder, 'late.json');
  await scenario('handing back, asked of a Longboard that is already running', { url: `${site.origin}/home.html` }, async (app) => {
    const file = lateFile;
    const chrome = await app.chrome();
    check('Longboard is on a page of the person\'s own', !!(await app.page(`${site.origin}/home.html`)), true);
    await app.again(handBack(file));
    check('the copy that was started hands the request over, and the store\'s sign-in page opens in the one already running', !!(await app.page(`${store.origin}/pretend/`)), true);
    check('once signed in, the person is asked', await question(chrome), 'Share this?');
    const words = await chrome.evaluate('(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)');
    check('and told where the list would be written, which is all that is known of who asks', words.includes(`written to this file: ${file}`), true);
    check('nothing fetched or written before the answer', [asked.length, existsSync(file)], [0, false]);
    await sayYes(chrome, 300);
    await until(() => existsSync(file), (there) => there, 60);
    check('a yes writes the list', existsSync(file) ? readFileSync(file, 'utf8') : null, '{"steamid":"76561198000000001","owned":[570,440]}');
    // A second request while the first is not yet answered replaces it, and the first is told no.
    const first = join(folder, 'first.json');
    const second = join(folder, 'second.json');
    await app.again(handBack(first));
    await sleep(600);
    await app.again(handBack(second));
    await until(() => existsSync(first), (there) => there, 40);
    check('a new request takes the place of one not yet answered, which is told no', existsSync(first) ? readFileSync(first, 'utf8') : null, '{"declined":true}');
  });

  // The store has changed its pages: nothing is shared, and the person and the program are both told.
  asked.length = 0;
  const changedFile = join(folder, 'changed.json');
  await scenario('handing back from a store whose pages have changed', { args: handBack(changedFile, `${changed.origin}/changed`) }, async (app) => {
    const page = await app.page(`${changed.origin}/changed/`);
    await until(() => existsSync(changedFile), (there) => there, 80);
    check('the program waiting is told no, and the list is never fetched', [existsSync(changedFile) ? readFileSync(changedFile, 'utf8') : null, asked.length], ['{"declined":true}', 0]);
    check('and the person is told why nothing was shared', /pages have changed and Longboard can no longer tell who is signed in, so nothing was shared/.test((await page.toastText()) ?? ''), true);
    const chrome = await app.chrome();
    check('with no question asked', await chrome.evaluate('document.querySelector("#panel h1")?.textContent ?? null'), null);
  });

  // Closed before any answer: the program waiting is told no.
  const closedFile = join(folder, 'closed.json');
  await scenario('closing Longboard with a hand-back unanswered', { args: handBack(closedFile) }, async (app) => {
    const chrome = await app.chrome();
    check('the person is asked', await question(chrome), 'Share this?');
    app.child.kill('SIGTERM');
    await until(() => existsSync(closedFile), (there) => there, 60);
    check('closing is a no', existsSync(closedFile) ? readFileSync(closedFile, 'utf8') : null, '{"declined":true}');
  });
  store.close();
  changed.close();
  rmSync(folder, { recursive: true, force: true });
}

site.close();
if (failureCount()) {
  console.error(`\n${failureCount()} check(s) failed\n${logs.join('\n')}`);
  process.exit(1);
}
console.log('\nall end-to-end checks passed');
