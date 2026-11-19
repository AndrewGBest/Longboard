An early build of Longboard, a web browser for the TV driven by a remote or
game controller. It has been checked by automated tests on a headless
machine only: nobody has yet tried it on a TV. Expect rough edges.

New in 0.2.0: every screen of Longboard's own redrawn; Forward, Stop and a
line that shows a page arriving; a desk browser's keyboard shortcuts; the
tab closed last can be opened again; history under days, searchable;
extensions from the Chrome Web Store (not every extension works).

**On a TV box:** download `Longboard-x86_64.AppImage`, then
`chmod +x Longboard-x86_64.AppImage` and run it. It needs a 64-bit Intel or
AMD machine running Linux with a desktop session; it does not run on ARM
boxes or on Android TV. If it says FUSE is missing, run it with
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
