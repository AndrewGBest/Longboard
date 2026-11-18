# Status

Update this at the end of every working session. Newest first.

## 2026-11-18, later: phases 0 to 4 built by the agent working alone

Andrew asked the agent to work through the roadmap without him. Phases 0 to
4 are built and pushed. Phase 4's profile editor is a first, small version.
Ad blocking (phase 5) is not started: Andrew said to leave it. Choices the agent made on the way are in
DECISIONS.md, each marked as an assumption.

### What there is

| Phase | Built |
|---|---|
| 0 | Tropic Video's code under the Longboard layout and name, on castLabs Electron 45.2.1 |
| 1 | Home with "go to address or search" and recently opened sites; the menu panel (address, Home, Back, Reload, zoom, pointer, outline, profiles, About, Quit); any web address opens and nothing else does; permissions denied by default; the on-screen keyboard on Longboard's own screens and on pages |
| 2 | Generic mode: finds what can be pressed (including things that only look clickable), scrolls when there is nothing to move to, drop-downs, sliders, native-control video, frames. Pointer mode on F2 / right stick click. Fixture pages and the real-site scorecard |
| 4 | "Add this site as an app": a tile on Home with the site's own icon, an entry in the desktop's app list, optional separate sign-ins, `--app=<id>`, removal. A first on-TV profile editor: point, press OK, mark as selectable / never / a row / the player, see it applied, save |
| 3 | Profile format version 1 with validator, matcher and interpreter; Tropic Video's adapter converted into the first profile; local, imported, catalogue and built-in sources; import from USB and export; the catalogue repository with its checks and index; background fetch with checksums |

### Verified, and how

All of this was checked by scripts on a headless virtual machine. **None of
it was checked by a person, with a remote, on a TV.**

- `npm run check`: 327 unit tests (geometry, input mapping, address rules,
  navigation policy, permission policy, pointer movement, profile validation,
  matching and choosing, the interpreter, the profile store, the catalogue
  fetcher, the guard, the outline sanitiser), the build, and the rule checks.
- `xvfb-run -a npm run e2e`: the real app, always with `--automation`, driven
  over the DevTools protocol against invented fixture pages served from this
  machine. 20 scenarios, 212 checks. They cover: arrows on a grid of
  cards; the on-screen keyboard; pop-ups; refused addresses, downloads and
  permissions; Home, the address field, the menu, zoom and Back; searching;
  notices for blocked and unreachable pages; a full-screen video with the
  site's own keys; reading a long article; a web app with its own scrolling
  pane; a form; things that only look clickable; a video with the browser's
  controls; pointer mode including a click inside a frame from another site
  and the purchase guard inside that frame; a site with no profile, with a
  local one, with one from a (made-up) catalogue, and with an imported one;
  adding a site as an app with its own sign-ins, its entry file and icon,
  opening it from Home and with `--app=`, and removing it; making a profile
  with the editor, saving it, and finishing without saving.
- Real key events (xdotool under Xvfb), once, by hand: arrows move the
  highlight; F2 starts pointer mode; a held arrow moves the pointer. This is
  how it was found that key releases never reach the shell (DECISIONS.md).
- `xvfb-run -a npm run scorecard`: ten public sites with no profile. Results
  and their limits are in SCORECARD.md.
- The real catalogue, once: the app was started with `--catalogue=` set to
  the published address on GitHub. It fetched the index and the one profile,
  the checksum matched, and the profile was on disk afterwards.
- CI on GitHub: the workflow (check, then the end-to-end run under Xvfb) has
  passed on every commit pushed so far, and the profiles repository's check
  has passed on both of its commits.

### Not verified

- **Anything on a real TV box, with a real remote or controller.** Fullscreen
  start, the 960x540 scale on a real screen, pointer speed, how a remote's
  keys arrive (especially whether a held key repeats), the gamepad paths.
  A controller could not be simulated here at all: every gamepad code path
  is covered only by unit tests of its pure parts.
- **Protected (DRM) playback.** The playback component downloads and reports
  ready here, and a page that asks for the Widevine key system is given it.
  No protected video was played. The "allow protected video?" question is
  never raised on Linux: the browser does not ask (DECISIONS.md).
- **The Prime Video profile in Longboard against the live site.** It is a
  conversion of selectors that worked in Tropic Video, checked against the
  same outlines. Nobody has signed in with Longboard.
- Import from an actual USB stick, and anything inside a Flatpak.
- **The app list entry on a real desktop.** The file is written where the
  desktop looks and its contents are tested; no desktop has been seen to
  show it or start it. Inside a Flatpak it will not work as written.
- Packaging: `electron-builder --linux dir` (the unpacked folder) was built
  once and the program in it started, found its built-in profile and showed
  Home. The AppImage, tarball and Flatpak have not been built, and nothing
  has been released.

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
- The menu has no ad-blocking switch (phase 5).
- The profile editor marks four things and writes nothing else of the
  format. Its selectors are a first guess at "things like this one". End to
  end it has only been used on a made-up page. On four real pages (a link
  list, an encyclopedia article, a news front page, a site built from web
  components) the agent pointed at three places each and read what was
  picked: the selectors were usable, but where a site has only machine-made
  class names and no test ids, one of those names can end up in a selector,
  and such a profile would stop matching when the site is next rebuilt.
  Nothing was saved or committed from those sites.
- An app's name and choices cannot be changed after it is added; remove it
  and add it again.
- The same shared code lives in Tropic Video and Steamboat. Fixes made here
  to navigation, the keyboard and the shell were **not** carried back.

### Open questions for Andrew

- Keep or drop the agent's addition that sites with protected playback start
  with ad blocking off even when not yet verified (carried over, still open).
- DuckDuckGo as the default search: fine, or something else?
- The keyboard now opens on OK instead of whenever a field is focused. That
  costs one extra press on a sign-in page. Acceptable?

**Next:** try it on the TV box with the remote. Everything after that
depends on what that shows.

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
