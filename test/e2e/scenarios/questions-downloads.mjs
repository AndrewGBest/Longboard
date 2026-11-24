// Questions a site makes Longboard ask, and downloads.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, sleep, until } from '../harness.mjs';
import { scenario, site, sayYes, siteMenu, asks } from './setup.mjs';

/** Runs this file's scenarios, one after another. */
export default async function run() {
  await scenario(
    'a site asks to be allowed something',
    { url: `${site.origin}/home.html`, args: ['--use-fake-device-for-media-stream'] },
    async (app) => {
      const page = await app.page(site.origin);
      const chrome = await app.chrome();
      const { evaluate } = page;
      const question = () =>
        chrome.evaluate(
          '[...document.querySelectorAll("#panel h1, #panel p")].map((n) => n.ariaLabel ?? n.textContent).join(" | ")',
        );
      const asked = () =>
        until(
          () => chrome.evaluate('document.querySelector("#panel h1")?.textContent ?? null'),
          (t) => t === 'Allow this?',
          50,
        );
      const answers = () => JSON.parse(readFileSync(join(app.userData, 'sites.json'), 'utf8'))['127.0.0.1']?.answers;
      const locate =
        'window.__geo = new Promise((r) => navigator.geolocation.getCurrentPosition(() => r("allowed"), (e) => r(e.code === 1 ? "refused" : "allowed, but no position"))); 0';
      await sleep(800);

      await evaluate(locate);
      check('asking for the location puts a question on screen', await asked(), 'Allow this?');
      check(
        'which says who is asking and for what, in plain words',
        (await question()).includes('127.0.0.1 wants to know where this device is.'),
        true,
      );
      check(
        'with the highlight on "Do not allow", and the page still waiting',
        [
          await chrome.focused(),
          await evaluate('Promise.race([__geo, new Promise((r) => setTimeout(() => r("waiting"), 300))])'),
        ],
        ['prompt-deny', 'waiting'],
      );
      await chrome.press('Escape', 500);
      check(
        'Back refuses this once and remembers nothing',
        [await evaluate('__geo'), existsSync(join(app.userData, 'sites.json'))],
        ['refused', false],
      );

      await evaluate(locate);
      await asked();
      await chrome.press('Enter', 500);
      check(
        '"Do not allow" refuses and is remembered for the site',
        [await evaluate('__geo'), await answers()],
        ['refused', { location: 'denied' }],
      );
      await evaluate(locate);
      await sleep(500);
      check(
        'so the next time it is refused without asking again',
        [await evaluate('__geo'), await chrome.evaluate('document.visibilityState')],
        ['refused', 'hidden'],
      );

      // Two things at once, allowed.
      await evaluate(
        'window.__cam = navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((s) => { s.getTracks().forEach((t) => t.stop()); return "allowed"; }, (e) => e.name); 0',
      );
      await asked();
      check(
        'camera and microphone are asked about together',
        (await question()).includes('127.0.0.1 wants to use the camera and use the microphone.'),
        true,
      );
      await chrome.press('ArrowUp');
      await chrome.press('Enter', 400);
      check(
        'a yes pressed the moment the question appears is not counted',
        [await chrome.evaluate('document.querySelector("#panel h1")?.textContent'), await answers()],
        ['Allow this?', { location: 'denied' }],
      );
      await sleep(700);
      await chrome.press('Enter', 800);
      check(
        '"Allow" gives the page what it asked for, and is remembered',
        [await evaluate('__cam'), await answers()],
        ['allowed', { location: 'denied', camera: 'granted', microphone: 'granted' }],
      );
      await evaluate(
        'window.__cam = navigator.mediaDevices.getUserMedia({ video: true }).then((s) => { s.getTracks().forEach((t) => t.stop()); return "allowed"; }, (e) => e.name); 0',
      );
      await sleep(600);
      check(
        'so the camera alone is then given without a question',
        [await evaluate('__cam'), await chrome.evaluate('document.visibilityState')],
        ['allowed', 'hidden'],
      );

      await evaluate('window.__note = Notification.requestPermission(); 0');
      await asked();
      await sayYes(chrome);
      check('notifications are asked about and can be allowed', await evaluate('__note'), 'granted');

      // The menu shows the answers and can forget them.
      await page.press('ContextMenu', 500);
      await siteMenu(chrome);
      const menu = await chrome.evaluate(
        '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)',
      );
      check(
        'the menu says what the site may and may not do',
        [
          menu.includes('Allowed to: use the camera, use the microphone, show notifications'),
          menu.includes('Not allowed to: know where this device is'),
        ],
        [true, true],
      );
      for (let i = 0; i < 16 && (await chrome.focused()) !== 'menu-forget'; i++) await chrome.press('ArrowDown');
      check('the entry that forgets them can be reached', await chrome.focused(), 'menu-forget');
      await chrome.press('Enter', 500);
      check(
        'and can forget them',
        existsSync(join(app.userData, 'sites.json'))
          ? JSON.parse(readFileSync(join(app.userData, 'sites.json'), 'utf8'))
          : {},
        {},
      );
      await evaluate('location.reload(); 0');
      await sleep(1000);
      await evaluate(locate);
      check('after which the site has to ask again', await asked(), 'Allow this?');
      await chrome.press('Escape', 400);
    },
  );

  await scenario('downloads', { url: `${site.origin}/home.html` }, async (app) => {
    const page = await app.page(site.origin);
    const chrome = await app.chrome();
    const folder = join(app.userData, 'downloads');
    const asked = () =>
      until(
        () => chrome.evaluate('document.querySelector("#panel h1")?.textContent ?? null'),
        (t) => t === 'Download this file?',
        50,
      );
    await sleep(800);
    await page.evaluate('location.href = "/file.bin"; 0');
    check('a download is asked about first', await asked(), 'Download this file?');
    const text = await chrome.evaluate(
      '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)',
    );
    check(
      'the question names the file, its size, where it is from and where it will go',
      [text.includes('x.bin4 bytes, from 127.0.0.1.'), text.includes(`It will be saved in ${folder}.`)],
      [true, true],
    );
    check('nothing is saved before the answer', existsSync(join(folder, 'x.bin')), false);
    await sayYes(chrome, 300);
    check(
      '"Download" saves it and says so',
      await until(
        () => page.toastText(),
        (t) => /^Saved/.test(t ?? ''),
        60,
      ),
      `Saved x.bin in ${folder}`,
    );
    check(
      'the file is there, whole, and the page did not go anywhere',
      [
        existsSync(join(folder, 'x.bin')) && readFileSync(join(folder, 'x.bin'), 'utf8'),
        await page.evaluate('location.pathname'),
      ],
      ['data', '/home.html'],
    );

    await page.evaluate('location.href = "/file.bin"; 0');
    await asked();
    check(
      'the same file again gets a new name, and writes over nothing',
      (
        await chrome.evaluate(
          '(document.getElementById("panel")?.ariaLabel ?? document.getElementById("panel")?.textContent)',
        )
      ).includes('x (2).bin'),
      true,
    );
    await chrome.press('Enter', 600);
    check(
      '"Cancel" saves nothing',
      [existsSync(join(folder, 'x (2).bin')), readFileSync(join(folder, 'x.bin'), 'utf8')],
      [false, 'data'],
    );

    await page.evaluate('location.href = "/file.bin"; 0');
    await asked();
    await chrome.press('Escape', 600);
    check(
      'and so does Back',
      [existsSync(join(folder, 'x (2).bin')), await chrome.evaluate('document.visibilityState')],
      [false, 'hidden'],
    );
    const waiting = join(app.userData, 'downloads-waiting');
    check(
      'each time the site was asked once, and nothing refused is left lying about',
      [asks.file, existsSync(waiting) ? readdirSync(waiting) : []],
      [3, []],
    );

    // A file that only exists in answer to a form.
    await page.evaluate(
      '(() => { const f = document.createElement("form"); f.method = "post"; f.action = "/made.bin"; document.body.append(f); f.submit(); f.remove(); })(); 0',
    );
    await asked();
    await sayYes(chrome, 300);
    check(
      'a file made in answer to a form is saved, and the form was sent once',
      [
        await until(
          () => existsSync(join(folder, 'made.bin')) && readFileSync(join(folder, 'made.bin'), 'utf8'),
          (v) => v === 'form',
          60,
        ),
        asks.made,
      ],
      ['form', 1],
    );

    // A file that takes its time, and the list of downloads.
    await page.evaluate('location.href = "/slow.bin"; 0');
    await asked();
    await sayYes(chrome, 300);
    check(
      'a slow download says it has started',
      await until(
        () => page.toastText(),
        (t) => /^Downloading/.test(t ?? ''),
        60,
      ),
      'Downloading slow.bin',
    );
    await page.press('ContextMenu', 500);
    check(
      'the menu has a Downloads entry saying one is under way',
      await chrome.evaluate(
        '(document.getElementById("menu-downloads")?.ariaLabel ?? document.getElementById("menu-downloads")?.textContent)',
      ),
      'Downloads (1 under way)',
    );
    for (let i = 0; i < 16 && (await chrome.focused()) !== 'menu-downloads'; i++) await chrome.press('ArrowDown');
    await chrome.press('Enter', 500);
    const lines = () =>
      chrome.evaluate('[...document.querySelectorAll("#panel .where")].map((p) => p.ariaLabel ?? p.textContent)');
    check(
      'the list shows how far it has got, and the earlier ones',
      ((l) => [/^slow\.bin: \d+% of 195 KB$/.test(l[0]), ...l.slice(1)])(
        await until(lines, (l) => /^slow\.bin: [1-9]\d?% of/.test(l[0] ?? ''), 40),
      ),
      [true, 'made.bin: Saved', 'x.bin: Saved'],
    );
    check('nothing is in the downloads folder until it is whole', existsSync(join(folder, 'slow.bin')), false);
    asks.slow.pop().end('r'.repeat(100000));
    check(
      'when the rest comes it is saved whole, and the list says so',
      [
        await until(lines, (l) => l[0] === 'slow.bin: Saved', 60),
        readFileSync(join(folder, 'slow.bin'), 'utf8') === 'h'.repeat(100000) + 'r'.repeat(100000),
      ],
      [['slow.bin: Saved', 'made.bin: Saved', 'x.bin: Saved'], true],
    );
    check(
      'the names of the files saved are written down for the next run, newest first',
      JSON.parse(readFileSync(join(app.userData, 'downloads.json'), 'utf8')).saved.map((d) => d.name),
      ['slow.bin', 'made.bin', 'x.bin'],
    );
    await chrome.press('Escape', 500);

    await page.evaluate('location.href = "/slow.bin"; 0');
    await asked();
    await sayYes(chrome);
    await page.press('ContextMenu', 500);
    for (let i = 0; i < 16 && (await chrome.focused()) !== 'menu-downloads'; i++) await chrome.press('ArrowDown');
    await chrome.press('Enter', 500);
    check('one under way can be cancelled from the list', await chrome.focused(), 'dl-cancel-6');
    await chrome.press('Enter', 500);
    check(
      'cancelled, it says so and leaves nothing behind',
      [
        (await until(lines, (l) => l[0] === 'slow (2).bin: Cancelled', 40))[0],
        existsSync(join(folder, 'slow (2).bin')),
        readdirSync(waiting),
      ],
      ['slow (2).bin: Cancelled', false, []],
    );
    asks.slow.pop()?.destroy();
  });

  await scenario(
    'files saved in an earlier run are still in the list',
    {
      url: `${site.origin}/home.html`,
      seed: (data) =>
        writeFileSync(
          join(data, 'downloads.json'),
          JSON.stringify({ saved: [{ name: 'holiday.pdf', at: 2 }, { name: 'timetable.pdf', at: 1 }, { at: 0 }] }),
        ),
    },
    async (app) => {
      const page = await app.page(`${site.origin}/home.html`);
      const chrome = await app.chrome();
      await sleep(800);
      await page.press('ArrowDown');
      await page.press('ContextMenu', 500);
      for (let i = 0; i < 24 && (await chrome.focused()) !== 'menu-downloads'; i++) await chrome.press('ArrowDown');
      await chrome.press('Enter', 500);
      check(
        'under their own heading, newest first',
        await chrome.evaluate(
          '[...document.querySelectorAll("#panel h2, #panel .where")].map((n) => n.ariaLabel ?? n.textContent)',
        ),
        ['Saved earlier', 'holiday.pdf', 'timetable.pdf'],
      );
    },
  );
}
