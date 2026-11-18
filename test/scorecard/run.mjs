// The generic-mode scorecard: opens each site on the fixed list in the real
// app, presses the same keys on each, and records what happened. It measures
// only what a script can see: whether the highlight appears and moves, how
// long a key press takes, and whether pointer mode comes up. Whether a site
// is pleasant to use still has to be judged by a person at a TV.
//
//   xvfb-run -a npm run scorecard            every site
//   xvfb-run -a npm run scorecard -- wiki    sites whose address contains "wiki"
//   ... -- --shots=/some/folder              also save a picture of each (never commit these)
//
// Always --automation (Hard rule 11): nothing is typed, bought or signed in to.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, root, sleep, until } from '../e2e/harness.mjs';

const args = process.argv.slice(2);
const shots = args.find((a) => a.startsWith('--shots='))?.slice(8);
const only = args.filter((a) => !a.startsWith('--'));
const { sites } = JSON.parse(readFileSync(join(root, 'test/scorecard/sites.json'), 'utf8'));
const list = sites.filter((s) => only.length === 0 || only.some((o) => s.url.includes(o)));
if (shots) mkdirSync(shots, { recursive: true });

const KEYS = ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp'];
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

/** What the page looks like to the layer, with nothing of the page's words in it. */
const STATE = `(() => {
  const f = document.querySelector('[data-longboard-focus]');
  const r = f?.getBoundingClientRect();
  return {
    focus: f ? f.tagName.toLowerCase() + (f.getAttribute('role') ? '[' + f.getAttribute('role') + ']' : '') : null,
    where: r ? [Math.round(r.left), Math.round(r.top + scrollY)].join(',') : null,
    onScreen: r ? r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth : false,
    scroll: Math.round(scrollY),
    elements: document.getElementsByTagName('*').length,
  };
})()`;

const rows = [];
for (const site of list) {
  const host = new URL(site.url).hostname;
  const row = { site: host, kind: site.kind, loaded: false, first: '-', moved: 0, lost: 0, medianMs: 0, worstMs: 0, elements: 0, pointer: false, note: '' };
  rows.push(row);
  // The real TV scale: a 1920x1080 window drawn at 960x540.
  const app = await launch({ url: site.url, args: ['--zoom=2'], width: 1920, height: 1080 });
  try {
    const page = await app.page('http', 150);
    if (!page) throw new Error('no page');
    const ready = await until(() => page.evaluate('document.readyState'), (s) => s === 'complete', 150, 200);
    row.loaded = ready === 'complete' || ready === 'interactive';
    await sleep(2500);
    let before = await page.evaluate(STATE);
    row.elements = before.elements;
    const times = [];
    for (const [i, name] of KEYS.entries()) {
      const t0 = performance.now();
      await page.keyDown(name);
      times.push(performance.now() - t0);
      await page.keyUp(name);
      await sleep(700);
      const after = await page.evaluate(STATE);
      if (i === 0) row.first = after.focus ?? 'nothing';
      if (after.where !== before.where || after.scroll !== before.scroll) row.moved += 1;
      if (after.focus && !after.onScreen) row.lost += 1;
      before = after;
    }
    row.medianMs = Math.round(median(times));
    row.worstMs = Math.round(Math.max(...times));
    if (shots) writeFileSync(join(shots, `${host}.png`), Buffer.from((await page.cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await page.press('F2', 500);
    row.pointer = (await page.pointerAt()) !== null;
    if (/blocked navigation|renderer exited/.test(app.log)) row.note = app.log.split('\n').filter((l) => /blocked navigation|renderer exited/.test(l)).slice(0, 2).join('; ').slice(0, 120);
  } catch (err) {
    row.note = String(err).slice(0, 120);
  } finally {
    await app.close();
  }
  console.log(JSON.stringify(row));
}

const table = [
  '| Site | Kind | Loaded | First press lands on | Presses that moved or scrolled (of 12) | Highlight left off screen | Key press, median / worst (ms) | Elements | Pointer mode |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.site} | ${r.kind} | ${r.loaded ? 'yes' : 'no'} | ${r.first} | ${r.moved} | ${r.lost} | ${r.medianMs} / ${r.worstMs} | ${r.elements} | ${r.pointer ? 'yes' : 'no'} |${r.note ? ` ${r.note}` : ''}`),
].join('\n');
console.log(`\n${table}`);
