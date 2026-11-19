An early build of Longboard, a web browser for the TV driven by a remote or
game controller. It has been checked by automated tests on a headless
machine only: nobody has yet tried it on a TV. Expect rough edges.

New in 0.3.1, from the first evening at a TV:

- **Search results can be selected.** On a page of results the title of
  each result could not be reached; the highlight went to a small menu
  button beside it. Each press of Down now lands on the next result.
- **The box goes round the whole of what is selected**, where it used to cut
  through a result's words, and it no longer runs off the edge of the screen.
- **Text links no longer grow when selected.** Only pictures do, on sites
  with no profile.

These are changes to how every site with no profile is driven, checked on
one search engine's results and on invented pages.

New in 0.3.0:

- **64-bit ARM.** Packages for ARM boxes (a Raspberry Pi 4 or 5 with a 64-bit
  system, Rockchip boxes and the like), built and tested on ARM machines but
  not yet tried on a TV box. Video is probably decoded by the processor, not
  the graphics chip.
- **Passwords.** After you sign in, the menu offers to keep the password; on
  a sign-in page the menu's first row fills it in. Needs a keyring on the
  system (GNOME Keyring, KWallet); without one nothing is kept.
- **Type from a phone.** The menu shows a code; scan it and the phone becomes
  a keyboard and a remote. Its keyboard can take dictation.
- **Speak.** The menu's "Speak" listens and types or searches for what you
  said, worked out on the machine itself. The first use fetches a 51 MB
  model. English only; needs a microphone the system can see.
- **Search suggestions**, off unless you turn them on under Settings, Search
  and starting.
- **Extensions:** ones written for "browser" now start; what comes from the
  store is checked against its maker's signature. Blockers that work by rule
  lists (uBlock Origin Lite) start and block nothing: the engine does not
  act on such rules. Longboard's own ad blocking is unaffected.

**Which file:** `Longboard-x86_64.AppImage` for Intel and AMD boxes,
`Longboard-arm64.AppImage` for ARM ones. Then `chmod +x` it and run it. It
needs Linux with a desktop session; it does not run on Android TV or on
32-bit systems. If it says FUSE is missing, run it with
`--appimage-extract-and-run`. Menu key, Ctrl+O or a controller's Start opens
the menu; Ctrl+Q quits.

- **AppImage:** make it executable and run it. It looks for new releases
  once a day and installs them; Settings, under "New versions", can turn
  that off.
- **tar.gz, Flatpak:** these are told when a new version is out, and do not
  replace themselves.

What exists and what has been checked is in `docs/STATUS.md`; what is
missing is in the README.

Longboard is an independent project. It is not affiliated with any website or
streaming service it can display. It does not provide, unlock or bypass access
to any content and does not remove or work around DRM.
