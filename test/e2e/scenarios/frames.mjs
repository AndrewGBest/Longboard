// Frames inside a page, and things laid over it.
import { check, sleep } from '../harness.mjs';
import { scenario, site } from './setup.mjs';

/** Runs this file's scenarios, one after another. */
export default async function run() {
  await scenario(
    'the highlight inside a frame from another site',
    { url: `${site.origin}/frames.html` },
    async (app) => {
      const page = await app.page(`${site.origin}/frames.html`);
      const { evaluate, press, focused } = page;
      const messages = () => evaluate('__frame.messages');
      const inFrame = () => evaluate('document.activeElement?.id');
      await sleep(1000);
      await press('ArrowDown');
      await press('ArrowDown');
      check('the highlight can land on an embedded frame', await focused(), 'frame');
      await press('Enter', 900);
      check(
        'OK on it sends the highlight into the frame: the frame has the keys, and no pointer is needed',
        [await inFrame(), await page.pointerAt()],
        ['frame', null],
      );
      // In the frame: a text field on the left, two buttons to its right, a password field below it.
      const at = async () => (await messages()).filter((m) => m.startsWith('at ')).at(-1);
      await press('Enter', 600);
      check(
        'it starts on the first thing in the frame, and OK presses it',
        [await at(), (await messages()).filter((m) => m.startsWith('clicked'))],
        ['at inside', ['clicked 1']],
      );
      await press('ArrowRight', 500);
      await press('Enter', 700);
      check(
        'the arrows move among what is in the frame; a purchase control there is not pressed in a scripted run',
        [await at(), (await messages()).includes('bought')],
        ['at buy', false],
      );
      await press('ArrowLeft', 400);
      await press('ArrowLeft', 400);
      await press('Enter', 900);
      check(
        "OK on a text field in the frame brings the page's keyboard up",
        [await at(), await page.keyboardShown()],
        ['at name', true],
      );
      await press('Enter', 500);
      await press('ArrowRight', 300);
      await press('Enter', 500);
      const typed = (await messages()).filter((m) => m.startsWith('typed '));
      check(
        'its keys type into the field in the frame',
        [typed.length, typed.at(-1)?.length],
        [2, 'typed '.length + 2],
      );
      check(
        'and the arrows moved along the keyboard, not into the frame',
        (await messages()).filter((m) => m.startsWith('key Arrow')),
        [],
      );
      await press('Escape', 700);
      check(
        "Back puts the keyboard away, and the keys are the frame's again",
        [await page.keyboardShown(), await inFrame(), await page.pointerAt()],
        [false, 'frame', null],
      );
      // As in the page itself: a field that has been typed in keeps the arrows until Back leaves it.
      await press('Escape', 500);
      // A scripted run never types a password (Hard rule 10): no keyboard for that field.
      await press('ArrowDown', 500);
      await press('Enter', 900);
      check(
        'in a scripted run no keyboard comes up for a password field in the frame',
        [await at(), await page.keyboardShown()],
        ['at secret', false],
      );
      await press('ArrowDown', 900);
      check('a press with nowhere to go in the frame leaves it, that way', await focused(), 'below');
      await press('ArrowUp', 500);
      await press('ArrowUp', 500);
      check('and the page is walked as before', await focused(), 'above');
    },
  );

  // A made-up page that embeds a player from another origin, with the page's
  // own bar pinned over the frame's lower edge. The player is watched full
  // screen and driven with the remote, without the pointer.
  await scenario(
    'a frame that is the first thing on the page',
    { url: `${site.origin}/frames.html?first` },
    async (app) => {
      const page = await app.page(`${site.origin}/frames.html`);
      const chrome = await app.chrome();
      await sleep(1000);
      await page.press('ArrowDown');
      check('the highlight lands on the frame', await page.focused(), 'frame');
      await page.press('Enter', 900);
      check('and goes into it', await page.evaluate('document.activeElement?.id'), 'frame');
      await page.press('ArrowUp', 700);
      check(
        'Up out of it is Up at the top of the page: the highlight stays on the frame and the menu is offered',
        [await page.focused(), await page.toastText(), await chrome.evaluate('!!document.querySelector("#panel h1")')],
        ['frame', 'Press Up again for the menu', false],
      );
      await page.press('ArrowUp', 700);
      check(
        'Up again opens the menu',
        await chrome.evaluate('document.querySelector("#panel h1")?.textContent'),
        'Menu',
      );
    },
  );

  await scenario(
    'a frame as big as the screen at the top of a long page',
    { url: `${site.origin}/frames.html?first&big` },
    async (app) => {
      const page = await app.page(`${site.origin}/frames.html`);
      await sleep(1000);
      let at = null;
      for (let i = 0; i < 14 && at !== 'below'; i++) {
        await page.press('ArrowDown', 700);
        at = await page.focused();
      }
      check(
        'Down gets through the frame and on to the page below it',
        [at, await page.evaluate('scrollY > 0')],
        ['below', true],
      );
    },
  );

  await scenario('a player in a frame from another site', { url: `${site.origin}/embed.html` }, async (app) => {
    const page = await app.page(`${site.origin}/embed.html`);
    const { evaluate, focused } = page;
    const press = (key, wait = 700) => page.press(key, wait);
    const inner = () => evaluate('__frame.state');
    const full = () => evaluate('document.fullscreenElement?.id ?? null');
    await sleep(1500);
    await press('ArrowDown');
    await press('ArrowDown');
    check(
      "the highlight lands on the frame, though the page's pinned bar lies over its lower edge",
      await focused(),
      'frame',
    );
    await press('Enter', 1500);
    check(
      'OK on it shows the player full screen and hands it the keys, with no pointer',
      [await full(), await evaluate('document.activeElement?.id'), await page.pointerAt()],
      ['frame', 'frame', null],
    );
    await press('Enter', 1200);
    const first = await inner();
    check(
      'OK pauses: this player ignores its key until it has been clicked, so the picture is clicked once',
      [first.paused, first.space, first.clicks],
      [true, 0, 1],
    );
    await press('Enter', 1200);
    const second = await inner();
    check(
      "OK again plays, by the player's own key now that it answers it",
      [second.paused, second.space, second.clicks],
      [false, 1, 1],
    );
    await press('ArrowRight');
    await press('ArrowLeft');
    check('left and right reach the player as its seek keys', [(await inner()).left, (await inner()).right], [1, 1]);
    await press('ArrowDown', 1200);
    const shown = await inner();
    check(
      "down brings the player's controls up, by a pointer movement, and lands on its progress bar",
      [shown.moves > 0, shown.ring],
      [true, 'progress'],
    );
    await press('ArrowRight');
    check(
      'right on the bar is the seek key again, though the bar never says it is a slider',
      [(await inner()).right, (await inner()).ring],
      [2, 'progress'],
    );
    await press('ArrowDown');
    await press('Enter', 900);
    const pressed = await inner();
    check(
      'down goes on to the buttons, and OK presses one',
      [['pp', 'full'].includes(pressed.ring), pressed.pressed.length],
      [true, 1],
    );
    await press('Escape', 1500);
    check(
      "Back leaves the player: the full screen ends, the keys are the page's again and the highlight is on the frame",
      [await full(), await focused(), await evaluate('document.activeElement?.id ?? ""')],
      [null, 'frame', ''],
    );
    await press('ArrowDown');
    check('and the page goes on below it', (await focused()) !== 'frame', true);
  });

  // Seen at a TV on 2026-11-23: the menu open, and the keys still going to the
  // page behind it, so that the menu could not be used or closed. How the
  // keys came to be there is not known; a key that arrives at the page while
  // another screen is in front is passed on to that screen.
  await scenario(
    'a key that reaches the page while the menu is open',
    { url: `${site.origin}/frames.html` },
    async (app) => {
      const page = await app.page(`${site.origin}/frames.html`);
      const chrome = await app.chrome();
      const menu = () =>
        chrome.evaluate(
          '[document.querySelector("#panel h1")?.textContent ?? null, document.activeElement?.id ?? null]',
        );
      await sleep(1000);
      await page.press('ArrowDown');
      await page.press('ArrowDown');
      await page.press('Enter', 900);
      check('the highlight is inside a frame of the page', await page.evaluate('document.activeElement?.id'), 'frame');
      await page.press('ContextMenu', 900);
      check('the menu opens', await menu(), ['Menu', 'menu-home']);
      // Sent to the page, not to the menu: the road a key took at the TV.
      await page.press('ArrowDown', 600);
      const moved = await menu();
      check(
        "a key sent to the page moves the menu's highlight, not the page's",
        [moved[0], moved[1] !== 'menu-home' && moved[1] !== null, await page.focused()],
        ['Menu', true, 'frame'],
      );
      await page.press('Escape', 900);
      check(
        'and Back sent to the page closes the menu and nothing else',
        [(await menu())[0], await page.focused(), await page.evaluate('location.pathname')],
        [null, 'frame', '/frames.html'],
      );
      check(
        'it is written down once that it happened',
        (app.log.match(/a key reached the page while another screen was in front/g) ?? []).length,
        1,
      );
    },
  );

  await scenario(
    'a frame with nothing in it to select',
    { url: `${site.origin}/frames.html?inner=inner-picture.html` },
    async (app) => {
      const page = await app.page(`${site.origin}/frames.html`);
      const { evaluate, press, focused } = page;
      await sleep(1000);
      await press('ArrowDown');
      await press('ArrowDown');
      check('the highlight lands on the frame', await focused(), 'frame');
      await press('Enter', 1500);
      check(
        'OK on it falls back to the pointer, on the frame, and says so',
        [(await page.pointerAt()) !== null, await page.toastText()],
        [true, 'Pointer mode: this part of the page needs the pointer'],
      );
      await press('Enter', 600);
      check('and OK presses what is under the pointer', await evaluate('__frame.messages'), ['pressed']);
    },
  );

  await scenario(
    'a prompt that is a frame over the whole page',
    { url: `${site.origin}/frame-prompt.html` },
    async (app) => {
      const page = await app.page(`${site.origin}/frame-prompt.html`);
      const { press } = page;
      await sleep(1200);
      await press('ArrowDown', 700);
      await press('ArrowDown', 900);
      check(
        'the arrows go into the prompt by themselves, with no pointer',
        [await page.evaluate('document.activeElement?.id'), await page.pointerAt()],
        ['frame', null],
      );
      // The prompt calls itself a dialog, and the highlight is kept in dialogs: that must not take the cursor out of the frame.
      await sleep(1500);
      await press('ArrowLeft', 500);
      await press('Enter', 2500);
      check('OK on a text field there brings the keyboard up, and it stays up', await page.keyboardShown(), true);
      await press('Enter', 600);
      check(
        'and its keys type into the field',
        (await page.evaluate('__frame.messages')).filter((m) => m.startsWith('typed ')).length,
        1,
      );
    },
  );

  await scenario(
    'a dialog the browser draws in front of everything',
    { url: `${site.origin}/modal.html` },
    async (app) => {
      const page = await app.page(`${site.origin}/modal.html`);
      const { press, focused } = page;
      // What is in the browser's top layer, back to front: the last is what is seen.
      const front = async () => {
        const { nodeIds } = await page.cdp.send('DOM.getTopLayerElements');
        const names = [];
        for (const nodeId of nodeIds) names.push((await page.cdp.send('DOM.describeNode', { nodeId })).node.localName);
        return names.filter((n) => n !== '::backdrop').at(-1);
      };
      await sleep(800);
      await page.cdp.send('DOM.getDocument', { depth: 0 });
      await press('ArrowDown', 300);
      await press('Enter', 900);
      check('the highlight goes into the dialog', await focused(), 'yes');
      check("and Longboard's own drawings are in front of it, not under it", await front(), 'longboard-overlay');
    },
  );
}
