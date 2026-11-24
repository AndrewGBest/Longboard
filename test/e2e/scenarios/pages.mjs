// Kinds of page: players, long articles, results, forms.
import { check, fail, sleep, until } from '../harness.mjs';
import { scenario, site } from './setup.mjs';

/** Runs this file's scenarios, one after another. */
export default async function run() {
  // A made-up player. Player control must reach the page as real key presses,
  // exactly once each, and the page's own controls must be usable.
  // The user config has one remapped key and one mistake that must be reported and ignored.
  await scenario(
    'a full-screen video',
    { url: `${site.origin}/player.html`, config: { keys: { F4: 'playPause', F6: 'explode' } } },
    async (app) => {
      const page = await app.page(site.origin);
      const { evaluate, focused } = page;
      const press = (key, wait = 400) => page.press(key, wait);
      await sleep(1500);
      check(
        'the fixture player is playing',
        await evaluate('!document.getElementById("v").paused && document.getElementById("v").currentTime > 0'),
        true,
      );

      await press(' ');
      check(
        'a physical Space reaches the player once and pauses',
        await evaluate('[__p.space, document.getElementById("v").paused]'),
        [1, true],
      );
      await press('Enter');
      check(
        'Enter becomes one Space key press and resumes',
        await evaluate('[__p.space, document.getElementById("v").paused]'),
        [2, false],
      );
      await press('F4');
      await press('F4');
      check(
        'a key remapped in config.json works, and a bad entry is reported',
        [await evaluate('__p.space'), /config\.json: key "F6": unknown action/.test(app.log)],
        [4, true],
      );
      await press('ArrowRight');
      await press('ArrowLeft');
      check('seek keys reach the player once each', await evaluate('[__p.left, __p.right]'), [1, 1]);
      check(
        'the layer did not move the picture itself',
        await evaluate('document.querySelector("[data-longboard-focus]") === null'),
        true,
      );

      await press('ArrowDown', 900);
      check(
        'down reveals the player controls and focuses one',
        [await focused(), (await evaluate('__p.moves')) > 0, await evaluate('document.hasFocus()')],
        ['pp', true, true],
      );
      await sleep(3000);
      check('the controls stay up while one has focus', await focused(), 'pp');
      await press('ArrowRight');
      check(
        'arrows move between controls instead of seeking',
        [await focused(), await evaluate('__p.right')],
        ['more', 1],
      );
      await press('Enter', 900);
      await press('ArrowUp');
      check('a styled option in the opened menu takes focus', ['optA', 'optB'].includes(await focused()), true);
      await press('Enter');
      check('and can be chosen', ['A', 'B'].includes(await evaluate('__p.option')), true);
      check(
        'the page behind the player was never focused',
        await evaluate('document.activeElement?.id !== "behind"'),
        true,
      );

      await press('Escape');
      check('first Back returns to the picture', [await focused(), await evaluate('__p.closed')], [null, 0]);
      await press('Escape', 600);
      check('second Back closes the open menu', await evaluate('[__p.escape, __p.closed]'), [1, 0]);
      await press('Escape', 600);
      check(
        'third Back closes the player and stays on the page',
        await evaluate('[__p.closed, location.pathname.endsWith("player.html")]'),
        [1, true],
      );
    },
  );

  // A made-up player whose progress bar is a track three pixels high with
  // buttons at either end. The bar must be reachable and movable with a remote.
  await scenario('a thin progress bar in a player', { url: `${site.origin}/scrub.html` }, async (app) => {
    const page = await app.page(site.origin);
    const { evaluate, focused } = page;
    const press = (key, wait = 500) => page.press(key, wait);
    await sleep(1500);
    await press('ArrowRight');
    check(
      "with nothing highlighted, right is the player's own key",
      [await focused(), await evaluate('__s.windowKeys')],
      [null, 1],
    );
    await press('ArrowDown', 900);
    check('down lands on the progress bar, thin as it is', await focused(), 'bar');
    await press('ArrowRight');
    await press('ArrowRight');
    await press('ArrowLeft');
    check(
      'left and right move the bar, once each, and the highlight stays on it',
      [await focused(), await evaluate('__s.at'), await evaluate('__s.windowKeys')],
      ['bar', 55, 1],
    );
    await press('ArrowDown');
    check("down again goes to a button in the bar's row", ['play', 'sound'].includes(await focused()), true);
    const first = await focused();
    await press(first === 'play' ? 'ArrowRight' : 'ArrowLeft');
    check('and from there the arrows come back to the bar', await focused(), 'bar');
    await press('Escape', 700);
    check('Back returns to the bare picture', await focused(), null);
    await press('ArrowUp', 900);
    check(
      'up brings the highlight to the play button, not the close button or the whole picture',
      await focused(),
      'play',
    );
    await press('ArrowUp');
    await press('ArrowUp');
    check('the button laid over the whole picture is never landed on', await focused(), 'x');
  });

  // A made-up player that ignores its keys until it has been clicked, as a
  // sports network's live player was seen to (2026-11-23).
  await scenario(
    'a player that answers its keys only once clicked',
    { url: `${site.origin}/player.html?needsClick` },
    async (app) => {
      const page = await app.page(site.origin);
      const { evaluate, focused } = page;
      await sleep(1500);
      await page.press('Enter', 1500);
      check(
        'OK pauses: the key did nothing, so the picture was clicked once',
        await evaluate('[document.getElementById("v").paused, __p.space, __p.clicks]'),
        [true, 0, 1],
      );
      await page.press('Enter', 1500);
      check(
        "OK again plays, by the player's own key now that it answers it, with no second click",
        await evaluate('[document.getElementById("v").paused, __p.space, __p.clicks]'),
        [false, 1, 1],
      );
      check(
        'no pointer was left on screen and nothing is highlighted',
        [await page.pointerAt(), await focused()],
        [null, null],
      );
    },
  );

  // Seen on a film service: its search box spreads over the menu when opened
  // and closes only on Escape with the cursor in it.
  await scenario('backing out of a search box without searching', { url: `${site.origin}/home.html` }, async (app) => {
    const page = await app.page(site.origin);
    const { evaluate } = page;
    await sleep(800);
    await page.press('/', 700);
    check(
      'the search key puts the cursor in the search box, with the keyboard',
      [await evaluate('document.activeElement?.id'), await page.keyboardShown()],
      ['search', true],
    );
    await page.press('Escape', 900);
    check(
      'Back puts the keyboard away and, nothing having been typed, tells the site Escape once, in the box',
      [await page.keyboardShown(), await evaluate('__searchEscapes'), await evaluate('location.pathname')],
      [false, 1, '/home.html'],
    );
    await page.press('Enter', 700);
    await page.press('Enter', 700);
    check('with something typed', await evaluate('document.getElementById("search").value.length > 0'), true);
    await page.press('Escape', 900);
    check(
      'Back only puts the keyboard away: what was typed is a search someone may still want',
      [
        await page.keyboardShown(),
        await evaluate('__searchEscapes'),
        await evaluate('document.getElementById("search").value.length > 0'),
      ],
      [false, 1, true],
    );
  });

  // One site opened in place of another: the site being left is not what the
  // person watches while the new one is on its way.
  await scenario(
    'the whole window is covered while another site arrives',
    { url: `${site.origin}/home.html` },
    async (app) => {
      const page = await app.page(site.origin);
      const chrome = await app.chrome();
      const cover = () => chrome.evaluate('document.getElementById("cover-site")?.textContent ?? null');
      await sleep(1200);
      check('nothing covers a site that has come', await cover(), null);
      // Another site (this machine under its other name), asked for the way an app's entry asks.
      await app.again([`--url=http://localhost:${new URL(site.origin).port}/late-page`]);
      await sleep(700);
      check(
        'while the other site is on its way the window is covered, with its name',
        [await cover(), await page.evaluate('document.getElementById("came") !== null')],
        ['localhost', false],
      );
      await until(
        () => page.evaluate('document.getElementById("came") !== null').catch(() => false),
        (there) => there === true,
        100,
        100,
      );
      await sleep(900);
      check(
        'once it has come the cover is gone and the site has the keys',
        [await cover(), await page.evaluate('document.getElementById("came") !== null')],
        [null, true],
      );
      await page.evaluate('location.href = "/home.html"; 0');
      await sleep(900);
      check('a page of the same site is not covered', await cover(), null);
    },
  );

  // A made-up page shaped like a sports network's live page: tabs, a player
  // nearly as big as the window, and under it the row of channels people come
  // for. The player is one stop on the way down the page, not a trap.
  await scenario(
    'a big player in the middle of a long page',
    { url: `${site.origin}/pageplayer.html` },
    async (app) => {
      const page = await app.page(site.origin);
      const { evaluate, focused } = page;
      const press = (key, wait = 900) => page.press(key, wait);
      const pictureShown = () =>
        evaluate(
          '(() => { const r = document.getElementById("v").getBoundingClientRect(); return r.top >= -2 && r.bottom <= innerHeight + 2; })()',
        );
      await sleep(1500);
      await press('ArrowDown');
      check(
        "the first press lands on the page's tabs: with the picture half off the screen this is a page",
        ['tab-live', 'tab-schedule'].includes(await focused()),
        true,
      );
      await press('ArrowDown');
      check(
        'down stops at the picture: nothing is highlighted and the whole picture is brought on screen',
        [await focused(), await pictureShown()],
        [null, true],
      );
      await press('Enter', 1200);
      check(
        "there OK plays and pauses, and left and right are the player's",
        [await evaluate('document.getElementById("v").paused'), await evaluate('__pp.space')],
        [true, 1],
      );
      await press('Enter', 1200);
      await press('ArrowRight');
      check(
        "the player's own keys reach it once each",
        await evaluate('[__pp.space, __pp.right, document.getElementById("v").paused]'),
        [2, 1, false],
      );
      await press('ArrowDown', 1300);
      check("down brings the player's controls up and lands on one", ['pp', 'full'].includes(await focused()), true);
      await press('ArrowDown', 1300);
      check('down again leaves the player for the page below it', await focused(), 'more');
      await press('ArrowDown');
      await press('ArrowRight');
      check('and reaches the row of channels, where left and right choose', await focused(), 'ch2');
      await press('Enter', 1800);
      check(
        'OK on a channel chooses it; the page goes back to the picture and the highlight with it',
        [await evaluate('__pp.channel'), await focused(), await pictureShown()],
        [2, null, true],
      );
      await press('ArrowUp', 1300);
      check('up from the picture brings its controls up, on the play button', await focused(), 'pp');
      await press('ArrowUp', 1300);
      check('and up again goes on to the tabs above', ['tab-live', 'tab-schedule'].includes(await focused()), true);
    },
  );

  await scenario('a long article: reading with the arrows', { url: `${site.origin}/article.html` }, async (app) => {
    const page = await app.page(site.origin);
    const { evaluate, press, focused } = page;
    await sleep(800);
    const screen = await evaluate('innerHeight');
    await press('ArrowDown');
    check('the first press takes the first link', await focused(), 'top-home');
    // Down the page to the first link in the text: the page must scroll there a
    // screen at a time, never jump over what lies between.
    let biggest = 0;
    let last = await evaluate('scrollY');
    let presses = 0;
    for (; presses < 12 && (await focused()) !== 'mid-link'; presses++) {
      await press('ArrowDown', 600);
      const now = await evaluate('scrollY');
      biggest = Math.max(biggest, now - last);
      last = now;
    }
    check('down reaches the link in the middle of the text', await focused(), 'mid-link');
    check('by scrolling no more than a screen per press', [presses >= 2, biggest <= screen], [true, true]);
    check(
      'and the link it lands on is on screen',
      await evaluate(
        '(() => { const r = document.getElementById("mid-link").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()',
      ),
      true,
    );
    for (let i = 0; i < 20 && (await focused()) !== 'foot-contact'; i++) await press('ArrowDown', 500);
    check(
      'and carries on to the end of the page',
      [
        await focused(),
        await evaluate('Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2'),
      ],
      ['foot-contact', true],
    );
    await press('ArrowDown', 500);
    check('at the very end the ring bumps instead', await page.ringClass(), 'ring bump-down');
    for (let i = 0; i < 12 && (await focused()) !== 'late-link'; i++) await press('ArrowUp', 500);
    check('up reads back the same way', await focused(), 'late-link');
  });

  await scenario('a web app whose window does not scroll', { url: `${site.origin}/app.html` }, async (app) => {
    const page = await app.page(site.origin);
    const { evaluate, press, focused } = page;
    await sleep(800);
    await press('ArrowDown');
    check('the first press takes the bar (there is nothing else on screen)', await focused(), 'inbox');
    for (let i = 0; i < 6 && (await focused()) !== 'deep'; i++) await press('ArrowDown', 600);
    check(
      'down reaches a link deep in the scrolling pane',
      [await focused(), (await evaluate('document.getElementById("pane").scrollTop')) > 0, await evaluate('scrollY')],
      ['deep', true, 0],
    );
    for (let i = 0; i < 4; i++) await press('ArrowDown', 500);
    check(
      'and scrolls the pane to its end when there is nothing more to move to',
      await evaluate(
        '(() => { const p = document.getElementById("pane"); return Math.ceil(p.scrollTop + p.clientHeight) >= p.scrollHeight - 2; })()',
      ),
      true,
    );
  });

  // The shapes of a page of results. Found by Andrew on the first evening at
  // a TV: on a search engine's results the title of each result could not be
  // reached, and the box round what could be was cut through its words.
  await scenario('a page of results', { url: `${site.origin}/results.html`, args: ['--zoom=1'] }, async (app) => {
    const page = await app.page(site.origin);
    const { evaluate, press, focused } = page;
    await sleep(800);
    const walk = [];
    for (let i = 0; i < 7; i++) {
      await press('ArrowDown', 350);
      walk.push(await focused());
    }
    check('each press of Down lands on the next result, never on the small button beside one', walk, [
      'top',
      'first',
      'sub1',
      'sub2',
      'second',
      'story',
      'last',
    ]);
    for (let i = 0; i < 5; i++) await press('ArrowUp', 350);
    check('and Up comes back the same way', await focused(), 'first');
    await sleep(500);
    const ring = await page.overlay(({ cls, style }) => (/(^| )ring( |$)/.test(cls) ? style : undefined));
    const px = (name) => Number(new RegExp(`(?:^|[; ])${name}: (-?[\\d.]+)px`).exec(ring ?? '')?.[1]);
    const held = await evaluate(
      `(() => { const y = scrollY; return ['.site', '.name'].map((s) => { const r = document.querySelector('#first ' + s).getBoundingClientRect(); return [r.top + y, r.bottom + y]; }); })()`,
    );
    check(
      'the box goes round the whole of a result, not through its words',
      [px('top') <= held[0][0], px('top') + px('height') >= held[1][1]],
      [true, true],
    );
    check(
      'a link in a line of text does not grow, and what is pinned in it stays where it was',
      await evaluate(
        `(() => { document.querySelector('[data-longboard-focus]'); return document.querySelectorAll('[data-longboard-zoom]').length; })()`,
      ),
      0,
    );
    await press('ArrowLeft', 350);
    check('the small button is still reached, sideways', await focused(), 'first-more');
    await press('ArrowDown', 350);
    check('and Down from it goes on down the page', await focused(), 'sub1');
    // The referee: everywhere Tab stops, the highlight can reach.
    const said = await page.referee();
    check(
      'everything the Tab key stops at can be reached with the arrows',
      [said.stops, said.seen, said.reached, said.missed],
      [10, 10, 10, []],
    );
  });

  // At a scale of 1: drawn bigger, the browser's own drop-down list opens
  // under where the virtual screen's mouse pointer happens to start, and the
  // entry under the pointer is the one the arrows move from. Measured: with
  // the pointer moved anywhere else first, the scaled run chooses the same
  // entry as this one. STATUS.md lists what that means on a TV.
  await scenario(
    'a search field with suggestions, and a top bar',
    { url: `${site.origin}/combo.html`, args: ['--zoom=1'] },
    async (app) => {
      const page = await app.page(`${site.origin}/combo.html`);
      if (!page) return fail('the page did not open');
      const chrome = await app.chrome();
      await sleep(700);
      await page.press('ArrowDown', 300);
      await page.press('ArrowUp', 400);
      check('Up goes to the top bar, not to the link parked above the page', await page.focused(), 'logo');
      await page.press('ArrowUp', 500);
      check(
        'Up at the top has nowhere to go: the parked link is not a target, and what is beside is not above',
        [await page.focused(), await page.toastText()],
        ['logo', 'Press Up again for the menu'],
      );
      await page.press('ArrowUp', 600);
      check(
        'so Up again opens the menu',
        await chrome.evaluate('document.querySelector("#panel h1")?.textContent'),
        'Menu',
      );
      await chrome.press('Escape', 500);
      await page.press('ArrowRight', 300);
      check('Right goes along the bar to the search field', await page.focused(), 'q');
      await page.press('Enter', 600);
      check('OK on it brings the keyboard', await page.keyboardShown(), true);
      await page.press('Enter', 400);
      await page.press('Escape', 600);
      check(
        'a letter typed opens the suggestions, and they stay when the keyboard is put away',
        [
          await page.keyboardShown(),
          await page.evaluate(
            'document.getElementById("q").getAttribute("aria-expanded") + " " + document.getElementById("q").value.length',
          ),
        ],
        [false, 'true 1'],
      );
      const marked = () =>
        page.evaluate(
          '[document.activeElement?.id, document.getElementById("q").getAttribute("aria-activedescendant")]',
        );
      await page.press('ArrowDown', 500);
      check('Down marks the first suggestion, with the cursor still in the field', await marked(), ['q', 'opt-0']);
      await page.press('ArrowDown', 500);
      check('Down again marks the second', await marked(), ['q', 'opt-1']);
      const ring = await page.overlay(({ cls, style }) => (/\bring\b/.test(cls) ? style : undefined));
      const optTop = await page.evaluate('Math.round(document.getElementById("opt-1").getBoundingClientRect().top)');
      check(
        'the ring is on the marked suggestion',
        Math.abs(Number(/top: ([\d.]+)px/.exec(ring ?? '')?.[1]) - optTop) <= 12,
        true,
      );
      await page.press('ArrowUp', 500);
      check('Up goes back to the first', await marked(), ['q', 'opt-0']);
      await page.press('Enter', 500);
      check(
        'OK chooses the marked suggestion, and does not bring the keyboard',
        [await page.evaluate('window.__chosen'), await page.keyboardShown()],
        ['one', false],
      );
      await page.press('ArrowDown', 500);
      check('with the list closed, Down moves on down the page', await page.focused(), 'first');
      await page.press('ArrowUp', 500);
      check(
        'Up from there passes over the link that jumps lower when it gets the cursor',
        await page.focused(),
        'logo',
      );
      check(
        'a side menu parked off the screen, calling itself a modal dialog, did not take the page away',
        await page.inLayer('globalThis.longboardReferee.targets().length > 4'),
        true,
      );
      await page.evaluate('document.getElementById("stuck").focus(); 0');
      await sleep(400);
      await page.press('ArrowDown', 700);
      check(
        'a field whose "open list" does nothing with the keys does not hold the highlight: Down moves on',
        await page.focused(),
        'after',
      );
      await page.evaluate('document.getElementById("stuck").focus(); 0');
      await sleep(400);
      await page.press('ArrowUp', 700);
      check('and so does Up', await page.focused(), 'second');
    },
  );

  await scenario(
    'a question laid over the whole page, with nothing to say it is a dialog',
    { url: `${site.origin}/gate.html`, args: ['--zoom=1'] },
    async (app) => {
      const page = await app.page(`${site.origin}/gate.html`);
      if (!page) return fail('the page did not open');
      await sleep(700);
      await page.press('ArrowDown', 300);
      check('the first press lands in the layer in front, not on the page behind it', await page.focused(), 'yes');
      await page.press('ArrowDown', 300);
      await page.press('ArrowDown', 300);
      await page.press('ArrowLeft', 300);
      check('and the highlight stays in it', await page.focused(), 'no');
      await page.press('ArrowUp', 300);
      await page.press('Enter', 600);
      check('answering it takes the layer away', await page.evaluate('!document.getElementById("gate")'), true);
      await page.press('ArrowDown', 400);
      await page.press('ArrowDown', 400);
      check('and then the page can be walked', ['one', 'two', 'three'].includes(await page.focused()), true);
    },
  );

  await scenario(
    'a form, and things that only look clickable',
    { url: `${site.origin}/form.html`, args: ['--zoom=1'] },
    async (app) => {
      const page = await app.page(site.origin);
      const { evaluate, press, focused } = page;
      const value = (id) => evaluate(`document.getElementById("${id}").value`);
      await sleep(800);
      await press('ArrowDown', 300);
      check(
        'the first press lands on the text field, and no keyboard gets in the way',
        [await focused(), await page.keyboardShown()],
        ['name', false],
      );
      await press('Enter', 300);
      check('OK on it brings the keyboard up', await page.keyboardShown(), true);
      await press('Enter', 300);
      check('and it types', await value('name'), 'a');
      await press('ArrowRight', 200);
      await press('Enter', 300);
      for (let i = 0; i < 4; i++) await press('ArrowDown', 200);
      await press('ArrowRight', 200);
      await press('Enter', 300);
      check(
        "the keyboard's left arrow moves the cursor in the field, and the keyboard stays",
        [
          await value('name'),
          await evaluate('document.getElementById("name").selectionStart'),
          await page.keyboardShown(),
        ],
        ['ab', 1, true],
      );
      for (let i = 0; i < 4; i++) await press('ArrowUp', 200);
      await press('Enter', 300);
      check('what is typed next goes in where the cursor is', await value('name'), 'acb');
      for (let i = 0; i < 4; i++) await press('ArrowDown', 200);
      await press('ArrowRight', 200);
      await press('Enter', 300);
      check('and the right arrow moves it on', await evaluate('document.getElementById("name").selectionStart'), 3);
      if (process.env.OSK_SHOT) {
        const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' });
        (await import('node:fs')).writeFileSync(process.env.OSK_SHOT, Buffer.from(data, 'base64'));
      }
      await press('Escape');
      check('Back puts the keyboard away', await page.keyboardShown(), false);
      await press('ArrowDown');
      check('down goes to the drop-down', await focused(), 'colour');
      await press('Enter', 500);
      await press('ArrowDown', 300);
      await press('Enter', 400);
      check("OK opens the browser's own list, the arrows move in it and OK chooses", await value('colour'), 'green');
      await press('ArrowDown');
      check('after which the arrows move the highlight again', await focused(), 'agree');
      await press('Enter');
      check('a checkbox is ticked', await evaluate('document.getElementById("agree").checked'), true);
      await press('ArrowDown');
      await press('ArrowRight');
      await press('Enter');
      check(
        'a radio button is chosen',
        [await focused(), await evaluate('document.getElementById("large").checked')],
        ['large', true],
      );
      await press('ArrowDown');
      check('down goes to the slider', await focused(), 'level');
      await press('ArrowRight', 300);
      await press('ArrowRight', 300);
      check('left and right move a slider', await value('level'), '7');
      await press('ArrowDown', 300);
      check(
        'down passes over the text box without the keyboard',
        [await focused(), await page.keyboardShown()],
        ['notes', false],
      );
      // A plugged-in keyboard just types, and then the keys are the field's.
      await page.type('h ');
      await sleep(200);
      check(
        'a real keyboard types straight into it, spaces included',
        [await value('notes'), await page.keyboardShown()],
        ['h ', false],
      );
      await press('ArrowDown');
      await press('Enter');
      check('the form can be sent', [await focused(), await evaluate('__f.submitted')], ['send', 1]);
      await press('ArrowDown');
      check('a card that is clickable only by script and cursor takes the highlight', await focused(), 'card1');
      await press('Enter');
      await press('ArrowRight');
      await press('Enter');
      await press('ArrowRight');
      check(
        'and is pressed; what is not clickable is passed over',
        [await evaluate('__f.clicks'), await focused()],
        [['card1', 'card2'], 'card2'],
      );
      await press('ArrowLeft');
      await press('ArrowDown');
      await press('Enter');
      check(
        'an element with an inline handler works',
        [await focused(), await evaluate('__f.clicks.at(-1)')],
        ['old', 'old'],
      );
      await press('ArrowDown');
      await press('Enter');
      check(
        'a disclosure opens',
        [await focused(), await evaluate('document.getElementById("more").open')],
        ['summary', true],
      );
    },
  );

  await scenario("a video with the browser's own controls", { url: `${site.origin}/video.html` }, async (app) => {
    const page = await app.page(site.origin);
    const { evaluate, press, focused } = page;
    const paused = () => evaluate('document.getElementById("v").paused');
    await sleep(1200);
    check(
      'the video is playing as part of the page',
      await evaluate('!document.getElementById("v").paused && document.getElementById("v").currentTime > 0'),
      true,
    );
    await press('ArrowDown');
    await press('ArrowDown');
    check('while it is only part of the page the arrows move the highlight, and can land on it', await focused(), 'v');
    await press('ArrowDown');
    check('and move on past it', await focused(), 'theatre');
    await press('Enter', 2500);
    check(
      'once it fills the screen the highlight is put away',
      [await evaluate('document.body.classList.contains("theatre")'), await focused()],
      [true, null],
    );
    await press(' ', 500);
    check('Space pauses it', await paused(), true);
    await press('Enter', 500);
    check('OK resumes it', await paused(), false);
    check(
      'with ordinary key presses, not by calling the video',
      (await evaluate('__v.keys')).filter((k) => k === ' ').length,
      2,
    );
  });
}
