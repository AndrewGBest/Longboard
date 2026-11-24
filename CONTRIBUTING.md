# Contributing to Longboard

There are three ways to help. None of them needs permission first.

## 1. Tell us a site does not work

Open an issue with:

- the site's address;
- what you pressed and what happened;
- a page outline if you can: "Save page outline" in the menu writes one.
  Outlines hold the page's structure only: no text, names, links or account
  details. Look at the file before attaching it anyway.

The issue form asks for these. Security problems go through
[SECURITY.md](SECURITY.md), not a public issue.

## 2. Make or fix a profile

No programming needed. A profile is a settings file that says where things
are on one website. Read [docs/PROFILES.md](docs/PROFILES.md), then:

1. Save an outline of the page.
2. Copy the template and fill it in from what the outline shows.
3. Try it locally.
4. Open a pull request on the profiles repository with the profile, the
   outline and a note of what you tested and on what device.

What reviewers check:

- every selector appears in the outline (no guesses);
- the outline has no text, names or IDs;
- the site still works in generic mode with the profile removed;
- nothing in it is copied from the site: no artwork, text or code.

You can also just export your profile as a file and share it yourself.

## 3. Change the application

1. Read [CLAUDE.md](CLAUDE.md). Its Hard rules apply to everyone.
2. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): it says which folder
   does what and why the pieces are separate.
3. Work on a branch and open a pull request. Small ones are reviewed
   sooner.
4. Run `npm run check` before you push, and `npm run e2e` if you touched the
   shell, the preload or navigation.
5. Say in the pull request what you ran and what you could not check.

### Getting set up

Node 22 or newer, on Linux.

```
npm install
npm start              # a window; add an address to open it
npm run check          # types, lint, formatting, unit tests, build, rule checks
xvfb-run -a npm run e2e    # the real app against made-up pages (drop xvfb-run on a desktop)
npm run format         # let Prettier lay the code out
```

### Tests

- **Anything that decides something gets a unit test with the change:**
  moving the highlight, mapping input, reading a profile, the purchase
  guard, the ad-block decision, address handling. These live in
  `src/shared/` and `src/layer/` as plain functions so they can be tested
  without a browser. Tests are in `test/`, one file per subject.
- **Anything in the shell gets an end-to-end check** in
  `test/e2e/run.mjs`: the real app, driven over the DevTools protocol,
  against the made-up pages in `test/fixtures/`.
- A bug fix comes with the test that would have caught it.
- Fixtures are invented. Never copy a real site's page into the repository.

### How the code is written

Prettier decides the layout and ESLint catches mistakes; neither is up for
discussion in review. The rest is convention:

- **TypeScript, strict.** No `any`; a value from outside (a file, a page,
  a message) is `unknown` until it has been checked.
- **Decisions are pure functions; the shell wires them up.** If you are
  writing an `if` that decides how Longboard behaves, it probably belongs
  in `src/shared/` with a test, and the shell calls it.
- **Names say what a thing is for** in plain words: `profileFor(url)`,
  `blockingAt(site)`. No abbreviations that need a glossary.
- **A file does one thing** and starts with a few lines saying what, and
  what it must never do if a Hard rule is involved. When a file passes
  several hundred lines, look for the part that can stand alone.
- **Comments say why, not what.** Write a comment when the reason is not
  in the code: the site behaviour that forced it, the rule it keeps, the
  thing that was tried and did not work. Do not narrate the code, and do
  not write the history of a change: that goes in the commit message, and
  a decision somebody might re-argue goes in `docs/DECISIONS.md`.
- **Words on screen are plain English** and are part of the design: see
  the wording in `src/chrome/` before adding to it.
- **Commits** are small, do one thing, and have an imperative subject
  ("Stop the pointer leaving the window"). The body says why.
- **A new runtime dependency** needs a line in `docs/DECISIONS.md` saying
  why and what its licence is. Development tools do not.

## AI assistance

This project is written with AI assistance and says so. Contributions made
with AI tools are welcome on the same terms as any other: say that you used
them, understand what you are submitting, and take responsibility for it.

## Conduct

Be direct and be kind. Criticise the work, not the person. The longer
version is [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Licence

By contributing code you agree it is released under GPL-3.0, the same
licence it came to you under. There is no contributor agreement to sign.
Profiles
contributed to the catalogue are released under that repository's licence.
