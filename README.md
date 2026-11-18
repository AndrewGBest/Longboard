# Longboard

A web browser for the TV. You drive it from the couch with a remote, a game
controller or a keyboard, by moving a highlight from one thing to the next.

**Status: early, runs, not released.** You can start it, open any address
from a home screen, drive ordinary websites with the arrows, switch to an
on-screen pointer, and use profiles. It has been tested by scripts against
made-up pages and a handful of public sites, **not yet by a person with a
remote at a TV**. There are no packages to download; see "Trying it" below.
[docs/STATUS.md](docs/STATUS.md) says exactly what has been checked.

It grew out of [Tropic Video](https://github.com/AndrewGBest/Tropic-Video),
which does this for one website.

## The idea

Websites are built for a mouse or a finger. Longboard makes them usable with
six buttons: up, down, left, right, OK and Back.

- **Any website works to some degree.** A built-in generic mode finds the
  things you can press on a page and lets you move a highlight between them.
- **Good websites work properly.** A *profile* is a small settings file for
  one website that tells Longboard exactly how that site is laid out. If a
  reviewed profile exists for the site you open, Longboard uses it by itself.
- **Anyone can make a profile.** Profiles are data, not programs. You can
  write one, export it as a file, import someone else's, or submit it to the
  shared catalogue on GitHub.
- **Any website can be an app.** Add a site to the home screen and to your
  TV's app list, and it opens like an app.
- **A pointer when you need one.** One button gives you an on-screen cursor for
  the pages the highlight cannot handle.

## Trying it

Linux x86_64, with Node 22 or newer:

```
git clone https://github.com/AndrewGBest/Longboard
cd Longboard
npm install
npm start          # in a window
npm run tv         # full screen, as on a TV
```

Add an address to open it straight away: `npm start -- https://example.com`.

| Button | Does |
|---|---|
| Arrows, D-pad | Move the highlight; scroll when there is nothing to move to |
| OK, Enter, A | Select. On a text field: bring up the on-screen keyboard |
| Back, Backspace, Escape, B | Back; Home from a site's first page |
| Menu key, Ctrl+O, Start | The menu: address, Home, Back, Reload, zoom, pointer, profiles |
| F2, right stick click | Pointer mode on and off |
| Ctrl+Q | Quit |

Keys and controller buttons can be remapped in `~/.config/Longboard/config.json`
(see `src/shared/config.ts`).

## What is missing

Compared with a mainstream browser, today:

- **No Safe Browsing.** Nothing warns about known phishing or malware sites.
- No tabs, history, bookmarks or downloads. Home remembers the sites you
  opened lately and that is all.
- No ad blocking yet. It is the last phase of the roadmap.
- Permissions are simple: full screen is allowed, protected video is asked
  about, everything else (camera, microphone, location, notifications) is
  refused.
- No packages, no automatic updates.

## What it will not do

- It does not remove or work around DRM, and it never claims to be a TV or
  another device to get better video quality.
- It does not skip ads inside video, download streaming video, or get
  around region limits. Ad blocking is a per-site switch that starts
  off on reviewed sites such as streaming services and on elsewhere.
- It sends no telemetry.

## Documents

| Document | What it covers |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | What Longboard is, who it is for, how it behaves |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it is built |
| [docs/PROFILES.md](docs/PROFILES.md) | The profile format, the catalogue, import and export |
| [docs/LEGAL-GUARDRAILS.md](docs/LEGAL-GUARDRAILS.md) | The rules and why they exist |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Order of work |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Choices made, with dates and reasons |
| [docs/STATUS.md](docs/STATUS.md) | What exists and what has been checked |
| [docs/SCORECARD.md](docs/SCORECARD.md) | How generic mode did on a fixed list of public sites |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to help, with code or with profiles |
| [CLAUDE.md](CLAUDE.md) | Working rules for every contributor, human or AI |

## How it is made

The code is written with Claude Code, an AI coding agent, directed and tested
by the owner, who is responsible for what is released.

## Licence

GPL-3.0 for the application. Profiles in the shared catalogue are data and are
CC0-1.0, free for anyone to reuse.

Longboard is an independent project. It is not affiliated with any website or
streaming service it can display. It does not provide, unlock or bypass access
to any content and does not remove or work around DRM.
