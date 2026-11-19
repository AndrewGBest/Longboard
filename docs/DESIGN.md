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
- a "Search or enter an address" bar, with the time and the day above it.

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

One button opens a side panel over the page. It is kept short, because every
entry is a press of the remote: the address field, Home, Back,
Forward and Reload (Stop while a page is arriving), size, pointer mode, the
ad-blocking switch, "This page" (keep on Home, find, reader view, desktop
site, add as an app, the profile, what the site may do), Tabs and History,
Settings, About and Quit.
In Longboard's own panels a list goes round at its ends, and anything chosen
from several is chosen from a list with the one in use marked.

**When it is not in front, it stops** **[Decision, Andrew, 2026-11-18]**. A
TV shows one thing at a time. A page behind Home, a tab behind another tab,
and the page in front when another program takes the screen are all stopped:
the site's own pause key is sent to a recognised player first, and then the
browser freezes the page as a whole, so every video, every sound and every
timer on it stops. Nothing starts again by itself when the page returns.

### 4.4 Typing

An on-screen keyboard, plus any real keyboard that is plugged in **[Decision,
2026-11-18]**.

**From a phone** **[Decision, Andrew, 2026-11-19; the shape is the agent's
assumption]**. The menu's "Type from a phone" shows a code. A phone on the
same home network that scans it gets a page with a text box, Send, Delete
and Enter, and the arrows, OK, Back, Menu and Play. What is sent goes into
the text field selected on the TV; with none selected the TV says to choose
one. The phone's keyboard can take dictation. It stays on, with the panel
put away, until it is turned off or Longboard closes. How it is kept private
is in DECISIONS.md.

### 4.5 Profile editor **[Assumption, 2026-11-18]**

A built-in mode for making and adjusting profiles on the TV:

- move the highlight or pointer to an element and mark it "can be selected",
  "never select", "this is a row", "this is the player";
- see the result immediately;
- save as a readable file that can also be edited by hand.

The editor is roadmap phase 4. Until then profiles are written as text files.

### 4.6 Left out of the first version

Tabs, history and bookmarks beyond Home tiles were not chosen for the first
version **[Decision, 2026-11-18]**. Andrew asked for tabs and history later
the same day and they are in (section 4.9). Bookmarks are still Home tiles
and apps. Downloads were on
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

### 4.8 Settings **[Decision, 2026-11-18; the contents are the agent's assumption]**

The menu has "Settings": a first page of headings and a page under each,
driven like everything else. Every change takes effect at once (one says it
needs a restart) and is kept in `config.json`, so the file and the screen are
two ways to the same settings.

| Page | What is there |
|---|---|
| Search and starting | The search site, stepped through by name (Google, DuckDuckGo, Bing, Brave Search). Open with Home or with the last site |
| Size and video | Everything bigger or smaller, for every site. Decode video on the graphics chip (next start) |
| Ad blocking | Each site has its own switch / on for every site / off for every site. The list of sites where it starts off, which can be added to and taken from. When the filter list was downloaded, and a button to download it now |
| Privacy and site data | Sign out of every site and clear what sites stored. Clear saved copies of pages. Clear the recently opened sites. Forget every site's own settings. What Longboard downloads by itself (Hard rule 12) |
| What sites may ask for | For each kind of access (camera, microphone, location...): may sites ask at all |
| Profiles and apps | How many profiles there are; look for reviewed profiles daily, and now; import from USB; remove an app |
| Downloads | Where files go, and a folder chooser driven with the arrows (the folder in use, up, into a folder, the home folder, USB sticks) |
| Remote and keyboard buttons | Give a button a job by pressing it: Back, Menu, Pointer, Play or pause, Skip back, Skip forward, Search, OK. The arrows, OK and plain letters cannot be reassigned |
| First page | Where settings are kept; put every setting back (button mappings stay); About and help |

Also under Search and starting: the language sites are asked for (next
start). Under Size and video: the dark or light look sites are asked for,
and whether videos may start by themselves. Under Privacy: keep a history
or not, and clear it; open only pages sent privately; clear what sites
stored when Longboard closes; clear everything at once.

Also under Privacy: ask sites not to track (the Do Not Track and Global
Privacy Control signals; off as shipped), refuse known trackers as well as
ads, and hide the device's home-network address from sites. Settings has a
page for the parental lock (4.10).

Buttons that clear something need a second press.

**Passwords** **[Decision, Andrew, 2026-11-19: "yes"; the shape is the
agent's assumption]**. After the person signs in somewhere, a line says the
menu can keep the password, and for five minutes the menu's first row is
"Keep the password for (name)". It asks once more, with "Not now" and "Never
for this site". On a sign-in page with something kept, the menu's first row
is "Sign in as (name)": it fills the form in, and the person presses the
site's own button. Nothing is filled in without that press, so a page cannot
have a password handed to it unseen. Settings, "Passwords", has the switch,
lists what is kept (never the passwords themselves) and forgets them.

The rules it keeps (Hard rule 10): a password is encrypted by the system's
keyring before it is written, kept on this machine only, offered back only
at exactly the address it was saved at, and never in a private tab. **With
no keyring on the system nothing is kept at all**, and Settings says so:
Chromium's fallback there is a fixed key, which protects nothing. A scripted
run never watches a sign-in form and never fills one. Forms inside an
embedded frame are not seen.

### 4.9 Tabs and history **[Decision, Andrew, 2026-11-18; the shape is the agent's assumption]**

- **Tabs:** the menu has "Tabs". It lists the pages that are open, brings
  one in front, closes one, and opens a new one, which starts on Home. An
  address or a tile opened from Home goes into the tab in front. Up to
  eight; they are not kept when Longboard is closed. A tab that is not in
  front is silent and its video is paused, as when Home is in front.
- **Private tabs:** "New private tab" beside "New tab". Nothing opened in
  one is kept: no history, no recent site, and what its sites store goes
  when it is closed.
- **Saved pages:** "Keep this page on Home" puts a page in a "Saved pages"
  row on Home; the menu on its tile takes it off.
- **Suggestions:** as an address is typed, matching places already known
  (saved pages, apps, recent sites, history) are offered under the field.
  Nothing typed is sent anywhere for them.
- **Find on this page**, from the menu's site page.
- **Reader view**, from the menu's site page: the article's words, big, on a
  screen of Longboard's own. Up and Down move through them; two buttons make
  the words bigger or smaller. The page is not changed. A page with no
  article says so.
- **Desktop site**, a switch on the menu's site page, kept per site: the
  site gets the width of a desk screen (1280) and lays itself out in full,
  with smaller text. Who Longboard says it is does not change.
- **History:** the menu has "History": the pages opened, newest first, each
  once, at most 300, on this machine only, under the day they were opened.
  Pressing one opens it; the cross beside it takes it out. Words typed
  above the list leave only the pages that have them. Settings can stop
  keeping it and clear it.
- **A closed tab** can be opened again from the list of tabs: the last ten,
  for this run only, and never a private one.
- **With a keyboard plugged in**, the shortcuts of a desk browser work
  (Ctrl+L, Ctrl+T, Ctrl+W and the rest; About lists them).

### 4.10 Parental lock **[Decision, Andrew, 2026-11-18; the shape is the agent's assumption]**

Settings, "Parental lock", sets a four-digit PIN. From then on Settings asks
for it. A second switch, "Only the sites on Home open without the PIN",
limits browsing to the person's apps and saved pages; anything else asks for
the PIN, and so do adding to Home and taking off it. The menu then has
"Unlock every site (PIN)" and, once unlocked, "Lock again". The PIN screen
is a pad of digits for OK, and takes a remote's number buttons. Wrong tries
are slowed. It keeps a child with the remote out; deleting `lock.json`
removes it, and Settings says so.

### 4.11 Extensions **[Decision, Andrew, 2026-11-19; the shape is the agent's assumption]**

Extensions come from the Chrome Web Store. Settings, "Extensions", opens the
store; on an extension's page there, the menu's page about the site has "Add
this extension". Longboard fetches it and asks, naming it and saying what it
will be able to do; the question starts on "Do not add it". Settings lists
the extensions installed, opens each one's own page in the tab (where the
arrows and pointer mode work as on any page), and removes one on a second
press. Not every extension works, and extensions do not run in private tabs
or in apps that keep their own sign-ins.

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

The switch is in the menu, as "Ad blocking: on" or "off", with a line under
it: how many requests were refused on this page, or why it is off (a
verified site, or the person's choice). Pressing it changes it for that site,
keeps the choice, and loads the page again.

Settings has one setting over all sites **[Decision, Andrew, 2026-11-18]**:

- **Each site has its own switch** (the usual): as in the table above.
- **On for every site:** the list of sites where it starts off is ignored.
  A site the person has switched off themselves, from the menu, stays off.
- **Off for every site:** nothing is refused anywhere, the menu's switch
  cannot be pressed, and the filter list is not downloaded.

The list of sites where blocking starts off can be edited in Settings: a
site can be added, and a reviewed site can be taken off (and put back). The
reviewed list itself is not changed; the person's changes are kept beside it.

Longboard never changes the switch by itself. Blocking means refusing network
requests that match public filter lists. Gaps left where an advertisement
would have been are not tidied away: that would mean changing the page. It never skips, hides or shortens
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

## 11. How Longboard's own screens look **[Decision, Andrew, 2026-11-19: "a top quality level of design"; the particulars are the agent's assumptions]**

One set of rules for Home, the menu, Settings, questions, the reader view and
the pages Longboard shows in place of a site. They live in
`src/chrome/chrome.html` (colours, type and spacing as CSS variables) and
`src/chrome/parts.ts` (the icon drawings, rows and switches). Sources for the
numbers are in `docs/RESEARCH-BROWSERS.md`, part 1.

| Rule | What Longboard does | Why |
|---|---|---|
| Safe area | 5% of the screen kept clear at every edge of Home; backgrounds run to the edge | Android TV and Fire TV both say 5% [Sourced] |
| Sizes | Everything in `vh`, so it is the same share of any screen | A TV is always 16:9; the panel must look the same over Home and beside a site |
| Text | Body 2.9vh (31 px at 1080 lines), second-line text 2.4vh (26 px), labels 2.2vh (24 px); nothing smaller | Fire TV: body at least 28 px at 1080p. tvOS: 29 pt body, 23 pt smallest [Sourced] |
| Colour | Dark, cool and not saturated: near-black blue-greys, one sea-green accent, amber for warnings, red only for what removes | Android TV: build from dark themes. Fire TV: less saturated, cool colours [Sourced] |
| Contrast | Body text on a row is 14:1, second-line text 8.4:1, the dimmest label 6:1, the highlighted row's words 17:1 | WCAG 2.2 asks 4.5:1 for text, 3:1 for large text and for the focus indicator [Sourced]. The ratios were worked out from the colour values with WCAG's formula, not measured on a screen |
| The highlight | One thing at a time. It turns light with dark words, the layer's white ring goes round it with corners that follow its own, and a Home tile grows by 4% | Android TV: scale 1.025 to 1.1, colour change and outline together. tvOS: do not move the highlight without the person [Sourced] |
| Rows | An icon, a label, a line under it saying what it is for, and at the right what is chosen now, a switch, or an arrow to another page | A switch drawn as a switch is read faster than "yes" and "no" in a sentence [Assumption] |
| What a row says | Each row's accessible name is the whole sentence ("Ad blocking: on"), for a screen reader | The picture of a switch says nothing to someone who cannot see it |
| Removing | Rows that clear or remove are red and need a second press | Nothing is undone by a slip of the thumb |
| Icons | Line drawings of the project's own, drawn in code; a site's icon comes from the site | Hard rules 1 and 6 |
| Movement | A panel slides in over 0.16 s the first time only; switches and the highlight ease over 0.12 s; all of it stops when the system asks for reduced motion | Enough to show what changed, never something to wait for |
| A page arriving | A thin line moves along the top of the page after a quarter of a second, until the page has come | Every desk browser shows that something is happening; a TV browser with no address bar had nowhere to show it |

**On-screen "Back" rows are kept** although Android TV's guidance says not to
draw a back button [Sourced]. They are the last, quiet row of a page, the
Back button of the remote does the same, and a list that goes round at its
ends puts them one press up from the top. [Assumption]

Home shows the time and the day, the search bar, "Carry on" for the page
left behind it, then saved pages, apps and recent sites, five tiles to a
row. With nothing on it yet, it shows three cards that say how to start.

## 12. Against other browsers **[Agent's review, 2026-11-19]**

The comparison this was made from is `docs/RESEARCH-BROWSERS.md`. It was
gathered from vendors' own pages on 2026-11-19; each row there is marked as
read from the page, taken from a search extract, or not confirmed.

**What the review changed** (all 2026-11-19):

| Found | Done |
|---|---|
| No Forward. Every browser has it | Forward beside Back in the menu; Alt+Right |
| Nothing showed that a page was loading, and it could not be stopped | The line along the top; Reload becomes Stop while a page arrives |
| None of a desk browser's keyboard shortcuts worked with a keyboard plugged in | Ctrl+L, T, W, Shift+T, Shift+N, Tab, R, F, H, J, D, plus, minus, 0, F5, Alt+Left and Right. Chrome and Edge document the same keys [Sourced] |
| A closed tab was gone | "Open the tab closed last", and Ctrl+Shift+T. Private tabs are never remembered |
| History was one flat list that could not be searched | Under the day each page was opened, with the time; searched as words are typed; one page can be taken out |
| Home's search bar collapsed to a sliver once Home had tiles | Fixed |
| The reader view drew headings in small capitals, repeated the title, and used the interface's type | Fixed; a reading typeface, a line length of about 34 em, and how long it takes to read |
| Pages shown in place of a site (cannot reach, blocked, not secure) looked like another program | Same colours and type as the rest |
| The page behind Home could only be got back through the menu | "Carry on" on Home; Back still does it |
| A new person was told nothing | Three cards on an empty Home; the keys along the bottom |

**Where Longboard is ahead of TV browsers.** Most of them move a mouse
pointer with the arrows (Silk, Xbox Edge, Steam Big Picture, TV Bro, Vewd)
[Sourced]; tvOS's own guidance is to avoid a pointer on a TV [Sourced].
Longboard moves between links and buttons, and has the pointer for when a
site needs one. It also has per-site ad blocking, a reader view, a parental
lock, web apps with their own sign-ins and extensions, which no one TV
browser in the comparison has together.

**Where it is behind the desk browsers, and not done:**

| Missing | Why not yet |
|---|---|
| Saved passwords and autofill | Allowed by Hard rule 10 since 2026-11-18 but not built. It is the biggest gap: signing in with a remote is the slowest thing in the product |
| Typing from a phone, and voice | The input layer was written for them (4.4); neither is built |
| Search suggestions from the search site | Sends what is typed to the search site as it is typed. Brave ships it off [Search extract]; Edge ships it on [Sourced]. Needs Andrew's decision under Hard rule 12 |
| Translation | Every engine for it is someone else's service or a large model |
| Sync between machines | Needs a server, or an account with someone |
| Opening again with every tab that was open | "Open with the last site" brings back one |

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
