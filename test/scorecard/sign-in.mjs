// Opens Longboard on the real screen, one site after another, for a person
// to sign in by hand. When the window is closed (the menu's Quit, or the
// desktop's close button) the next site opens.
//
//   node test/scorecard/sign-in.mjs --data=folder [words] [--list=file.json] [--size=1240x720]
//
// Hard rule 10: no script is attached to these windows. There is no
// debugging port and nothing is read from the page, so what is typed is seen
// by nobody but the site. The app is started as a person would start it, so
// --automation does not apply: nothing here is driven by a script. What the
// sites store stays in the data folder, which must be outside the
// repository and is never committed. The survey later opens the same folder
// (--data=) under --automation to see the signed-in pages.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { root } from '../e2e/harness.mjs';

const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const data = opt('data') && resolve(opt('data'));
if (!data || (data + sep).startsWith(root + sep)) {
  console.error('--data= must name a folder outside the repository');
  process.exit(2);
}
mkdirSync(data, { recursive: true });
const only = args.filter((a) => !a.startsWith('--'));
const { sites } = JSON.parse(readFileSync(join(root, opt('list') ?? 'test/scorecard/survey-sites.json'), 'utf8'));
// Sites marked as having an account, less those that share another site's.
const list = sites.filter((s) => s.account && !s.with && (only.length === 0 || only.some((o) => s.url.includes(o))));
// Those that cost nothing first.
list.sort((a, b) => (a.account === 'paid') - (b.account === 'paid'));
const electron = createRequire(import.meta.url)('electron');

let n = 0;
for (const site of list) {
  n += 1;
  console.log(
    `${n} of ${list.length}: ${new URL(site.app ?? site.url).hostname} opened (${site.account === 'paid' ? 'paid for' : 'free'})`,
  );
  const started = Date.now();
  // The same password-store setting as the survey, or the cookies kept here could not be read there.
  const child = spawn(
    electron,
    [
      root,
      '--dev',
      `--size=${opt('size') ?? '1240x720'}`,
      `--url=${site.app ?? site.url}`,
      `--user-data-dir=${data}`,
      '--password-store=basic',
    ],
    { stdio: 'ignore', env: { ...process.env, XDG_DATA_HOME: join(data, 'xdg') } },
  );
  await new Promise((r) => child.once('exit', r));
  console.log(`${n} of ${list.length}: closed after ${Math.round((Date.now() - started) / 1000)} s`);
}
