# Longboard: working rules

Read this file at the start of every session, and re-read the Hard rules before
any commit. Then read `docs/STATUS.md` for where things stand.

Longboard is an open-source web browser for TVs, driven by a remote or game
controller. It is a Chromium shell with an original navigation layer, a
generic mode for any website and data-only profiles for specific sites. The
owner is Andrew (GitHub: AndrewGBest). Releases go out through GitHub Releases.

## Hard rules

These are not style preferences. A change that breaks one does not ship, even
if asked for casually. If a request conflicts with a rule, stop and say so.
The reasoning for each is in `docs/LEGAL-GUARDRAILS.md`.

1. **No third-party material in the repo or the packages.** No code, fonts,
   logos, artwork, sounds, screenshots or copied text from any website or
   service is committed or shipped. Libraries come as declared dependencies
   with their licences recorded. What Longboard fetches for the person at
   run time (filter lists, reviewed profiles, a site's icon, an extension
   the person adds) comes from its source, stays on their machine and is
   never committed. The Widevine library is never committed or bundled.
2. **DRM is left alone.** Protected playback goes through the browser's
   standard EME interface with the unmodified CDM. Never extract keys, patch or
   wrap the CDM, inspect or replay licence traffic, record or download streams,
   or work around a resolution or output restriction.
3. **Honest identity.** The user agent is the embedded Chromium's real one with
   only the app tokens removed. Never claim to be another browser or engine,
   another OS, a console, a phone, or another maker's device. Never invent
   device IDs or serials. No user-agent switcher. **One addition is allowed**
   (Andrew, 2026-11-21): Longboard is a TV browser, so for a site whose
   profile says `view.device: "tv"` it may add, after the unchanged honest
   identity, the one fixed statement that it is Longboard running as a TV,
   so that the site serves the interface it made for TVs. The wording is
   Longboard's and lives in `src/main/useragent.ts`; a profile can only say
   `"tv"`, never supply or alter an identity; the person cannot pick one
   either. This is never used to get past DRM, a paywall, a region limit or
   a resolution limit (rule 2 stands untouched).
4. *(Removed by Andrew, 2026-11-18. Longboard is a whole browser, not a
   client for streaming services. The number is kept so the other rules keep
   theirs. Rules 2, 3 and 5 still stand.)*
5. **Ad blocking is the person's to control.** As shipped, each site has
   its own switch, which starts off on verified sites (the reviewed list in
   the profiles repository) and on everywhere else. The person can change a
   site's switch, edit the list, or set blocking on or off for every site in
   Settings. Longboard never changes any of these for the person and never
   ships a default that turns blocking on for a verified site. It works by
   refusing requests on public filter lists: never in-stream ad skipping,
   never anti-detection. The starting-state decision is a tested pure
   function.
6. **No trademarks in the name, app ID, icon or artwork.** Plain-text
   descriptions of compatibility are fine, with the non-affiliation notice.
   Site icons shown in the UI come from the site at run time, never the repo.
7. **Profiles are data.** A profile cannot contain or load code in format
   version 1. The validator rejects unknown keys. Never add a way for a profile
   to run script without a recorded decision and a new format version.
8. **Selectors come from evidence.** Nothing is added to a reviewed or
   built-in profile without an outline from the live site showing it. Never
   guess a selector from memory. Every site must still work, degraded, with no
   profile.
9. **No reverse engineering of services' apps.** The only inputs are pages
   served to a browser.
10. **Credentials are the user's business.** Sign-in happens on the site's own
    page. An agent or script never types, reads or handles passwords or
    one-time codes, and under `--automation` the on-screen keyboard stays out
    of those fields; a person's own key picks may pass to them. Passwords and
    codes are never logged. Longboard may keep a password only when the person
    asks it to, encrypted with the system's keyring, on this machine only,
    never synced or sent anywhere. Never commit cookies, profiles of browsing
    data, HAR files or anything captured from a signed-in session.
11. **Automation never spends money.** Any agent- or script-driven run uses
    `--automation`, which blocks purchase, rental, subscription and sign-up
    controls. Never disable or weaken the guard to get a test through.
12. **Privacy by default.** No telemetry, analytics or crash upload. Outlines
    contain structure only and are written locally. Every request Longboard
    makes by itself in the background is disclosed in Settings and can be
    turned off there; adding one needs a recorded decision. The one it cannot
    turn off is the engine's own download of the protected-playback
    component, which is disclosed.
13. **Least privilege in the shell.** Keep `contextIsolation: true`,
    `sandbox: true`, `nodeIntegration: false`, no `contextBridge` API exposed to
    web pages, default-deny permissions (a site gets camera, microphone,
    location and the like only when the person says yes for that site), no
    click-through on certificate errors.
14. **Stay current.** The shell is updated to each stable castLabs Electron
    release promptly. A browser on an old engine is unsafe; do not postpone
    this for features.

`npm run check` enforces the mechanical parts of these. Passing it is
necessary, not sufficient.

## How to work

- **Verify before claiming.** Run `npm run check` before every commit. Run
  `npm run e2e` (under `xvfb-run -a` if headless) after touching the shell,
  preload, navigation or guard. Report results as they are, including failures.
- **Say what is verified and what is not.** Anything not exercised against a
  live site is unverified; record it in `docs/STATUS.md`, not as done.
- **Test first for logic.** Geometry, input mapping, profile validation and
  matching, the guard, the ad-block decision, the outline sanitiser and URL
  rules are pure and must have unit tests for every change.
- **Fixtures are invented.** Pages in `test/fixtures/` are made-up layouts.
  Outlines from live sites may be committed only after checking they contain
  no titles, names or IDs.
- **Small dependencies.** Adding a runtime dependency needs a line in
  `docs/DECISIONS.md` saying why and what its licence is.
- **Record decisions.** Any choice a future session might re-argue goes in
  `docs/DECISIONS.md` with the date and the reason. Mark the agent's own
  choices as assumptions.
- **Keep STATUS current.** Update `docs/STATUS.md` at the end of each session.
- **Commits.** Small, one purpose each, imperative subject line. Use a branch
  and a pull request once others contribute.
- **Sources.** Andrew wants claims backed by sources and guesses labelled as
  guesses. Apply that to docs, commit messages and reports.

## Map

| Path | What |
|---|---|
| `src/main/` | Shell: windows, sessions, permissions, profile store, ad blocking |
| `src/preload/` | Boots the layer in the isolated world |
| `src/layer/` | Navigation engine, profile interpreter, generic mode, pointer, player |
| `src/chrome/` | Home, menu, on-screen keyboard, profile editor |
| `src/platform/` | Per-OS code |
| `src/shared/` | Types and the profile schema |
| `profiles/` | Built-in profiles and the template |
| `test/` | Unit tests, invented fixtures, end-to-end harness |
| `scripts/` | Build and rule checks |
| `docs/` | Design, architecture, profiles, guardrails, roadmap, status, decisions |

## Commands

```
npm run check        # typecheck + unit tests + build + rule checks
npm run e2e          # the real app against the invented fixtures, driven over the DevTools protocol
npm run scorecard    # generic mode against the fixed list of public sites (test/scorecard/)
npm start            # a window; add an address to open it
npm run tv           # full screen
```

`e2e` and `scorecard` need a display: `xvfb-run -a npm run e2e` when headless.
Every scripted run uses `--automation` (rule 11); the harness in
`test/e2e/harness.mjs` adds it and there is no way to launch through it without.
