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

await scenario('a form, and things that only look clickable', { url: `${site.origin}/form.html` }, async (app) => {
  const page = await app.page(site.origin);
  const { evaluate, press, focused } = page;
  const value = (id) => evaluate(`document.getElementById("${id}").value`);
  await sleep(800);
  await press('ArrowDown', 300);
  check('the first press lands in the text field and the keyboard comes up', [await focused(), await page.keyboardShown()], ['name', true]);
  await press('Enter', 300);
  check('and types', await value('name'), 'a');
  await press('Escape');
  await press('Escape');
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
  check('down goes to the text box, with the keyboard', [await focused(), await page.keyboardShown()], ['notes', true]);
  await press('Escape');
  await press('Escape');
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

await scenario('pointer mode', { url: `${site.origin}/frames.html` }, async (app) => {
  const page = await app.page(`${site.origin}/frames.html`);
  const { evaluate, press, focused } = page;
  const messages = () => evaluate('__frame.messages');
  await sleep(1000);
  check('no pointer is shown to begin with', await page.pointerAt(), null);
  await press('ArrowDown');
  await press('ArrowDown');
  check('the highlight can land on an embedded frame', await focused(), 'frame');
  await press('Enter', 500);
  const start = await page.pointerAt();
  const box = await evaluate('(() => { const r = document.getElementById("frame").getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })()');
  check('OK on it switches to pointer mode, with the pointer on the frame and the ring put away', [!!start && start.x > box.l && start.x < box.r && start.y > box.t && start.y < box.b, await focused()], [true, null]);
  await press('Enter', 600);
  check('OK clicks what is under the pointer, inside the frame', [await messages(), await page.toastText()], [['clicked 1'], 'Pointer mode: this part of the page needs the pointer']);

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
  check('the pointer key brings it back, in the middle of the screen', await page.pointerAt(), { x: (await evaluate('innerWidth')) / 2, y: (await evaluate('innerHeight')) / 2 });
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
  check('the menu says pointer mode is on', await chrome.evaluate('document.getElementById("menu-pointer").textContent'), 'Pointer mode: on');
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
