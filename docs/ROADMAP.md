# Roadmap

No dates: this is a spare-time project and dates would be guesses. What is
done is listed so that nobody plans it twice; `docs/STATUS.md` has the detail
and what was and was not checked.

## Done

| Phase | What | Since |
|---|---|---|
| 0 | Tropic Video's code carried over under the new layout | 2026-11-18 |
| 1 | A browser shell: Home, the menu, Back, reload, zoom, the permission policy, the on-screen keyboard | 2026-11-18 |
| 2 | Generic mode (any page with no profile), pointer mode, the fixture pages and the scorecard | 2026-11-18 |
| 3 | Profiles: schema, validator, matcher, interpreter, import and export, the shared catalogue with checksums | 2026-11-18 |
| 4 | Any site as an app; the on-TV profile editor | 2026-11-18 |
| 5 | Ad blocking: a per-site switch, off to start with on verified sites | 2026-11-18 |
| - | Settings, tabs, history, downloads, reader view, find on the page, a PIN lock, passwords in the system keyring, extensions, speech, typing from a phone | 2026-11-18 to 19 |
| - | Releases for Intel/AMD and ARM as AppImage, Flatpak file and tar.gz; the AppImage updates itself | 0.3.0, 2026-11-19 |
| - | A site's own interface for TVs, opened by a profile | 0.3.13 to 0.3.24 |
| - | Players: thin progress bars, players in a frame from another site, players in a long page | 0.3.19 to 0.3.27 |

## Next

In rough order. The first group is about trust, which a browser needs before
it needs features.

1. **People other than the owner using it.** Nobody else has reported yet.
   The README, the website and the issue forms exist to make that easy.
2. **Move to each castLabs Electron release promptly** (Hard rule 14). The
   December 2026 one is expected to fix the engine's wrong answer about
   AC-3 sound, after which the stopgap in `src/shared/audio-truth.ts` goes.
3. **Signed releases.** Today GitHub's digests are the only check.
4. **Safe Browsing or an equivalent**, if one can be had on terms an
   open-source project can meet. Until then the README says it is missing.

Then, as they are asked for:

- Tabs that survive a restart; a list of downloads that lasts beyond one run.
- Frames from other origins driven by the highlight everywhere, not only
  for players.
- More reviewed profiles, written from outlines by the people who use the
  sites.
- An Android TV version (researched in `RESEARCH-ANDROID.md`, not started).
- Reviewed scripts in profiles (format version 2), only with a recorded
  decision (Hard rule 7).
- Speech in languages other than English.

## Known and open

- Not on Flathub: its policy on AI-written code ruled it out (DECISIONS.md,
  "Distribution"), so the Flatpak is a file that does not update itself.
- A cable company's streaming site refuses playback on Linux
  ([issue 1](https://github.com/AndrewGBest/Longboard/issues/1)). Nothing
  Longboard may do changes that (Hard rule 2).
- Several services send a smaller picture to a browser on Linux than to a
  TV app. Not Longboard's to work around.
- The Chrome Web Store's terms and what they mean for adding extensions
  from it (`RESEARCH-STORE-ARM.md`).
