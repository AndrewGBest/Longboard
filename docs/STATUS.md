# Status

Update this at the end of every working session. Newest first.

## 2026-11-18, later: phases 0 to 3 built by the agent working alone

Andrew asked the agent to work through the roadmap without him. Phases 0, 1,
2 and 3 are built and pushed. Phases 4 (web apps, the on-TV editor) and 5
(ad blocking) are not started. Choices the agent made on the way are in
DECISIONS.md, each marked as an assumption.

### What there is

| Phase | Built |
|---|---|
| 0 | Tropic Video's code under the Longboard layout and name, on castLabs Electron 45.2.1 |
| 1 | Home with "go to address or search" and recently opened sites; the menu panel (address, Home, Back, Reload, zoom, pointer, outline, profiles, About, Quit); any web address opens and nothing else does; permissions denied by default; the on-screen keyboard on Longboard's own screens and on pages |
| 2 | Generic mode: finds what can be pressed (including things that only look clickable), scrolls when there is nothing to move to, drop-downs, sliders, native-control video, frames. Pointer mode on F2 / right stick click. Fixture pages and the real-site scorecard |
| 3 | Profile format version 1 with validator, matcher and interpreter; Tropic Video's adapter converted into the first profile; local, imported, catalogue and built-in sources; import from USB and export; the catalogue repository with its checks and index; background fetch with checksums |

### Verified, and how

All of this was checked by scripts on a headless virtual machine. **None of
it was checked by a person, with a remote, on a TV.**

- `npm run check`: 303 unit tests (geometry, input mapping, address rules,
  navigation policy, permission policy, pointer movement, profile validation,
  matching and choosing, the interpreter, the profile store, the catalogue
  fetcher, the guard, the outline sanitiser), the build, and the rule checks.
- `xvfb-run -a npm run e2e`: the real app, always with `--automation`, driven
  over the DevTools protocol against invented fixture pages served from this
  machine. 15 scenarios, 171 checks. They cover: arrows on a grid of
  cards; the on-screen keyboard; pop-ups; refused addresses, downloads and
  permissions; Home, the address field, the menu, zoom and Back; searching;
  notices for blocked and unreachable pages; a full-screen video with the
  site's own keys; reading a long article; a web app with its own scrolling
  pane; a form; things that only look clickable; a video with the browser's
  controls; pointer mode including a click inside a frame from another site
  and the purchase guard inside that frame; a site with no profile, with a
  local one, with one from a (made-up) catalogue, and with an imported one.
- Real key events (xdotool under Xvfb), once, by hand: arrows move the
  highlight; F2 starts pointer mode; a held arrow moves the pointer. This is
  how it was found that key releases never reach the shell (DECISIONS.md).
- `xvfb-run -a npm run scorecard`: ten public sites with no profile. Results
  and their limits are in SCORECARD.md.

### Not verified

- **Anything on a real TV box, with a real remote or controller.** Fullscreen
  start, the 960x540 scale on a real screen, pointer speed, how a remote's
  keys arrive (especially whether a held key repeats), the gamepad paths.
  A controller could not be simulated here at all: every gamepad code path
  is covered only by unit tests of its pure parts.
- **Protected (DRM) playback.** The playback component downloads and reports
  ready here. No protected video was played. Whether the "allow protected
  video?" question is ever raised on Linux is unknown: the code and its
  policy are tested, the browser asking is not.
- **The Prime Video profile in Longboard against the live site.** It is a
  conversion of selectors that worked in Tropic Video, checked against the
  same outlines. Nobody has signed in with Longboard.
- **The real catalogue download.** The fetcher is tested against a made-up
  catalogue on this machine and, by unit tests, against failures. See the
  next section for the real one.
- Import from an actual USB stick, and anything inside a Flatpak.
- Packaging: `npm run dist` has not been run for Longboard. The icon is still
  Tropic Video's (original artwork of that project, so no rule is broken,
  but it is the wrong picture).
- CI: the workflow was pushed; whether it passes on GitHub was not looked at.

### Known gaps and rough edges

- `view.safeMargin` in a profile is accepted and not applied.
- A held arrow in pointer mode starts moving only when the keyboard's own
  repeat starts (about half a second), because key releases are not
  reported. A controller moves at once.
- With nothing to move to, the highlight can be off screen while a long
  article scrolls. There is then no indicator until a link comes into view.
- Home tiles have a letter, not the site's icon.
- Tiles cannot be removed from Home yet.
- Sites at the 960-pixel TV scale often show their phone layout.
- Profiles are chosen when a page loads, not when a site changes its address
  without loading.
- The menu has no "add as app" (phase 4) and no ad-blocking switch (phase 5).
- The same shared code lives in Tropic Video and Steamboat. Fixes made here
  to navigation, the keyboard and the shell were **not** carried back.

### Open questions for Andrew

- Keep or drop the agent's addition that sites with protected playback start
  with ad blocking off even when not yet verified (carried over, still open).
- DuckDuckGo as the default search: fine, or something else?
- The keyboard now opens on OK instead of whenever a field is focused. That
  costs one extra press on a sign-in page. Acceptable?

**Next:** try it on the TV box with the remote. Then phase 4.

## 2026-11-18: project started, documents only

- Andrew decided to build a TV browser with generic navigation and per-site
  profiles, named it Longboard and created the repository.
- An interview in chat settled the main choices; they are in DECISIONS.md,
  with the two assumptions the agent made where questions were skipped.
- Written: README, CLAUDE.md, CONTRIBUTING, and docs for design,
  architecture, profiles, guardrails, roadmap and decisions.
- Later the same day: ad blocking became a per-site switch with a reviewed
  verified-sites list; profiles are CC0-1.0; the profiles repository
  `AndrewGBest/Longboard-Profiles` was created and given a skeleton.

Still open from then: that a launcher entry can be created from inside a
Flatpak; that the ad-block library's licence and the filter lists' licences
allow shipping with a GPL-3.0 app; the two live LONGBOARD trademark records.
