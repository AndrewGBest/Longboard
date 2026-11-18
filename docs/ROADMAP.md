# Roadmap

Phases are in order. Each ends with something a person can try. No dates:
this is a spare-time project and dates would be guesses.

## Phase 0: carry over

- Bring Tropic Video's code into this repository under the new layout.
- Rename, keep every test passing, keep the rule checks.
- Result: Longboard opens one address and behaves as Tropic Video does.

## Phase 1: a browser shell

- Home screen with tiles and "go to address or search".
- The menu panel. Back, reload, zoom.
- Replace the single-service allowlist with the permission policy.
- On-screen keyboard working in Longboard's own screens and on pages.
- Result: you can open any address from the couch.

## Phase 2: generic mode and pointer mode

- Target discovery on unknown pages, scrolling, video detection.
- Pointer mode on a button.
- The fixture pages and the real-site scorecard.
- Result: ordinary sites are usable without a profile.

## Phase 3: profiles

- Schema, validator, matcher, interpreter.
- Convert Tropic Video's adapter into the first profile. This is the test of
  the format.
- Local profiles folder; import and export of files.
- The catalogue repository with its checks; background fetch with checksums.
- Result: Prime Video works through a profile as well as it did in Tropic
  Video, and a second person can write a profile.

## Phase 4: web apps and the editor

- Add any site as an app: Home tile, launcher entry, optional own session.
- The on-TV profile editor.
- Result: the first release worth announcing.

## Phase 5: ad blocking

- Request filter, the allowed-here decision, settings.
- Result: on by default on ordinary sites, off on streaming services.
- Built on 2026-11-18 (STATUS.md). Not in it: a settings screen (the switch
  is in the menu, the rest is in `config.json`), and choosing lists on the TV.

Ad blocking is late on purpose. It adds a dependency and the most legal
exposure, and nothing else depends on it.

## Later

- Tabs, history, bookmarks. A list of downloads that lasts beyond one run.
- Typing from a phone; voice search.
- Reviewed scripts in profiles (format version 2).
- Other systems and architectures: Linux arm64 first, since the shell already
  ships for it.
- Frames from other origins handled by the highlight, not only the pointer.

## Before any public release

- Clear the name (DECISIONS.md).
- State plainly what is missing compared with a mainstream browser,
  including Safe Browsing.
- Run the scorecard and publish it.
