// End-to-end tests: the real app, started with --automation, driven over the
// DevTools Protocol against invented fixture pages served from this machine.
// Run with `npm run e2e` (needs a display; `xvfb-run -a npm run e2e` headless).
//
// The scenarios are in scenarios/, one file per subject, and run one after
// another in the order listed below. `--part=2/6` runs
// every sixth scenario starting with the second; words on the command line
// run only the scenarios whose names contain them (scenarios/setup.mjs).
import { failureCount } from './harness.mjs';
import { logs, site } from './scenarios/setup.mjs';
import arrows from './scenarios/arrows.mjs';
import questionsDownloads from './scenarios/questions-downloads.mjs';
import home from './scenarios/home.mjs';
import pages from './scenarios/pages.mjs';
import frames from './scenarios/frames.mjs';
import pointer from './scenarios/pointer.mjs';
import profiles from './scenarios/profiles.mjs';
import adblock from './scenarios/adblock.mjs';
import wholeWindow from './scenarios/window.mjs';
import updatesExtensions from './scenarios/updates-extensions.mjs';
import settings from './scenarios/settings.mjs';
import apps from './scenarios/apps.mjs';
import keysSuggestions from './scenarios/keys-suggestions.mjs';
import speech from './scenarios/speech.mjs';

const subjects = [
  arrows,
  questionsDownloads,
  home,
  pages,
  frames,
  pointer,
  profiles,
  adblock,
  wholeWindow,
  updatesExtensions,
  settings,
  apps,
  keysSuggestions,
  speech,
];
for (const run of subjects) await run();

site.close();
if (failureCount()) {
  console.error(`\n${failureCount()} check(s) failed\n${logs.join('\n')}`);
  process.exit(1);
}
console.log('\nall end-to-end checks passed');
