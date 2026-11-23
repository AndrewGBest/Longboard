An early build of Longboard, a web browser for the TV driven by a remote or
game controller. Its owner has tested it at a TV with a remote, and it is checked
by automated tests; not every part has been tried by hand. Expect rough
edges.

New in 0.3.25 (not yet released):

- **OK pauses and plays on players that ignore the remote until they have
  been clicked.** When the player's own key does nothing, Longboard clicks
  the picture once, which starts it listening. Seen on a sports network's
  live player; before, only players inside a frame were helped this way.

New in 0.3.24 (it takes in 0.3.23, which was never released):

- **YouTube's TV app gives Longboard its full interface: video previews
  and page animation.** To that app, and only to it, Longboard now says
  what a TV says (the engine TV apps run on, with Longboard as the
  device). Told the plain truth the site served its lowest tier. This is
  the owner's decision; everywhere else Longboard says what it is.
- **YouTube's TV app plays at full size and frame rate.** It was held at
  1280x720 and 30 pictures a second: the app asks a browser impossible
  questions to see whether its answers can be trusted, and the engine
  said yes to all of them. Longboard now says no to what it cannot play.
  Measured in a 1920x1080 window: 1920x1080 at 60 for the same video.
- **The menu cannot be left stranded.** A key that reaches the page while
  the menu (or Settings, or Home) is in front is passed on to it, and a
  game controller is read only by the screen in front.
- **No highlight is drawn over a picture shown full screen.**

New in 0.3.23 (never released on its own):

- **A video player embedded in a page can be watched with the remote.**
  Many video sites show their player inside a frame from another site.
  The highlight now lands on it (it was skipped when the site's own bar
  overlapped it); OK shows it full screen and hands it the remote: OK
  plays and pauses, Left and Right seek, Down brings up its controls,
  with the progress bar first and the buttons after, and Back returns to
  the page. Before, such a player could only be used with the pointer.
  Checked on one video site's embedded player and an invented one.
- A player whose page has no height of its own (everything in it pinned to
  the window) no longer has all its controls taken for hidden.

New in 0.3.22:

- **Disney+ plays.** It showed error 83. The engine Longboard is built on
  tells sites on Linux that it can play Dolby Digital sound, which it
  cannot; the site sent that sound and its player stopped. Longboard now
  gives sites the true answer, and the site sends ordinary sound instead.
  Checked signed in: a title played. Other sites that failed the same way
  should be helped too; none has been tried.
- The profile setting added in 0.3.21 (leaving Longboard's name out for a
  site) is taken out again: the name turned out not to be the cause.

New in 0.3.21 (withdrawn in 0.3.22):

- **A site's profile can ask Longboard to leave its own name out of what
  it says it is.** One streaming site is reported to refuse to play (its
  error 83) for any identity but the engine's own; a profile for it now
  exists. Whether that makes it play has not been tried yet.

New in 0.3.20:

- **The on-screen keyboard has two arrow keys that move the cursor in the
  field,** so a letter in the middle can be put right, and the cursor
  brought back when a site moves it.
- **Up while watching brings the controls up with the highlight on the play
  button,** not on the close button. A layer some players lay over the
  whole picture is no longer highlighted as if it were a control. Checked
  on a public video site; not yet tried on a subscription service's player.

New in 0.3.19:

- **A video's progress bar can be highlighted and moved.** A bar drawn only
  a few pixels high was passed over as too small to aim at, so Down went to
  a button instead. Now Down while watching lands on the bar, Left and
  Right move it, and Down again goes on to the buttons. Checked on a public
  video site; not yet tried on a subscription service's player.

New in 0.3.18:

- **Sites added as apps now reach the TV's app list when Longboard is
  installed as a Flatpak.** They were written where no desktop looks. Apps
  you added before appear after this version has been started once.

New in 0.3.17:

- **Up twice opens the menu inside a site's own TV app too.** There the
  arrows belong to the app, so the menu could not be reached without a
  Menu key.

New in 0.3.16:

- **Another program can ask Longboard to show Steam's sign-in page and,
  with your yes, hand back the list of games you own.** The Bilby app
  store uses this on a TV. You sign in on Steam's own page; Longboard asks
  before anything is shared, starts on "Do not share", and passes on only
  the account number and the list. Not yet tried signed in to Steam.
- **Longboard tells sites its name.** Its identity now ends with
  `Longboard/<version>`, after the engine and system it always named.
  With the name left out, a large sign-in service refused it as "may not
  be secure"; with it, the same page goes on to ask for the account.
  Whether the rest of that sign-in works has not been tried yet.

New in 0.3.15:

- **With a profile for a site's TV interface, the site always opens in
  that interface**, whatever address was asked for; a link to one video
  opens that video there.
- **"Use this site's profile"** in the site menu switches a site's
  profile off (and on again), for the site as any browser gets it.

New in 0.3.14:

- **A site's front page can open straight at its interface for TVs.** With
  the video site's profile, going to its plain address now lands on its
  TV app; a link to one video or one search still opens as before.

New in 0.3.13:

- **Sites with an interface made for TVs can be given it.** A profile can
  say a site has one; Longboard then tells that site it is running as a
  TV, which it is, and leaves the remote to the site's own app. It still
  never claims to be another browser or another maker's device. The first
  such profile is for a video site's TV app, at its `/tv` address.

New in 0.3.12, from a run over 49 sites with the owner's sign-ins:

- **A pop-up card that closes when the highlight steps into it** (the card
  about a picture's owner on a photo site) no longer swallows the
  highlight: it goes back to the picture and passes the card over.
- **When a page redraws what was highlighted**, the next press carries on
  from there, not from the top.
- **An app of panes is no longer pushed up off the screen** as the
  highlight moves.
- **A profile for a music player's web app** is in the catalogue: the app
  now fits on the screen whole.

New in 0.3.11:

- **The highlight goes inside embedded frames.** A sign-in prompt that is
  a page within the page can be walked with the arrows: no pointer
  needed. The pointer still takes over for frames with nothing to
  select, such as maps.
- **A strip under the part of a page that scrolls** (a "which country"
  question) is offered on the way down, once.

New in 0.3.10:

- **Sign-in prompts the browser draws in front of everything** no longer
  hide the pointer, the highlight and the on-screen keyboard, and the
  keyboard stays up while you type in them.
- **The X on a cookie notice** can be reached with Left and Right from
  the notice's other buttons.

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
