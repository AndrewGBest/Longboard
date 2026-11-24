// Profiles: using one, the interfaces sites make for TVs, the catalogue, and the editor.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, root, sleep, until } from '../harness.mjs';
import { site, scenario, siteMenu, fixtureProfile, sayYes, mapHost, port } from './setup.mjs';

/** Runs this file's scenarios, one after another. */
export default async function run() {
  const profiled = `http://profile.test:${port}/profiled.html`;

  await scenario('a site with no profile, then with one', { url: profiled, args: [mapHost] }, async (app) => {
    const page = await app.page('http://profile.test');
    const { press, focused } = page;
    await sleep(800);
    await press('ArrowDown');
    check(
      'with no profile the first press takes the banner link, and the tiles cannot be reached',
      await focused(),
      'banner-link',
    );
    await press('ArrowDown');
    check(
      'down goes past the tiles to the first real control',
      ['stray', 'footer-link', 'panel-close'].includes(await focused()),
      true,
    );
    const chrome = await app.chrome();
    await press('ContextMenu', 500);
    check(
      'the menu warns that a page sent over plain http is not secure',
      (
        await chrome.evaluate(
          '(document.getElementById("not-secure")?.ariaLabel ?? document.getElementById("not-secure")?.textContent) ?? ""',
        )
      ).startsWith('Not secure:'),
      true,
    );
    await siteMenu(chrome);
    check(
      'the menu says there is no profile',
      (
        await chrome.evaluate(
          '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)',
        )
      ).includes('No profile for this site: generic mode'),
      true,
    );
    check('and offers nothing to export', await chrome.evaluate('!!document.getElementById("menu-export")'), false);
  });

  // Rule 3 as amended on 2026-11-21: a profile may say its site has an interface
  // for TVs. Longboard then adds, for that site only, that it is running as a
  // TV; and the site answers the remote itself.
  await scenario(
    'a site with an interface for TVs',
    {
      // The site's front page is asked for; the profile says its TV interface starts elsewhere.
      url: `http://profile.test:${port}/`,
      args: [mapHost],
      seed: (data) => {
        mkdirSync(join(data, 'profiles'), { recursive: true });
        copyFileSync(join(root, 'test/fixtures/profiles/tvapp.json'), join(data, 'profiles/tvapp.json'));
      },
    },
    async (app) => {
      const page = await app.page('http://profile.test');
      const { evaluate, press } = page;
      await sleep(800);
      check(
        "asking for the site's front page opens its interface for TVs",
        await evaluate('location.pathname'),
        '/tvapp.html',
      );
      const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
      const said = await evaluate('navigator.userAgent');
      const cut = said.lastIndexOf(', Longboard_TV');
      const [honest, added] = cut < 0 ? [said, ''] : [said.slice(0, cut), said.slice(cut + 2)];
      check(
        'the page is told what a TV says: the TV engine, then Longboard as the device, by its own name',
        [
          /^Mozilla\/5\.0 \(X11; Linux [^)]+\) Cobalt\/\S+ \(unlike Gecko\) v8\/[\d.]+-jit gles Starboard\/\d+$/.test(
            honest,
          ),
          added,
        ],
        [
          true,
          `Longboard_TV_${process.arch === 'x64' ? 'x8664' : process.arch}_${new Date().getUTCFullYear()}/${version} (Longboard, Linux)`,
        ],
      );
      check(
        "no other maker's device or system is named",
        /Tizen|Web0S|SMART|PlayStation|Xbox|Android|Windows|Macintosh/i.test(said),
        false,
      );
      const usual = (ua) =>
        /^Mozilla\/5\.0 \(X11; Linux [^)]+\) AppleWebKit\/[\d.]+ \(KHTML, like Gecko\) Chrome\/[\d.]+ Safari\/[\d.]+ Longboard\/[\d.]+$/.test(
          ua,
        );
      check('what it fetches says the same', await evaluate('fetch("/agent").then((r) => r.json())'), said);
      await press('ArrowRight');
      await press('ArrowRight');
      check(
        "the arrows are the app's own: it moves its mark, and Longboard highlights nothing",
        [
          await evaluate('where()'),
          await evaluate('seen.join()'),
          await evaluate('!!document.querySelector("[data-longboard-focus]")'),
        ],
        [2, 'ArrowRight,ArrowRight', false],
      );
      // Up where the app has nowhere further up: pressed again, it opens the menu, as on any site.
      await press('ArrowUp', 500);
      check(
        'Up with nowhere to go in the app says how to reach the menu',
        await page.toastText(),
        'Press Up again for the menu',
      );
      await press('ArrowUp', 700);
      const menuChrome = await app.chrome();
      check(
        'and Up again opens it',
        await menuChrome.evaluate('document.querySelector("#panel h1")?.textContent ?? null'),
        'Menu',
      );
      await menuChrome.press('Escape', 500);
      // Long enough for the words from before to have gone.
      await until(
        () => page.toastText(),
        (t) => !t,
        60,
      );
      await press('ArrowDown');
      await press('ArrowUp', 500);
      check(
        "an Up the app did something with is the app's alone",
        [await evaluate('document.activeElement.id'), await page.toastText()],
        ['', null],
      );
      await sleep(4200);
      await press('ArrowDown');
      await press('Enter', 400);
      check(
        'in a scripted run OK still never presses a sign-up button',
        [
          await evaluate('document.activeElement.id'),
          await evaluate('pressed'),
          /never activates purchase or sign-up/.test((await page.toastText()) ?? ''),
        ],
        ['join', 0, true],
      );
      // Any other address of the site goes to the interface for TVs too, keeping only what the profile says that interface understands.
      await evaluate('location.href = "/home.html?v=abc123&other=1"');
      await sleep(1500);
      check(
        'any other page of the site opens the interface for TVs, with the video it named',
        await evaluate('location.pathname + location.search'),
        '/tvapp.html?v=abc123',
      );
      // The way out: the site menu's switch.
      const chrome = await app.chrome();
      const reachRow = async (id) => {
        for (let i = 0; i < 30 && (await chrome.focused()) !== id; i++) await chrome.press('ArrowDown');
        return chrome.focused();
      };
      await press('ContextMenu', 500);
      await siteMenu(chrome);
      check(
        "the site menu has a switch for the site's profile, on",
        [
          await reachRow('menu-site-profile'),
          await chrome.evaluate(
            '(document.getElementById("menu-site-profile")?.ariaLabel ?? document.getElementById("menu-site-profile")?.textContent)',
          ),
        ],
        ['menu-site-profile', "Use this site's profile: on"],
      );
      await chrome.press('Enter', 1500);
      check(
        "switched off, the site's front page is opened as any browser gets it",
        [
          await evaluate('location.pathname'),
          usual(await evaluate('navigator.userAgent')),
          JSON.parse(readFileSync(join(app.userData, 'sites.json'), 'utf8'))['profile.test'],
        ],
        ['/', true, { profile: false }],
      );
      await evaluate('location.href = "/home.html"');
      await sleep(1200);
      check(
        'and its pages open as asked, told only the usual, as is what they fetch',
        [
          await evaluate('location.pathname'),
          usual(await evaluate('navigator.userAgent')),
          usual(await evaluate('fetch("/agent").then((r) => r.json())')),
        ],
        ['/home.html', true, true],
      );
      await press('ContextMenu', 500);
      await siteMenu(chrome);
      check(
        'the switch is still there, off',
        [
          await reachRow('menu-site-profile'),
          await chrome.evaluate(
            '(document.getElementById("menu-site-profile")?.ariaLabel ?? document.getElementById("menu-site-profile")?.textContent)',
          ),
        ],
        ['menu-site-profile', "Use this site's profile: off"],
      );
      await chrome.press('Enter', 1500);
      check(
        'switched on again, the page it was on gives way to the interface for TVs',
        [await evaluate('location.pathname'), /Longboard_TV/.test(await evaluate('navigator.userAgent'))],
        ['/tvapp.html', true],
      );
    },
  );

  // The second thing a profile can ask Longboard to say: that it is a browser
  // on a TV, added to what it always says. The page stays Longboard's to drive.
  await scenario(
    'a site with a layout for browsers on TVs',
    {
      url: `http://profile.test:${port}/article.html`,
      args: [mapHost],
      seed: (data) => {
        mkdirSync(join(data, 'profiles'), { recursive: true });
        copyFileSync(join(root, 'test/fixtures/profiles/tvbrowser.json'), join(data, 'profiles/tvbrowser.json'));
      },
    },
    async (app) => {
      const page = await app.page('http://profile.test');
      const { evaluate, press } = page;
      await sleep(800);
      const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
      const said = await evaluate('navigator.userAgent');
      check(
        'the page is told what every page is told, and at the end that this is a TV',
        [
          /^Mozilla\/5\.0 \(X11; Linux [^)]+\) AppleWebKit\/\S+ \(KHTML, like Gecko\) Chrome\/\S+ Safari\/\S+ Longboard\/\S+ Smart-TV$/.test(
            said,
          ),
          said.endsWith(` Longboard/${version} Smart-TV`),
        ],
        [true, true],
      );
      check(
        "no maker's device or other engine is named",
        /Tizen|Web0S|PlayStation|Xbox|Android|Windows|Macintosh|Cobalt/i.test(said),
        false,
      );
      await press('ArrowDown', 300);
      check(
        "the highlight is still Longboard's to move",
        await evaluate('!!document.querySelector("[data-longboard-focus]")'),
        true,
      );
      await evaluate(`location.href = 'http://profile.test:${port}/home.html'; 0`);
      await until(
        () => evaluate('location.pathname'),
        (at) => at === '/home.html',
        40,
      );
      await sleep(500);
      check(
        'a page the profile does not name is told the usual',
        (await evaluate('navigator.userAgent')).endsWith(` Longboard/${version}`),
        true,
      );
    },
  );

  await scenario(
    'a profile of your own',
    {
      url: profiled,
      args: [mapHost, '--size=1280x720', '--zoom='],
      seed: (data) => {
        mkdirSync(join(data, 'profiles'), { recursive: true });
        copyFileSync(join(root, 'test/fixtures/profiles/profile-test.json'), join(data, 'profiles/fixture.json'));
        // A file that is not a valid profile must be reported and ignored, not stop anything.
        writeFileSync(
          join(data, 'profiles/scripted.json'),
          JSON.stringify({ longboard: 1, id: 'scripted', scripts: ['evil.js'] }),
        );
      },
    },
    async (app) => {
      const page = await app.page('http://profile.test');
      const { evaluate, press, focused } = page;
      await sleep(800);
      check(
        'a file with scripts in it is refused and said so',
        /scripted\.json is not a usable profile: profiles cannot contain scripts/.test(app.log),
        true,
      );
      check('the page is drawn at the size the profile asks for', await evaluate('innerWidth'), 640);
      check(
        'and the edge of the screen the profile asks for is kept clear',
        await evaluate('[Math.round(innerWidth * devicePixelRatio), Math.round(innerHeight * devicePixelRatio)]'),
        [1152, 648],
      );
      await press('ArrowDown');
      check('the highlight starts where the profile says', await focused(), 'a3');
      await press('Enter');
      check('a tile only the profile knows about can be pressed', await evaluate('__t.clicks'), ['a3']);
      await press('ArrowRight');
      check('right at the end of a row stays in the row', await focused(), 'a3');
      await press('ArrowDown');
      await press('ArrowLeft');
      check('down goes to the next row', await focused(), 'b1');
      await press('ArrowUp');
      check('and up comes back to where the highlight was in the first row', await focused(), 'a3');
      await press('ArrowUp');
      check('the excluded banner is never highlighted', await focused(), 'a3');
      // The site changes its address without loading a page, off the paths the profile is for and back.
      await evaluate('history.pushState({}, "", "/elsewhere"); 0');
      check(
        'when the address leaves what the profile is for, the page is driven without it',
        (await until(
          () => evaluate('innerWidth'),
          (w) => w > 900,
        )) > 900,
        true,
      );
      await evaluate('history.pushState({}, "", "/profiled.html"); 0');
      check(
        'and with it again when the address comes back',
        [
          await until(
            () => evaluate('innerWidth'),
            (w) => w === 640,
          ),
          await focused(),
        ],
        [640, 'a3'],
      );
      await press('ArrowDown');
      await press('ArrowUp');
      check('its rows work as before', await focused(), 'a3');

      // Pointer mode in a view that does not start at the corner of the screen.
      await press('F2', 400);
      const a1 = await evaluate(
        '(() => { const r = document.getElementById("a1").getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()',
      );
      check(
        'with the edges kept clear the pointer can still be walked to a tile',
        await page.pointTo(a1.x, a1.y),
        true,
      );
      await press('Enter', 600);
      check('and OK clicks the tile under it', (await evaluate('__t.clicks')).at(-1), 'a1');
      await press('F2', 400);

      await press('Escape', 400);
      check(
        'Back first closes what the profile says it closes',
        [await evaluate('!!document.getElementById("panel")'), await evaluate('location.pathname')],
        [false, '/profiled.html'],
      );

      const chrome = await app.chrome();
      await press('ContextMenu', 500);
      await siteMenu(chrome);
      check(
        'the menu names the profile and where it came from',
        (
          await chrome.evaluate(
            '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)',
          )
        ).includes('Profile: Fixture Site (your own)'),
        true,
      );
      for (let i = 0; i < 12 && (await chrome.focused()) !== 'menu-export'; i++) await chrome.press('ArrowDown');
      await chrome.press('Enter', 600);
      const exported = join(app.userData, 'exports/fixture-site.longboard-profile.json');
      check(
        'the profile can be exported as one file',
        [existsSync(exported), existsSync(exported) && JSON.parse(readFileSync(exported, 'utf8')).id],
        [true, 'fixture-site'],
      );
      check('and the screen says where it went', (await page.toastText())?.startsWith('Profile saved as '), true);
    },
  );

  await scenario(
    'the reviewed catalogue, and a profile someone gave you',
    {
      url: profiled,
      args: [mapHost, `--catalogue=${site.origin}/catalogue/index.json`],
      seed: (data) => {
        // What a USB stick or the import folder would hold: the same profile under another name and version.
        mkdirSync(join(data, 'import'), { recursive: true });
        const given = {
          ...JSON.parse(fixtureProfile.toString()),
          id: 'given-profile',
          name: 'Given Profile',
          version: '2.0.0',
        };
        writeFileSync(join(data, 'import/given.longboard-profile.json'), JSON.stringify(given));
      },
    },
    async (app) => {
      const page = await app.page('http://profile.test');
      const chrome = await app.chrome();
      await until(
        () => app.log,
        (log) => /catalogue: \d+ profile/.test(log),
        100,
      );
      check(
        'the catalogue is fetched in the background, checked, and what fails its checksum is left out',
        [
          /catalogue: 1 profile\(s\), 1 verified site\(s\)/.test(app.log),
          /tampered\.test\/profile\.json does not match its checksum/.test(app.log),
        ],
        [true, true],
      );
      check(
        'it is kept in the data folder',
        existsSync(join(app.userData, 'catalogue/profiles/profile.test/profile.json')),
        true,
      );
      // The page was opened before the download finished: it picks the profile up when it is next loaded.
      await page.press('ContextMenu', 500);
      for (let i = 0; i < 6 && (await chrome.focused()) !== 'menu-reload'; i++) await chrome.press('ArrowDown');
      await chrome.press('Enter', 1200);
      await page.press('ArrowDown');
      check('a reviewed profile is used without asking', await page.focused(), 'a3');
      await page.press('ContextMenu', 500);
      await siteMenu(chrome);
      check(
        'and the menu says it is reviewed',
        (
          await chrome.evaluate(
            '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)',
          )
        ).includes('Profile: Fixture Site (reviewed)'),
        true,
      );

      // Importing.
      await chrome.press('Escape', 400);
      for (const id of ['menu-settings', 'settings-profiles', 'set-import']) {
        for (let i = 0; i < 24 && (await chrome.focused()) !== id; i++) await chrome.press('ArrowDown');
        await chrome.press('Enter', id === 'set-import' ? 700 : 400);
      }
      check(
        'profiles are imported from the import folder',
        [
          (await page.toastText())?.startsWith('Imported: Given Profile'),
          existsSync(join(app.userData, 'imported/given-profile.json')),
        ],
        [true, true],
      );
      await page.evaluate('location.reload(); 0');
      const asked = await until(
        () => chrome.evaluate('document.querySelector("#panel h1")?.textContent'),
        (t) => t === 'Use this profile?',
        60,
      );
      check('an imported profile is not used silently: the next visit asks', asked, 'Use this profile?');
      check(
        'the question says what it is and which sites it applies to',
        (
          await chrome.evaluate(
            '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)',
          )
        ).includes('"Given Profile" (version 2.0.0)') &&
          (
            await chrome.evaluate(
              '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)',
            )
          ).includes('profile.test'),
        true,
      );
      check('with the highlight on the answer that changes nothing', await chrome.focused(), 'prompt-deny');
      await sayYes(chrome, 1500);
      await page.press('ContextMenu', 600);
      await siteMenu(chrome);
      check(
        'after "Use it" the site is driven by the imported profile, and the menu says nobody reviewed it',
        (
          await chrome.evaluate(
            '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)',
          )
        ).includes('Profile: Given Profile (imported, not reviewed)'),
        true,
      );
      check(
        'and the answer is remembered, for that file and no other',
        Object.entries(JSON.parse(readFileSync(join(app.userData, 'imported-answers.json'), 'utf8'))).map(([k, v]) => [
          /^given-profile@2\.0\.0#[0-9a-f]{32}$/.test(k),
          v,
        ]),
        [[true, 'yes']],
      );

      // Home shows what Longboard has for a site.
      await chrome.press('Escape', 400);
      for (let i = 0; i < 6 && (await chrome.focused()) !== 'menu-home'; i++) await chrome.press('ArrowUp');
      await chrome.press('Enter', 600);
    },
  );

  await scenario('the profile editor', { url: profiled, args: [mapHost] }, async (app) => {
    const page = await app.page('http://profile.test');
    const chrome = await app.chrome();
    const { evaluate, press } = page;
    const reach = async (id, key = 'ArrowDown') => {
      for (let i = 0; i < 20 && (await chrome.focused()) !== id; i++) await chrome.press(key);
      return chrome.focused();
    };
    /** How many of the editor's boxes of one kind are drawn on the page. */
    const boxes = async (kind) => {
      let n = 0;
      await page.overlay(({ cls }) => {
        if (new RegExp(`^mark ${kind}$`).test(cls)) n += 1;
        return undefined;
      });
      return n;
    };
    const text = (id) =>
      chrome.evaluate(
        `(document.getElementById("${id}")?.ariaLabel ?? document.getElementById("${id}")?.textContent) ?? null`,
      );
    await sleep(800);
    await press('ContextMenu', 500);
    await siteMenu(chrome);
    check('with no profile the menu offers to make one', await text('menu-edit'), 'Make a profile for this site');
    await reach('menu-edit');
    await chrome.press('Enter', 700);
    check(
      'which brings up the pointer and says what to do',
      [(await page.pointerAt()) !== null, (await page.toastText())?.startsWith('Profile editor:')],
      [true, true],
    );

    const tile = await evaluate(
      '(() => { const r = document.getElementById("a1").getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; })()',
    );
    check('the pointer can be put on a tile', await page.pointTo(tile.x, tile.y), true);
    await press('Enter', 700);
    check(
      'OK does not press it: it is picked, by its kind, and every one like it is counted',
      [await evaluate('__t.clicks'), await chrome.evaluate('document.querySelector("#panel .where")?.textContent')],
      [[], 'div.tile: 5 on this page, shown with a dashed box'],
    );
    check('and all of them are boxed on the page', await boxes('picked'), 5);
    check(
      'the highlight is on the first choice',
      [await chrome.focused(), await text('edit-include')],
      ['edit-include', 'Can be selected: no'],
    );
    check(
      'nothing can be saved before anything is marked',
      await chrome.evaluate('document.getElementById("edit-save").disabled'),
      true,
    );
    await chrome.press('Enter', 500);
    check(
      'choosing it marks every tile as something that can be selected',
      [await text('edit-include'), await boxes('include')],
      ['Can be selected: yes', 5],
    );

    await reach('edit-wider');
    await chrome.press('Enter', 500);
    check(
      'Wider moves out to what holds the tiles',
      await chrome.evaluate('document.querySelector("#panel .where")?.textContent'),
      'div.strip: 2 on this page, shown with a dashed box',
    );
    check(
      'with nothing wider left, the highlight goes back to the top of the panel',
      [await chrome.evaluate('document.getElementById("edit-wider").disabled'), await chrome.focused()],
      [true, 'edit-include'],
    );
    await reach('edit-row');
    await chrome.press('Enter', 500);
    check('which can be marked as a row', [await text('edit-row'), await boxes('row')], ['This is a row: yes', 2]);

    // Back goes back to pointing; the banner is marked as never selected.
    await chrome.press('Escape', 500);
    check(
      'Back returns to pointing, with the marks still shown',
      [await chrome.evaluate('document.visibilityState'), (await page.pointerAt()) !== null, await boxes('include')],
      ['hidden', true, 5],
    );
    const banner = await evaluate(
      '(() => { const r = document.querySelector(".banner").getBoundingClientRect(); return { x: r.left + 20, y: (r.top + r.bottom) / 2 }; })()',
    );
    await page.pointTo(banner.x, banner.y);
    await press('Enter', 700);
    await reach('edit-exclude');
    await chrome.press('Enter', 500);
    check(
      'something else can be marked as never selected',
      [
        await chrome.evaluate('document.querySelector("#panel .where")?.textContent'),
        await text('edit-exclude'),
        await boxes('exclude'),
      ],
      ['div.banner: 1 on this page, shown with a dashed box', 'Never select: yes', 1],
    );

    await reach('edit-save');
    await chrome.press('Enter', 1200);
    const file = join(app.userData, 'profiles/profile-test.json');
    const saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    check(
      'Save writes an ordinary profile to your own profiles',
      [saved.id, saved.match, saved.focus],
      [
        'profile-test',
        { hosts: ['profile.test', '*.profile.test'] },
        {
          include: ['div.tile'],
          exclude: ['div.banner'],
          groups: [{ name: 'row-1', selector: 'div.strip', axis: 'horizontal', remember: true }],
        },
      ],
    );
    const outlineFile = join(app.userData, 'profiles', saved.evidence?.outline ?? 'missing');
    const outline = existsSync(outlineFile) ? readFileSync(outlineFile, 'utf8') : '';
    check(
      'with an outline of the page as its evidence, holding structure and no text',
      [
        /^\s*div#a1\.tile$/m.test(outline),
        /made-up cookies|Read more|Stray/.test(outline),
        outline
          .split('\n')
          .filter((l) => l && !l.startsWith('#'))
          .some((l) => l.trim().includes(' ')),
      ],
      [true, false, false],
    );
    check(
      'the editor is put away and says where the file went',
      [await page.pointerAt(), await boxes('include'), (await page.toastText())?.startsWith('Profile saved as ')],
      [null, 0, true],
    );

    // The page is driven by it at once, and it is still there on the next visit.
    await press('ArrowDown');
    check('the tiles can be reached now, and the banner cannot', /^[ab][123]$/.test(await page.focused()), true);
    await press('Enter');
    check('and pressed', (await evaluate('__t.clicks')).length, 1);
    await evaluate('location.reload(); 0');
    await sleep(1200);
    await press('ArrowDown');
    check('the same after loading the page again', /^[ab][123]$/.test(await page.focused()), true);
    await press('ContextMenu', 500);
    await siteMenu(chrome);
    check(
      'the menu names it as your own, and offers to edit it',
      [
        (
          await chrome.evaluate(
            '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)',
          )
        ).includes('Profile: profile.test (your own)'),
        await text('menu-edit'),
      ],
      [true, 'Edit the profile for this site'],
    );
  });

  await scenario('the profile editor, changing your mind', { url: profiled, args: [mapHost] }, async (app) => {
    const page = await app.page('http://profile.test');
    const chrome = await app.chrome();
    const reach = async (id, key = 'ArrowDown') => {
      for (let i = 0; i < 20 && (await chrome.focused()) !== id; i++) await chrome.press(key);
    };
    await sleep(800);
    await page.press('ContextMenu', 500);
    await siteMenu(chrome);
    await reach('menu-edit');
    await chrome.press('Enter', 700);
    const tile = await page.evaluate(
      '(() => { const r = document.getElementById("b1").getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; })()',
    );
    await page.pointTo(tile.x, tile.y);
    await page.press('Enter', 700);
    await chrome.press('Enter', 500); // can be selected
    await page.press('ArrowDown', 100).catch(() => undefined);
    await reach('edit-discard');
    await chrome.press('Enter', 700);
    check(
      '"Finish without saving" writes nothing',
      existsSync(join(app.userData, 'profiles/profile-test.json')),
      false,
    );
    await page.press('ArrowDown');
    await page.press('ArrowDown');
    check(
      'and the page is driven as it was before: the tiles cannot be reached',
      /^[ab][123]$/.test((await page.focused()) ?? ''),
      false,
    );
  });
}
