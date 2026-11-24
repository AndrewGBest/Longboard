// Pointer mode.
import { check, sleep } from '../harness.mjs';
import { scenario, site } from './setup.mjs';

/** Runs this file's scenarios, one after another. */
export default async function run() {
  await scenario('pointer mode', { url: `${site.origin}/frames.html` }, async (app) => {
    const page = await app.page(`${site.origin}/frames.html`);
    const { evaluate, press, focused } = page;
    const messages = async () => (await evaluate('__frame.messages')).filter((m) => !m.startsWith('at '));
    await sleep(1000);
    check('no pointer is shown to begin with', await page.pointerAt(), null);
    await press('ArrowDown');
    await press('ArrowDown');
    check('the highlight can land on an embedded frame', await focused(), 'frame');
    await press('F2', 500);
    const box = await evaluate(
      '(() => { const r = document.getElementById("frame").getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })()',
    );
    check(
      'the pointer key brings the pointer, and it can be walked onto the frame',
      await page.pointTo((box.l + box.r) / 2, (box.t + box.b) / 2),
      true,
    );
    const start = await page.pointerAt();
    check('with the ring put away', await focused(), null);
    await press('Enter', 600);
    check('OK clicks what is under the pointer, inside the frame', await messages(), ['clicked 1']);

    // The guard reaches into the frame: a purchase button there is not pressed either.
    check('the pointer can be walked to another button in the frame', await page.pointTo(start.x + 200, start.y), true);
    await press('Enter', 700);
    check(
      'a purchase control inside the frame is not clicked in automation mode',
      [await messages(), await page.toastText()],
      [['clicked 1'], 'Blocked: automation mode never activates purchase or sign-up controls'],
    );
    await page.pointTo(start.x, start.y);

    // Moving: a tap is a small step, a held key travels.
    const before = await page.pointerAt();
    await press('ArrowRight', 200);
    const tapped = await page.pointerAt();
    check(
      'a tap moves the pointer a little',
      [tapped.x > before.x, tapped.x - before.x < 20, tapped.y === before.y],
      [true, true, true],
    );
    check('and no further', (await sleep(500), await page.pointerAt()), tapped);
    await page.hold('ArrowLeft', 900);
    await sleep(250);
    const held = await page.pointerAt();
    check('a held key moves it a long way', tapped.x - held.x > 100, true);
    check('and it stops when the key is let go', (await sleep(300), (await page.pointerAt()).x), held.x);
    check(
      'the arrows went to the pointer, not into the frame',
      (await messages()).filter((m) => m.startsWith('key Arrow')),
      [],
    );

    // Leaving: the same key, or Back; the keys come back to the page.
    await press('F2', 400);
    check('the pointer key puts the pointer away', await page.pointerAt(), null);
    await press('ArrowDown', 300);
    check(
      'and the arrows move the highlight again, though the click left the keys in the frame',
      (await focused()) !== null,
      true,
    );
    await press('F2', 400);
    check(
      'the pointer key brings it back, in the middle of the screen',
      ((at, w, h) => !!at && Math.abs(at.x - w / 2) <= 1 && Math.abs(at.y - h / 2) <= 1)(
        await page.pointerAt(),
        await evaluate('innerWidth'),
        await evaluate('innerHeight'),
      ),
      true,
    );
    await press('Escape', 400);
    check('Back puts it away too', await page.pointerAt(), null);
  });

  await scenario('pointer mode: edges, the menu and the guard', { url: `${site.origin}/home.html` }, async (app) => {
    const page = await app.page(site.origin);
    const { evaluate, press } = page;
    await sleep(800);
    const pointTo = page.pointTo;
    const centre = (id) =>
      evaluate(
        `(() => { const r = document.getElementById("${id}").getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; })()`,
      );

    await press('F2', 400);
    const play = await centre('play');
    check('the pointer can be walked to a button', await pointTo(play.x, play.y), true);
    await press('Enter', 500);
    check('and OK presses it, as a mouse click', await evaluate('__clicks'), ['play']);
    const rent = await centre('rent');
    await pointTo(rent.x, rent.y);
    await press('Enter', 500);
    check(
      'a purchase control is not clicked in automation mode',
      [await evaluate('__clicks'), await page.toastText()],
      [['play'], 'Blocked: automation mode never activates purchase or sign-up controls'],
    );

    // The menu knows about it.
    const chrome = await app.chrome();
    await press('ContextMenu', 500);
    check(
      'the menu says pointer mode is on',
      await chrome.evaluate(
        '(document.getElementById("menu-pointer")?.ariaLabel ?? document.getElementById("menu-pointer")?.textContent)',
      ),
      'Pointer mode: on',
    );
    for (let i = 0; i < 8 && (await chrome.focused()) !== 'menu-pointer'; i++) await chrome.press('ArrowDown');
    await chrome.press('Enter', 500);
    check('and switches it off', await page.pointerAt(), null);

    // Pushing against the bottom edge scrolls the page.
    await evaluate('document.body.insertAdjacentHTML("beforeend", "<div style=\\"height:3000px\\"></div>"); 0');
    await press('F2', 400);
    await page.hold('ArrowDown', 2200);
    await sleep(400);
    const at = await page.pointerAt();
    check(
      'holding down runs the pointer to the bottom edge and then scrolls the page',
      [at.y >= (await evaluate('innerHeight')) - 2, (await evaluate('scrollY')) > 100],
      [true, true],
    );

    // A text field takes the keyboard, and the keyboard takes the arrows.
    await evaluate('scrollTo(0, 0); 0');
    await sleep(300);
    const search = await centre('search');
    await pointTo(search.x, search.y);
    await press('Enter', 600);
    check(
      'clicking a text field ends pointer mode and brings up the keyboard',
      [await page.pointerAt(), await page.keyboardShown(), await evaluate('document.activeElement?.id')],
      [null, true, 'search'],
    );
  });
}
