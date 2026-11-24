// Speaking.
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, serveFixtures, sleep, until } from '../harness.mjs';
import { scenario, sayYes, site } from './setup.mjs';

/** Runs this file's scenarios, one after another. */
export default async function run() {
  // Recognising speech needs the model and a microphone, neither of which a
  // test machine has; what is checked here is that nothing is fetched unasked.
  await scenario('speaking: the model is asked about, and not fetched unless agreed to', {}, async (app) => {
    const chrome = await app.chrome();
    await until(
      () => chrome.focused(),
      (id) => id === 'go',
    );
    await chrome.press('ContextMenu', 500);
    for (let i = 0; i < 12 && (await chrome.focused()) !== 'menu-voice'; i++) await chrome.press('ArrowDown');
    check('the menu has "Speak"', await chrome.focused(), 'menu-voice');
    await chrome.press('Enter', 700);
    check(
      'the first time, it asks before fetching the speech model, and says how big it is and where from',
      [
        await chrome.evaluate('document.querySelector("#panel h1")?.textContent'),
        /51 MB.*download\.moonshine\.ai/.test(
          await chrome.evaluate('document.querySelector("#panel p.lead")?.textContent ?? ""'),
        ),
        await chrome.focused(),
      ],
      ['Fetch the speech model?', true, 'prompt-deny'],
    );
    await chrome.press('Enter', 500);
    check(
      '"Not now" fetches nothing',
      [await chrome.evaluate('document.getElementById("panel")'), existsSync(join(app.userData, 'voice-model'))],
      [null, false],
    );
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
        const text = await until(
          () => notice.evaluate('document.body?.innerText ?? ""'),
          (t) => t && !t.startsWith('Starting'),
          100,
        );
        check(
          'the notice says the site cannot be reached and that it will retry',
          [text.includes('Cannot reach'), /Trying again in \d+ seconds/.test(text)],
          [true, true],
        );
      }
      late = createServer((_req, res) =>
        res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>back</title><p id="up">up</p>'),
      );
      await new Promise((r) => late.listen(sitePort, '127.0.0.1', r));
      check(
        'the page loads by itself once the site is reachable',
        !!(await app.page(`http://127.0.0.1:${sitePort}`)),
        true,
      );
    });
    late?.close();
  }

  // Another program asks for the list of games the person owns at a store they
  // are signed in to (main/handback.ts). The store here is invented: a sign-in
  // page that signs in by itself, a front page that says who is signed in the
  // way the real one does, and the list.
  {
    const config = (signedIn) =>
      JSON.stringify(signedIn ? { logged_in: true, steamid: '76561198000000001' } : { logged_in: false }).replace(
        /"/g,
        '&quot;',
      );
    const signedIn = (req) => /(^|;\s*)who=me/.test(req.headers.cookie ?? '');
    const html = (res, body) =>
      res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><title>Pretend store</title>${body}`);
    const asked = [];
    const store = await serveFixtures({
      '/pretend/login/': (_req, res) =>
        html(
          res,
          '<h1>Sign in</h1><script>setTimeout(() => { document.cookie = "who=me; path=/"; location.href = "/pretend/"; }, 2500);</script>',
        ),
      '/pretend/': (req, res) =>
        html(
          res,
          `<div id="application_config" data-config="{}" data-userinfo="${config(signedIn(req))}"></div><h1 id="front">Front page</h1>`,
        ),
      '/pretend/dynamicstore/userdata/': (req, res) => {
        asked.push(signedIn(req));
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(
            JSON.stringify({ rgOwnedApps: signedIn(req) ? [570, 440] : [], rgWishlist: [10], secret: 'not passed on' }),
          );
      },
    });
    // The same store after it has changed how its front page says who is signed in.
    const changed = await serveFixtures({
      '/changed/login/': (_req, res) =>
        html(
          res,
          '<h1>Sign in</h1><script>setTimeout(() => { document.cookie = "who=me; path=/"; location.href = "/changed/"; }, 2500);</script>',
        ),
      '/changed/': (req, res) =>
        html(
          res,
          signedIn(req)
            ? '<div id="app" data-user="me"></div><h1 id="front">Front page, done another way</h1>'
            : `<div id="application_config" data-userinfo="${config(false)}"></div>`,
        ),
      '/changed/dynamicstore/userdata/': (req, res) => {
        asked.push(signedIn(req));
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"rgOwnedApps":[570]}');
      },
    });
    const handBack = (file, at = `${store.origin}/pretend`) => [
      '--hand-back=steam-library',
      `--hand-back-to=${file}`,
      `--hand-back-site=${at}`,
    ];
    const question = (chrome) =>
      until(
        () => chrome.evaluate('document.querySelector("#panel h1")?.textContent'),
        (t) => t === 'Share this?',
        80,
      );
    const folder = mkdtempSync(join(tmpdir(), 'longboard-hand-back-'));
    const yesFile = join(folder, 'yes.json');
    const noFile = join(folder, 'no.json');

    await scenario('handing back the list of games owned', { args: handBack(yesFile) }, async (app) => {
      const file = yesFile;
      const chrome = await app.chrome();
      check('the sign-in page of the store is opened', !!(await app.page(`${store.origin}/pretend/login/`)), true);
      check(
        'nothing is asked or fetched while nobody is signed in',
        [
          await chrome.evaluate('document.querySelector("#panel h1")?.textContent ?? null'),
          asked.length,
          existsSync(file),
        ],
        [null, 0, false],
      );
      check('once signed in, the person is asked', await question(chrome), 'Share this?');
      const words = await chrome.evaluate(
        '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)',
      );
      check(
        'in plain words: what is asked for, and what is not shared',
        [
          words.includes('the list of games and tools you own on Steam'),
          words.includes('Your password and your sign-in to Steam are not'),
        ],
        [true, true],
      );
      check('with the highlight on the answer that changes nothing', await chrome.focused(), 'prompt-deny');
      check('and nothing fetched or written before the answer', [asked.length, existsSync(file)], [0, false]);
      await sayYes(chrome, 300);
      await until(
        () => existsSync(file),
        (there) => there,
        60,
      );
      check(
        'a yes writes the account number and the ids owned, and nothing else the store said',
        existsSync(file) ? readFileSync(file, 'utf8') : null,
        '{"steamid":"76561198000000001","owned":[570,440]}',
      );
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
      await until(
        () => existsSync(file),
        (there) => there,
        40,
      );
      check(
        'a no is written as a no, and the list is never fetched',
        [existsSync(file) ? readFileSync(file, 'utf8') : null, asked.length],
        ['{"declined":true}', 0],
      );
    });

    // The request arriving while Longboard is already running: the second copy passes it on and leaves.
    asked.length = 0;
    const lateFile = join(folder, 'late.json');
    await scenario(
      'handing back, asked of a Longboard that is already running',
      { url: `${site.origin}/home.html` },
      async (app) => {
        const file = lateFile;
        const chrome = await app.chrome();
        check("Longboard is on a page of the person's own", !!(await app.page(`${site.origin}/home.html`)), true);
        await app.again(handBack(file));
        check(
          "the copy that was started hands the request over, and the store's sign-in page opens in the one already running",
          !!(await app.page(`${store.origin}/pretend/`)),
          true,
        );
        check('once signed in, the person is asked', await question(chrome), 'Share this?');
        const words = await chrome.evaluate(
          '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)',
        );
        check(
          'and told where the list would be written, which is all that is known of who asks',
          words.includes(`written to this file: ${file}`),
          true,
        );
        check('nothing fetched or written before the answer', [asked.length, existsSync(file)], [0, false]);
        await sayYes(chrome, 300);
        await until(
          () => existsSync(file),
          (there) => there,
          60,
        );
        check(
          'a yes writes the list',
          existsSync(file) ? readFileSync(file, 'utf8') : null,
          '{"steamid":"76561198000000001","owned":[570,440]}',
        );
        // A second request while the first is not yet answered replaces it, and the first is told no.
        const first = join(folder, 'first.json');
        const second = join(folder, 'second.json');
        await app.again(handBack(first));
        await sleep(600);
        await app.again(handBack(second));
        await until(
          () => existsSync(first),
          (there) => there,
          40,
        );
        check(
          'a new request takes the place of one not yet answered, which is told no',
          existsSync(first) ? readFileSync(first, 'utf8') : null,
          '{"declined":true}',
        );
      },
    );

    // The store has changed its pages: nothing is shared, and the person and the program are both told.
    asked.length = 0;
    const changedFile = join(folder, 'changed.json');
    await scenario(
      'handing back from a store whose pages have changed',
      { args: handBack(changedFile, `${changed.origin}/changed`) },
      async (app) => {
        const page = await app.page(`${changed.origin}/changed/`);
        await until(
          () => existsSync(changedFile),
          (there) => there,
          80,
        );
        check(
          'the program waiting is told no, and the list is never fetched',
          [existsSync(changedFile) ? readFileSync(changedFile, 'utf8') : null, asked.length],
          ['{"declined":true}', 0],
        );
        check(
          'and the person is told why nothing was shared',
          /pages have changed and Longboard can no longer tell who is signed in, so nothing was shared/.test(
            (await page.toastText()) ?? '',
          ),
          true,
        );
        const chrome = await app.chrome();
        check(
          'with no question asked',
          await chrome.evaluate('document.querySelector("#panel h1")?.textContent ?? null'),
          null,
        );
      },
    );

    // Closed before any answer: the program waiting is told no.
    const closedFile = join(folder, 'closed.json');
    await scenario('closing Longboard with a hand-back unanswered', { args: handBack(closedFile) }, async (app) => {
      const chrome = await app.chrome();
      check('the person is asked', await question(chrome), 'Share this?');
      app.child.kill('SIGTERM');
      await until(
        () => existsSync(closedFile),
        (there) => there,
        60,
      );
      check('closing is a no', existsSync(closedFile) ? readFileSync(closedFile, 'utf8') : null, '{"declined":true}');
    });
    store.close();
    changed.close();
    rmSync(folder, { recursive: true, force: true });
  }
}
