// Home, the address field, the menu and Back.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, sleep, until } from '../harness.mjs';
import { scenario, site } from './setup.mjs';

/** Runs this file's scenarios, one after another. */
export default async function run() {
  await scenario('Home, the address field, the menu and Back', { env: { LONGBOARD_TIPS: '1' } }, async (app) => {
    const chrome = await app.chrome();
    await until(
      () => chrome.focused(),
      (id) => id === 'go',
    );
    check(
      'the app starts on Home with the highlight on "go to address"',
      [await chrome.evaluate('document.querySelector("#home h1")?.textContent'), await chrome.focused()],
      ['Longboard', 'go'],
    );
    check(
      'Home has no script and no app API in its page',
      await chrome.evaluate('document.scripts.length + typeof window.require + typeof window.ipcRenderer'),
      '0undefinedundefined',
    );
    check('no keyboard is shown before it is asked for', await chrome.keyboardShown(), false);

    // A remote with no menu key: the menu is a button on Home. There is no line of key names at the foot (Andrew, 2026-11-19).
    check('Home has no legend', await chrome.evaluate('!!document.getElementById("hint")'), false);
    await chrome.press('ArrowUp', 300);
    check('Up from the address bar reaches the Menu button', await chrome.focused(), 'home-menu');
    await chrome.press('Enter', 500);
    check('OK on it opens the menu', await chrome.evaluate('!!document.getElementById("menu-tabs")'), true);
    await chrome.press('Escape', 400);
    check(
      'Back closes it, on Home again',
      [await chrome.evaluate('!!document.getElementById("menu-tabs")'), await chrome.focused()],
      [false, 'go'],
    );

    await chrome.press('Enter', 400);
    check(
      'OK on it opens the address field with the on-screen keyboard',
      [await chrome.evaluate('document.activeElement?.id'), await chrome.keyboardShown()],
      ['address', true],
    );
    await chrome.press('Enter', 300); // "a" on the on-screen keyboard
    check(
      'the on-screen keyboard types into it',
      await chrome.evaluate('document.getElementById("address").value'),
      'a',
    );
    await chrome.press('Escape', 200);
    check(
      'Back puts the keyboard away and stays in the field',
      [await chrome.keyboardShown(), await chrome.evaluate('document.activeElement?.id')],
      [false, 'address'],
    );
    await chrome.press('Backspace', 200);
    // The rest of the address is typed as a plugged-in keyboard would.
    await chrome.type(`${site.origin.replace('http://', '')}/home.html`);
    await chrome.press('Enter', 300);
    const page = await app.page(`${site.origin}/home.html`);
    check('typing an address and pressing Enter opens it', !!page, true);
    if (!page) return;
    await until(
      () => page.evaluate('document.visibilityState'),
      (v) => v === 'visible',
    );
    check(
      'the website is in front and Home is put away',
      [await page.evaluate('document.visibilityState'), await chrome.evaluate('document.visibilityState')],
      ['visible', 'hidden'],
    );
    check(
      'the first website of a run says how to get the menu',
      await until(
        () => page.toastText(),
        (t) => !!t,
        60,
      ),
      'For the menu, press Up twice at the top of the page',
    );
    await page.press('ArrowDown');
    check('the arrows drive the page', await page.focused(), 'nav-home');
    await page.press('BrowserHome', 600);
    check(
      "a remote's Home button goes Home",
      [await chrome.evaluate('document.visibilityState'), await chrome.evaluate('!!document.getElementById("resume")')],
      ['visible', true],
    );
    await chrome.press('Escape', 600);
    check(
      'and Back on Home returns to the page, where the highlight was',
      [await page.evaluate('document.visibilityState'), await page.focused()],
      ['visible', 'nav-home'],
    );

    // A remote with no menu key, on a website: Up at the top, then Up again.
    await page.press('ArrowUp', 500);
    check(
      'Up at the top of the page says how to get the menu, and does not open it',
      [await page.toastText(), await chrome.evaluate('!!document.querySelector("#panel h1")')],
      ['Press Up again for the menu', false],
    );
    await page.press('ArrowUp', 600);
    check('Up again opens the menu', await chrome.evaluate('document.querySelector("#panel h1")?.textContent'), 'Menu');
    await chrome.press('Escape', 500);
    check(
      'Back closes it and the highlight is where it was',
      [await chrome.evaluate('!!document.querySelector("#panel h1")'), await page.focused()],
      [false, 'nav-home'],
    );
    check(
      'having opened the menu on a website, it is not said again',
      JSON.parse(readFileSync(join(app.userData, 'tips.json'), 'utf8')),
      { menu: true },
    );

    // The menu.
    await page.press('ContextMenu', 500);
    check(
      'the menu key opens the menu panel beside the page',
      [
        await chrome.evaluate('document.querySelector("#panel h1")?.textContent'),
        await chrome.evaluate('document.visibilityState'),
        await page.evaluate('document.visibilityState'),
      ],
      ['Menu', 'visible', 'visible'],
    );
    check(
      'the highlight starts on Home, not in the address field',
      [await chrome.focused(), await chrome.keyboardShown()],
      ['menu-home', false],
    );
    check(
      'Back is greyed out on the first page',
      await chrome.evaluate('document.getElementById("menu-back").disabled'),
      true,
    );
    await chrome.press('ArrowDown');
    check('down skips what cannot be pressed', await chrome.focused(), 'menu-reload');
    await chrome.press('ArrowDown');
    await chrome.press('ArrowRight');
    await chrome.press('ArrowRight');
    check('the zoom buttons can be reached', await chrome.focused(), 'menu-zoom-in');
    const widthBefore = await page.evaluate('innerWidth');
    await chrome.press('Enter', 500);
    check(
      'Bigger makes the page bigger and the menu stays open',
      [
        (await page.evaluate('innerWidth')) < widthBefore,
        await chrome.evaluate(
          '(document.getElementById("menu-zoom-reset")?.ariaLabel ?? document.getElementById("menu-zoom-reset")?.textContent)',
        ),
        await chrome.focused(),
      ],
      [true, '110%', 'menu-zoom-in'],
    );
    check('the choice is saved for the site', JSON.parse(readFileSync(join(app.userData, 'sites.json'), 'utf8')), {
      '127.0.0.1': { zoom: 1.1 },
    });
    await chrome.press('ArrowLeft');
    await chrome.press('Enter', 500);
    check(
      'pressing the percentage puts it back',
      [
        await page.evaluate('innerWidth'),
        await chrome.evaluate(
          '(document.getElementById("menu-zoom-reset")?.ariaLabel ?? document.getElementById("menu-zoom-reset")?.textContent)',
        ),
      ],
      [widthBefore, '100%'],
    );
    await chrome.press('Escape', 400);
    check(
      'Back closes the menu and the keys return to the page',
      [await chrome.evaluate('document.visibilityState'), await page.evaluate('document.hasFocus()')],
      ['hidden', true],
    );
    await page.press('ArrowDown');
    check('the page is driven again', await page.focused(), 't1');

    // About.
    await page.press('ContextMenu', 500);
    for (let i = 0; i < 20 && (await chrome.focused()) !== 'menu-about'; i++) await chrome.press('ArrowDown');
    await chrome.press('Enter', 400);
    check(
      'About shows the notice',
      (await chrome.evaluate('document.querySelector("#panel p")?.textContent')).includes('not affiliated'),
      true,
    );
    await chrome.press('Escape', 400);

    // A link, then Back, then Back again from the first page.
    await page.evaluate('location.href = "/article.html"; 0');
    const article = await until(
      () => page.evaluate('location.pathname'),
      (p) => p === '/article.html',
    );
    check('a link opens in the same view', article, '/article.html');
    await sleep(500);
    await page.press('Escape', 600);
    check(
      'Back goes back a page',
      await until(
        () => page.evaluate('location.pathname'),
        (p) => p === '/home.html',
      ),
      '/home.html',
    );
    await sleep(700);
    await page.press('Escape', 600);
    check(
      'Back on the first page goes Home',
      [await chrome.evaluate('document.visibilityState'), await chrome.evaluate('!!document.getElementById("home")')],
      ['visible', true],
    );
    check(
      'the site is on Home as a tile, with its title, and has the highlight',
      [
        await chrome.evaluate('document.querySelector("#tiles .site")?.textContent'),
        await chrome.evaluate('document.querySelector("#tiles .title")?.textContent'),
        await chrome.focused(),
      ],
      ['127.0.0.1', 'Longboard fixture: generic streaming home', 'tile-0'],
    );
    check(
      'and is remembered on disk',
      JSON.parse(readFileSync(join(app.userData, 'home.json'), 'utf8')).recents.map((r) => r.url),
      [`${site.origin}/home.html`],
    );

    check(
      "the tile shows the site's own icon, fetched from the site",
      await until(
        () => chrome.evaluate('!!document.querySelector("#tiles img.icon")?.src.startsWith("data:image/png;base64,")'),
        (v) => v === true,
      ),
      true,
    );
    const iconsNow = () => (existsSync(join(app.userData, 'icons')) ? readdirSync(join(app.userData, 'icons')) : []);
    check(
      'the icon is kept under a name that does not say which site',
      iconsNow().map((f) => /^site-[0-9a-f]{16}\.png$/.test(f)),
      [true],
    );

    await chrome.press('Enter', 600);
    check(
      'the tile opens the site again',
      await until(
        () => page.evaluate('document.visibilityState + location.pathname'),
        (v) => v === 'visible/home.html',
      ),
      'visible/home.html',
    );

    // Taking the tile off Home: the menu, opened with the highlight on the tile.
    await sleep(700);
    await page.press('Escape', 600);
    await until(
      () => chrome.focused(),
      (id) => id === 'tile-0',
    );
    await chrome.press('ContextMenu', 500);
    check(
      'the menu opened on a tile offers to remove it',
      await chrome.evaluate(
        '(document.getElementById("menu-remove-tile")?.ariaLabel ?? document.getElementById("menu-remove-tile")?.textContent)',
      ),
      'Remove 127.0.0.1 from Home',
    );
    for (let i = 0; i < 6 && (await chrome.focused()) !== 'menu-remove-tile'; i++) await chrome.press('ArrowDown');
    await chrome.press('Enter', 500);
    check(
      'removing it takes the tile, the saved entry and the icon away',
      [
        await chrome.evaluate('document.querySelectorAll("#tiles .tile").length'),
        await chrome.evaluate('document.getElementById("panel")'),
        JSON.parse(readFileSync(join(app.userData, 'home.json'), 'utf8')).recents,
        iconsNow(),
      ],
      [0, null, [], []],
    );
    await chrome.press('ContextMenu', 500);
    check(
      'with the highlight on nothing that can be removed, the menu does not offer it',
      [(await chrome.focused()) !== null, await chrome.evaluate('document.getElementById("menu-remove-tile")')],
      [true, null],
    );
  });

  await scenario(
    'words typed into the address field are searched for',
    { config: { search: 'https://search.invalid/find?q=%s' } },
    async (app) => {
      const chrome = await app.chrome();
      await until(
        () => chrome.focused(),
        (id) => id === 'go',
      );
      await chrome.press('Enter', 400);
      await chrome.press('Escape', 200); // the on-screen keyboard away; a plugged-in keyboard types
      await chrome.type('two words');
      await chrome.press('Enter', 300);
      // search.invalid can never resolve, so nothing leaves this machine; the notice names what was asked for.
      const notice = await app.view((u) => u.startsWith('data:'));
      const text = notice
        ? await until(
            () => notice.evaluate('document.body?.innerText ?? ""'),
            (t) => /Cannot reach/.test(t),
          )
        : '';
      check(
        'the configured search address is opened with the words',
        [/Cannot reach this site/.test(text), /page failed to load .*: search\.invalid\/find\n/.test(app.log)],
        [true, true],
      );
      check('a search is not put on Home', existsSync(join(app.userData, 'home.json')), false);
      if (notice) {
        await sleep(400);
        await notice.press('Escape', 600);
        check('Back from the notice returns Home', await chrome.evaluate('document.visibilityState'), 'visible');
      }
    },
  );

  await scenario('a start page that automation refuses', { url: `${site.origin}/signed-out` }, async (app) => {
    const notice = await app.view((u) => u.startsWith('data:'));
    check('a blocked start page is replaced by a notice page', !!notice, true);
    if (notice) {
      // The view opens on a "Starting" notice; wait for the one under test.
      const text = await until(
        () => notice.evaluate('document.body?.innerText ?? ""'),
        (t) => t && !t.startsWith('Starting'),
        100,
      );
      check(
        'the notice names the blocked address, the cause and the way out, and no query',
        [
          text.includes('/signup/landing'),
          text.includes('--automation'),
          text.includes('Ctrl+Q'),
          text.includes('SECRET'),
        ],
        [true, true, true, false],
      );
    }
    if (notice) {
      await sleep(400);
      await notice.press('Escape', 600);
      const chrome = await app.chrome();
      check(
        'Back from it goes Home, not to the "Starting" notice',
        await chrome.evaluate('document.visibilityState + !!document.getElementById("home")'),
        'visibletrue',
      );
    }
    check(
      'the blocked start page is logged',
      /blocked navigation \(automation-spend\): http:\/\/127\.0\.0\.1:\d+\/signup\/landing\n/.test(app.log),
      true,
    );
  });
}
