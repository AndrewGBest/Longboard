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

1. **No third-party material in the repo.** No code, fonts, logos, artwork,
   sounds, screenshots or copied text from any website or service. The
   Widevine library is never committed or bundled.
2. **DRM is left alone.** Protected playback goes through the browser's
   standard EME interface with the unmodified CDM. Never extract keys, patch or
   wrap the CDM, inspect or replay licence traffic, record or download streams,
   or work around a resolution or output restriction.
3. **Honest identity.** The user agent is the embedded Chromium's real one with
   only the app tokens removed. Never claim to be a TV, console, phone, another
   OS or another browser. Never invent device IDs or serials. No user-agent
   switcher.
4. **Streaming services are not altered.** No in-stream ad skipping, no region
   or VPN workarounds, no rewriting of responses, headers or scripts, on any
   site. Requests are refused only by the ad-blocking switch in rule 5.
   The layer adds its own UI and sends ordinary input. It never calls `play()`,
   `pause()` or sets `currentTime` on a site's video.
5. **Ad blocking is a per-site switch the person controls.** It starts off on
   verified sites (the reviewed list in the profiles repository) and on sites
   granted protected playback, and on everywhere else. Never change the switch
   for the person, never ship a default that turns it on for a verified site.
   It works by refusing requests on public filter lists: never in-stream ad
   skipping, never anti-detection. The starting-state decision is a tested
   pure function.
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
    page. Never read, log or store passwords or one-time codes. The on-screen
    keyboard may pass a person's own key picks to those fields; an agent or
    script never types them, and under `--automation` the keyboard stays out of
    them. Never commit cookies, profiles of browsing data, HAR files or
    anything captured from a signed-in session.
11. **Automation never spends money.** Any agent- or script-driven run uses
    `--automation`, which blocks purchase, rental, subscription and sign-up
    controls. Never disable or weaken the guard to get a test through.
12. **Privacy by default.** No telemetry, analytics or crash upload. Outlines
    contain structure only and are written locally. The only background
    requests are the profile index and filter lists; both are disclosed in
    Settings and neither reveals which sites are visited.
13. **Least privilege in the shell.** Keep `contextIsolation: true`,
    `sandbox: true`, `nodeIntegration: false`, no `contextBridge` API exposed to
    web pages, default-deny permissions, no click-through on certificate
    errors.
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
