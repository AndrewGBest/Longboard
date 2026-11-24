// Forward and the keyboard's shortcuts; suggestions from the search site.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, sleep, until } from '../harness.mjs';
import { scenario, site, asks } from './setup.mjs';

/** Runs this file's scenarios, one after another. */
export default async function run() {
  await scenario(
    'Forward, a page that is slow to come, "Carry on", a keyboard\'s shortcuts, and the history searched',
    { url: `${site.origin}/home.html` },
    async (app) => {
      const page = await app.page(`${site.origin}/home.html`);
      const chrome = await app.chrome();
      const path = () => page.evaluate('location.pathname');
      const loadingShown = (view) =>
        view.overlay(({ cls }) => (/(^| )loading( |$)/.test(cls) ? /\bshow\b/.test(cls) : undefined));
      /** A key with Ctrl held, as a plugged-in keyboard sends it. */
      const ctrl = async (view, key, code, vk, shift = false) => {
        // Not waited on for ever: Ctrl+W closes the very view the key was sent to, and then nothing answers.
        const sent = (async () => {
          await view.keyDown(key, {
            code,
            windowsVirtualKeyCode: vk,
            nativeVirtualKeyCode: vk,
            modifiers: shift ? 10 : 2,
          });
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
      check(
        'on the newest page Forward is greyed out and Back is not',
        [
          await chrome.evaluate('document.getElementById("menu-forward").disabled'),
          await chrome.evaluate('document.getElementById("menu-back").disabled'),
        ],
        [true, false],
      );
      await chrome.press('ArrowDown');
      check('down from Home is Back', await chrome.focused(), 'menu-back');
      await chrome.press('Enter', 600);
      check('Back goes back', await until(path, (p) => p === '/home.html'), '/home.html');
      await sleep(600);
      await page.press('ContextMenu', 500);
      check(
        'and then Forward can be pressed',
        await chrome.evaluate('document.getElementById("menu-forward").disabled'),
        false,
      );
      await chrome.press('ArrowDown');
      for (let i = 0; i < 3 && (await chrome.focused()) !== 'menu-forward'; i++) await chrome.press('ArrowLeft');
      await chrome.press('Enter', 600);
      check('Forward goes forward again', await until(path, (p) => p === '/article.html'), '/article.html');
      await sleep(600);

      // A page that is slow to come.
      check('a page that has come shows no line along the top', await loadingShown(page), false);
      page.evaluate('location.href = "/slow-page"').catch(() => undefined);
      await until(path, (p) => p === '/slow-page', 80);
      check(
        'while a page is still coming, a line along the top says so',
        await until(
          () => loadingShown(page),
          (v) => v === true,
          20,
        ),
        true,
      );
      await page.press('ContextMenu', 500);
      check(
        'and the menu offers Stop in place of Reload',
        await chrome.evaluate('document.getElementById("menu-reload")?.textContent'),
        'Stop',
      );
      await chrome.press('Escape', 300);
      check(
        'once it has all come the line goes',
        await until(
          () => loadingShown(page),
          (v) => v === false,
          80,
        ),
        false,
      );
      await page.press('ContextMenu', 500);
      check(
        'and the menu offers Reload again',
        await chrome.evaluate('document.getElementById("menu-reload")?.textContent'),
        'Reload',
      );
      await chrome.press('Escape', 300);

      // Home keeps the page one press away.
      await page.press('ContextMenu', 500);
      await chrome.press('Enter', 600);
      check(
        'Home has "Carry on" for the page left behind it',
        await chrome.evaluate('document.getElementById("resume")?.ariaLabel'),
        'Carry on at 127.0.0.1',
      );
      for (let i = 0; i < 6 && (await chrome.focused()) !== 'resume'; i++) await chrome.press('ArrowDown');
      await chrome.press('Enter', 600);
      check(
        'pressing it brings the page back',
        await until(
          () => page.evaluate('document.visibilityState'),
          (v) => v === 'visible',
        ),
        'visible',
      );

      // A keyboard's shortcuts.
      await ctrl(page, 't', 'KeyT', 84);
      check(
        'Ctrl+T opens a new tab, which starts on Home',
        [
          await chrome.evaluate('!!document.getElementById("home")'),
          await chrome.evaluate('document.querySelector("#top .badge")?.textContent'),
          await page.evaluate('document.visibilityState'),
        ],
        [true, '2 tabs', 'hidden'],
      );
      await ctrl(chrome, 'l', 'KeyL', 76);
      check(
        'Ctrl+L goes straight into the address field',
        await chrome.evaluate('document.activeElement?.id'),
        'address',
      );
      await chrome.press('Escape', 200);
      await chrome.type(`${site.origin.replace('http://', '')}/app.html`);
      await chrome.press('Enter', 500);
      const second = await app.page(`${site.origin}/app.html`);
      check('an address typed there opens in the new tab', !!second, true);
      if (!second) return;
      await until(
        () => second.evaluate('document.visibilityState'),
        (v) => v === 'visible',
      );
      await sleep(600);
      await ctrl(second, 'w', 'KeyW', 87);
      check(
        'Ctrl+W closes the tab and the other comes in front',
        [
          await second.evaluate('1').then(
            () => 'still there',
            () => 'gone',
          ),
          await until(
            () => page.evaluate('document.visibilityState'),
            (v) => v === 'visible',
          ),
        ],
        ['gone', 'visible'],
      );
      await ctrl(page, 'T', 'KeyT', 84, true);
      const again = await app.frontPage(`${site.origin}/app.html`);
      check('Ctrl+Shift+T opens the tab closed last', !!again, true);
      if (!again) return;
      await sleep(600);

      // The history, searched, and one page taken out of it.
      await ctrl(again, 'h', 'KeyH', 72);
      check(
        'Ctrl+H opens the history, under the day',
        [
          await chrome.evaluate('document.querySelector("#panel h1")?.textContent'),
          await chrome.evaluate('document.querySelector("#visits h2")?.textContent'),
        ],
        ['History', 'Today'],
      );
      const rows = () =>
        chrome.evaluate('[...document.querySelectorAll("#visits button.row")].map((b) => b.ariaLabel)');
      const all = await rows();
      for (let i = 0; i < 6 && (await chrome.focused()) !== 'history-find'; i++) await chrome.press('ArrowUp');
      await chrome.press('Enter', 400);
      await chrome.press('Escape', 200);
      await chrome.type('long article');
      await sleep(300);
      const found = await rows();
      check(
        'words typed above the list leave only the pages that have them',
        [all.length > found.length, found.length, /long article/.test(found[0] ?? '')],
        [true, 1, true],
      );
      await chrome.press('ArrowDown');
      await chrome.press('ArrowRight');
      check('each page has a cross beside it', /^visit-forget-\d+$/.test((await chrome.focused()) ?? ''), true);
      await chrome.press('Enter', 500);
      const kept = JSON.parse(readFileSync(join(app.userData, 'history.json'), 'utf8')).visits.map(
        (v) => new URL(v.url).pathname,
      );
      check(
        'which takes that page out of the history, and no other',
        [kept.includes('/article.html'), kept.includes('/home.html')],
        [false, true],
      );
    },
  );

  await scenario(
    'suggestions from the search site, when they are turned on',
    { config: { search: 'https://search.invalid/find?q=%s', searchSuggestions: `${site.origin}/suggest?q=%s` } },
    async (app) => {
      const chrome = await app.chrome();
      await until(
        () => chrome.focused(),
        (id) => id === 'go',
      );
      const shown = () =>
        chrome.evaluate('[...document.querySelectorAll("#suggestions button")].map((b) => b.textContent)');
      await chrome.press('Enter', 400);
      await chrome.press('Escape', 200);
      asks.suggest.length = 0;
      await chrome.type('127.0.0.1/private');
      await sleep(900);
      check('an address being typed is not sent to the search site', asks.suggest, []);
      for (let i = 0; i < 17; i++) await chrome.press('Backspace', 20);
      await chrome.type('rain');
      check(
        'words being typed are, and what it suggests is offered under the field',
        await until(shown, (l) => l.length === 2, 40),
        ['rain today', 'rain tomorrow'],
      );
      check(
        'it was asked about the words, not about each letter',
        asks.suggest.at(-1) === 'rain' && asks.suggest.length <= 3,
        true,
      );
      await chrome.press('ArrowDown');
      await chrome.press('Enter', 600);
      const went = await app.view((u) => u.startsWith('data:') || u.includes('search.invalid'), 40);
      check('pressing one searches for it', !!went, true);
    },
  );

  await scenario(
    'no suggestions are asked for as Longboard ships',
    { config: { search: 'https://search.invalid/find?q=%s' } },
    async (app) => {
      const chrome = await app.chrome();
      await until(
        () => chrome.focused(),
        (id) => id === 'go',
      );
      await chrome.press('Enter', 400);
      await chrome.press('Escape', 200);
      asks.suggest.length = 0;
      await chrome.type('rain');
      await sleep(900);
      check(
        'with the setting off nothing typed goes anywhere',
        [asks.suggest, await chrome.evaluate('document.querySelectorAll("#suggestions button").length')],
        [[], 0],
      );
    },
  );

  {
    // The key a phone would get from the code on the screen; a scripted run brings its own.
    const nacl = (await import('tweetnacl')).default;
    const url64 = (bytes) => Buffer.from(bytes).toString('base64url');
    const phoneKey = nacl.randomBytes(32);
    let n = 0;
    const sealed = (message, key = phoneKey) => {
      const nonce = nacl.randomBytes(24);
      return url64(
        Buffer.concat([
          nonce,
          nacl.secretbox(new TextEncoder().encode(JSON.stringify({ n: ++n, ...message })), nonce, key),
        ]),
      );
    };
    await scenario(
      'typing from a phone',
      { args: ['--phone-at=127.0.0.1', `--phone-key=${url64(phoneKey)}`] },
      async (app) => {
        const chrome = await app.chrome();
        await until(
          () => chrome.focused(),
          (id) => id === 'go',
        );
        await chrome.press('ContextMenu', 500);
        check(
          'the menu has "Type from a phone", which is off until asked for',
          await chrome.evaluate('document.getElementById("menu-phone")?.ariaLabel'),
          'Type from a phone',
        );
        for (let i = 0; i < 12 && (await chrome.focused()) !== 'menu-phone'; i++) await chrome.press('ArrowDown');
        await chrome.press('Enter', 800);
        const words = await chrome.evaluate('document.getElementById("panel")?.textContent ?? ""');
        const at = /http:\/\/127\.0\.0\.1:\d+/.exec(words)?.[0];
        check(
          'it shows a code to scan and the address, without the key',
          [
            await chrome.evaluate('document.querySelector("#scan-code path")?.getAttribute("d")?.length > 500'),
            !!at,
            words.includes(url64(phoneKey)),
            await chrome.evaluate('document.getElementById("phone-state")?.textContent'),
          ],
          [true, true, false, "Point your phone's camera at this code."],
        );
        if (!at) return;
        const post = (body) => fetch(`${at}/send`, { method: 'POST', body }).then((r) => r.status);
        check(
          'the phone is given a page and its script',
          [
            (await (await fetch(`${at}/`)).text()).includes('Longboard remote'),
            (await (await fetch(`${at}/app.js`)).text()).length > 5000,
          ],
          [true, true],
        );
        check(
          'what is not sealed with the key from the code is refused',
          [await post('hello'), await post(sealed({ t: 'text', v: 'intruder' }, nacl.randomBytes(32)))],
          [403, 403],
        );
        check(
          'a phone that has the key gets through, and the TV says so',
          [
            await post(sealed({ t: 'hello' })),
            await until(
              () => chrome.evaluate('document.getElementById("phone-state")?.textContent'),
              (t) => t === 'A phone is connected.',
            ),
          ],
          [204, 'A phone is connected.'],
        );
        await chrome.press('Enter', 500);
        check(
          '"Done" puts the panel away and leaves it on',
          [await chrome.evaluate('document.getElementById("panel")'), await chrome.focused()],
          [null, 'go'],
        );

        await post(sealed({ t: 'text', v: 'nothing selected' }));
        check(
          'text sent with no text field selected goes nowhere, and the TV says to choose one',
          await until(
            () => chrome.toastText(),
            (t) => /Choose a text field/.test(t ?? ''),
          ),
          'Choose a text field on the TV first, then send again',
        );
        await chrome.press('Enter', 400);
        await chrome.press('Escape', 200);
        await post(sealed({ t: 'text', v: 'films tonight' }));
        check(
          'with the address field selected, what the phone sends is typed into it',
          await until(
            () => chrome.evaluate('document.getElementById("address")?.value'),
            (v) => v === 'films tonight',
          ),
          'films tonight',
        );
        await post(sealed({ t: 'key', v: 'delete' }));
        check(
          "the phone's Delete takes a letter off",
          await until(
            () => chrome.evaluate('document.getElementById("address")?.value'),
            (v) => v === 'films tonigh',
          ),
          'films tonigh',
        );
        await post(sealed({ t: 'key', v: 'enter' }));
        check(
          'and its Enter opens what was typed',
          !!(await app.view((u) => u.startsWith('data:') || u.includes('search.invalid'), 40)),
          true,
        );

        await chrome.press('ContextMenu', 500).catch(() => undefined);
      },
    );
  }
}
