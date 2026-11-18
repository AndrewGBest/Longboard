// Shared parts of the end-to-end tests: launching the real app with
// --automation, serving the invented fixture pages on this machine, and a
// small DevTools Protocol client. No dependencies.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const electronPath = createRequire(import.meta.url)('electron');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
export const failureCount = () => failures;
export function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     expected ${JSON.stringify(expected)}\n     actual   ${JSON.stringify(actual)}`}`);
}
export function fail(what) {
  failures += 1;
  console.log(`FAIL ${what}`);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

/**
 * Serves test/fixtures on 127.0.0.1. `routes` adds made-up addresses:
 * a function per path that answers the request itself.
 */
export async function serveFixtures(routes = {}) {
  const dir = join(root, 'test/fixtures');
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (routes[path]) return routes[path](req, res);
    const file = normalize(join(dir, path));
    if (!file.startsWith(dir)) return res.writeHead(403).end();
    try {
      const body = readFileSync(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, close: () => server.close() };
}

function connect(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve: ok, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : ok(msg.result);
      }
    };
    ws.onerror = () => rej(new Error('CDP socket error'));
    ws.onopen = () =>
      res({
        send: (method, params = {}) =>
          new Promise((resolve2, reject) => {
            pending.set(++id, { resolve: resolve2, reject });
            ws.send(JSON.stringify({ id, method, params }));
          }),
        close: () => ws.close(),
      });
  });
}

const VK = {
  ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Enter: 13, '/': 191, Escape: 27, ' ': 32, Backspace: 8,
  ContextMenu: 93, F2: 113, F4: 115, F6: 117,
};

/** One view of the app (a DevTools target), with the helpers the tests use. */
async function attach(target) {
  const cdp = await connect(target.webSocketDebuggerUrl);
  const evaluate = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
  const key = (name) => ({ key: name, code: name === ' ' ? 'Space' : name, windowsVirtualKeyCode: VK[name], nativeVirtualKeyCode: VK[name] });
  const press = async (name, wait = 150) => {
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key(name) });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key(name) });
    await sleep(wait);
  };
  /** The layer's own elements are in a closed shadow root; DevTools can still read them. */
  const overlay = async (pick) => {
    const { root: tree } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const classOf = (n) => (n.attributes?.includes('class') ? n.attributes[n.attributes.indexOf('class') + 1] : '');
    const styleOf = (n) => (n.attributes?.includes('style') ? n.attributes[n.attributes.indexOf('style') + 1] : '');
    const textOf = (n) => (n.children ?? []).map((c) => c.nodeValue ?? textOf(c)).join('');
    const walk = (n) => {
      const hit = pick({ cls: classOf(n), style: styleOf(n), text: () => textOf(n), node: n });
      if (hit !== undefined) return hit;
      for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) {
        const found = walk(c);
        if (found !== undefined) return found;
      }
      return undefined;
    };
    return walk(tree) ?? null;
  };
  return {
    cdp,
    url: target.url,
    evaluate,
    press,
    keyDown: (name, extra = {}) => cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key(name), ...extra }),
    keyUp: (name) => cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key(name) }),
    type: (text) => cdp.send('Input.insertText', { text }),
    focused: () => evaluate('document.querySelector("[data-longboard-focus]")?.id ?? null'),
    ringClass: () => overlay(({ cls }) => (/\bring\b/.test(cls) ? cls : undefined)),
    toastText: () => overlay(({ cls, text }) => (/\btoast\b/.test(cls) && /\bshow\b/.test(cls) ? text() : undefined)),
    keyboardShown: async () => (await overlay(({ cls }) => (/\bosk\b/.test(cls) ? /\bshow\b/.test(cls) : undefined))) === true,
    overlay,
    close: () => cdp.close(),
  };
}

let nextPort = 9300 + Math.floor(Math.random() * 400);

/**
 * Starts the app. Always with --automation (Hard rule 11) and its own
 * throw-away data folder. `url` is the address to open; without it the app
 * starts on Home. `config` is written as the user's config.json.
 */
export async function launch({ url, config, args = [] } = {}) {
  const port = nextPort++;
  const userData = mkdtempSync(join(tmpdir(), 'longboard-e2e-'));
  // Searches go to a name that can never resolve, so a test never contacts a search engine.
  writeFileSync(join(userData, 'config.json'), JSON.stringify({ search: 'https://search.invalid/find?q=%s', ...config }));
  const child = spawn(
    electronPath,
    [root, '--dev', '--automation', '--zoom=1', ...(url ? [`--url=${url}`] : []), ...args, `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, '--no-sandbox', '--disable-gpu'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const app = { child, userData, log: '' };
  child.stdout.on('data', (d) => (app.log += d));
  child.stderr.on('data', (d) => (app.log += d));
  const open = [];

  const targets = async () => {
    try {
      return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === 'page');
    } catch {
      return [];
    }
  };
  /** Waits for a view whose address passes `test` and attaches to it. Null if none turns up. */
  app.view = async (test, tries = 100) => {
    for (let i = 0; i < tries; i++) {
      const hit = (await targets()).find((t) => test(t.url));
      if (hit) {
        const view = await attach(hit);
        open.push(view);
        return view;
      }
      await sleep(200);
    }
    return null;
  };
  /** Longboard's own screens. */
  app.chrome = () => app.view((u) => u.startsWith('file:') && u.endsWith('chrome.html'));
  /** The website view, once it shows an address starting with `prefix`. */
  app.page = (prefix, tries) => app.view((u) => u.startsWith(prefix), tries);
  app.exited = new Promise((r) => child.once('exit', () => r(true)));
  app.close = async () => {
    for (const view of open) view.close();
    child.kill();
    await sleep(300);
    rmSync(userData, { recursive: true, force: true });
  };
  return app;
}

/** Polls until `read()` gives something `test` accepts; returns the last value read. */
export async function until(read, test, tries = 40, gap = 100) {
  let value;
  for (let i = 0; i < tries; i++) {
    try {
      value = await read();
      if (test(value)) return value;
    } catch {
      // the page may be between documents; ask again
    }
    await sleep(gap);
  }
  return value;
}
