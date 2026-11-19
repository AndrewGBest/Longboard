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
| Menu key, Ctrl+O, Start | The menu: address, Home, Back, Reload, zoom, pointer, the ad-blocking switch for the site, add as an app, make or edit a profile, Settings |
| F2, right stick click | Pointer mode on and off |
| Ctrl+Q | Quit |

Settings (in the menu) has the search site, sizes, ad blocking, privacy
(including "ask sites not to track" and refusing trackers), what sites may
ask for, a parental lock with a PIN, extensions from the Chrome Web Store
(not all of them work), new versions, and profiles. The menu's page about the
site in front has reader view, "Desktop site", find on the page, and keeping
the page on Home. Keys and controller buttons can be remapped
in `~/.config/Longboard/config.json`, which is also where Settings keeps its
choices (see `src/shared/config.ts`).

## What is missing

Compared with a mainstream browser, today:

- **No Safe Browsing.** Nothing warns about known phishing or malware sites.
- No saved passwords, autofill, sync, voice search or translation. Tabs are
  not kept when Longboard is closed.
- Ad blocking only refuses requests that a public filter list names. It
  does not hide the gaps ads leave, and it does nothing about advertising
  inside a video stream.
- Downloads are saved, after a question. The menu lists the ones from this
  run and can cancel one under way. Longboard does not open what it saves.
- A site is asked about before it gets the camera, microphone, location,
  notifications, the clipboard, MIDI or the pointer. USB, serial and screen
  capture are refused: they need a chooser Longboard does not have yet.
- No published release yet. Once there is one, a copy run as an AppImage
  looks for new releases daily and installs them; Settings can turn that off.

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
| [docs/RESEARCH-BROWSERS.md](docs/RESEARCH-BROWSERS.md) | What TV design guidance and other browsers do, with sources |
| [docs/RESEARCH-STORE-ARM.md](docs/RESEARCH-STORE-ARM.md) | The Chrome Web Store's terms, and what ARM needs, with sources |
| [docs/RESEARCH-VOICE.md](docs/RESEARCH-VOICE.md) | Ways to recognise speech on the device, and search-suggestion addresses, with sources |
| [docs/SCORECARD.md](docs/SCORECARD.md) | How generic mode did on a fixed list of public sites |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to help, with code or with profiles |
| [CLAUDE.md](CLAUDE.md) | Working rules for every contributor, human or AI |

## How it is made

The code is written with Claude Code, an AI coding agent, directed and tested
by the owner, who is responsible for what is released.

## Licence

GPL-3.0 for the application. Profiles in the shared catalogue are data and are
CC0-1.0, free for anyone to reuse.

Ad blocking uses the request matcher from Ghostery's adblocker library
(MPL-2.0, https://github.com/ghostery/adblocker), which is built into the
program, and the EasyList filter list (https://easylist.to, by the EasyList
authors, GPL-3.0 or CC BY-SA 3.0), which is not part of Longboard: each
copy of Longboard downloads it from its authors.

Longboard is an independent project. It is not affiliated with any website or
streaming service it can display. It does not provide, unlock or bypass access
to any content and does not remove or work around DRM.
