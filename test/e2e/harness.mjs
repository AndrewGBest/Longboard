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
// LONGBOARD_APP=<path to a packaged longboard binary> runs the same checks
// against a package (after `npx electron-builder --linux dir`) instead of
// the source tree, which is how the package's own settings get tested.
const packaged = process.env.LONGBOARD_APP ? resolve(process.env.LONGBOARD_APP) : null;
const appBinary = packaged ?? electronPath;
const appFirst = packaged ? [] : [root];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
export const failureCount = () => failures;
export function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     expected ${JSON.stringify(expected)}\n     actual   ${JSON.stringify(actual)}`}`,
  );
}
export function fail(what) {
  failures += 1;
  console.log(`FAIL ${what}`);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

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
    const listeners = [];
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (!msg.id && msg.method) for (const hear of listeners) hear(msg.method, msg.params);
      if (msg.id && pending.has(msg.id)) {
        const { resolve: ok, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : ok(msg.result);
      }
    };
    ws.onerror = () => rej(new Error('CDP socket error'));
    ws.onopen = () =>
      res({
        // A call that is never answered must fail the test, not hang it.
        send: (method, params = {}) =>
          new Promise((resolve2, reject) => {
            const mine = ++id;
            const timer = setTimeout(() => {
              pending.delete(mine);
              reject(new Error(`no answer to ${method} after 15 seconds`));
            }, 15000);
            pending.set(mine, {
              resolve: (v) => (clearTimeout(timer), resolve2(v)),
              reject: (e) => (clearTimeout(timer), reject(e)),
            });
            ws.send(JSON.stringify({ id: mine, method, params }));
          }),
        /** Calls `hear(method, params)` for everything the app says unasked. */
        listen: (hear) => listeners.push(hear),
        close: () => ws.close(),
      });
  });
}

const VK = {
  ArrowUp: 38,
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39,
  Enter: 13,
  '/': 191,
  Escape: 27,
  ' ': 32,
  Backspace: 8,
  ContextMenu: 93,
  BrowserHome: 172,
  Tab: 9,
  F2: 113,
  F4: 115,
  F6: 117,
  F7: 118,
};

/** One view of the app (a DevTools target), with the helpers the tests use. */
async function attach(target) {
  const cdp = await connect(target.webSocketDebuggerUrl);
  const evaluate = async (expression) =>
    (await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
  const key = (name) => ({
    key: name,
    code: name === ' ' ? 'Space' : name,
    windowsVirtualKeyCode: VK[name],
    nativeVirtualKeyCode: VK[name],
  });
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
  const pointerAt = () =>
    overlay(({ cls, style }) => {
      if (!/(^| )pointer( |$)/.test(cls)) return undefined;
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(style);
      return /\bshow\b/.test(cls) && m ? { x: Number(m[1]), y: Number(m[2]) } : null;
    });
  // The layer's own world, where the page's scripts cannot reach. Found by
  // name; a page that goes somewhere else gets a new one.
  let layerWorld;
  let watching = false;
  const inLayer = async (expression) => {
    if (!watching) {
      watching = true;
      // Frames inside the page have such a world too; only the page's own counts.
      const top = (await cdp.send('Page.getFrameTree')).frameTree.frame.id;
      cdp.listen((method, params) => {
        if (
          method === 'Runtime.executionContextCreated' &&
          /isolated/i.test(params.context.name) &&
          params.context.auxData?.isDefault === false &&
          params.context.auxData?.frameId === top
        )
          layerWorld = params.context.id;
        if (method === 'Runtime.executionContextsCleared') layerWorld = undefined;
      });
      await cdp.send('Runtime.enable');
      await sleep(200);
    }
    if (layerWorld === undefined) throw new Error("the layer's world was not found");
    const answer = await cdp.send('Runtime.evaluate', {
      expression,
      contextId: layerWorld,
      returnByValue: true,
      awaitPromise: true,
    });
    if (answer.exceptionDetails)
      throw new Error(
        `in the layer's world: ${answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text}`.slice(
          0,
          200,
        ),
      );
    return answer.result.value;
  };
  return {
    cdp,
    url: target.url,
    /** Evaluates in the layer's isolated world. For the referee only. */
    inLayer,
    /** Walks the pointer to a point (page pixels) with taps, reading where it is after each. */
    pointTo: async (x, y) => {
      for (let i = 0; i < 400; i++) {
        const at = await pointerAt();
        if (!at) return false;
        const dx = x - at.x;
        const dy = y - at.y;
        if (Math.abs(dx) <= 6 && Math.abs(dy) <= 6) return true;
        await press(
          Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : dy > 0 ? 'ArrowDown' : 'ArrowUp',
          20,
        );
      }
      return false;
    },
    evaluate,
    press,
    keyDown: (name, extra = {}) => cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key(name), ...extra }),
    keyUp: (name) => cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key(name) }),
    /** Holds a key the way a keyboard does: one press, then repeats until it is let go. */
    hold: async (name, ms) => {
      await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key(name) });
      await sleep(250);
      for (const end = Date.now() + ms - 250; Date.now() < end;) {
        await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key(name), autoRepeat: true });
        await sleep(33);
      }
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key(name) });
    },
    /** Types text the way a plugged-in keyboard does: a key press for every character. */
    type: async (text) => {
      for (const ch of text) {
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
      }
    },
    /**
     * The referee: presses Tab through the page and says how the places it
     * stopped compare with what the highlight can reach (src/layer/diagnostics/referee.ts).
     */
    referee: async (most = 150) => {
      let again = 0;
      for (let i = 0; i < most && again < 2; i++) {
        await press('Tab', 40);
        if ((await inLayer('globalThis.longboardReferee.note()')) !== 'new') again += 1;
      }
      return inLayer('globalThis.longboardReferee.report()');
    },
    focused: () => evaluate('document.querySelector("[data-longboard-focus]")?.id ?? null'),
    ringClass: () => overlay(({ cls }) => (/\bring\b/.test(cls) ? cls : undefined)),
    toastText: () => overlay(({ cls, text }) => (/\btoast\b/.test(cls) && /\bshow\b/.test(cls) ? text() : undefined)),
    keyboardShown: async () =>
      (await overlay(({ cls }) => (/\bosk\b/.test(cls) ? /\bshow\b/.test(cls) : undefined))) === true,
    /** Where the on-screen pointer is drawn (page pixels), or null when pointer mode is off. */
    pointerAt,
    overlay,
    close: () => cdp.close(),
  };
}

let nextPort = 9300 + Math.floor(Math.random() * 400);

/**
 * Starts the app. Always with --automation (Hard rule 11) and its own
 * throw-away data folder. `url` is the address to open; without it the app
 * starts on Home. `config` is written as the user's config.json. `seed` is
 * called with the data folder before the app starts.
 *
 * The page is scaled for a TV, as it is for a person (1.33 times in the
 * default window), unless a scenario passes --zoom=. Running everything at
 * a scale of 1 once hid a pointer bug that every real TV would have shown.
 */
export async function launch({ url, config, args = [], width, height, seed, env = {}, sandbox = false, keep } = {}) {
  const port = nextPort++;
  // `keep` names a data folder that outlives the run (the survey's signed-in
  // pass: a person signed in there by hand). It is never deleted here.
  const userData = keep ?? mkdtempSync(join(tmpdir(), 'longboard-e2e-'));
  // Searches go to a name that can never resolve, so a test never contacts a search engine.
  writeFileSync(
    join(userData, 'config.json'),
    JSON.stringify({ search: 'https://search.invalid/find?q=%s', ...config }),
  );
  // Files a scenario wants in the data folder before the app starts.
  if (seed) seed(userData);
  const child = spawn(
    appBinary,
    [
      ...appFirst,
      '--dev',
      '--automation',
      ...(width ? [`--size=${width}x${height}`] : []),
      ...(url ? [`--url=${url}`] : []),
      `--downloads=${join(userData, 'downloads')}`,
      ...args,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userData}`,
      '--password-store=basic',
      ...(sandbox ? [] : ['--no-sandbox']),
      '--disable-gpu',
    ],
    // The desktop's app list is kept inside the throw-away folder too: a test never writes to the real one.
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        XDG_DATA_HOME: join(userData, 'xdg'),
        ...(typeof env === 'function' ? env(userData) : env),
      },
    },
  );
  const app = { child, userData, log: '' };
  /**
   * Starts a second copy on the same data folder, as choosing Longboard
   * again from another program does while it is already running. The copy
   * passes its arguments to the first and leaves; resolves when it has left.
   */
  app.again = (more = []) =>
    new Promise((done) => {
      const copy = spawn(
        appBinary,
        [
          ...appFirst,
          '--dev',
          '--automation',
          ...more,
          `--user-data-dir=${userData}`,
          '--password-store=basic',
          ...(sandbox ? [] : ['--no-sandbox']),
          '--disable-gpu',
        ],
        {
          stdio: 'ignore',
          env: {
            ...process.env,
            XDG_DATA_HOME: join(userData, 'xdg'),
            ...(typeof env === 'function' ? env(userData) : env),
          },
        },
      );
      copy.on('exit', done);
    });
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
  /** The website view that is in front, among those showing an address starting with `prefix`. */
  app.frontPage = async (prefix, tries = 50) => {
    for (let i = 0; i < tries; i++) {
      for (const t of (await targets()).filter((x) => x.url.startsWith(prefix))) {
        const view = await attach(t);
        if ((await view.evaluate('document.visibilityState').catch(() => '')) === 'visible') {
          open.push(view);
          return view;
        }
        view.close();
      }
      await sleep(200);
    }
    return null;
  };
  /** Longboard's own screens. */
  app.chrome = () => app.view((u) => u === 'longboard://screens/chrome.html');
  /** The website view, once it shows an address starting with `prefix`. */
  app.page = (prefix, tries) => app.view((u) => u.startsWith(prefix), tries);
  app.exited = new Promise((r) => child.once('exit', () => r(true)));
  app.close = async () => {
    for (const view of open) view.close();
    child.kill();
    await sleep(300);
    // The app may still be writing as it goes: the folder is tried a few times, and a throw-away folder that
    // will not go is left for the system to clear, since it says nothing about Longboard.
    if (!keep) {
      try {
        rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch (err) {
        console.error(`(left behind: ${userData}: ${String(err).slice(0, 120)})`);
      }
    }
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
