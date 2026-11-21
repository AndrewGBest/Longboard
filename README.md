# Longboard

A web browser for the TV. You drive it from the couch with a remote, a game
controller or a keyboard, by moving a highlight from one thing to the next.

**Status: early, released, in use on a TV.** You can start it, open any
address from a home screen, drive ordinary websites with the arrows, switch
to an on-screen pointer, and use profiles. Its owner has tested it at a TV
with a remote, including signed in to a number of well-known sites; what they
find wrong is fixed and written down. Beyond that it is tested by
scripts, against made-up pages and against a list of public sites. Not
every part has been tried by hand, and nobody else has reported on it yet:
expect rough edges. Packages are on the
[releases page](https://github.com/AndrewGBest/Longboard/releases/latest);
see "Trying it" below. [docs/STATUS.md](docs/STATUS.md) says exactly what
has been checked, and how.

It grew out of [Tropic Video](https://github.com/AndrewGBest/Tropic-Video),
which does this for one website.

## The idea

Websites are built for a mouse or a finger. Longboard makes them usable with
six buttons: up, down, left, right, OK and Back.

- **The major websites just work.** Longboard finds the things you can
  press on any page and moves a highlight between them, with no setting up
  per site. It is run against a list of 68 of the most-visited sites and
  streaming services, signed out and (for those its owner has accounts on)
  signed in, and the highlight gets around every one of them: sign-in
  prompts, cookie notices, menus, feeds, players. Its owner's verdict from
  the couch: it works better than any other browser for the TV they have
  used. [docs/SCORECARD.md](docs/SCORECARD.md) and
  [docs/STATUS.md](docs/STATUS.md) have the runs and the known rough spots.
- **Profiles for the finishing touches.** A *profile* is a small settings
  file for one website: the size it is drawn at, where the highlight
  starts, or that the site has an interface made for TVs, which Longboard
  then opens instead. If a reviewed profile exists for the site you open,
  Longboard uses it by itself, and you can switch it off.
- **Anyone can make a profile.** Profiles are data, not programs. You can
  write one, export it as a file, import someone else's, or submit it to the
  shared catalogue on GitHub.
- **Any website can be an app.** Add a site to the home screen and to your
  TV's app list, and it opens like an app.
- **A pointer when you need one.** One button gives you an on-screen cursor for
  the pages the highlight cannot handle.

## Trying it

**A package:** from the [latest release](https://github.com/AndrewGBest/Longboard/releases/latest),
`Longboard-x86_64.AppImage` for 64-bit Intel and AMD machines or
`Longboard-arm64.AppImage` for 64-bit ARM ones. `chmod +x` it and run it. It
needs Linux with a desktop session. Each release also has a Flatpak file and
a plain `.tar.gz` for both kinds of machine. The ARM packages are built and
tested by script on ARM machines and have not yet been tried on an ARM TV box.

**From source:** Linux on 64-bit Intel/AMD or ARM, with Node 22 or newer:

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
| Menu key (three lines, on some remotes), Ctrl+O, Start; Up twice at the top of a website; the Menu button on Home | The menu: address, Home, Back, Forward, Reload, zoom, pointer, the ad-blocking switch for the site, Speak, Type from a phone, tabs, history, Settings |
| "Pointer" in the menu; F2 on a keyboard; pressing the right stick on a controller | Pointer mode on and off |
| A remote's Home button | Home |
| Ctrl+Q | Quit |

Settings (in the menu) has the search site, sizes, ad blocking, privacy
(including "ask sites not to track" and refusing trackers), what sites may
ask for, a parental lock with a PIN, extensions from the Chrome Web Store
(not all of them work), saved passwords, new versions, and profiles. The menu's page about the
site in front has reader view, "Desktop site", find on the page, keeping
the page on Home, and a switch for the site's profile. Keys and controller buttons can be remapped
in `~/.config/Longboard/config.json`, which is also where Settings keeps its
choices (see `src/shared/config.ts`).

## What is missing

Compared with a mainstream browser, today:

- **No Safe Browsing.** Nothing warns about known phishing or malware sites.
- No sync between machines and no translation. Tabs are not kept when
  Longboard is closed.
- Passwords are kept only on a system with a keyring, and only filled in
  when asked; there is no other autofill. Speech is English only.
- Extensions that block by rule lists (uBlock Origin Lite) start and block
  nothing: the engine does not act on such rules.
- Ad blocking only refuses requests that a public filter list names. It
  does not hide the gaps ads leave, and it does nothing about advertising
  inside a video stream.
- Downloads are saved, after a question. The menu lists the ones from this
  run and can cancel one under way. Longboard does not open what it saves.
- A site is asked about before it gets the camera, microphone, location,
  notifications, the clipboard, MIDI or the pointer. USB, serial and screen
  capture are refused: they need a chooser Longboard does not have yet.
- A copy run as an AppImage looks for new releases daily and installs them;
  Settings can turn that off. Releases are not signed.

## What it will not do

- It does not remove or work around DRM, and it never claims to be another
  browser, another system or another maker's device. It tells every site
  what it is: the engine it is built on, and its own name. To a site whose profile
  says it has an interface made for TVs, it does say what is true: that it
  is Longboard, running as a TV.
- It does not skip ads inside video, download streaming video, or get
  around region limits. Ad blocking is a per-site switch that starts
  off on reviewed sites such as streaming services and on elsewhere.
- It sends no telemetry. (Its name is in what it tells sites it is, as
  with any browser, so a site can tell you are using Longboard.)

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
| [docs/RESEARCH-ANDROID.md](docs/RESEARCH-ANDROID.md) | What an Android TV version needs, with sources |
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
