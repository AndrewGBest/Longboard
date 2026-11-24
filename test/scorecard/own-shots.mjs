// Pictures of Longboard's own screens for the README and the project site.
// Everything on screen is Longboard's or an invented fixture page: no real
// website is opened, so nothing of anyone else's ends up in a picture
// (Hard rules 1 and 6).
//
//   xvfb-run -a -s "-screen 0 1920x1080x24" node test/scorecard/own-shots.mjs <folder>
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, serveFixtures, sleep } from '../e2e/harness.mjs';

const out = process.argv[2];
if (!out) throw new Error('say which folder the pictures go in');
mkdirSync(out, { recursive: true });
const site = await serveFixtures();
// The whole window as the display shows it: page, highlight and Longboard's screens together.
const shot = (name) => execFileSync('import', ['-window', 'root', join(out, `${name}.png`)]);
const apps = ['Films', 'Music', 'News', 'Sport', 'Games', 'Weather'].map((name) => ({
  id: name.toLowerCase(),
  url: `http://${name.toLowerCase()}.test/`,
  name,
  ownSession: false,
  launcher: false,
}));
const seed = (dir) => writeFileSync(join(dir, 'apps.json'), JSON.stringify({ apps }));

{
  const app = await launch({ width: 1920, height: 1080, seed });
  const chrome = await app.chrome();
  await sleep(2500);
  await chrome.press('ArrowDown', 400);
  await chrome.press('ArrowRight', 600);
  shot('home');
  await app.close();
}
{
  const app = await launch({ url: `${site.origin}/showcase.html`, width: 1920, height: 1080, seed });
  const page = await app.page(site.origin);
  const chrome = await app.chrome();
  await sleep(2000);
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight']) await page.press(key, 500);
  shot('highlight');
  await page.press('ContextMenu', 900);
  await chrome.press('ArrowDown', 300);
  shot('menu');
  await chrome.press('Escape', 600);
  await app.close();
}
{
  const app = await launch({ url: `${site.origin}/form.html`, width: 1920, height: 1080, seed });
  const page = await app.page(site.origin);
  await sleep(2000);
  await page.press('ArrowDown', 500);
  await page.press('Enter', 1200);
  shot('keyboard');
  await app.close();
}
site.close();
process.exit(0);
