// The About and help panel's words. The notice is the wording
// LEGAL-GUARDRAILS.md requires in every release; keep the two in step.
export const NOTICE =
  'Longboard is an independent project. It is not affiliated with any website or streaming service it can display. ' +
  'It does not provide, unlock or bypass access to any content and does not remove or work around DRM.';

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
  return version ? `Longboard ${version}` : 'Longboard';
}
