An early build of Longboard, a web browser for the TV driven by a remote or
game controller. It has been checked by automated tests on a headless
machine only: nobody has yet tried it on a TV. Expect rough edges.

This release exists first of all to test that a copy of Longboard can find a
new release and install it.

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
