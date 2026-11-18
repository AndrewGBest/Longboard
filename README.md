# Longboard

A web browser for the TV. You drive it from the couch with a remote, a game
controller or a keyboard, by moving a highlight from one thing to the next.

**Status: design stage.** Nothing here runs yet. The navigation core will be
carried over from [Tropic Video](https://github.com/AndrewGBest/Tropic-Video),
which already does this for one website. See [docs/STATUS.md](docs/STATUS.md).

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
