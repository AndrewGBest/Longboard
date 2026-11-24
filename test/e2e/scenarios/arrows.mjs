// Moving round a page with the arrows.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, root, sleep } from '../harness.mjs';
import { scenario, site } from './setup.mjs';

/** Runs this file's scenarios, one after another. */
export default async function run() {
  await scenario('a page driven with the arrows', { url: `${site.origin}/home.html` }, async (app) => {
    const page = await app.page(site.origin);
    const { evaluate, press, focused } = page;
    await sleep(800);
    check('layer overlay is present', await evaluate('!!document.querySelector("longboard-overlay")'), true);
    check(
      'page cannot see any app API',
      await evaluate(
        'typeof window.require + typeof window.longboard + typeof window.electron + typeof window.ipcRenderer',
      ),
      'undefinedundefinedundefinedundefined',
    );

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
    check(
      'the user agent names the real engine and system, and Longboard once, by its own name',
      [/Electron/i.test(ua), /Linux/.test(ua) && /Chrome\//.test(ua), ua.match(/longboard\/[\d.]+/gi)],
      [false, true, [`Longboard/${JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version}`]],
    );

    // On-screen keyboard: the search key focuses the field and a remote can type into it.
    await press('/');
    await sleep(300);
    check('search key focuses the search field', await evaluate('document.activeElement?.id'), 'search');
    await press('Enter'); // "a"
    await press('ArrowRight');
    await press('ArrowDown');
    await press('Enter'); // "l", under "b"
    await sleep(300);
    check(
      'the on-screen keyboard types into the field',
      await evaluate('document.getElementById("search").value'),
      'al',
    );
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
    check(
      'a field the page focused becomes the remote focus, without a keyboard over the page',
      [await focused(), await page.keyboardShown()],
      ['search', false],
    );
    await press('Enter', 300); // brings the keyboard up
    await press('Enter', 300); // "a"
    check(
      'OK brings the keyboard up on it',
      [await page.keyboardShown(), await evaluate('document.getElementById("search").value')],
      [true, 'a'],
    );
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
    check(
      'Back closes the pop-up and focus returns to its button',
      [await evaluate('!!document.getElementById("dialog")'), await focused()],
      [false, 'info'],
    );

    // A refused navigation must be visible: the page stays, a toast appears, the terminal says why.
    const disguised = site.origin.replace('http://', 'http://user:pw@');
    await evaluate(`location.href = "${disguised}/home.html?token=SECRET"; 0`);
    await sleep(500);
    check('an address carrying a user name does not load', await evaluate('location.href'), `${site.origin}/home.html`);
    check(
      'a blocked navigation shows a toast',
      await page.toastText(),
      'Blocked: that address carries a user name or password',
    );
    check(
      'a blocked navigation is logged without its query or the password',
      [
        /blocked navigation \(credentials\): http:\/\/127\.0\.0\.1:\d+\/home\.html\n/.test(app.log),
        /SECRET|user:pw/.test(app.log),
      ],
      [true, false],
    );

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
    check(
      'a page is told the truth about AC-3 and E-AC-3 sound, which the engine cannot decode on Linux and says it can',
      [audio['ac-3'], audio['ec-3']],
      [
        [false, '', false],
        [false, '', false],
      ],
    );
    const picture = await evaluate(
      `['width=640', 'width=99999', 'framerate=60', 'framerate=9999', 'width=3840; height=2160; framerate=60; bitrate=20000000'].map((more) => MediaSource.isTypeSupported('video/webm; codecs="vp9"; ' + more))`,
    );
    check(
      'a page is told the truth about picture sizes and frame rates the engine cannot play, and says yes to those it can',
      picture,
      [true, false, true, false, true],
    );
    // The engine's own answer, asked where Longboard's correction does not reach (a worker): when this
    // turns false the engine has been put right and shared/audio-truth.ts can go (castLabs issue 221).
    const engine = await evaluate(
      `new Promise((done) => { const w = new Worker(URL.createObjectURL(new Blob(['postMessage(typeof MediaSource === "undefined" ? null : MediaSource.isTypeSupported(\\'audio/mp4; codecs="ec-3"\\'))'], { type: 'text/javascript' }))); w.onmessage = (e) => done(e.data); w.onerror = () => done('error'); })`,
    );
    check('KNOWN WRONG, in the engine itself: it still says it can play E-AC-3', engine, true);

    // What a page makes up is not a key press, and a web component does not hide a purchase button.
    const before = await focused();
    await evaluate(
      'window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); document.dispatchEvent(new KeyboardEvent("keydown", { key: "q", ctrlKey: true, bubbles: true })); 0',
    );
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
    check(
      'a purchase button inside a web component is still not pressed in a scripted run',
      await evaluate('__shadow'),
      ['fine'],
    );

    // Nothing that is not a web address opens, and nothing is granted that the policy does not list.
    await evaluate('window.open("file:///etc/passwd"); 0');
    await sleep(400);
    check('a file address does not open', await evaluate('location.href'), `${site.origin}/home.html`);
    await evaluate('window.__w = window.open("about:blank"); window.open(""); 0');
    await sleep(400);
    check(
      'an empty window a script means to fill in later does not blank the site',
      [await evaluate('location.href'), await evaluate('__w')],
      [`${site.origin}/home.html`, null],
    );
    check(
      'a kind of access Longboard never gives is refused without a question',
      await evaluate(
        'navigator.permissions.query({ name: "idle-detection" }).then((p) => p.state, () => "refused")',
      ).then((v) => v !== 'granted'),
      true,
    );

    // Quit is handled by the shell, so it must work whatever the page is doing.
    void page
      .keyDown('q', { code: 'KeyQ', windowsVirtualKeyCode: 81, nativeVirtualKeyCode: 81, modifiers: 2 })
      .catch(() => undefined);
    check('Ctrl+Q quits the app', await Promise.race([app.exited, sleep(4000).then(() => false)]), true);
  });
}
