An early build of Longboard, a web browser for the TV driven by a remote or
game controller. It has been checked by automated tests on a headless
machine only: nobody has yet tried it on a TV. Expect rough edges.

New in 0.3.9, from the owner signing in to 45 sites by hand:

- **Cookie notices pinned to the top or bottom of the screen** can be
  reached with the arrows. Before, some could not be answered at all.
- **Sign-in prompts that are a page within the page:** the arrows now
  switch to the pointer there by themselves, and choosing a text field
  with the pointer brings up the on-screen keyboard. Before, nothing
  could be typed into such a prompt with a remote.

New in 0.3.8, from a second pass over 68 well-known sites:

- **Shelves in a part of the page that scrolls by itself** can be walked
  to the end. Before, a notice underneath could take the highlight and
  the rest was out of reach.
- **The highlight no longer goes to buttons a site has folded away** (a
  music player's bar before anything plays).
- **The page behind a cookie notice that fills the screen** stays where
  it is while the notice is open.

New in 0.3.7:

- A search field whose list of suggestions does nothing with the arrow
  keys no longer holds the highlight.

New in 0.3.6:

- **A question laid over the whole page** (an age check, a consent wall)
  keeps the highlight in it until it is answered, also on sites that do
  not mark it as a dialog. Before, the highlight could wander off among
  the links hidden behind it.

New in 0.3.5, from trying 63 well-known sites:

- **A shop's whole page could not be reached** once the highlight touched
  its menu button. Fixed.
- **Sites where no button did anything** (an advertisement had taken the
  keyboard). Fixed.
- **Down going round in a loop** at the foot of a page with a tall banner,
  and jumping back up a side column on a music site. Fixed.
- **Up twice for the menu** now works on more sites with a "skip" link
  hidden at the top.
- **A small notice in a corner no longer shuts the highlight in.**

New in 0.3.4:

- **Suggested searches can be chosen.** With suggestions showing under a
  search field, Down steps through them and OK takes the one highlighted.
  Put the on-screen keyboard away with Back first.
- **Up twice for the menu works on sites with a bar across the top.** On
  some sites the highlight went round in the bar and never reached the top.
- **"Add this site as an app" is on the menu's first page.**

New in 0.3.3:

- **The menu without a menu key.** On a website, press Up at the top of
  the page, then Up again; Longboard says so on screen until you have
  done it once. On Home there is a Menu button at the top
  right. A remote with no menu key could not open the menu before, and so
  could not reach Settings, the pointer or "Add as an app".
- **The line of key names at the foot of Home is gone.** It named keys a
  remote does not have.
- A remote's Home button goes Home.

New in 0.3.2:

- **Links that run over two lines can be selected.** In an article, a link
  that started on one line and ended on the next could not be reached.
  Found by a new test that compares what the Tab key can reach with what
  the remote can, on ten public sites.

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
