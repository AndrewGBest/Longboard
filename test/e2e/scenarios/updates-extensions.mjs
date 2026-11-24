// New versions of Longboard, and extensions.
import { createHash, generateKeyPairSync } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, root, sleep, until } from '../harness.mjs';
import { scenario, site, newPackage, siteMenu } from './setup.mjs';

/** Runs this file's scenarios, one after another. */
export default async function run() {
  const oldPackage = (data) => ({
    APPIMAGE:
      (mkdirSync(join(data, 'pkg'), { recursive: true }),
      writeFileSync(join(data, 'pkg', 'Longboard.AppImage'), 'the old package'),
      join(data, 'pkg', 'Longboard.AppImage')),
  });
  await scenario(
    'a new version is fetched, checked and put in place',
    { args: [`--updates=${site.origin}/releases/latest`], env: oldPackage },
    async (app) => {
      const chrome = await app.chrome();
      const file = join(app.userData, 'pkg', 'Longboard.AppImage');
      const reach = async (id) => {
        for (let i = 0; i < 30 && (await chrome.focused()) !== id; i++) await chrome.press('ArrowDown');
        return chrome.focused();
      };
      const state = await until(
        () =>
          existsSync(join(app.userData, 'update.json'))
            ? JSON.parse(readFileSync(join(app.userData, 'update.json'), 'utf8'))
            : {},
        (s) => s.installed,
        60,
      );
      check('a newer release is noticed and installed at start', state.installed, '99.0.0');
      check(
        'the package this copy was started from is now the new one, and can be run',
        [
          readFileSync(file).equals(newPackage),
          (statSync(file).mode & 0o111) !== 0,
          readdirSync(join(app.userData, 'pkg')),
        ],
        [true, true, ['Longboard.AppImage']],
      );
      await until(
        () => chrome.focused(),
        (id) => id === 'go',
      );
      await chrome.press('ContextMenu', 500);
      await reach('menu-settings');
      await chrome.press('Enter', 400);
      await reach('settings-updates');
      await chrome.press('Enter', 400);
      const said = await chrome.evaluate(
        '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)',
      );
      check(
        'Settings says so, and says what is asked of whom',
        [
          said.includes('Version 99.0.0 is in place: close and open Longboard to use it.'),
          said.includes('asks GitHub whether there is a newer release'),
          await chrome.evaluate(
            '(document.getElementById("set-updates")?.ariaLabel ?? document.getElementById("set-updates")?.textContent)',
          ),
        ],
        [true, true, 'New versions are: installed by themselves'],
      );
      await reach('set-updates');
      await chrome.press('Enter', 400);
      await chrome.press('Enter', 400);
      check(
        'and can turn looking off',
        [
          await chrome.evaluate(
            '(document.getElementById("set-updates")?.ariaLabel ?? document.getElementById("set-updates")?.textContent)',
          ),
          JSON.parse(readFileSync(join(app.userData, 'config.json'), 'utf8')).updates,
        ],
        ['New versions are: not looked for', 'off'],
      );
    },
  );
  await scenario(
    'a new version that is not what the release says is left alone',
    { args: [`--updates=${site.origin}/releases/tampered`], env: oldPackage },
    async (app) => {
      await app.chrome();
      const state = await until(
        () =>
          existsSync(join(app.userData, 'update.json'))
            ? JSON.parse(readFileSync(join(app.userData, 'update.json'), 'utf8'))
            : {},
        (s) => s.checkedAt,
        60,
      );
      await sleep(500);
      check(
        'a package whose checksum is not the one stated is not installed',
        [
          state.installed ?? null,
          state.available,
          readFileSync(join(app.userData, 'pkg', 'Longboard.AppImage'), 'utf8'),
          readdirSync(join(app.userData, 'pkg')),
        ],
        [null, '99.0.0', 'the old package', ['Longboard.AppImage']],
      );
      check('and the log says why', /could not be installed .*not the one the release describes/.test(app.log), true);
    },
  );

  // A store extension is known by a key in its manifest, and its name in the store is made from that key.
  // A key is made up here for the made-up extension.
  const fixtureKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({
    type: 'spki',
    format: 'der',
  });
  const fixtureExtensionId = [...createHash('sha256').update(fixtureKey).digest('hex').slice(0, 32)]
    .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
    .join('');
  await scenario(
    'an extension',
    {
      url: `${site.origin}/home.html`,
      seed: (data) => {
        const to = join(data, 'Extensions', fixtureExtensionId, '1.0.0_0');
        mkdirSync(to, { recursive: true });
        for (const f of ['mark.js', 'options.html'])
          copyFileSync(join(root, 'test/fixtures/extension', f), join(to, f));
        writeFileSync(
          join(to, 'manifest.json'),
          JSON.stringify({
            ...JSON.parse(readFileSync(join(root, 'test/fixtures/extension/manifest.json'), 'utf8')),
            key: fixtureKey.toString('base64'),
          }),
        );
      },
    },
    async (app) => {
      const page = await app.page(site.origin);
      const chrome = await app.chrome();
      const reach = async (id) => {
        for (let i = 0; i < 30 && (await chrome.focused()) !== id; i++) await chrome.press('ArrowDown');
        return chrome.focused();
      };
      await sleep(1200);
      check(
        'an installed extension runs on the pages that are opened',
        await until(
          () => page.evaluate('document.documentElement.getAttribute("data-fixture-extension")'),
          (v) => v === 'ran',
          30,
        ),
        'ran',
      );
      check(
        "a page that is not an extension's page in the store is not offered one",
        (await page.press('ContextMenu', 500),
        await siteMenu(chrome),
        await chrome.evaluate('document.getElementById("menu-add-extension")')),
        null,
      );
      await chrome.press('Escape', 300);
      await reach('menu-settings');
      await chrome.press('Enter', 400);
      check(
        'Settings counts the extensions',
        await chrome.evaluate(
          '(document.getElementById("settings-extensions")?.ariaLabel ?? document.getElementById("settings-extensions")?.textContent)',
        ),
        'Extensions (1)',
      );
      await reach('settings-extensions');
      await chrome.press('Enter', 400);
      const listed = await chrome.evaluate(
        '[...document.querySelectorAll("#panel button")].map((b) => b.ariaLabel ?? b.textContent)',
      );
      check('and lists each with a way to open it and to remove it', listed.slice(0, 3), [
        'Open the Chrome Web Store',
        'Open "Longboard fixture extension"',
        'Remove "Longboard fixture extension"',
      ]);
      await reach('ext-open-0');
      await chrome.press('Enter', 1200);
      const own = await app.view((u) => u.startsWith('chrome-extension://') && u.endsWith('/options.html'), 40);
      check(
        '"Open" shows the extension\'s own page in the tab',
        own && (await own.evaluate('document.title')),
        'Fixture extension settings',
      );
      if (!own) return;
      await sleep(600);
      // Extensions written for `browser` rather than `chrome` must find the same interfaces under both names.
      check(
        'its page finds under "browser" what it finds under "chrome"',
        await own.evaluate(
          'typeof browser === "object" && typeof chrome.windows === "object" ? browser.windows === chrome.windows && browser.tabs === chrome.tabs : "one of the two is missing"',
        ),
        true,
      );
      await own.press('ArrowRight', 300);
      await own.press('ArrowRight', 300);
      check(
        'and the arrows move on it as on any page',
        await own.evaluate('document.querySelector("[data-longboard-focus]")?.id ?? null'),
        'two',
      );
      await own.press('ContextMenu', 500);
      await reach('menu-settings');
      await chrome.press('Enter', 400);
      await reach('settings-extensions');
      await chrome.press('Enter', 400);
      await reach('ext-remove-0');
      await chrome.press('Enter', 300);
      check(
        'removing asks for a second press',
        await chrome.evaluate(
          '(document.getElementById("ext-remove-0")?.ariaLabel ?? document.getElementById("ext-remove-0")?.textContent)',
        ),
        'Press again to remove "Longboard fixture extension"',
      );
      await chrome.press('Enter', 900);
      check(
        'and then it is gone, from Settings and from disk',
        [
          await until(
            () => chrome.evaluate('document.querySelector("#panel")?.textContent.includes("None are installed.")'),
            (v) => v === true,
            30,
          ),
          existsSync(join(app.userData, 'Extensions', fixtureExtensionId)),
        ],
        [true, false],
      );
    },
  );
}
