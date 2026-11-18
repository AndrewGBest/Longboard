// The About and help panel's words. The notice is the wording
// LEGAL-GUARDRAILS.md requires in every release; keep the two in step.
import { PRODUCT } from './product';

export const NOTICE =
  `${PRODUCT.name} is an independent project. It is not affiliated with any website or streaming service it can display. ` +
  'It does not provide, unlock or bypass access to any content and does not remove or work around DRM.';

/** What Longboard fetches by itself, said where the person can read it (Hard rule 12). */
export const BACKGROUND =
  `${PRODUCT.name} sends no usage data. Once a day it downloads the list of reviewed profiles and verified sites from the ` +
  'Longboard-Profiles repository on GitHub; the whole list is fetched, so nothing is revealed about the sites you visit. ' +
  'Put "catalogue": false in config.json to stop it. ' +
  'For ad blocking it downloads a public filter list, EasyList, from its authors at easylist.to every four days, also whole. ' +
  'Put "adBlocking": false in config.json to leave ad blocking out and stop that download.';

export const HELP: readonly (readonly [string, string])[] = [
  ['Arrows or D-pad', 'Move'],
  ['OK, Enter or A', 'Select; play or pause on a full-screen video'],
  ['Back, Backspace, Escape or B', 'Back'],
  ['Menu key, Ctrl+O or Start', 'Open or close the menu'],
  ['F2 or right stick click', 'Pointer mode on or off'],
  ['Space or X', 'Play or pause'],
  ['Left, Right, LB or RB on a video', 'Skip back or forward'],
  ['/ or Y', "Go to the page's search field"],
  ['Ctrl+Shift+D', 'Save a page outline (structure only)'],
  ['Ctrl+Q', 'Quit'],
];

export function aboutTitle(version: string | undefined): string {
  return version ? `${PRODUCT.name} ${version}` : PRODUCT.name;
}
