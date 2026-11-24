// Sites added as apps.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, sleep, until } from '../harness.mjs';
import { scenario, site } from './setup.mjs';

/** Runs this file's scenarios, one after another. */
export default async function run() {
  await scenario('a site added as an app', { url: `${site.origin}/home.html` }, async (app) => {
    const page = await app.page(site.origin);
    const chrome = await app.chrome();
    const panelText = () =>
      chrome.evaluate(
        '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent) ?? ""',
      );
    const reach = async (id, key = 'ArrowDown') => {
      for (let i = 0; i < 16 && (await chrome.focused()) !== id; i++) await chrome.press(key);
      return chrome.focused();
    };
    await sleep(1000);
    await page.evaluate('document.cookie = "who=shared; path=/"; 0');
    await page.press('ContextMenu', 500);
    check('the menu offers, on its first page, to add the site as an app', await reach('menu-add-app'), 'menu-add-app');
    await chrome.press('Enter', 500);
    check(
      "which asks for a name, starting from the page's own",
      [
        await chrome.evaluate('document.querySelector("#panel h1")?.textContent'),
        await chrome.evaluate('document.getElementById("app-name").value'),
      ],
      ['Add as an app', 'Longboard fixture: generic streaming home'],
    );
    check(
      'with the highlight on the first choice, sign-ins shared',
      [
        await chrome.focused(),
        await chrome.evaluate(
          '(document.getElementById("app-session")?.ariaLabel ?? document.getElementById("app-session")?.textContent)',
        ),
      ],
      ['app-session', 'Sign-ins: shared with the rest of Longboard'],
    );
    await chrome.press('Enter', 300);
    check(
      'OK changes it to its own sign-ins and stays there',
      [
        await chrome.focused(),
        await chrome.evaluate(
          '(document.getElementById("app-session")?.ariaLabel ?? document.getElementById("app-session")?.textContent)',
        ),
      ],
      ['app-session', 'Sign-ins: its own, apart from the rest'],
    );
    await chrome.press('ArrowDown');
    check(
      "the TV's app list is offered, and wanted unless said otherwise",
      await chrome.evaluate(
        '(document.getElementById("app-launcher")?.ariaLabel ?? document.getElementById("app-launcher")?.textContent)',
      ),
      "Also in the TV's app list: yes",
    );
    await reach('app-add');
    await chrome.press('Enter', 1200);
    check(
      'Add says what it did',
      await page.toastText(),
      'Added "Longboard fixture: generic streaming home" to Home and to the TV\'s app list. Open it from Home to use its own sign-ins',
    );
    const saved = JSON.parse(readFileSync(join(app.userData, 'apps.json'), 'utf8')).apps;
    check('the app is saved', saved, [
      {
        id: '127-0-0-1',
        url: `${site.origin}/home.html`,
        name: 'Longboard fixture: generic streaming home',
        ownSession: true,
        launcher: true,
      },
    ]);
    const entryFile = join(app.userData, 'xdg/applications/io.github.andrewgbest.Longboard.app-127-0-0-1.desktop');
    const entry = existsSync(entryFile) ? readFileSync(entryFile, 'utf8') : '';
    check(
      'an entry for the app list is written, starting Longboard with the app',
      [
        /^Name=Longboard fixture: generic streaming home$/m.test(entry),
        /^Exec=.+ --app=127-0-0-1$/m.test(entry),
        /^Type=Application$/m.test(entry),
      ],
      [true, true, true],
    );
    const iconFile = join(app.userData, 'icons/127-0-0-1.png');
    check(
      "the site's own icon was fetched from the site and is what the entry shows",
      [existsSync(iconFile), entry.includes(`Icon=${iconFile}`)],
      [true, true],
    );

    await page.press('ContextMenu', 500);
    check(
      'the menu now offers to remove it instead',
      [(await panelText()).includes('Remove the app'), (await panelText()).includes('Add this site as an app')],
      [true, false],
    );
    await reach('menu-home', 'ArrowUp');
    await chrome.press('Enter', 600);
    check(
      "Home has an Apps section with the tile first, showing the site's icon",
      [
        await chrome.evaluate('document.querySelector("#home h2")?.textContent'),
        await chrome.focused(),
        await chrome.evaluate('document.querySelector("#apps img.icon")?.src.startsWith("data:image/png;base64,")'),
        await chrome.evaluate('document.querySelector("#apps .mark")?.textContent'),
      ],
      ['Apps', 'app-0', true, 'Own sign-ins'],
    );
    await chrome.press('Enter', 600);
    const own = await app.frontPage(site.origin);
    check('the tile opens the site', !!own, true);
    if (!own) return;
    await sleep(600);
    check(
      'in a session of its own: what the shared session stored is not there',
      await own.evaluate('document.cookie'),
      '',
    );
    await own.evaluate('document.cookie = "who=app; path=/"; 0');
    await own.press('ArrowDown');
    check('and the arrows drive it like any page', await own.focused(), 'nav-home');

    // Removing it.
    await own.press('ContextMenu', 500);
    await reach('menu-remove-app');
    await chrome.press('Enter', 900);
    check(
      'removing the app takes away the tile, the entry and the icon',
      [
        JSON.parse(readFileSync(join(app.userData, 'apps.json'), 'utf8')).apps,
        existsSync(entryFile),
        existsSync(iconFile),
      ],
      [[], false, false],
    );
    check(
      'and goes Home, since the app that was in front is gone',
      [
        await chrome.evaluate('document.visibilityState'),
        await chrome.evaluate('!!document.getElementById("home")'),
        await chrome.evaluate('document.getElementById("panel")'),
      ],
      ['visible', true, null],
    );
    const shared = await app.page(site.origin);
    check('the shared session still has what it stored', await shared?.evaluate('document.cookie'), 'who=shared');
  });

  await scenario(
    "started from the TV's app list",
    {
      args: ['--app=fixture-app'],
      seed: (data) =>
        writeFileSync(
          join(data, 'apps.json'),
          JSON.stringify({
            apps: [
              {
                id: 'fixture-app',
                url: `${site.origin}/article.html`,
                name: 'Fixture',
                ownSession: false,
                launcher: true,
              },
            ],
          }),
        ),
    },
    async (app) => {
      const page = await app.page(`${site.origin}/article.html`);
      check('--app opens that app straight away', !!page, true);
      if (!page) return;
      await sleep(600);
      await page.press('Escape', 600);
      const chrome = await app.chrome();
      check(
        'and Back from its first page goes to Home, where its tile is',
        [
          await chrome.evaluate('document.visibilityState'),
          await chrome.evaluate('document.querySelector("#apps .site")?.textContent'),
        ],
        ['visible', 'Fixture'],
      );
    },
  );

  // Run as a Flatpak, Longboard has a data folder of its own that no desktop
  // reads. An app's entry goes to the desktop's folder all the same, started
  // the way a Flatpak is started; and one added by a version that got this
  // wrong is written there at the next start.
  await scenario(
    'an app in the app list when Longboard is a Flatpak',
    {
      url: `${site.origin}/home.html`,
      env: (data) => ({ FLATPAK_ID: 'io.example.Boxed', HOST_XDG_DATA_HOME: join(data, 'host-share') }),
      seed: (data) =>
        writeFileSync(
          join(data, 'apps.json'),
          JSON.stringify({
            apps: [
              { id: 'made-up', url: `${site.origin}/home.html`, name: 'Made up', ownSession: false, launcher: true },
            ],
          }),
        ),
    },
    async (app) => {
      await app.page(`${site.origin}/home.html`);
      const file = join(app.userData, 'host-share/applications/io.github.andrewgbest.Longboard.app-made-up.desktop');
      await until(
        () => existsSync(file),
        (there) => there,
        30,
      );
      const entry = existsSync(file) ? readFileSync(file, 'utf8') : '';
      const icon = /^Icon=(.*)$/m.exec(entry)?.[1] ?? '';
      check(
        "at start the entry is written where the desktop looks, not in the box's own folder",
        [
          existsSync(file),
          existsSync(join(app.userData, 'xdg/applications/io.github.andrewgbest.Longboard.app-made-up.desktop')),
        ],
        [true, false],
      );
      check(
        'it starts Longboard the way a Flatpak is started',
        /^Exec=flatpak run io\.example\.Boxed --app=made-up$/m.test(entry),
        true,
      );
      check(
        'and its picture is a file kept in the data folder, not one inside the package',
        [icon.startsWith(app.userData), existsSync(icon)],
        [true, true],
      );
    },
  );

  await scenario('an app that does not exist', { args: ['--app=no-such-app'] }, async (app) => {
    const chrome = await app.chrome();
    await until(
      () => chrome.focused(),
      (id) => id === 'go',
    );
    check(
      '--app with an unknown name shows Home and says so in the terminal',
      [await chrome.focused(), /there is no app called "no-such-app"/.test(app.log)],
      ['go', true],
    );
  });
}
