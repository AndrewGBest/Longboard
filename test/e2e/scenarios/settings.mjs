// Settings, tabs and history.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, sleep, until } from '../harness.mjs';
import { scenario, site, mapHost, port } from './setup.mjs';

/** Runs this file's scenarios, one after another. */
export default async function run() {
  await scenario(
    'settings that change how sites are shown',
    { url: `${site.origin}/video.html`, config: { theme: 'dark', httpsOnly: true, autoplay: false }, args: [mapHost] },
    async (app) => {
      const page = await app.page(site.origin);
      await sleep(1200);
      check(
        'sites are asked for their dark look when Settings says so',
        await page.evaluate('matchMedia("(prefers-color-scheme: dark)").matches'),
        true,
      );
      check(
        'sound and video do not start by themselves when Settings says not to',
        await page.evaluate('new Audio("/quiet.wav").play().then(() => "played", (e) => e.name)'),
        'NotAllowedError',
      );
      await page.evaluate(`location.href = "http://profile.test:${port}/home.html"; 0`);
      await sleep(900);
      check(
        'with "only pages sent privately" on, a plain http page is not opened, and says why',
        [await page.evaluate('location.host'), await page.toastText()],
        [
          new URL(site.origin).host,
          'Not opened: that page is not sent privately (http). Settings can allow such pages',
        ],
      );
    },
  );

  await scenario('tabs', { url: `${site.origin}/home.html` }, async (app) => {
    const first = await app.page(`${site.origin}/home.html`);
    const chrome = await app.chrome();
    const names = () =>
      chrome.evaluate(
        '[...document.querySelectorAll("#panel button[id^=tab-]")].map((b) => b.id + "=" + (b.ariaLabel ?? b.textContent))',
      );
    const openTabs = async (from) => {
      await from.press('ContextMenu', 500);
      for (let i = 0; i < 24 && (await chrome.focused()) !== 'menu-tabs'; i++) await chrome.press('ArrowDown');
      await chrome.press('Enter', 500);
    };
    await sleep(800);
    await first.press('ArrowDown');
    await openTabs(first);
    check('the menu has Tabs, which starts with the one page that is open', await names(), [
      'tab-new=New tab',
      'tab-private=New private tab',
      'tab-0=Longboard fixture: generic streaming home (127.0.0.1): in front now',
    ]);
    for (let i = 0; i < 4 && (await chrome.focused()) !== 'tab-new'; i++) await chrome.press('ArrowUp');
    await chrome.press('Enter', 600);
    check(
      'a new tab starts on Home, with the first page still there behind it',
      [
        await chrome.evaluate('!!document.getElementById("home")'),
        await chrome.focused(),
        await first.evaluate('document.visibilityState + location.pathname'),
      ],
      [true, 'go', 'hidden/home.html'],
    );
    await chrome.press('Enter', 400);
    await chrome.press('Escape', 200);
    await chrome.type(`${site.origin.replace('http://', '')}/article.html`);
    await chrome.press('Enter', 400);
    const second = await app.page(`${site.origin}/article.html`);
    check('an address typed there opens in the new tab', !!second, true);
    if (!second) return;
    await until(
      () => second.evaluate('document.visibilityState'),
      (v) => v === 'visible',
    );
    check(
      'and the first tab keeps its page, out of sight, with the highlight where it was',
      [await first.evaluate('location.pathname + document.visibilityState'), await first.focused()],
      ['/home.htmlhidden', 'nav-home'],
    );

    await sleep(500);
    await openTabs(second);
    check(
      'Tabs lists both, and says which is in front',
      (await names()).map((n) => n.replace(/=.*\((127[^)]*)\)/, '=($1)')),
      [
        'tab-new=New tab',
        'tab-private=New private tab',
        'tab-0=(127.0.0.1)',
        'tab-close-0=(127.0.0.1)',
        'tab-1=(127.0.0.1): in front now',
        'tab-close-1=(127.0.0.1)',
      ],
    );
    for (let i = 0; i < 8 && (await chrome.focused()) !== 'tab-0'; i++) await chrome.press('ArrowDown');
    await chrome.press('Enter', 600);
    check(
      'pressing a tab brings it in front',
      [await first.evaluate('document.visibilityState'), await second.evaluate('document.visibilityState')],
      ['visible', 'hidden'],
    );
    await first.press('ArrowDown');
    check('and it is driven as before', (await first.focused()) !== null, true);

    await openTabs(first);
    for (let i = 0; i < 8 && (await chrome.focused()) !== 'tab-1'; i++) await chrome.press('ArrowDown');
    await chrome.press('ArrowRight');
    await chrome.press('Enter', 600);
    check(
      'a tab can be closed from the list, which leaves the other where it was',
      [await names(), await first.evaluate('location.pathname')],
      [
        [
          'tab-new=New tab',
          'tab-private=New private tab',
          'tab-0=Longboard fixture: generic streaming home (127.0.0.1): in front now',
          'tab-reopen=Open the tab closed last',
        ],
        '/home.html',
      ],
    );
    check(
      'the closed tab is gone, not hidden',
      await second.evaluate('1').then(
        () => 'still there',
        () => 'gone',
      ),
      'gone',
    );
  });

  // Tabs from the last run are written in tabs.json. Here the file is put
  // there beforehand, as a run that ended with two tabs open would have left it.
  const keptTabs = (data) =>
    writeFileSync(
      join(data, 'tabs.json'),
      JSON.stringify({
        tabs: [
          { url: `${site.origin}/article.html`, title: 'Kept one' },
          { url: `${site.origin}/results.html`, title: 'Kept two' },
          { url: 'file:///etc/hostname', title: 'Not a web page' },
        ],
      }),
    );
  await scenario('tabs kept from the last time', { url: `${site.origin}/home.html`, seed: keptTabs }, async (app) => {
    const first = await app.page(`${site.origin}/home.html`);
    const chrome = await app.chrome();
    const names = () =>
      chrome.evaluate(
        '[...document.querySelectorAll("#panel button[id^=tab-]")].map((b) => b.id + "=" + (b.ariaLabel ?? b.textContent))',
      );
    await sleep(800);
    await first.press('ArrowDown');
    await first.press('ContextMenu', 500);
    for (let i = 0; i < 24 && (await chrome.focused()) !== 'menu-tabs'; i++) await chrome.press('ArrowDown');
    await chrome.press('Enter', 500);
    check('the tabs open last time are offered again, behind the page Longboard started with', await names(), [
      'tab-new=New tab',
      'tab-private=New private tab',
      'tab-0=Longboard fixture: generic streaming home (127.0.0.1): in front now',
      'tab-close-0=Close: Longboard fixture: generic streaming home (127.0.0.1)',
      'tab-1=Kept one (127.0.0.1)',
      'tab-close-1=Close: Kept one (127.0.0.1)',
      'tab-2=Kept two (127.0.0.1)',
      'tab-close-2=Close: Kept two (127.0.0.1)',
    ]);
    check('none of them has been loaded yet', await app.page(`${site.origin}/article.html`, 3), null);
    for (let i = 0; i < 8 && (await chrome.focused()) !== 'tab-1'; i++) await chrome.press('ArrowDown');
    await chrome.press('Enter', 600);
    const kept = await app.page(`${site.origin}/article.html`);
    check('choosing one loads it and puts it in front', !!kept, true);
    if (!kept) return;
    await until(
      () => kept.evaluate('document.visibilityState'),
      (v) => v === 'visible',
    );
    check(
      'with the first page still there behind it, and the other kept tab still not loaded',
      [await first.evaluate('document.visibilityState'), await app.page(`${site.origin}/results.html`, 3)],
      ['hidden', null],
    );
    const file = join(app.userData, 'tabs.json');
    const written = await until(
      () => JSON.parse(readFileSync(file, 'utf8')).tabs.map((t) => new URL(t.url).pathname),
      (paths) => paths.length === 3 && paths[1] === '/article.html',
      40,
    );
    check('what is open is written down again for next time, in order', written, [
      '/home.html',
      '/article.html',
      '/results.html',
    ]);
  });

  await scenario(
    'no tabs are kept when that is switched off',
    { url: `${site.origin}/home.html`, config: { keepTabs: false }, seed: keptTabs },
    async (app) => {
      const first = await app.page(`${site.origin}/home.html`);
      const chrome = await app.chrome();
      await sleep(800);
      await first.press('ArrowDown');
      await first.press('ContextMenu', 500);
      for (let i = 0; i < 24 && (await chrome.focused()) !== 'menu-tabs'; i++) await chrome.press('ArrowDown');
      await chrome.press('Enter', 500);
      check(
        'only the page Longboard started with is there, and the file from last time is gone',
        [
          await chrome.evaluate('document.querySelectorAll("#panel button[id^=tab-]").length'),
          existsSync(join(app.userData, 'tabs.json')),
        ],
        [3, false],
      );
    },
  );

  await scenario('history', { url: `${site.origin}/home.html` }, async (app) => {
    const page = await app.page(site.origin);
    const chrome = await app.chrome();
    const saved = () =>
      JSON.parse(readFileSync(join(app.userData, 'history.json'), 'utf8')).visits.map((v) => new URL(v.url).pathname);
    await sleep(800);
    await page.evaluate('location.href = "/article.html"; 0');
    await until(
      () => page.evaluate('location.pathname + document.readyState'),
      (v) => v === '/article.htmlcomplete',
    );
    // The file is written a moment after the page arrives; a slow machine takes longer, so wait for what is expected.
    const savedAs = (want) =>
      until(
        () => {
          try {
            return saved();
          } catch {
            return [];
          }
        },
        (v) => v.join() === want.join(),
        40,
      );
    check('each page opened is kept, newest first, on this machine', await savedAs(['/article.html', '/home.html']), [
      '/article.html',
      '/home.html',
    ]);
    await page.press('ContextMenu', 500);
    for (let i = 0; i < 24 && (await chrome.focused()) !== 'menu-tabs'; i++) await chrome.press('ArrowDown');
    await chrome.press('ArrowRight');
    await chrome.press('Enter', 500);
    const lines = await chrome.evaluate(
      '[...document.querySelectorAll("#panel button.row[id^=visit-]")].map((b) => b.ariaLabel ?? b.textContent)',
    );
    check(
      'the menu has History, which lists them with their titles and when',
      [lines.length, /\(127\.0\.0\.1\), today$/.test(lines[0] ?? ''), lines[1]],
      [2, true, 'Longboard fixture: generic streaming home (127.0.0.1), today'],
    );
    await chrome.press('ArrowDown');
    await chrome.press('Enter', 600);
    check(
      'pressing one opens it',
      await until(
        () => page.evaluate('location.pathname'),
        (p) => p === '/home.html',
      ),
      '/home.html',
    );
    check('and it moves to the front', await savedAs(['/home.html', '/article.html']), ['/home.html', '/article.html']);
  });

  await scenario(
    'no history when it is turned off, and a language for sites',
    { url: `${site.origin}/home.html`, config: { history: false, language: 'fr' } },
    async (app) => {
      const page = await app.page(site.origin);
      await sleep(1000);
      check('with history off nothing is written down', existsSync(join(app.userData, 'history.json')), false);
      check(
        'sites are asked for the language chosen in Settings',
        await page.evaluate('[navigator.language, navigator.languages[0]]'),
        ['fr', 'fr'],
      );
    },
  );

  await scenario(
    'Settings',
    { seed: (data) => mkdirSync(join(data, 'downloads', 'films'), { recursive: true }) },
    async (app) => {
      const chrome = await app.chrome();
      const file = () => JSON.parse(readFileSync(join(app.userData, 'config.json'), 'utf8'));
      const text = (id) =>
        chrome.evaluate(
          `document.getElementById(${JSON.stringify(id)})?.ariaLabel ?? document.getElementById(${JSON.stringify(id)})?.textContent ?? null`,
        );
      const title = () => chrome.evaluate('document.querySelector("#panel h1")?.textContent ?? null');
      const reach = async (id) => {
        for (let i = 0; i < 24 && (await chrome.focused()) !== id; i++) await chrome.press('ArrowDown');
        return chrome.focused();
      };
      const open = async (id) => {
        await reach(id);
        await chrome.press('Enter', 400);
      };
      await until(
        () => chrome.focused(),
        (id) => id === 'go',
      );
      await chrome.press('ContextMenu', 500);
      await open('menu-settings');
      check(
        'the menu opens Settings on its first page',
        [await title(), await chrome.focused()],
        ['Settings', 'settings-general'],
      );

      await chrome.press('Enter', 400);
      check('a page of Settings opens', [await title(), await chrome.focused()], ['Search and starting', 'set-search']);
      await chrome.press('Enter', 400);
      check(
        'the search setting opens a list of search sites to choose from',
        [
          await title(),
          await chrome.evaluate(
            '[...document.querySelectorAll("#panel button[id^=pick-]")].map((b) => b.ariaLabel ?? b.textContent)',
          ),
        ],
        ['Search with', ['Google', 'DuckDuckGo', 'Bing', 'Brave Search', 'Cancel']],
      );
      await open('pick-1');
      check(
        'choosing one goes back, shows it, and keeps it in config.json',
        [await title(), await text('set-search'), file().search],
        ['Search and starting', 'Search with: DuckDuckGo', 'https://duckduckgo.com/?q=%s'],
      );
      await chrome.press('ArrowUp');
      check('a list goes round: up from the top is the bottom', await chrome.focused(), 'settings-back');
      await chrome.press('ArrowDown');
      check('and down from the bottom is the top', await chrome.focused(), 'set-search');
      await open('set-start');
      check(
        'opening with the last site can be chosen',
        [await text('set-start'), file().startWith],
        ['Open with: the last site', 'last'],
      );
      await chrome.press('Escape', 400);
      check('Back goes up to the first page, not out of Settings', await title(), 'Settings');

      await open('settings-display');
      await chrome.press('ArrowRight');
      await chrome.press('ArrowRight');
      check('the size buttons can be reached', await chrome.focused(), 'set-size-up');
      await chrome.press('Enter', 400);
      check(
        'Bigger makes everything bigger, for every site',
        [await text('set-size-reset'), file().pageSize],
        ['110%', 1.1],
      );
      await open('set-decode');
      check(
        'video decoding on the graphics chip can be asked for',
        [await text('set-decode'), file().hardwareDecode],
        ['Decode video on the graphics chip: yes', true],
      );
      await chrome.press('Escape', 400);

      await open('settings-ads');
      check(
        'ad blocking starts as a switch for each site',
        await text('set-ads'),
        'Ad blocking: each site has its own switch',
      );
      await chrome.press('Enter', 400);
      check(
        'pressing it lists the three ways, each with what it means, and marks the one in use',
        [
          await chrome.evaluate(
            '[...document.querySelectorAll("#panel button[id^=pick-]")].map((b) => b.ariaLabel ?? b.textContent)',
          ),
          (
            await chrome.evaluate(
              '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)',
            )
          ).includes('A site you switch off yourself from the menu stays off.'),
        ],
        [['Each site has its own switch (in use)', 'On for every site', 'Off for every site', 'Cancel'], true],
      );
      await open('pick-1');
      check(
        'it can be turned on for every site',
        [await text('set-ads'), file().adBlocking],
        ['Ad blocking: on for every site', 'everywhere'],
      );
      await chrome.press('Enter', 400);
      await open('pick-2');
      check(
        'or off for every site',
        [await text('set-ads'), file().adBlocking],
        ['Ad blocking: off for every site', 'off'],
      );
      await chrome.press('Enter', 400);
      await chrome.press('Escape', 400);
      check('Back on the list changes nothing', [await title(), file().adBlocking], ['Ad blocking', 'off']);
      await chrome.press('Enter', 400);
      await open('pick-0');
      check(
        "or back to each site's own switch, which is not written down as a choice",
        [await text('set-ads'), 'adBlocking' in file()],
        ['Ad blocking: each site has its own switch', false],
      );
      check(
        'the filter list is said to be what it is and where it comes from',
        (
          await chrome.evaluate(
            '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)',
          )
        ).includes('Filter list: EasyList, not downloaded yet. Downloaded from easylist.to every four days.'),
        true,
      );

      await open('set-ads-list');
      const entries = () =>
        chrome.evaluate(
          '[...document.querySelectorAll("#panel button[id^=starts-off-]")].map((b) => b.ariaLabel ?? b.textContent)',
        );
      check('the list of sites where it starts off shows the reviewed sites', await entries(), [
        'primevideo.com (reviewed list: press to take off)',
        'tv.apple.com (reviewed list: press to take off)',
        'youtube.com (reviewed list: press to take off)',
      ]);
      await open('starts-off-2');
      check(
        'pressing a reviewed site takes it off, and says whose doing that was',
        [await entries(), file().adBlockingStartsOn],
        [
          [
            'primevideo.com (reviewed list: press to take off)',
            'tv.apple.com (reviewed list: press to take off)',
            'youtube.com (taken off by you: press to put back)',
          ],
          ['youtube.com'],
        ],
      );
      await chrome.press('Enter', 400);
      check(
        'pressing it again puts it back',
        [(await entries())[2], 'adBlockingStartsOn' in file()],
        ['youtube.com (reviewed list: press to take off)', false],
      );
      for (let i = 0; i < 6 && (await chrome.focused()) !== 'starts-off-add'; i++) await chrome.press('ArrowUp');
      await chrome.press('Enter', 400);
      check(
        'OK on the field brings the keyboard up',
        [await chrome.evaluate('document.activeElement?.id'), await chrome.keyboardShown()],
        ['starts-off-add', true],
      );
      await chrome.press('Escape', 200);
      await chrome.type('https://WWW.Example.org/some/page');
      await chrome.press('Enter', 500);
      check(
        'a site typed as a person would type it is added to the list',
        [await entries(), file().adBlockingStartsOff],
        [
          [
            'example.org (added by you: press to remove)',
            'primevideo.com (reviewed list: press to take off)',
            'tv.apple.com (reviewed list: press to take off)',
            'youtube.com (reviewed list: press to take off)',
          ],
          ['example.org'],
        ],
      );
      await open('starts-off-0');
      check(
        'and pressing it removes it again',
        [(await entries()).length, 'adBlockingStartsOff' in file()],
        [3, false],
      );
      for (let i = 0; i < 6 && (await chrome.focused()) !== 'starts-off-add'; i++) await chrome.press('ArrowUp');
      await chrome.press('Enter', 400);
      await chrome.press('Escape', 200);
      await chrome.type('not a site');
      await chrome.press('Enter', 500);
      check(
        'something that is not a site name is not added, and says why',
        [(await entries()).length, await chrome.toastText()],
        [3, 'That is not a site name. Try something like example.com'],
      );
      await chrome.press('Escape', 400);
      check('Back from the list goes to ad blocking', await title(), 'Ad blocking');
      await chrome.press('Escape', 400);

      // Saved sign-ins need the system's keyring, and a scripted run never comes near a password (Hard rule 10).
      await open('settings-passwords');
      check(
        'Settings has Passwords, which says plainly when the system has no keyring to keep them with',
        [
          await chrome.evaluate('document.querySelector("#panel h1")?.textContent'),
          await chrome.evaluate('document.querySelector("#panel p.lead")?.textContent'),
          await chrome.evaluate('!!document.getElementById("set-passwords")'),
        ],
        ['Passwords', 'Passwords cannot be kept on this system.', false],
      );
      check('and nothing was written for them', existsSync(join(app.userData, 'passwords.json')), false);
      await chrome.press('Escape', 400);

      await open('settings-access');
      await open('ask-camera');
      check(
        'a kind of access can be closed to every site',
        [await text('ask-camera'), file().neverAsk],
        ['Sites may ask to use the camera: no', ['camera']],
      );
      await chrome.press('Escape', 400);

      await open('settings-privacy');
      check(
        'Settings says what Longboard downloads by itself',
        ((t) => ['no usage data', 'Longboard-Profiles repository', 'easylist.to'].map((w) => t.includes(w)))(
          await chrome.evaluate(
            '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)',
          ),
        ),
        [true, true, true],
      );
      await open('clear-data');
      check(
        'a scripted run is not let near the button that signs out of every site',
        [await text('clear-data'), await chrome.toastText()],
        [
          'Sign out of every site and clear what sites have stored',
          'Blocked: automation mode never activates purchase or sign-up controls',
        ],
      );
      await open('clear-sites');
      check(
        "forgetting every site's settings asks first",
        await text('clear-sites'),
        "Press again to forget every site's settings",
      );
      await chrome.press('Enter', 600);
      check(
        'and the second press does it',
        await until(
          () => chrome.toastText(),
          (t) => /^Forgotten/.test(t ?? ''),
          40,
        ),
        "Forgotten: every site's answers, size and ad-blocking switch",
      );
      await chrome.press('Escape', 400);

      await open('settings-privacy');
      await open('set-history');
      check(
        'keeping a history can be turned off',
        [await text('set-history'), file().history],
        ['Keep a history of pages opened: no', false],
      );
      await chrome.press('Escape', 400);

      await open('settings-general');
      await open('set-language');
      await open('pick-1');
      check(
        'a language for sites can be chosen from a list by name',
        [await text('set-language'), file().language],
        ['Language sites are asked for: English (United States)', 'en-US'],
      );
      await chrome.press('Escape', 400);

      await open('settings-downloads');
      check(
        'Downloads says where files go',
        (
          await chrome.evaluate(
            '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)',
          )
        ).includes(`Files are saved in ${join(app.userData, 'downloads')}.`),
        true,
      );
      await chrome.press('Enter', 500);
      check(
        'the folder chooser opens on the folder in use and lists the folders in it',
        [
          await title(),
          await chrome.evaluate(
            '[...document.querySelectorAll("#panel button[id^=folder-]")].map((b) => b.ariaLabel ?? b.textContent)',
          ),
        ],
        ['Choose a folder', ['Save downloads in this folder', 'Up to the folder above', 'Open: films', 'Cancel']],
      );
      await open('folder-0');
      check(
        'a folder can be gone into',
        await chrome.evaluate('document.querySelector("#panel .where")?.textContent'),
        join(app.userData, 'downloads', 'films'),
      );
      for (let i = 0; i < 6 && (await chrome.focused()) !== 'folder-use'; i++) await chrome.press('ArrowUp');
      await chrome.press('Enter', 500);
      check(
        'and chosen: it is kept, and the chooser goes away',
        [file().downloads, await title()],
        [join(app.userData, 'downloads', 'films'), 'Downloads'],
      );
      await chrome.press('Escape', 400);

      await open('settings-remote');
      await open('button-back');
      check(
        'giving a button a job asks for the button',
        (
          await chrome.evaluate(
            '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)',
          )
        ).includes('Press the button to use for "Back". Back cancels.'),
        true,
      );
      await chrome.press('ArrowDown', 400);
      check(
        'an arrow cannot be given another job, and says so',
        [await chrome.toastText(), 'keys' in file()],
        ['That button cannot be used for this', false],
      );
      await open('button-back');
      await chrome.press('F7', 500);
      check(
        'the next button pressed gets the job, and is kept',
        [await text('button-back'), file().keys],
        ['Back: also F7', { F7: 'back' }],
      );
      await chrome.press('F7', 500);
      check('and does it straight away: here, Back to the first page of Settings', await title(), 'Settings');
      await open('settings-remote');
      await open('unbutton-back');
      check(
        'the extra buttons can be taken away again',
        [await text('button-back'), file().keys],
        ['Back: add a button', {}],
      );
      await chrome.press('Escape', 400);

      await open('settings-reset');
      await chrome.press('Enter', 500);
      check('putting everything back takes two presses and leaves no settings behind', file(), { keys: {} });
      await chrome.press('Escape', 400);
      check('Back on the first page closes Settings', await chrome.evaluate('document.getElementById("panel")'), null);
    },
  );
}
