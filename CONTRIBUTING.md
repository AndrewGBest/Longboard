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
2. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
   [docs/STATUS.md](docs/STATUS.md).
3. Work on a branch and open a pull request.
4. Navigation, input, profile handling and the ad-block decision need unit
   tests with every change.
5. Run `npm run check` before you push, and `npm run e2e` if you touched the
   shell, the preload or navigation.
6. Say in the pull request what you ran and what you could not check.

## AI assistance

This project is written with AI assistance and says so. Contributions made
with AI tools are welcome on the same terms as any other: say that you used
them, understand what you are submitting, and take responsibility for it.

## Conduct

Be direct and be kind. Criticise the work, not the person.

## Licence

By contributing code you agree it is released under GPL-3.0. Profiles
contributed to the catalogue are released under that repository's licence.
