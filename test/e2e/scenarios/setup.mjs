// What every scenario shares: the made-up site the app is pointed at, a few helpers, and `scenario`, which runs one.
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, failureCount, launch, root, serveFixtures, sleep } from '../harness.mjs';

// A made-up catalogue: an index and the one profile it lists, with the
// profile's real checksum, and a second entry whose checksum is wrong.
export const fixtureProfile = readFileSync(join(root, 'test/fixtures/profiles/profile-test.json'));
const catalogueIndex = JSON.stringify({
  'longboard-index': 1,
  profiles: [
    {
      id: 'fixture-site',
      version: '1.0.0',
      path: 'profiles/profile.test/profile.json',
      sha256: createHash('sha256').update(fixtureProfile).digest('hex'),
    },
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
  const crc = (buf) =>
    (buf.reduce((c, byte) => crcTable[(c ^ byte) & 0xff] ^ (c >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0;
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
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', pixels),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const siteIcon = pngSquare(32, [40, 120, 200]);

/** The package a release has for this machine's kind of processor. */
const packageName = `Longboard-${process.arch === 'arm64' ? 'arm64' : 'x86_64'}.AppImage`;
/** What stands for a newer package in the update checks. */
export const newPackage = Buffer.from('#!/bin/sh\n# a made-up newer package\n'.repeat(200));
/** What the made-up site was asked for, for the download checks. */
export const asks = { suggest: [], file: 0, made: 0, slow: [], adverts: 0, bigIcon: 0, maskIcon: 0 };
export const site = await serveFixtures({
  // A page that takes its time, as a far-away site does.
  '/slow-page': (_req, res) =>
    res
      .writeHead(200, { 'content-type': 'text/html' })
      .end(
        '<!doctype html><title>slow</title><a href="/home.html" id="there">the words</a><img src="/slow.png" alt="">',
      ),
  // A page that takes five seconds to answer at all.
  '/late-page': (_req, res) =>
    setTimeout(
      () =>
        res
          .writeHead(200, { 'content-type': 'text/html' })
          .end('<!doctype html><title>late</title><a href="#" id="came">here at last</a>'),
      5000,
    ),
  '/slow.png': (_req, res) => setTimeout(() => res.writeHead(200, { 'content-type': 'image/png' }).end(siteIcon), 3500),
  // A made-up search site's suggestions, in the shape the real ones answer in.
  '/suggest': (req, res) => {
    const q = new URL(req.url, 'http://x').searchParams.get('q') ?? '';
    asks.suggest.push(q);
    res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify([q, [`${q} today`, `${q} tomorrow`]]));
  },
  // What a request said it was, for the checks on the identity sent to a site with a TV interface.
  '/agent': (req, res) =>
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(req.headers['user-agent'] ?? '')),
  '/favicon.ico': (_req, res) => res.writeHead(200, { 'content-type': 'image/png' }).end(siteIcon),
  '/catalogue/index.json': (_req, res) =>
    res.writeHead(200, { 'content-type': 'application/json' }).end(catalogueIndex),
  '/catalogue/profiles/profile.test/profile.json': (_req, res) =>
    res.writeHead(200, { 'content-type': 'application/json' }).end(fixtureProfile),
  '/catalogue/profiles/tampered.test/profile.json': (_req, res) =>
    res.writeHead(200, { 'content-type': 'application/json' }).end(fixtureProfile),
  // A start page that redirects somewhere automation refuses, as a service
  // does for a signed-out visitor.
  '/signed-out': (_req, res) => res.writeHead(302, { location: '/signup/landing?token=SECRET' }).end(),
  // Something a browser would save to disk.
  '/file.bin': (_req, res) => {
    asks.file += 1;
    res
      .writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-disposition': 'attachment; filename=x.bin',
        'content-length': 4,
      })
      .end('data');
  },
  // A second of silence, as a sound file: something a page can try to play.
  '/quiet.wav': (_req, res) => {
    const samples = 8000;
    const head = Buffer.alloc(44);
    head.write('RIFF', 0);
    head.writeUInt32LE(36 + samples, 4);
    head.write('WAVEfmt ', 8);
    head.writeUInt32LE(16, 16);
    head.writeUInt16LE(1, 20);
    head.writeUInt16LE(1, 22);
    head.writeUInt32LE(8000, 24);
    head.writeUInt32LE(8000, 28);
    head.writeUInt16LE(1, 32);
    head.writeUInt16LE(8, 34);
    head.write('data', 36);
    head.writeUInt32LE(samples, 40);
    res.writeHead(200, { 'content-type': 'audio/wav' }).end(Buffer.concat([head, Buffer.alloc(samples, 128)]));
  },
  // A made-up list of harmful sites: the made-up name harmful.test, and one part of profile.test
  // (written with ^* because the test site has a port in its address, which real sites on such lists do not).
  '/harmful.txt': (_req, res) =>
    res
      .writeHead(200, { 'content-type': 'text/plain' })
      .end('! Title: made-up list of harmful sites for the tests\n||harmful.test^\n||profile.test^*/form.html$doc\n'),
  // A page that sends its visitor on to the listed site before it has finished arriving itself.
  '/hop.html': (_req, res) =>
    res
      .writeHead(200, { 'content-type': 'text/html' })
      .end(
        '<!doctype html><title>Hop</title><script>location.href = "http://harmful.test:" + location.port + "/article.html";</script><p>On the way.</p>',
      ),
  // A made-up filter list, and what the page with advertising asks for.
  '/filters.txt': (_req, res) =>
    res
      .writeHead(200, { 'content-type': 'text/plain' })
      .end('[Adblock Plus 2.0]\n! Title: made-up list for the tests\n/advert/*\nlocalhost,127.0.0.1##a\n'),
  '/advert/ad.js': (_req, res) => {
    asks.adverts += 1;
    res
      .writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' })
      .end('window.__seen.push("advert");');
  },
  '/advert/banner.png': (_req, res) => {
    asks.adverts += 1;
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' }).end(siteIcon);
  },
  // A web-app manifest and the big icon it lists, for a Home tile.
  '/pwa/app.webmanifest': (_req, res) =>
    res.writeHead(200, { 'content-type': 'application/manifest+json' }).end(
      JSON.stringify({
        name: 'Made up',
        icons: [
          { src: 'mask.png', sizes: '512x512', purpose: 'maskable' },
          { src: 'icon-192.png', sizes: '192x192' },
        ],
      }),
    ),
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
      JSON.stringify({
        tag_name: 'v99.0.0',
        draft: false,
        prerelease: false,
        assets: [
          {
            name: packageName,
            browser_download_url: `http://${req.headers.host}/releases/package`,
            size: newPackage.length,
            digest: `sha256:${createHash('sha256').update(newPackage).digest('hex')}`,
          },
        ],
      }),
    ),
  '/releases/tampered': (req, res) =>
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        tag_name: 'v99.0.0',
        assets: [
          {
            name: packageName,
            browser_download_url: `http://${req.headers.host}/releases/package`,
            size: newPackage.length,
            digest: `sha256:${'0'.repeat(64)}`,
          },
        ],
      }),
    ),
  '/releases/package': (_req, res) =>
    res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(newPackage),
  // What a request arrived with, by header name.
  '/headers': (req, res) =>
    res
      .writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      .end(JSON.stringify(req.headers)),
  '/site.js': (_req, res) =>
    res
      .writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' })
      .end('window.__seen.push("site");'),
  // A file made in answer to a form: it cannot be asked for a second time.
  '/made.bin': (req, res) => {
    if (req.method !== 'POST') return res.writeHead(405).end();
    asks.made += 1;
    res
      .writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-disposition': 'attachment; filename=made.bin',
        'content-length': 4,
      })
      .end('form');
  },
  // A file that comes slowly: half now, the rest when the test says.
  '/slow.bin': (_req, res) => {
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename=slow.bin',
      'content-length': 200000,
    });
    // Enough of it that the browser knows it is a file and not a page.
    res.write('h'.repeat(100000));
    asks.slow.push(res);
  },
  '/signup/landing': (_req, res) =>
    res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>should never load</title>'),
});
/**
 * Says yes to the question on screen. The highlight starts on the answer
 * that changes nothing, and a yes in the question's first moments is not
 * counted, so this waits, moves up to the yes, and presses OK.
 */
export async function sayYes(chrome, wait = 500) {
  await sleep(750);
  await chrome.press('ArrowUp');
  await chrome.press('Enter', wait);
}
/** From the menu's first page to its page about the site in front: app, profile, what the site may do. */
export async function siteMenu(chrome) {
  for (let i = 0; i < 20 && (await chrome.focused()) !== 'menu-site'; i++) await chrome.press('ArrowDown');
  await chrome.press('Enter', 400);
}
export const logs = [];

/** Runs one scenario with its own app; a crash in it fails the run and the app's log is kept. */
// `npm run e2e -- words` runs only the scenarios whose names contain one of the words.
// `--part=2/3` runs every third scenario starting with the second: the whole
// suite in pieces, for a machine too short of memory to run it in one go.
const part = /^--part=(\d+)\/(\d+)$/.exec(process.argv.slice(2).find((a) => a.startsWith('--part=')) ?? '');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--part='));
let ordinal = 0;
export async function scenario(name, options, body) {
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

// The fixture site also answers to the made-up name profile.test (mapped to
// this machine), because a profile names sites by domain.
export const port = new URL(site.origin).port;
export const mapHost = '--host-resolver-rules=MAP profile.test 127.0.0.1';
