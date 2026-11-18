# Longboard: design

Claims are labelled **[Sourced]**, **[Decision]** (Andrew's, with date),
**[Assumption]** (chosen by the agent because a question went unanswered) or
**[Guess]**. Sources are listed at the end.

## 1. What it is

A browser for a TV that is used from the couch. The person holds a remote or a
game controller, not a mouse. They move a highlight between the things on a
page and press OK.

It grows out of Tropic Video, which does this for one website. Longboard does
it for any website, and treats the hand-tuned work for one site as a *profile*
that anyone can write and share.

**Who it is for:** people running a Linux box behind a TV (the owner's case:
small Fedora Kinoite boxes on KDE Plasma Bigscreen), who want streaming sites
and ordinary websites without reaching for a keyboard.

## 2. Principles

1. **Six buttons are enough.** Everything is reachable with up, down, left,
   right, OK and Back. Extra buttons are shortcuts, never requirements.
2. **You always know where you are.** One clearly visible highlight, always on
   screen, never lost. Fire TV's guidelines make the same demand of TV apps
   [Sourced: Amazon].
3. **The website stays itself.** Longboard enlarges and steers a site; it does
   not redesign it. What you see is the site's own page.
4. **Degrade, never dead-end.** Profile, then generic mode, then pointer mode.
   There is always a next thing to try.
5. **Fast enough to feel like a remote.** A key press moves the highlight
   before the person notices a delay (targets in section 9).
6. **Easy to help.** A person who cannot program can still fix a site by
   making a profile.
7. **Honest and private.** No telemetry, no pretending to be another device,
   no DRM tricks.

## 3. The three ways a page is driven

### 3.1 Profile mode

If a profile matches the site, Longboard follows it: which elements can take
the highlight, how rows and grids are grouped, where the player and its
controls are, how big to draw the page. Details in [PROFILES.md](PROFILES.md).

Which profile applies **[Assumption, 2026-11-18]**:

1. your own local profile for the site, if you have one;
2. otherwise the reviewed profile from the catalogue, applied automatically;
3. otherwise generic mode.

Unreviewed profiles (imported by hand) are never applied silently. Longboard
shows what the profile matches and asks once.

### 3.2 Generic mode

For sites with no profile. It works from what the page exposes:

- **Find what can be pressed:** links, buttons, form fields, elements with a
  role or tab position, and elements that look clickable.
- **Move by geometry:** pressing a direction moves to the nearest sensible
  target that way. Aligned targets beat nearer misaligned ones, and left and
  right stay inside a row. This is Tropic Video's tested navigation code.
- **Scroll when there is nothing to move to:** the page scrolls and the
  highlight picks up the next target that comes into view.
- **Recognise video:** when a video is playing full screen, keys become
  play, pause and seek, sent to the page as ordinary key presses.
- **Recognise text fields:** OK on a field opens the on-screen keyboard.
- **Fit the page to the TV:** pages are drawn to a 960x540 logical canvas so
  text is readable from the couch. Android's TV guidance recommends designing
  at 960x540 and scaling up [Sourced: Android].

Chromium has its own directional navigation behind a flag, and there is a W3C
draft with a polyfill [Sourced: Igalia, CSSWG]. Longboard keeps its own
implementation because profiles need to steer it, but the draft's rules are
the reference for expected behaviour.

### 3.3 Pointer mode

A dedicated button switches to an on-screen cursor moved with the arrows or
the stick; OK clicks; the same button switches back **[Decision,
2026-11-18]**. It is the escape hatch for maps, canvases and drag targets.
The cursor accelerates while a direction is held so that crossing the screen
does not take long.

## 4. Screens

### 4.1 Home

A grid of tiles, like a TV's app row:

- sites you added as apps;
- recently opened sites;
- a "Go to address or search" tile.

A tile shows whether the site has a reviewed profile, your own profile, or
none.

### 4.2 Web apps **[Decision, 2026-11-18]**

"Add this site as an app" does three things:

1. adds a tile to Home;
2. offers to add a launcher entry so the site appears in the TV's app list
   (for example Plasma Bigscreen's), opening straight into that site;
3. lets you choose whether the app shares sign-ins with the rest of Longboard
   or keeps its own.

This is how the earlier idea of separate apps per streaming service survives:
each is a profile plus a launcher entry, with one program underneath.

### 4.3 The menu

One button opens a side panel over the page: Home, Back, Reload, Add as app,
Zoom, Pointer mode, Profile (which one is active, switch, edit), Settings.

### 4.4 Typing

An on-screen keyboard, plus any real keyboard that is plugged in **[Decision,
2026-11-18]**. The input layer is written so that typing from a phone and
voice search can be added later as extra sources of text without changing the
rest.

### 4.5 Profile editor **[Assumption, 2026-11-18]**

A built-in mode for making and adjusting profiles on the TV:

- move the highlight or pointer to an element and mark it "can be selected",
  "never select", "this is a row", "this is the player";
- see the result immediately;
- save as a readable file that can also be edited by hand.

The editor is roadmap phase 4. Until then profiles are written as text files.

### 4.6 Left out of the first version

Tabs, history and bookmarks beyond Home tiles were not chosen for the first
version and are on the roadmap **[Decision, 2026-11-18]**. Downloads were on
that list too; Andrew asked for them later the same day and they are in
(section 4.7).

### 4.7 Questions Longboard asks **[Decision, 2026-11-18]**

Longboard asks before a site is given something, and before a file is saved.
Each question is a panel with two buttons, driven like everything else. The
highlight starts on the answer that changes nothing, and a yes in the first
moments is not counted, so a page cannot time a question to catch a press
meant for something else.

- **A site wants access**: the camera, the microphone, the device's
  location, notifications, reading the clipboard, MIDI instruments, or the
  pointer. The question says which site and what for, in plain words.
  "Allow" and "Do not allow" are remembered for the site; Back refuses this
  once and asks again next time. The menu shows a site's answers and can
  forget them. Full screen needs no question. Devices that need a chooser
  Longboard does not have (USB, serial, screen capture) are still refused.
- **A download**: the question names the file, its size, the site it comes
  from and the folder it will go to. Agreed to, it is saved in the Downloads
  folder under a name that writes over nothing. Longboard never opens or
  runs a downloaded file. While the question is up, what arrives is held in
  a folder of Longboard's own and deleted if the answer is no. The menu's
  Downloads entry lists the downloads of this run, how far each has got,
  and can cancel one.

## 5. Ad blocking **[Decision, 2026-11-18]**

Every site has an ad-blocking switch. Only the starting position differs.

| Site | Starts | Switch |
|---|---|---|
| Verified site | Off | Yes |
| Everything else | On | Yes |

**Verified sites** are websites that a person has reviewed and added to a
public list because their advertising is not malicious. Andrew's examples are
Prime Video and YouTube. The list lives in the profiles repository as its own
file and changes by pull request, the same way profiles do. Being verified is
separate from having a profile: a site can be on the list with no profile.

An earlier draft had a third row, added by the agent: sites granted
protected (DRM) playback but not yet verified would also start off. Andrew
dropped it **[Decision, 2026-11-18]**: only the verified list starts off. On
Linux there was also nothing to base it on, because the browser never asks
about protected playback there.

Longboard never changes the switch by itself. Blocking means refusing network
requests that match public filter lists. It never skips, hides or shortens
advertising inside a video stream, and it does nothing to defeat a site's
detection of blocking.

## 6. Input

| Action | Remote / keyboard | Gamepad |
|---|---|---|
| Move | Arrows | D-pad, left stick |
| Select | OK, Enter, Space | A |
| Back | Back, Backspace, Esc | B |
| Menu | Menu key | Start |
| Pointer mode | a dedicated key (to be chosen) | Right stick click |
| Play/pause | Play key, Space in the player | X |

Key names are provisional. Remotes differ a great deal, so every action is
re-mappable in Settings. Tropic Video already learned that some remotes send
Space for OK.

## 7. What makes a good browser, applied here

| Quality | What it means for Longboard |
|---|---|
| Safe | Chromium kept current; pages sandboxed; no way for a page or a profile to run code with the app's privileges. Electron's own guidance puts staying up to date first [Sourced: Electron] |
| Predictable | Back always goes back. The highlight never disappears. The same key does the same thing on every site |
| Quick | Targets in section 9, measured in tests |
| Compatible | A real, current Chromium with its real identity, so sites treat it as the browser it is |
| Private | No telemetry. The only calls home are the profile catalogue and the filter lists, both to public hosts, both listed in Settings |
| Legible | Text sized for ten feet; a margin for TVs that cut off the edges. Android's older TV guidance suggests a 5% margin [Sourced: Android style] |
| Repairable by its users | Profiles |

## 8. Contribution paths

Three ways in, from least to most skill needed:

1. **Report:** "this site does not work", with a page outline saved by a key
   press. Outlines contain structure only, no text or names.
2. **Profile:** write or fix a profile and open a pull request on the
   catalogue. No programming. The model is Dark Reader, where site fixes are
   entries in a config file that anyone can propose and checks run
   automatically [Sourced: Dark Reader].
3. **Code:** the application itself, with tests required for navigation,
   input and profile logic.

## 9. Responsiveness targets **[Guess: goals, not measurements]**

| Measure | Target |
|---|---|
| Key press to highlight moved | under 50 ms on the reference box |
| Cold start to Home | under 3 s |
| Page ready to first highlight | under 300 ms after the page settles |
| Catalogue check | never blocks start-up; happens in the background |

The reference box is the owner's TV box (Intel N97 class). Targets become
tests once there is something to measure.

## 10. What is unverified

- Everything in this document is design; none of it has been built or run.
- Whether the generic mode is good enough on real sites is unknown until it
  is tried on a sample of them.
- Whether a launcher entry can be created from inside a Flatpak depends on a
  desktop portal the agent recalls but has not checked **[Guess]**.
- The name Longboard has not been cleared. See DECISIONS.md.

## Sources

- Amazon, Fire TV design and user experience guidelines:
  https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html
- Android, TV layouts (960x540 canvas):
  https://developer.android.com/design/ui/tv/guides/styles/layouts
- Android, Style for TV (overscan margin, archived copy):
  https://iut-fbleau.fr/docs/android/design/tv/style.html
- Igalia, spatial navigation in Chromium:
  https://blogs.igalia.com/jaragunde/?p=839
- CSS Working Group, spatial navigation explainer:
  https://drafts.csswg.org/css-spatial-nav-1/explainer.html
- Electron, security tutorial: https://electronjs.org/docs/latest/tutorial/security
- Dark Reader, contributing guide (fork copy read):
  https://github.com/AubreyF/darkreader/blob/master/CONTRIBUTING.md
