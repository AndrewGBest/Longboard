// The window as a whole: starting up, pages standing still, saved pages, icons, reader view, the parental lock.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, sleep, until } from '../harness.mjs';
import { scenario, site, siteMenu, asks } from './setup.mjs';

/** Runs this file's scenarios, one after another. */
export default async function run() {
  await scenario(
    'opening with the last site',
    {
      config: { startWith: 'last' },
      seed: (data) =>
        writeFileSync(
          join(data, 'home.json'),
          JSON.stringify({ recents: [{ url: `${site.origin}/article.html`, title: 'An article', at: 5 }] }),
        ),
    },
    async (app) => {
      const page = await app.page(`${site.origin}/article.html`);
      // (Covered by Longboard's own screen for the moment it takes to come.)
      check(
        'Longboard starts on the site opened most recently',
        [
          !!page,
          await until(
            () => page?.evaluate('document.visibilityState'),
            (v) => v === 'visible',
            40,
            100,
          ).catch(() => 'still hidden'),
        ],
        [true, 'visible'],
      );
    },
  );

  await scenario(
    'a page that is not in front stands still',
    { url: `${site.origin}/video.html`, args: ['--autoplay-policy=no-user-gesture-required'] },
    async (app) => {
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
      check(
        'Back on the first page goes Home',
        await until(
          () => chrome.evaluate('document.visibilityState'),
          (v) => v === 'visible',
        ),
        'visible',
      );
      check(
        'and a moment later everything on the page behind has stopped: the video, the sound',
        await until(playing, (p) => p[0] && p[1], 40),
        [true, true],
      );
      const ticks = await page.evaluate('__ticks');
      await sleep(700);
      check('and its clocks', await page.evaluate('__ticks'), ticks);
      await chrome.press('ContextMenu', 500);
      for (let i = 0; i < 6 && (await chrome.focused()) !== 'menu-resume'; i++) await chrome.press('ArrowDown');
      await chrome.press('Enter', 600);
      await sleep(700);
      check(
        'back in front the page runs again and can be seen, and playing waits for the person',
        [await page.evaluate('document.visibilityState'), (await page.evaluate('__ticks')) > ticks, await playing()],
        ['visible', true, [true, true]],
      );
      await page.press('ArrowDown');
      check('and it is driven as before', (await page.focused()) !== null, true);
    },
  );

  await scenario(
    'saved pages, suggestions, finding words, and a private tab',
    { url: `${site.origin}/article.html` },
    async (app) => {
      const page = await app.page(`${site.origin}/article.html`);
      const chrome = await app.chrome();
      const home = () => JSON.parse(readFileSync(join(app.userData, 'home.json'), 'utf8'));
      const reach = async (id, key = 'ArrowDown') => {
        for (let i = 0; i < 24 && (await chrome.focused()) !== id; i++) await chrome.press(key);
        return chrome.focused();
      };
      await sleep(900);
      check(
        'sound a page starts by itself plays, as Longboard ships',
        await page.evaluate('new Audio("/quiet.wav").play().then(() => "played", (e) => e.name)'),
        'played',
      );
      check(
        'a page sent privately, or from this machine, gets no warning',
        (await page.press('ContextMenu', 500), await chrome.evaluate('document.getElementById("not-secure")')),
        null,
      );

      // Keeping the page on Home.
      await siteMenu(chrome);
      await reach('menu-save');
      await chrome.press('Enter', 500);
      check(
        '"Keep this page on Home" keeps it, and says so',
        [home().saved, await chrome.toastText()],
        [
          [{ url: `${site.origin}/article.html`, title: 'Longboard fixture: long article' }],
          'This page is kept on Home',
        ],
      );
      check(
        'and the menu then offers to take it off',
        await chrome.evaluate(
          '(document.getElementById("menu-unsave")?.ariaLabel ?? document.getElementById("menu-unsave")?.textContent)',
        ),
        'Take this page off Home',
      );

      // Finding words.
      await reach('menu-find');
      await chrome.press('Enter', 500);
      check(
        '"Find words on this page" opens a field and two buttons',
        [
          await chrome.evaluate('document.querySelector("#panel h1")?.textContent'),
          await chrome.evaluate('!!document.getElementById("find-text")'),
        ],
        ['Find on this page', true],
      );
      await reach('find-text', 'ArrowUp');
      await chrome.press('Enter', 400);
      await chrome.press('Escape', 200);
      await chrome.type('link');
      await chrome.press('Enter', 700);
      const first = await until(
        () => chrome.toastText(),
        (t) => /^\d+ of \d+$/.test(t ?? ''),
        40,
      );
      check(
        'typing words and pressing Enter finds them and says how many there are',
        [/^1 of [2-9]\d*$/.test(first ?? ''), await chrome.focused()],
        [true, 'find-next'],
      );
      await chrome.press('Enter', 700);
      check(
        'Next goes to the next place',
        /^2 of /.test(
          (await until(
            () => chrome.toastText(),
            (t) => /^2 of /.test(t ?? ''),
            40,
          )) ?? '',
        ),
        true,
      );
      await chrome.press('Escape', 500);

      // Home: the saved page, and suggestions under the address field.
      await sleep(600);
      await page.press('Escape', 700);
      await until(
        () => chrome.evaluate('document.visibilityState'),
        (v) => v === 'visible',
      );
      check(
        'Home has a Saved pages section with the page in it',
        [await chrome.evaluate('document.querySelector("#saved .site")?.textContent'), await chrome.focused()],
        ['Longboard fixture: long article', 'saved-0'],
      );
      await reach('go', 'ArrowUp');
      await chrome.press('Enter', 400);
      await chrome.press('Escape', 200);
      await chrome.type('long art');
      const offered = await until(
        () =>
          chrome.evaluate(
            '[...document.querySelectorAll("#suggestions button")].map((b) => b.ariaLabel ?? b.textContent)',
          ),
        (l) => l.length > 0,
        40,
      );
      check('typing in the address field offers places already known that match', offered, [
        'Longboard fixture: long article (127.0.0.1)',
      ]);
      await chrome.press('ArrowDown');
      check(
        'down from the field goes to the suggestion, and the field stays',
        [await chrome.focused(), await chrome.evaluate('document.getElementById("address")?.value')],
        ['suggest-0', 'long art'],
      );
      await chrome.press('Enter', 700);
      check(
        'pressing it opens that page',
        await until(
          () => page.evaluate('document.visibilityState + location.pathname'),
          (v) => v === 'visible/article.html',
        ),
        'visible/article.html',
      );

      // A private tab.
      await page.evaluate('document.cookie = "who=shared; path=/"; 0');
      await sleep(500);
      await page.press('ContextMenu', 500);
      await reach('menu-tabs');
      await chrome.press('Enter', 500);
      await chrome.press('ArrowRight');
      check('Tabs offers a private tab beside a new one', await chrome.focused(), 'tab-private');
      await chrome.press('Enter', 600);
      check(
        'a private tab starts on Home and says what it is',
        [
          await chrome.evaluate('document.getElementById("private-badge")?.textContent'),
          (
            await chrome.evaluate(
              '(document.getElementById("private")?.ariaLabel ?? document.getElementById("private")?.textContent) ?? ""',
            )
          ).startsWith('Nothing opened in this tab is kept'),
        ],
        ['Private tab', true],
      );
      const before = {
        visits: JSON.parse(readFileSync(join(app.userData, 'history.json'), 'utf8')).visits.length,
        recents: home().recents.length,
      };
      await reach('go', 'ArrowUp');
      await chrome.press('Enter', 400);
      await chrome.press('Escape', 200);
      await chrome.type(`${site.origin.replace('http://', '')}/form.html`);
      await chrome.press('Enter', 500);
      const priv = await app.page(`${site.origin}/form.html`);
      check('an address opens in it', !!priv, true);
      if (!priv) return;
      await until(
        () => priv.evaluate('document.readyState'),
        (v) => v === 'complete',
      );
      await sleep(500);
      check("it does not see what the other tabs' sites stored", await priv.evaluate('document.cookie'), '');
      await priv.evaluate('document.cookie = "who=private; path=/"; 0');
      check(
        'and nothing opened in it is written down: no history, no recent site',
        [JSON.parse(readFileSync(join(app.userData, 'history.json'), 'utf8')).visits.length, home().recents.length],
        [before.visits, before.recents],
      );
      await priv.press('ContextMenu', 500);
      await reach('menu-tabs');
      await chrome.press('Enter', 500);
      const tabs = await chrome.evaluate(
        '[...document.querySelectorAll("#panel button[id^=tab-]")].map((b) => b.ariaLabel ?? b.textContent)',
      );
      check('the list of tabs marks it as private', tabs.filter((t) => t.includes('Private: ')).length, 2);
      await reach('tab-1');
      await chrome.press('ArrowRight');
      await chrome.press('Enter', 700);
      check(
        'closing it leaves the other tab with what it had, and nothing from the private one',
        [await page.evaluate('document.cookie'), await page.evaluate('document.visibilityState')],
        ['who=shared', 'visible'],
      );
    },
  );

  await scenario(
    "a site's own icon for its tile: the big one its manifest lists",
    { url: `${site.origin}/pwa.html` },
    async (app) => {
      const page = await app.page(`${site.origin}/pwa.html`);
      const chrome = await app.chrome();
      const reach = async (id, key = 'ArrowDown') => {
        for (let i = 0; i < 24 && (await chrome.focused()) !== id; i++) await chrome.press(key);
        return chrome.focused();
      };
      const icons = () =>
        existsSync(join(app.userData, 'icons')) ? readdirSync(join(app.userData, 'icons')).sort() : [];
      const width = (file) => readFileSync(join(app.userData, 'icons', file)).readUInt32BE(16);
      await sleep(1000);
      await page.press('ContextMenu', 500);
      await siteMenu(chrome);
      await reach('menu-save');
      await chrome.press('Enter', 500);
      const first = await until(icons, (l) => l.length === 1, 60);
      check(
        'a page kept on Home gets its icon from the site',
        [first.length, first[0]?.startsWith('site-')],
        [1, true],
      );
      await chrome.press('Escape', 300);
      await chrome.press('Escape', 500);
      check(
        'the icon fetched is the big one the manifest lists, not the small one in the page or the one made for cutting to a shape',
        [asks.bigIcon > 0, asks.maskIcon, width(first[0])],
        [true, 0, 128],
      );
      // Added as an app, the app's tile gets the same.
      await page.press('ContextMenu', 500);
      await reach('menu-add-app');
      await chrome.press('Enter', 500);
      await reach('app-add');
      await chrome.press('Enter', 500);
      const both = await until(icons, (l) => l.length === 2, 60);
      check(
        'a site added as an app gets its icon too',
        both.some((f) => !f.startsWith('site-')),
        true,
      );
      await sleep(600);
      await page.press('Escape', 700);
      await until(
        () => chrome.evaluate('document.visibilityState'),
        (v) => v === 'visible',
      );
      check(
        'and Home draws the tile with it',
        await until(
          () => chrome.evaluate('!!document.querySelector("#apps img.icon")'),
          (v) => v === true,
          30,
        ),
        true,
      );
    },
  );

  await scenario(
    'a desktop site, the reader view, and asking not to be tracked',
    { url: `${site.origin}/article.html` },
    async (app) => {
      const page = await app.page(`${site.origin}/article.html`);
      const chrome = await app.chrome();
      const reach = async (id, key = 'ArrowDown') => {
        for (let i = 0; i < 30 && (await chrome.focused()) !== id; i++) await chrome.press(key);
        return chrome.focused();
      };
      const sent = async () => {
        const h = await page.evaluate(
          'fetch("/headers").then((r) => r.json()).then((h) => JSON.stringify([h.dnt ?? null, h["sec-gpc"] ?? null, h["user-agent"]]))',
        );
        return JSON.parse(h);
      };
      await sleep(900);
      const usual = { width: await page.evaluate('innerWidth'), agent: await page.evaluate('navigator.userAgent') };
      check('nothing is added to what a site is sent, as Longboard ships', (await sent()).slice(0, 2), [null, null]);

      // Desktop site.
      await page.press('ContextMenu', 500);
      await siteMenu(chrome);
      check(
        'the site menu offers a desktop site',
        [
          await reach('menu-desktop'),
          await chrome.evaluate(
            '(document.getElementById("menu-desktop")?.ariaLabel ?? document.getElementById("menu-desktop")?.textContent)',
          ),
        ],
        ['menu-desktop', 'Desktop site: off'],
      );
      await chrome.press('Enter', 600);
      const wide = await until(
        () => page.evaluate('innerWidth'),
        (w) => w !== usual.width,
        30,
      );
      check(
        'turned on, the site gets the width of a desk screen',
        [
          wide > usual.width,
          wide >= 1270,
          await chrome.evaluate(
            '(document.getElementById("menu-desktop")?.ariaLabel ?? document.getElementById("menu-desktop")?.textContent)',
          ),
        ],
        [true, true, 'Desktop site: on'],
      );
      check(
        'and Longboard says it is who it said it was',
        [
          await page.evaluate('navigator.userAgent'),
          JSON.parse(readFileSync(join(app.userData, 'sites.json'), 'utf8'))['127.0.0.1'],
        ],
        [usual.agent, { desktop: true }],
      );
      await chrome.press('Enter', 600);
      check(
        'turned off, the site is as it was',
        await until(
          () => page.evaluate('innerWidth'),
          (w) => w === usual.width,
          30,
        ),
        usual.width,
      );

      // Reader view.
      const before = await page.evaluate('document.body.innerHTML.length');
      await reach('menu-reader');
      await chrome.press('Enter', 900);
      const shown = await until(
        () => chrome.evaluate('document.querySelector("#reader-text h1")?.textContent ?? null'),
        (t) => t !== null,
        30,
      );
      check('reader view shows the article under its headline', shown, 'A long page with little to press');
      const read = await chrome.evaluate(
        '[...document.querySelectorAll("#reader-text > p:not(.where)")].map((p) => p.ariaLabel ?? p.textContent)',
      );
      check(
        'with its paragraphs, and without the links around it',
        [read[0]?.startsWith('This paragraph is filler.'), read.length > 3, read.join(' ').includes('Front page')],
        [true, true, false],
      );
      check(
        'it fills the screen, starting on Close',
        [await chrome.evaluate('innerWidth > 1000 || innerWidth === screen.width'), await chrome.focused()],
        [true, 'reader-close'],
      );
      const size = () => chrome.evaluate('getComputedStyle(document.getElementById("reader-text")).fontSize');
      const small = await size();
      await chrome.press('ArrowRight');
      await chrome.press('ArrowRight');
      await chrome.press('Enter', 300);
      check(
        '"Bigger words" makes the words bigger',
        [await chrome.focused(), parseFloat(await size()) > parseFloat(small)],
        ['reader-bigger', true],
      );
      await chrome.press('ArrowDown', 700);
      check(
        'Down moves through the words',
        await until(
          () => chrome.evaluate('document.getElementById("panel").scrollTop > 0'),
          (v) => v === true,
          20,
        ),
        true,
      );
      await chrome.press('Escape', 600);
      check(
        'Back closes it, and the page was not changed',
        [
          await chrome.evaluate('document.getElementById("reader-text")'),
          await page.evaluate('document.body.innerHTML.length'),
        ],
        [null, before],
      );
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
      check(
        'Settings has "ask sites not to track", and turning it on says so',
        [
          await chrome.evaluate(
            '(document.getElementById("set-dnt")?.ariaLabel ?? document.getElementById("set-dnt")?.textContent)',
          ),
          JSON.parse(readFileSync(join(app.userData, 'config.json'), 'utf8')).doNotTrack,
        ],
        ['Ask sites not to track you or sell your data: yes', true],
      );
      const signalled = await sent();
      check('then every request carries the two signals, and Longboard still says who it is', signalled, [
        '1',
        '1',
        usual.agent,
      ]);
      await chrome.press('Enter', 500);
      check('turned off, they are no longer sent', (await sent()).slice(0, 2), [null, null]);
    },
  );

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
    const lockFile = () =>
      existsSync(join(app.userData, 'lock.json')) ? readFileSync(join(app.userData, 'lock.json'), 'utf8') : null;
    await sleep(900);
    await page.press('ContextMenu', 500);
    await reach('menu-settings');
    await chrome.press('Enter', 500);
    check('with no PIN, Settings opens without one', await title(), 'Settings');
    await reach('settings-lock');
    await chrome.press('Enter', 400);
    await reach('lock-set');
    await chrome.press('Enter', 500);
    check(
      '"Set a PIN" asks for four digits, starting on 1',
      [await title(), await asked(), await chrome.focused()],
      ['PIN', 'Choose a PIN: four digits', 'pin-1'],
    );
    await four();
    check(
      'then for the same again',
      [
        await asked(),
        await chrome.evaluate(
          '(document.getElementById("pin-dots")?.ariaLabel ?? document.getElementById("pin-dots")?.textContent)',
        ),
      ],
      ['Enter the same PIN again', '0 of 4 digits entered'],
    );
    await chrome.press('ArrowRight');
    await four();
    check(
      'a different second entry starts over',
      [await asked(), await chrome.toastText(), lockFile()],
      ['Choose a PIN: four digits', 'Those two were not the same. Choose again', null],
    );
    await reach('pin-1', 'ArrowLeft');
    await four();
    await four();
    const kept = lockFile();
    check(
      'the same twice sets it, and the PIN itself is not what is kept',
      [
        await chrome.toastText(),
        await title(),
        kept !== null && !kept.includes('1111'),
        Object.keys(JSON.parse(kept ?? '{}')).sort(),
      ],
      ['The PIN is set', 'Parental lock', true, ['hash', 'homeOnly', 'salt']],
    );
    await reach('lock-home-only');
    await chrome.press('Enter', 400);
    check(
      '"only the sites on Home" can be turned on',
      [
        await chrome.evaluate(
          '(document.getElementById("lock-home-only")?.ariaLabel ?? document.getElementById("lock-home-only")?.textContent)',
        ),
        JSON.parse(lockFile()).homeOnly,
      ],
      ['Only the sites on Home open without the PIN: yes', true],
    );
    await chrome.press('Escape', 300);
    await chrome.press('Escape', 500);

    // Nothing is on Home, so the page that was open gives way, and no other opens.
    const locked = () => page.evaluate('document.title + "|" + document.querySelector("h1")?.textContent');
    check(
      'then a page that is not on Home gives way to a notice saying so',
      await until(locked, (t) => t.startsWith('Longboard: page blocked'), 30),
      'Longboard: page blocked|This page was blocked',
    );
    await page.press('ContextMenu', 500);
    await reach('menu-address', 'ArrowUp');
    await chrome.press('Enter', 400);
    await chrome.press('Escape', 200);
    await chrome.type(`${site.origin.replace('http://', '')}/article.html`);
    await chrome.press('Enter', 600);
    check(
      'opening a site that is not on Home asks for the PIN',
      [await title(), ((await asked()) ?? '').endsWith('is not on Home. Enter the PIN to unlock every site')],
      ['PIN', true],
    );
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
    check(
      'the menu offers to unlock every site',
      [
        await reach('menu-lock'),
        await chrome.evaluate(
          '(document.getElementById("menu-lock")?.ariaLabel ?? document.getElementById("menu-lock")?.textContent)',
        ),
      ],
      ['menu-lock', 'Unlock every site (PIN)'],
    );
    await chrome.press('Enter', 500);
    await four();
    check('the right PIN unlocks', ((await page.toastText()) ?? '').startsWith('Unlocked until you lock again'), true);
    await page.evaluate(`location.href = "${site.origin}/article.html"; 0`);
    check(
      'and then any site opens',
      await until(
        () => page.evaluate('location.pathname'),
        (v) => v === '/article.html',
        30,
      ),
      '/article.html',
    );
    await sleep(600);
    await page.press('ContextMenu', 500);
    await reach('menu-lock');
    check(
      'until "Lock again" is pressed',
      await chrome.evaluate(
        '(document.getElementById("menu-lock")?.ariaLabel ?? document.getElementById("menu-lock")?.textContent)',
      ),
      'Lock again: only the sites on Home',
    );
    await chrome.press('Enter', 700);
    check(
      'after which the page gives way again, and Back leads nowhere',
      [await until(locked, (t) => t.startsWith('Longboard: page blocked'), 30), await page.evaluate('history.length')],
      ['Longboard: page blocked|This page was blocked', 1],
    );
    await page.press('ContextMenu', 500);
    await reach('menu-settings');
    await chrome.press('Enter', 500);
    await four();
    check('the right PIN opens Settings', await title(), 'Settings');
  });
}
