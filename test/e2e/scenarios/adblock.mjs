// Ad blocking.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, sleep, until } from '../harness.mjs';
import { scenario, site, asks, mapHost, port } from './setup.mjs';

/** Runs this file's scenarios, one after another. */
export default async function run() {
  await scenario(
    'ad blocking',
    {
      url: `${site.origin}/ads.html`,
      args: [`--filters=${site.origin}/filters.txt`, `--catalogue=${site.origin}/catalogue/index.json`, mapHost],
    },
    async (app) => {
      const page = await app.page(site.origin);
      const chrome = await app.chrome();
      const { evaluate } = page;
      const reach = async (id) => {
        for (let i = 0; i < 20 && (await chrome.focused()) !== id; i++) await chrome.press('ArrowDown');
        return chrome.focused();
      };
      const line = () => chrome.evaluate('document.querySelector("#menu-adblock .sub")?.textContent ?? null');
      // A slow machine can be read between one script of the page and the next, so each check waits for the answer it expects and fails only if that never comes.
      const loaded = (want) =>
        until(
          () =>
            evaluate(
              'document.readyState === "complete" && Array.isArray(window.__seen) ? window.__seen.join() : null',
            ),
          (v) => (want ? v === want : v !== null),
          60,
        );
      // The list arrives in the background; the first page may have been loaded before it.
      await until(
        () => app.log,
        (log) => /ad blocking: 1 filter list\(s\) fetched/.test(log),
        80,
      );
      check(
        'the filter list is fetched in the background and said so in the terminal',
        /ad blocking: 1 filter list\(s\) fetched/.test(app.log),
        true,
      );
      asks.adverts = 0;
      await evaluate('location.reload(); 0');
      await sleep(500);
      check(
        'on an ordinary site, what the list names is never asked for, and the rest of the page loads',
        [await loaded(), asks.adverts, await evaluate('document.getElementById("banner").naturalWidth')],
        ['site', 0, 0],
      );
      check(
        'nothing on the page is hidden or changed: the link a hiding filter names is still there',
        await evaluate(
          '[getComputedStyle(document.getElementById("one")).display !== "none", document.querySelectorAll("script, style").length]',
        ),
        [true, 4],
      );
      await page.press('ContextMenu', 500);
      check(
        'the menu shows the switch, on, and how many requests were refused',
        [
          await chrome.evaluate(
            '(document.getElementById("menu-adblock")?.ariaLabel ?? document.getElementById("menu-adblock")?.textContent)',
          ),
          await line(),
        ],
        ['Ad blocking: on', '2 requests refused on this page.'],
      );
      check(
        'nothing was saved about the site: the switch has not been touched',
        existsSync(join(app.userData, 'sites.json')),
        false,
      );
      check('the switch can be reached', await reach('menu-adblock'), 'menu-adblock');
      await chrome.press('Enter', 900);
      check(
        'turning it off is kept for the site and loads the page again with everything on it',
        [
          JSON.parse(readFileSync(join(app.userData, 'sites.json'), 'utf8')),
          await loaded('advert,site'),
          await until(
            () => asks.adverts,
            (n) => n >= 2,
            40,
          ),
        ],
        [{ '127.0.0.1': { adBlocking: false } }, 'advert,site', 2],
      );
      check(
        'the menu stays open and says it is off by choice',
        [
          await chrome.evaluate(
            '(document.getElementById("menu-adblock")?.ariaLabel ?? document.getElementById("menu-adblock")?.textContent)',
          ),
          await line(),
          await chrome.focused(),
        ],
        ['Ad blocking: off', 'Off for this site: your choice.', 'menu-adblock'],
      );
      await chrome.press('Enter', 900);
      check(
        'and on again',
        [JSON.parse(readFileSync(join(app.userData, 'sites.json'), 'utf8')), await loaded(), asks.adverts],
        [{ '127.0.0.1': { adBlocking: true } }, 'site', 2],
      );
      await chrome.press('Escape', 400);

      // A verified site: the made-up catalogue lists profile.test.
      // The list of verified sites is fetched in the background after the start. Going to the site before it
      // has come would have its first advertisement refused and its second let through, so it is waited for
      // properly (half a minute at most, for a loaded machine) and said aloud if it never comes.
      const fetched = await until(
        () => app.log,
        (log) => /catalogue: \d+ profile\(s\), 1 verified site/.test(log),
        300,
      );
      check(
        'the list of verified sites has been fetched',
        /catalogue: \d+ profile\(s\), 1 verified site/.test(fetched ?? ''),
        true,
      );
      asks.adverts = 0;
      await evaluate(`location.href = "http://profile.test:${port}/ads.html"; 0`);
      const verifiedPage = await app.page('http://profile.test');
      check('a verified site opens', !!verifiedPage, true);
      if (!verifiedPage) return;
      await sleep(600);
      // Both of the page's advertisements must have been asked for; the second is a picture and can come a moment after the page says it is complete.
      await until(
        () => asks.adverts,
        (n) => n >= 2,
        40,
      );
      check(
        'on a verified site nothing is refused to begin with',
        [
          await until(
            () =>
              verifiedPage.evaluate(
                'document.readyState === "complete" && Array.isArray(window.__seen) ? window.__seen.join() : null',
              ),
            (v) => v === 'advert,site',
            60,
          ),
          asks.adverts,
        ],
        ['advert,site', 2],
      );
      await verifiedPage.press('ContextMenu', 500);
      check(
        'the menu says the switch starts off there, and why',
        [
          await chrome.evaluate(
            '(document.getElementById("menu-adblock")?.ariaLabel ?? document.getElementById("menu-adblock")?.textContent)',
          ),
          await line(),
        ],
        ['Ad blocking: off', 'Off to start with: this site is on the list of sites where it starts off.'],
      );
      await reach('menu-adblock');
      await chrome.press('Enter', 900);
      check(
        'the person can still turn it on there',
        [
          JSON.parse(readFileSync(join(app.userData, 'sites.json'), 'utf8'))['profile.test'],
          await until(
            () =>
              verifiedPage.evaluate(
                'document.readyState === "complete" && Array.isArray(window.__seen) ? window.__seen.join() : null',
              ),
            (v) => v === 'site',
            60,
          ),
          await chrome.evaluate(
            '(document.getElementById("menu-adblock")?.ariaLabel ?? document.getElementById("menu-adblock")?.textContent)',
          ),
        ],
        [{ adBlocking: true }, 'site', 'Ad blocking: on'],
      );
    },
  );

  await scenario(
    'ad blocking off for every site, and a kind of access nobody may ask for',
    {
      url: `${site.origin}/ads.html`,
      config: { adBlocking: 'off', neverAsk: ['location'] },
      args: [`--filters=${site.origin}/filters.txt`],
    },
    async (app) => {
      const page = await app.page(site.origin);
      const chrome = await app.chrome();
      await sleep(1500);
      check(
        'with ad blocking off in Settings nothing is fetched and nothing is refused',
        [/ad blocking:/.test(app.log), await page.evaluate('window.__seen.join()')],
        [false, 'advert,site'],
      );
      await page.evaluate(
        'window.__geo = new Promise((r) => navigator.geolocation.getCurrentPosition(() => r("allowed"), (e) => r(e.code === 1 ? "refused" : "other"))); 0',
      );
      await sleep(600);
      check(
        'a kind of access Settings says no site may ask for is refused without a question',
        [await page.evaluate('__geo'), await chrome.evaluate('document.visibilityState')],
        ['refused', 'hidden'],
      );
      await page.press('ContextMenu', 500);
      check(
        "the menu's switch says so and cannot be pressed",
        [
          await chrome.evaluate('document.getElementById("menu-adblock")?.disabled'),
          await chrome.evaluate('document.querySelector("#menu-adblock .sub")?.textContent'),
        ],
        [true, 'Ad blocking is off everywhere. Settings can turn it on.'],
      );
    },
  );

  for (const [name, config] of [
    ['ad blocking on for every site', { adBlocking: 'everywhere' }],
    ['a reviewed site the person took off the list', { adBlockingStartsOn: ['profile.test'] }],
  ]) {
    await scenario(
      name,
      {
        url: `http://profile.test:${port}/ads.html`,
        config,
        args: [`--filters=${site.origin}/filters.txt`, `--catalogue=${site.origin}/catalogue/index.json`, mapHost],
      },
      async (app) => {
        const page = await app.page('http://profile.test');
        const chrome = await app.chrome();
        await until(
          () => app.log,
          (log) => /filter list\(s\) fetched/.test(log) && /1 verified site/.test(log),
          80,
        );
        await page.evaluate('location.reload(); 0');
        await sleep(600);
        check(
          'on a site from the reviewed list, what the filter list names is refused all the same',
          await until(
            () =>
              page.evaluate(
                'document.readyState === "complete" && Array.isArray(window.__seen) ? window.__seen.join() : null',
              ),
            (v) => v !== null,
            60,
          ),
          'site',
        );
        await page.press('ContextMenu', 500);
        check(
          "and the menu shows the switch on, and still the person's to turn off",
          [
            await chrome.evaluate(
              '(document.getElementById("menu-adblock")?.ariaLabel ?? document.getElementById("menu-adblock")?.textContent)',
            ),
            await chrome.evaluate('document.getElementById("menu-adblock")?.disabled'),
          ],
          ['Ad blocking: on', false],
        );
      },
    );
  }
}
