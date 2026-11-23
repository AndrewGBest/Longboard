// A wider, rougher look than the scorecard: many sites, and for each the
// things that go wrong for a remote. It looks for faults a script can see:
// a top that Up never reaches, a highlight that goes round in a loop, stops
// where nothing moves although the page goes on, a highlight left off
// screen, and controls Tab reaches that the highlight cannot.
//
//   xvfb-run -a -s "-screen 0 1920x1080x24" node test/scorecard/survey.mjs [words] [--out=file.jsonl] [--shots=folder] [--part=1/2] [--answer-gate] [--open-first] [--data=folder]
//
// Always --automation (Hard rule 11): nothing is typed, bought or signed in
// to. What is written holds kinds, sizes and counts, never a page's words.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, root, sleep, until } from '../e2e/harness.mjs';

const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const shots = opt('shots');
const out = opt('out');
const answerGate = args.includes('--answer-gate');
const openFirst = args.includes('--open-first');
// A data folder a person has signed in to by hand (test/scorecard/sign-in.mjs).
const keep = opt('data');
const [part, parts] = (opt('part') ?? '1/1').split('/').map(Number);
const only = args.filter((a) => !a.startsWith('--'));
const { sites } = JSON.parse(readFileSync(join(root, opt('list') ?? 'test/scorecard/survey-sites.json'), 'utf8'));
const list = sites.filter((s) => !keep || s.account).map((s) => (keep && s.app ? { ...s, url: s.app } : s)).filter((s, i) => (only.length === 0 || only.some((o) => s.url.includes(o))) && i % parts === part - 1);
if (shots) mkdirSync(shots, { recursive: true });

const STATE = `(() => {
  // The highlight may be inside a component's own tree, which querySelector does not look into.
  const deep = (root) => {
    const hit = root.querySelector('[data-longboard-focus]');
    if (hit) return hit;
    for (const e of root.querySelectorAll('*')) {
      const inner = e.shadowRoot && deep(e.shadowRoot);
      if (inner) return inner;
    }
    return null;
  };
  const f = deep(document);
  const r = f?.getBoundingClientRect();
  const doc = document.scrollingElement ?? document.documentElement;
  return {
    focus: f ? f.tagName.toLowerCase() + (f.getAttribute('role') ? '[' + f.getAttribute('role') + ']' : '') + (f.getAttribute('type') ? ':' + f.getAttribute('type') : '') : null,
    at: r ? [Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)].join(',') : null,
    onScreen: r ? r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth : false,
    small: r ? r.width < 4 || r.height < 4 : false,
    scroll: Math.round(scrollY),
    room: Math.round(doc.scrollHeight - innerHeight - scrollY),
    dialog: !!document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]'),
    frames: document.getElementsByTagName('iframe').length,
    elements: document.getElementsByTagName('*').length,
    host: location.hostname,
    path: location.pathname.split('/').length - 1,
  };
})()`;

async function survey(site) {
  const row = { site: new URL(site.url).hostname, kind: site.kind, loaded: false, endedAt: '', elements: 0, dialog: false, first: '-', topIn: null, topFault: '', down: { moved: 0, stuckWithRoom: 0, loop: 0, offScreen: 0, small: 0, leftSite: false }, side: 0, tab: '-', missed: '-', beyond: 0, note: '' };
  const app = await launch({ url: site.url, args: ['--zoom=2'], width: 1920, height: 1080, keep });
  try {
    const page = await app.page('http', 150);
    if (!page) throw new Error('no page');
    const ready = await until(() => page.evaluate('document.readyState'), (s) => s === 'complete', 100, 200);
    row.loaded = ready === 'complete' || ready === 'interactive';
    await sleep(4000);
    const shot = async (name) => shots && writeFileSync(join(shots, `${row.site}-${name}.png`), Buffer.from((await page.cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    const state = () => page.evaluate(STATE);
    const press = async (key, wait = 650) => {
      await answer();
      await page.press(key, wait);
      return state();
    };
    // A site may ask for something (where the device is, notices), as it
    // opens or later. Longboard then puts its question in front and the
    // arrows go to it, which from the page looks like a highlight that never
    // moves. The answer given is "Do not allow", which is where the question
    // starts and is remembered, so a site that asks again is not asked about again.
    const chrome = await app.chrome();
    const answer = async () => {
      for (let i = 0; i < 3 && (await chrome.evaluate('document.activeElement?.id === "prompt-deny"').catch(() => false)); i++) {
        row.asked = (row.asked ?? 0) + 1;
        await chrome.press('Enter', 700);
      }
    };
    await answer();
    let s = await state();
    row.elements = s.elements;
    row.dialog = s.dialog;
    row.endedAt = s.host;
    await shot('0');

    // An age question first, when asked to (--answer-gate): the highlight is
    // walked to the button that says the person is an adult, and OK is
    // pressed, as someone with a remote would. Andrew, an adult and the
    // owner, asked for these sites to be tested past the question
    // (2026-11-20). The button's words are read to find it and kept nowhere.
    if (answerGate) {
      const YES = `(() => { const t = (document.querySelector('[data-longboard-focus]')?.textContent ?? '').trim().toLowerCase(); return t.length < 60 && /(18|eighteen|adult|older|enter|agree|accept|yes)/.test(t) && !/(leave|exit|under|not |no,|decline|sign|log ?in|join|parent)/.test(t); })()`;
      row.gate = 'no such button found';
      for (const key of ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowLeft', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) {
        await page.press(key, 500);
        if (await page.evaluate(YES)) {
          await page.press('Enter', 5000);
          row.gate = 'answered';
          break;
        }
      }
      // Some sites put the cursor in their search field once the question is
      // answered, which brings the on-screen keyboard; Back puts it away.
      if (await page.keyboardShown()) {
        row.keyboardAfterGate = true;
        await page.press('Escape', 600);
      }
      const after = await state();
      row.dialogAfterGate = after.dialog;
      row.elements = after.elements;
    }

    // One page further in, when asked to (--open-first): the highlight is
    // walked down to the first large card and OK is pressed, and the page
    // that opens is what gets surveyed.
    if (openFirst) {
      row.opened = 'no large card found';
      for (let i = 0; i < 14; i++) {
        await page.press('ArrowDown', 600);
        const big = await page.evaluate(`(() => { const f = document.querySelector('[data-longboard-focus]'); const r = f?.getBoundingClientRect(); return !!f && f.tagName === 'A' && r.width >= 140 && r.height >= 80; })()`);
        if (big) {
          const from = await page.evaluate('location.pathname.length');
          await page.press('Enter', 7000);
          const now = await state();
          row.opened = `a page ${now.path} deep, ${now.elements} elements, ${await page.evaluate('document.getElementsByTagName("video").length')} video element(s), ${now.frames} frame(s)${(await page.evaluate('location.pathname.length')) === from ? ', address unchanged' : ''}`;
          row.elements = now.elements;
          row.endedAt = now.host;
          break;
        }
      }
      // Back to the top of whatever is now in front, with nothing highlighted from the walk above.
      await page.evaluate('window.scrollTo(0, 0); 0');
      await sleep(800);
    }

    // The top: one press to land, then Up until Longboard says it has nowhere to go.
    s = await press('ArrowDown');
    row.first = s.focus ?? 'nothing';
    const seenUp = new Set([`${s.at}/${s.scroll}`]);
    for (let i = 1; i <= 14; i++) {
      s = await press('ArrowUp', 500);
      if ((await page.toastText()) === 'Press Up again for the menu') {
        row.topIn = i;
        break;
      }
      const key = `${s.at}/${s.scroll}`;
      if (seenUp.has(key) && i > 1) {
        row.topFault = `Up went round after ${i} presses (${s.focus})`;
        break;
      }
      seenUp.add(key);
    }
    if (row.topIn === null && !row.topFault) row.topFault = 'no top after 14 presses';
    // Anything but Up, so that the next Up is not taken for "again".
    s = await press('ArrowLeft', 400);
    await shot('1');

    // Down the page.
    const seen = new Map();
    let before = s;
    const trail = [];
    for (let i = 0; i < 24; i++) {
      s = await press('ArrowDown');
      if (s.host !== row.endedAt) {
        row.down.leftSite = true;
        break;
      }
      const key = `${s.at}/${s.scroll}`;
      const same = s.at === before.at && s.scroll === before.scroll;
      if (!same) row.down.moved += 1;
      else if (s.room > 40) row.down.stuckWithRoom += 1;
      if (!same && seen.has(key)) row.down.loop += 1;
      seen.set(key, i);
      if (s.focus && !s.onScreen) row.down.offScreen += 1;
      if (s.focus && s.small) row.down.small += 1;
      trail.push(`${s.focus ?? '-'}@${s.at ?? '-'}/${s.scroll}`);
      before = s;
    }
    row.trail = trail.slice(-8);
    await shot('2');
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft']) {
      s = await press(key, 500);
      if (s.at !== before.at || s.scroll !== before.scroll) row.side += 1;
      before = s;
    }
    try {
      const said = await page.referee(120);
      row.tab = `${said.reached} of ${said.seen}`;
      const kinds = {};
      for (const m of said.missed) kinds[`${m.what} ${m.size}`] = (kinds[`${m.what} ${m.size}`] ?? 0) + 1;
      row.missed = Object.entries(kinds).slice(0, 8).map(([what, n]) => `${n}x ${what}`).join('; ') || '-';
      row.beyond = said.beyond;
    } catch (err) {
      row.tab = 'not measured';
      row.missed = String(err).slice(0, 80);
    }
    if (/blocked navigation|renderer exited/.test(app.log)) row.note = app.log.split('\n').filter((l) => /blocked navigation|renderer exited/.test(l)).slice(0, 2).join('; ').replace(/https?:\/\/\S+/g, '(address)').slice(0, 160);
  } catch (err) {
    row.note = String(err).slice(0, 160);
  } finally {
    // A site still writing as the app goes must not stop the survey.
    await app.close().catch(() => undefined);
  }
  return row;
}

for (const site of list) {
  const row = await Promise.race([survey(site), sleep(150000).then(() => ({ site: new URL(site.url).hostname, kind: site.kind, note: 'gave up after 150 s' }))]);
  const line = JSON.stringify(row);
  console.log(line);
  if (out) appendFileSync(out, `${line}\n`);
}
process.exit(0);
