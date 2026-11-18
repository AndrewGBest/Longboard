// End-to-end tests: the real app, started with --automation, driven over the
// DevTools Protocol against invented fixture pages served from this machine.
// Run with `npm run e2e` (needs a display; `xvfb-run -a npm run e2e` headless).
import { createServer } from 'node:http';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, fail, failureCount, launch, serveFixtures, sleep, until } from './harness.mjs';

const site = await serveFixtures({
  // A start page that redirects somewhere automation refuses, as a service
  // does for a signed-out visitor.
  '/signed-out': (_req, res) => res.writeHead(302, { location: '/offers/landing?token=SECRET' }).end(),
  // Something a browser would save to disk.
  '/file.bin': (_req, res) => res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename=x.bin' }).end('data'),
  '/offers/landing': (_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>should never load</title>'),
});
const logs = [];

/** Runs one scenario with its own app; a crash in it fails the run and the app's log is kept. */
async function scenario(name, options, body) {
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
  check('user agent hides nothing but the app tokens', /Electron|longboard/i.test(ua) === false && /Linux/.test(ua) && /Chrome\//.test(ua), true);

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
  for (let i = 0; i < 3; i++) await press('ArrowDown'); // bottom row: shift
  await press('ArrowRight');
  await press('ArrowRight');
  await press('Enter'); // "space"
  await press('ArrowRight');
  await press('Enter'); // "delete"
  await press('Enter');
  await sleep(300);
  check('space and delete work', await evaluate('document.getElementById("search").value'), 'a');
  // Capitals and symbols: shift then "a", then the symbols face and "@".
  for (let i = 0; i < 3; i++) await press('ArrowLeft');
  await press('Enter'); // shift
  for (let i = 0; i < 4; i++) await press('ArrowUp');
  await press('Enter'); // "B": shift is two columns wide and up goes from its middle
  for (let i = 0; i < 4; i++) await press('ArrowDown');
  await press('ArrowRight');
  await press('Enter'); // symbols face; highlight is on "abc"
  for (let i = 0; i < 3; i++) await press('ArrowUp');
  await press('Enter'); // "@", second key of the second row
  await sleep(300);
  check('capitals and symbols can be typed', await evaluate('document.getElementById("search").value'), 'aB@');
  await press('Escape');
  await press('Escape');
  check('back closes the keyboard and then leaves the field', await evaluate('document.activeElement?.id ?? ""'), '');

  // A field the page focuses by itself (as a sign-in page does) gets the keyboard without a key press.
  await evaluate('document.getElementById("search").value = ""; document.getElementById("search").focus()');
  await sleep(200);
  check('a field the page focused becomes the remote focus', await focused(), 'search');
  await press('Enter'); // "a", on the keyboard that opened by itself
  await sleep(300);
  check('the keyboard is already open on it', await evaluate('document.getElementById("search").value'), 'a');
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

  // Nothing that is not a web address opens, and nothing is granted that the policy does not list.
  await evaluate('window.open("file:///etc/passwd"); 0');
  await sleep(400);
  check('a file address does not open', await evaluate('location.href'), `${site.origin}/home.html`);
  check('location is refused without a question', await evaluate('new Promise((r) => navigator.geolocation.getCurrentPosition(() => r("granted"), (e) => r(e.code)))'), 1);
  check('notifications are refused', await evaluate('Notification.requestPermission()'), 'denied');
  check('the camera and microphone are refused', await evaluate('navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(() => "granted", () => "refused")'), 'refused');

  // A download is refused, and said so.
  await evaluate('location.href = "/file.bin"; 0');
  check('a download is refused with a message', await until(() => page.toastText(), (t) => /Downloads/.test(t ?? '')), 'Downloads are not available in Longboard yet');
  check('and the page stays', await evaluate('location.pathname'), '/home.html');

  // Quit is handled by the shell, so it must work whatever the page is doing.
  void page.keyDown('q', { code: 'KeyQ', windowsVirtualKeyCode: 81, nativeVirtualKeyCode: 81, modifiers: 2 }).catch(() => undefined);
  check('Ctrl+Q quits the app', await Promise.race([app.exited, sleep(4000).then(() => false)]), true);
});

await scenario('Home, the address field, the menu and Back', {}, async (app) => {
  const chrome = await app.chrome();
  await until(() => chrome.focused(), (id) => id === 'go');
  check('the app starts on Home with the highlight on "go to address"', [await chrome.evaluate('document.querySelector("#home h1")?.textContent'), await chrome.focused()], ['Longboard', 'go']);
  check('Home has no script and no app API in its page', await chrome.evaluate('document.scripts.length + typeof window.require + typeof window.ipcRenderer'), '0undefinedundefined');
  check('no keyboard is shown before it is asked for', await chrome.keyboardShown(), false);

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
  await sleep(500);
  await page.press('ArrowDown');
  check('the arrows drive the page', await page.focused(), 'nav-home');

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
  check('Bigger makes the page bigger and the menu stays open', [(await page.evaluate('innerWidth')) < widthBefore, await chrome.evaluate('document.getElementById("menu-zoom-reset").textContent'), await chrome.focused()], [true, '110%', 'menu-zoom-in']);
  check('the choice is saved for the site', JSON.parse(readFileSync(join(app.userData, 'sites.json'), 'utf8')), { '127.0.0.1': { zoom: 1.1 } });
  await chrome.press('ArrowLeft');
  await chrome.press('Enter', 500);
  check('pressing the percentage puts it back', [await page.evaluate('innerWidth'), await chrome.evaluate('document.getElementById("menu-zoom-reset").textContent')], [widthBefore, '100%']);
  await chrome.press('Escape', 400);
  check('Back closes the menu and the keys return to the page', [await chrome.evaluate('document.visibilityState'), await page.evaluate('document.hasFocus()')], ['hidden', true]);
  await page.press('ArrowDown');
  check('the page is driven again', await page.focused(), 't1');

  // About.
  await page.press('ContextMenu', 500);
  for (let i = 0; i < 8 && (await chrome.focused()) !== 'menu-about'; i++) await chrome.press('ArrowDown');
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

  await chrome.press('Enter', 600);
  check('the tile opens the site again', await until(() => page.evaluate('document.visibilityState + location.pathname'), (v) => v === 'visible/home.html'), 'visible/home.html');
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
      [text.includes('/offers/landing'), text.includes('--automation'), text.includes('Ctrl+Q'), text.includes('SECRET')],
      [true, true, true, false],
    );
  }
  if (notice) {
    await sleep(400);
    await notice.press('Escape', 600);
    const chrome = await app.chrome();
    check('Back from it goes Home, not to the "Starting" notice', await chrome.evaluate('document.visibilityState + !!document.getElementById("home")'), 'visibletrue');
  }
  check('the blocked start page is logged', /blocked navigation \(automation-spend\): http:\/\/127\.0\.0\.1:\d+\/offers\/landing\n/.test(app.log), true);
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

site.close();
if (failureCount()) {
  console.error(`\n${failureCount()} check(s) failed\n${logs.join('\n')}`);
  process.exit(1);
}
console.log('\nall end-to-end checks passed');
