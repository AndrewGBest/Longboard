# Status

Update this at the end of every working session. Newest first.

## 2026-11-22: Disney+ error 83, and leaving the name out for one site (0.3.21)

Andrew: Disney+ does not play; it shows error 83.

**Sourced:** the engine maker's tracker has an open report from 2022
(castlabs/electron-releases issue 142) that the site answers 83 unless the
identity is exactly Chrome's. Since 0.3.16 Longboard ends its identity
with its name. **A likely cause, not an established one**: the agent
cannot play anything there (it would need Andrew's account).

Andrew chose: keep naming Longboard everywhere, except where a site's
reviewed profile says to leave the name out. Done as `view.named: false`
(only `false`; not with `view.device`); the wording stays in
`src/main/useragent.ts`. A Disney+ profile (hosts only, no selectors) is in
the profiles repository with an outline of the public front page.

**Verified:** unit tests; an end-to-end scenario on a made-up site (the
page and what it fetches say the unnamed identity; the site's other pages
say the name); the whole suite in six parts.

**Not verified:** that Disney+ plays with it. If error 83 stays in 0.3.21,
the cause is something else (the AC-3 claim, castLabs issue 221, is the
next suspect) and the profile should be withdrawn.

## 2026-11-22, night: Disney+ plays; the cause was the AC-3 claim (0.3.22)

Andrew signed in to Disney+ himself in the survey's data folder (a window
with nothing attached, `test/scorecard/sign-in.mjs`) and chose a viewer, so
that the agent could test.

**Measured, signed in, under `--automation`,** by a probe that reads only
the page's own calls to the browser's media interfaces, the console and
the screen (nothing of the licence exchange):

| Run | Identity | E-AC-3 answer | Result |
|---|---|---|---|
| 0.3.21 as released, Disney+ profile on | name left out | engine's "yes" | Error Code 83; the console says "audio decoder initialization failed" |
| the same, answer corrected by the probe | name left out | "no" | plays (picture 854x480, sound added as AAC) |
| the same, profile off | named | "no" | plays |
| this version, no probe help, no profile | named | "no" (Longboard's correction) | plays |

So the name was not the cause and the AC-3 claim (castLabs issue 221) was.
The site asks `MediaSource.isTypeSupported('audio/mp4; codecs="ec-3"')`;
it did not put sound into its key-system request.

**Done:** on Linux, Longboard corrects three answers in the page's own
world before the page's scripts run (`src/shared/audio-truth.ts`, from the
preload): `MediaSource.isTypeSupported`, `canPlayType` and
`mediaCapabilities.decodingInfo` say no to AC-3 and E-AC-3. It does
nothing when the engine already says no. The key-system interface is not
touched. `view.named` (0.3.21) is taken out again, with its rule-3
amendment, and the Disney+ profile is withdrawn from the profiles
repository.

**Verified:** unit tests; the end-to-end check that held the wrong answers
now holds the right ones, and a second check asks the engine itself from a
worker, where the correction does not reach, so the day castLabs fixes it
that check fails and the correction can go; a title played on Disney+ for
the agent with this build; the whole suite in six parts.

**Not verified:** on Andrew's TV; other sites that failed for the same
reason (Apple TV was the first suspected); a page that asks from a worker,
which still gets the engine's wrong answer; picture quality (the title
played at 854x480 in a 960x540 window, which says nothing about a TV).

## 2026-11-24, later: 0.3.26 released; Spotify profile 1.1.0 pushed; TSN's interface

- **0.3.26 is released and the Spotify profile 1.1.0 is pushed** (Andrew:
  "Yes" to both). Both builds and the publish step passed.
- **Andrew asked whether TSN has a TV interface on the web, or anything
  better than `/live`.** **Not found:** a search turned up none, and the
  likely addresses tried (`/tv`, `tv.` on the same name, `/live/<channel>`)
  do not exist. Bell's own help page lists TV apps for particular makers'
  TVs and boxes, which are installed apps, not pages served to a browser
  (rule 9 keeps Longboard to the latter). **Found on `/live`,** signed in:
  the player has a full-screen button the remote reaches (Down, then Right
  to the end of the row, OK), and the page went full screen.
  **Not done:** making OK on such a player go full screen by itself.

## 2026-11-24: Prime Video's categories, the cover, Spotify's cookie notice (0.3.26, not released)

**Not released, and the Spotify profile 1.1.0 is committed in the profiles
repository but not pushed** (a push reaches people within a day). Andrew
is asked about both.

Reports from Andrew at the TV:

1. **Prime Video "thinks you're hovering over an element and opens all
   their categories".** **Reproduced by putting a real pointer** (the X
   server's) on the site's Categories button: a panel 746 by 430 opens and
   stays open while the remote is used. **Not established:** where the
   pointer on Andrew's TV came from (the agent's guess: it rests near the
   top right, where that button is). **Done:** a key pressed after the
   mouse was last moved, and a page arriving, each tell the page the
   pointer has left the window (`mouseLeave`); a real movement of the mouse
   brings it back. **Verified** on the live site, signed in: with the
   pointer resting on the button and the panel open, Down closed it.
   **Not verified:** on the TV; a mouse user's hover at the moment a page
   arrives is lost until they move it (accepted).
2. **Prime Video's search bar staying on screen.** The fix made for
   Netflix covers it: with the search key and then Back, the box closed
   (its opener went back to `aria-expanded="false"`). Verified on the live
   site in this build.
3. **"Make the loading animation take up the whole screen so they don't
   see the previous website."** Done in the shell, not in the page (the
   page being left may be frozen): when an address of another site than
   the tab shows is opened, Longboard's own screen covers the window with
   the site's name and a moving line until the new page's document is
   ready (a quarter second after), a failure, or twelve seconds. The keys
   stay with the page. **Verified:** a scenario with a page that takes
   five seconds; the look, from a screenshot. **Known:** the page counts
   as hidden while covered, so a site that waits to be seen starts a
   moment later.
4. **"Hard to reach the cookie notice X on Spotify."** **Reproduced**,
   signed out: the X came after five presses down the page, and the
   highlight could land on a button lying under the notice. **Done:** when
   a profile's `dismiss` control is showing in a bar pinned right across
   the window, the highlight starts on it (a small panel in a corner does
   not take it: an existing scenario holds that). The Spotify profile
   1.1.0 names the notice's close button, from an outline saved today.
   **Verified** on the live site with the profile installed: first press
   on the X; OK closes it; Back closes it. **Not done:** keeping the
   highlight off controls that lie under a pinned notice, on sites with no
   profile.

The whole suite in six parts, all passed.

## 2026-11-23, late night: Netflix's search bar stayed open; the Rogers issue (0.3.26, not released)

- **Rogers is an open issue on GitHub**, at Andrew's word: issue 1,
  "does not play: its licence server refuses Longboard on Linux". It says
  what was ruled out, why it stays unresolved and what would change it.
- **Andrew: on Netflix, opening search and then not searching leaves the
  wide search bar over the menu.** **Reproduced**, signed in with his
  sign-in and (the agent's choice, browsing only, nothing played) the
  viewer named Andrew: OK on the magnifier spreads the box over two menu
  entries; Back put the keyboard away and nothing closed the box.
  **Measured, what closes it:** a real click elsewhere; a real Escape
  reaching the page while the cursor is in the box. **What does not:** the
  cursor leaving the box, a Tab, Escape after the cursor has left.
  **Done:** Back that puts the on-screen keyboard away on a search box
  with nothing typed also sends the site its own Escape key. A search box
  is known by its markup (`src/layer/search-field.ts`): its type or role,
  or the word "search" in any of its attributes (this one says it only in
  a test hook). Not inside a pop-up, where Escape would close the pop-up;
  not in a frame; not once something is typed.
  **Verified:** unit tests; a scenario on the home fixture; on the live
  site the bar closed, the menu entries came back and the highlight went
  on along them.
  **Not verified:** other sites' search boxes; a search box that is the
  page's only purpose, where Escape may do something unwanted (none seen).

## 2026-11-23, night: 0.3.25 released; Rogers checked again

**0.3.25 is released** (Andrew: "Release it"): OK on a player that ignores
its key until clicked.

**Rogers, checked again at Andrew's word ("make sure we are 100% positive").**
What was added to the entry below:

| Could the refusal be something else? | Checked how | Answer |
|---|---|---|
| Out of the country or out of the home | Where this machine is on the internet | No: it is on a Rogers connection in Ontario |
| The identity being only half changed | A whole Windows identity, then a whole macOS one: user agent, `navigator.platform` and the browser's brand hints, by a test-only override | No: the licence server answers 403 with the same code under each |
| One channel, or the in-home list | A second and a third channel; the out-of-home list | No: the same every time |
| Protected playback broken on this machine | The same day, same machine | No: Sportsnet+, TSN and Disney+ are given licences and play |

**Sourced, for the sister service on the same platform** (the licence
address is Comcast's): a 2022 write-up of Xfinity Stream on Linux found the
same thing, a licence request refused on Linux whatever the user agent,
and got past it only by loading another system's protected-playback
library into the browser. That is exactly what Hard rule 2 forbids
(the library is never replaced, patched or wrapped), and Longboard will
not do it. https://thebrokenrail.com/2022/12/31/xfinity-stream-on-linux.html

**What is established:** on this engine on Linux, signed in, on a Rogers
line, the service's licence server refuses every channel tried, and
nothing a page can be told changes that. **What is not, and cannot be from
here:** that the same account plays in Chrome on Windows or a Mac on the
same line (it was never seen to play anywhere). If Andrew sees it play
there, the platform is the whole difference; if it fails there too, the
account or the line is in it as well.

## 2026-11-23, evening: Rogers Xfinity Stream cannot play in Longboard; Apple TV asked about

**Andrew: "test whatever methods to see if you can get Rogers working."**
He signed in himself. Everything below was done with a temporary,
test-only switch for the identity, **since removed; nothing of it is in
Longboard**.

| Step | Longboard says Linux (the truth) | Says ChromeOS, Windows or macOS (the system only, in the user agent) |
|---|---|---|
| Front door | "Update your browser to start streaming" | The MyRogers sign-in page |
| Signed in | not reached | Home, the guide and the listings load and can be read |
| A channel pressed in the guide | | The player opens, asks for the Widevine key system and is given it, and starts two stream buffers (H.264, AAC) |
| Then | | **The service's licence server answers 403.** The page's own console: "Failed to acquire a license", and the request to its licence address is the one that failed |

So the refusal at the door is not the real one. The service does not
issue a licence to this player (the agent's reading of why, **not
established**: a Linux build of the engine reports an unverified platform,
castLabs' wiki, and the service wants a verified one). That is the
service's protected-playback decision. **Longboard does not work round it
(rule 2), and this is where the testing stopped.** Only the status of the
request and the page's console were looked at; nothing of the licence
exchange was read.

**Nothing is built for Rogers.** Saying another system would only move the
refusal from a clear page to a failed player, so rule 3 stays as it is on
systems: Longboard never says it runs on another.

The "This Video Cannot Be Played (player.noPlayableID)" seen first was a
different thing: the item on the home page's "Now Playing" strip has no
stream for a browser, under any identity tried.

**Apple TV**, asked again by Andrew: it has played since 0.3.22 (a title
resumed on the Canadian storefront, entry of 2026-11-22). The castLabs
December release is not being waited for; it will let the AC-3 stopgap be
taken out.

## 2026-11-23, after the release: Sportsnet+, TSN and Rogers (0.3.25, not released)

Andrew asked how the three work and signed in to the first two himself
(windows with nothing attached). Tested in the survey's data folder under
`--automation`, in a 1920x1080 window. No profile was written for any.

| Service | Signed out | Signed in |
|---|---|---|
| **Sportsnet+** (`watch.sportsnet.ca`) | Rows move sideways, tiles open | A live channel plays full-window with sound. OK pauses and plays. Down reaches Settings, Multiview, Captions and picture-in-picture; Up lands on Pause; Back returns to the picture, then leaves |
| **TSN** (`tsn.ca/live`) | Navigates; the player says to sign in | The live channel plays. Down reaches jump forward, mute, information, captions, settings; Up lands on Play. **OK did nothing**: the player ignores its key until clicked. Fixed (below) |
| **Rogers Ignite TV** (now "Rogers Xfinity Stream") | Sent to "Update your browser to start streaming" | Not reached |

- **Fixed for TSN, and for any site without a profile:** OK on the bare
  picture sends the player's key; if nothing changes in 0.6 s and the video
  has not said it played or paused, the picture is clicked once (an
  ordinary click at its middle). Until now only for a player in a frame.
  **Verified:** a scenario on the invented player with "?needsClick"; on
  TSN, OK paused, played and paused again; Sportsnet+ unchanged (its
  player answers the key, so no click).
- **Picture size, not understood:** after a minute Sportsnet+ showed
  512x288 and TSN 960x540, both from streams coded for standard
  definition. **Not established** whether that is the service's limit for
  a browser with software-only protected playback (a common one, and not
  something Longboard works round, rule 2), or this test machine, which
  has no graphics card. Andrew's TV will show which.
- **Rogers:** its requirements page lists Windows and Mac browsers only.
  **Measured:** refused with Longboard's name and without it, so it is
  Linux it refuses. Saying another system is still forbidden by rule 3
  (Andrew's change of 2026-11-23 was about browsers), and such a refusal
  often stands for protected playback that would fail anyway. **Asked
  Andrew; nothing done.**
- TSN asks the key-system interface whether AC-3 sound can be played and
  is told yes (Longboard corrects that answer elsewhere, not there, by
  the decision of 2026-11-22). It then used ordinary sound. Noted in case
  a title there ever fails the way Disney+ did.

**Not verified:** on a TV; a game as opposed to a channel; TSN full
screen (its player takes 96% of the screen inside its page; whether it has
a full-screen button the remote reaches was not looked for).

## 2026-11-23: 0.3.24 is released

Andrew, asked: "Release it". Tagged and published 2026-11-23; both builds
and the publish step passed. Everything in the entries below marked "not
released" is in it. Still asked for before any later release.

To hear back from Andrew, on a TV: YouTube's animation and previews signed
in; embedded players; whether the menu is ever stranded again (if it is,
the log now says once that a key reached the page behind it); Disney+ and
Apple TV on 0.3.22 or later.

## 2026-11-23, late: to a TV site Longboard says the TV engine (0.3.24, not released)

**Andrew, 2026-11-23:** "If reporting as a different browser enhances the
experience then you can do that. Otherwise report truthfully." Hard rule 3
is rewritten to that, with conditions (CLAUDE.md).

**Measured first**, signed out, the video site's TV app, by a temporary
switch since removed:

| Said to the site | Tier | Elements with a transition | Previews | Extra switches served |
|---|---|---|---|---|
| Chrome, then `Longboard_TV_x8664_2026/... (Longboard, Linux)` | 3 | 0 | play | |
| `Cobalt/... Starboard/18`, then the same device part | 1 | 37 or 38 | play | lottie animations, squeezeback, cast headers |

**Done:** a site whose profile says `view.device: "tv"` is told the second.
Everything but the engine's name, version and interface number is still
true and Longboard's own. Every other site, and the same site's pages the
profile does not name, get the true identity (held by an end-to-end check).

**Verified in the built app, on the live site, signed out:** tier 1 and 37
transitions; a preview plays on a rested result; a video opens from search
and plays; Escape goes back; one 4K 60 video played at 2560x1440 at 60 in
two runs (and at 854x480 at 30 in one run 33 seconds in, which the agent
takes for the stream still finding its level, not established).

**Not verified:** signed in; on a TV; that animation is *seen* (counted in
the page, not watched); sign-in by code; voice search (the site now sets
`trigger_starboard_mic_check`, and Longboard has none of that engine's own
interfaces; nothing was seen to break, and not everything was tried);
"who's watching" (its cooldowns are the same under either identity).

## 2026-11-23, night: what VacuumTube does, read from its source (0.3.24, not released)

Andrew: "VacuumTube has previews working, make sure to study what they're
doing." Its source (github.com/shy1132/VacuumTube, MIT) was read; none of
it is used.

| What it does | Its stated reason | Longboard |
|---|---|---|
| Says it is the TV engine, Cobalt, with its own name in the device part: `..., VacuumTube_DESKTOP_<chip>_<year>/<version> (VacuumTube, <system>)`, and sets the browser's brand hints to match | "leanback only lets you in with a user agent from one of the tv/console apps, and it decides a lot based on it (ui quality, thumbnails, player build, etc)" | Does not say it is Cobalt (rule 3). **Does** write its own TV statement in that device layout since this version; the site let Longboard in without the engine claim all along |
| Nothing at all for previews | (none) | Previews came with the device layout: measured playing on 2026-11-23 |
| Makes `MediaSource.isTypeSupported` say no to impossible sizes and rates | The player tests that "absurd" values are refused; when they are not it "falls back to assuming no hfr (capping videos at 720p30) and no hdr" | **Taken, written afresh** (`src/shared/video-truth.ts`). **Measured**, signed out, 1920x1080 window, one 4K 60 video: 1280x720 at 30 before; 1920x1080 at 60 after, in the built app |
| Gives the page a `window.h5vcc` object, the TV engine's own interface (casting discovery, deep links, "container size override" to unlock sizes above the screen's) | Features that need it | Not done: it is another engine's interface, and saying a bigger screen than there is would be untrue |
| Overrides entries of the site's own configuration in the page (webp pictures, no "sign in with your remote", memory saving) | Fixes for its own shell | Not done: Longboard does not rewrite a site's data |
| Loosens the site's content-security policy, blocks ads and sponsors, adds its own settings page inside the site's | Its features | Not done (rules 5, 7 and the profile format) |

**Still open:** animation. The site's configuration still says
`steel_limited_animation: true` and `receiver_tier: 3` for Longboard. Not
measured: what VacuumTube is given; whether the tier follows the engine
claim. **Not verified:** any of this signed in, on a TV, or above
1920x1080 (the test machine has no bigger screen and no graphics card).

## 2026-11-23, later: the stranded menu, the ring over full screen, YouTube's tier (0.3.24, not released)

**Nothing here is released.** 0.3.24 is committed, not tagged; it takes in
0.3.23. The tag `v0.3.23` exists on an older commit and was never
published. Andrew is asked before any release.

Four reports from Andrew at the TV, on 0.3.22:

1. **"I have opened the Longboard menu but my selection is on the web page
   not the menu and there's no way to close the menu."** **Not
   reproduced**, with real key presses through the X server, in any of:
   the highlight inside a frame, a frame's player full screen, a page
   asking for the window's focus, a frame taking the cursor. The road is
   unknown. Two things done that do not depend on the road: a key that
   reaches a website while one of Longboard's screens is in front is taken
   from the page, the screen in front is given the keys again and the key
   is passed on to it (and the log says once that it happened, which will
   say whether this was the road); and each view is now told by the shell
   whether it is the one in front, so a game controller is not read by a
   page behind the menu when its window never heard it lost the keys.
   **Verified:** an end-to-end scenario sends keys to the page with the
   menu open. **Not verified:** that this is what Andrew met; a
   controller (none on the test machine).
2. **A highlight showing over a player put full screen.** The ring is
   drawn above everything, full screen included. Now not drawn while
   something is full screen that the highlighted thing is not inside, and
   drawn again after. **Verified** by eye from two screenshots of a
   fixture; no test holds it.
3. **YouTube's previews, its animations, and "are we getting the full TV
   experience?"** No. Read from the configuration the site serves the
   page (`window.environment`): this device is given `receiver_tier: 3`
   and `steel_limited_animation: true`. **Previews: fixed.** With the TV
   statement written the way TV devices write it, chip and year included
   (`Longboard_TV_x8664_2026/<version> (Longboard, Linux)`), the site
   also serves `inline_playback` and the client-side muted-preview
   switches, and a preview played on a rested tile (measured before and
   after, as a guest, on a browse shelf). **Animations: not fixed**; the
   tier and "limited animation" stay as they were. **Not established:**
   what the tier goes by. VacuumTube's own source says the site "decides a
   lot" by the identity and that it presents itself as the TV engine
   (Cobalt) to get it; Longboard says it is Chrome, which it is (rule 3).
4. **"Who's watching" every launch on VacuumTube, not here.** The served
   configuration has `whos_watching_enabled: true` with cooldowns: 120
   minutes with several accounts, 30 as a guest. That fits what Andrew saw
   on 2026-11-21 (shown once, then not). Why VacuumTube sees it at every
   launch was not found.

## 2026-11-23: releases are asked for first; 0.3.23 is not out; YouTube previews

- **Andrew, 2026-11-23: "Ask before you release things."** This replaces
  "You can make releases" (2026-11-19). The tag `v0.3.23` had been pushed
  minutes before; its build was cancelled before the publish step, so
  **0.3.23 is committed and tagged but not released**. The latest release
  is 0.3.22. To release it once Andrew says so: re-run the cancelled
  workflow run for the tag.
- **"Video previews don't work on YouTube"** (the TV app, which the
  YouTube profile opens). **Reproduced as a guest:** resting for nine
  seconds on a tile of a browse shelf or of search results starts nothing;
  the app's one video element stays hidden and the app never calls `play`.
  **Looked at:** the app's Settings list here has no "Previews" entry (it
  has Auto-play, Restricted mode, linking, language, history, About);
  guides for other TV platforms describe a "Previews with sound" entry
  there, and user reports say some platforms have none. About says the
  app sees "TV (PLATFORM_DETAIL_TV), Longboard/Linux, Chrome".
  **The agent's reading, not established:** the app does not offer
  previews to this device, and that is its decision. **Tried and ruled
  out:** the engine answers yes to the app's deliberately impossible
  capability questions (video 99,999 wide and the like); answering those
  truthfully, by a probe, changed nothing, so nothing was built for it.
  **Not tried:** signed in. What decides it inside the app was not looked
  for (rule 9), and saying Longboard is another maker's TV is out (rule 3).

## 2026-11-23: players embedded in a frame from another site (0.3.23)

Andrew: on general media players "there's no way to get to the media
player's controls to full-screen or anything", naming one video site.

**Found on that site** (signed out, under `--automation`; no profile made
for it, nothing of it committed): its player is a frame from another host
(an open-source player), nearly as tall as the screen, and the site pins a
header and a bar of its own over the frame's top and bottom.

| What went wrong | Why | Now |
|---|---|---|
| Down passed over the player | The pinned bar's buttons lie inside the frame's box, so the frame was taken for a backdrop with controls on it and dropped | A frame or a video is never a backdrop |
| OK on the frame fell back to pointer mode | A playing player has nothing to highlight, and that counted as "nothing here" | A frame that a video fills is a player: its layer takes the keys with nothing highlighted |
| The player's control row lay under the site's bar | It is at the frame's bottom edge | The page puts such a frame in the browser's own full screen when the highlight goes in, and takes it out on the way back |
| The player's keys and the pointer movement that shows its controls never arrived | Electron's own input events do not reach a frame served by another site (known since 2026-11-18 for clicks) | For a player in a frame they go through the DevTools input channel, as pointer mode's do |
| The player ignored its keys until clicked | Its own behaviour | OK that changes nothing is followed by one ordinary click on the picture |
| Left and Right did nothing on its progress bar | The bar is plain boxes, not a slider | Inside a player a thin strip across most of the screen is the progress bar |
| (the invented player) no control was ever a target | Its body clips and has no height, everything being pinned; that read as "all hidden" | Clipping on the body or root never hides |
| Escape left full screen but not the frame | The browser ends full screen on Escape itself and no page sees the key | The end of that full screen is taken as leaving the player |

**Verified:** unit tests; a new scenario with two invented fixtures
(`embed.html`, `inner-player.html`): landing on the frame under a pinned
bar, full screen, OK by click then by key, seek keys, controls by pointer
movement, the bar, a button pressed, Back; the whole suite in six parts,
all passed. On the live site: full screen, OK paused and resumed, Right
moved on by about five seconds, Down landed on the progress bar and Right
there moved on, Down then Right walked the buttons, Escape ended it.

**Not verified:** on a TV; a remote whose Back is not Escape (the layer's
own path, exercised only by reading); a player in a frame inside another
frame; a frame the page does not allow to go full screen (it then stays in
the page, driven the same way); other embedded players. **Known gap:**
on the player seen, Left and Right before the first OK do nothing, since
it ignores keys until clicked and only OK clicks.

## 2026-11-22, night: Apple TV with the same correction (0.3.22)

Andrew asked whether the AC-3 correction helps Apple TV too. **Measured,
signed in (his sign-in from an earlier pass), under `--automation`, with
the same probe:** the site asks about AC-3 and E-AC-3 through
`MediaSource.isTypeSupported` and is now told no; on its Canadian
storefront a title he had started resumed and played (picture running,
sound added as AAC, no media error).

**Not measured:** the same title on 0.3.21, so that it failed before
because of AC-3 is still the expectation from 2026-11-18, not something
seen here. On the US storefront, where this machine lands, the front page
and Resume both answer "An Error Occurred. Please try again."; the account
is a Canadian one, and the agent's reading (not established) is that the
storefront is the reason.

## 2026-11-22, later: Disney+ still shows error 83 on 0.3.21

Andrew: "Error is still there." **Not known:** whether the Disney+ profile
was in use on the TV when he tried (it arrives with the daily look for
reviewed profiles, or from Settings, "Look for reviewed profiles now").
Asked him to look at the menu, "This page", for the profile's row.

What was read since:

- **Sourced:** castLabs' wiki (VMP page) says that on Linux the engine
  reports `PLATFORM_UNVERIFIED` to a licence server, "Expected on Linux";
  their signing that makes a platform "verified" exists for Windows and
  macOS only.
- **Sourced, old (2019, a Dutch forum quoted by news sites):** the answer
  behind error 83 was "platform verification status is incompatible with
  the security level".
- **The agent's reading, not established:** if the profile was in use,
  the likelier cause is the service's own licence rule refusing an
  unverified platform. That is the service's protected-playback decision;
  Longboard does not work round it (rule 2), and does not say it is
  another browser or system to be let in (rule 3).

Open: withdraw the Disney+ profile once it is known it was in use and did
not help.

## 2026-11-22: cursor keys on the keyboard; Up in a player (0.3.20)

Three reports from Andrew at the TV.

- **"There needs to be arrows on the keyboard to move the cursor."** The
  bottom row of every face now has a left and a right key between the face
  keys and space; each is one real arrow-key press in the field. Shift, the
  symbols key and "abc" are one column wide to make room (space too, on the
  symbols face). **Verified:** unit tests; end to end on the form fixture
  (left, a letter typed in the middle, right); the look, from a screenshot.
  **Not verified:** fields a site handles in its own way (a search box that
  takes the arrows for its suggestions), or a text box of several lines.
- **On Netflix, Up with no controls showing "selects the whole video".**
  Not seen by the agent (see 0.3.19 for why Netflix is not played). The
  likely cause, **a guess**: something pressable laid over the whole
  picture. Anything pressable that covers four fifths of the screen's width
  and seven tenths of its height is now passed over while a video is
  watched.
- **"It should put the selection on the play button not the x button."**
  Up from the bare picture now goes to the play button: a button in the
  lower part of the screen named Play or Pause, else the first button of
  the lowest row. Down still goes to the progress bar.
  **Verified:** unit tests; the `scrub.html` fixture (now with a button
  over the whole picture and a close button in the corner); Vimeo's player
  page, where Up landed on the play button. **Not verified:** Netflix.
- **Disney+ does not play.** Not looked into: nothing is known here about
  what it shows. The open request to castLabs (issue 221: the Linux engine
  says it can play AC-3 sound and cannot) is one possible cause and is not
  established as this one. Asked Andrew what the screen says.

The whole suite in six parts, all passed.

## 2026-11-22: a player's progress bar could not be highlighted (0.3.19)

Andrew, at the TV: on Netflix the timeline could not be selected and moved
while a video played; is it so on other sites?

**Found on a public video site** (Vimeo's own player page, signed out):
yes. Its progress bar is a `role="slider"` four pixels high. Longboard drops
anything under ten pixels as too small to aim at, and counts anything under
four as not visible, so Down from the picture skipped the bar and landed on
the sound button. Left and Right with nothing highlighted did seek all
along (they are sent to the site as its own keys).

Now: a slider with a track at least 100 pixels long is a target however
thin. On it Left and Right are the slider's own keys (before, only for the
browser's own range input, or a bar half the screen wide in a player). Down
from such a slider goes first to the nearest control in its own row, since
Left and Right no longer lead to the buttons a player puts at the bar's
ends.

**Verified:** unit tests; a new invented fixture (`scrub.html`, a bar three
pixels high with a button at each end) and scenario; the whole suite in six
parts, all passed. On Vimeo's player page: Down lands on the bar, Right
moved the picture on by about five seconds a press and Left back, Down went
to the sound button, Left from there back to the bar.

**Not verified:** Netflix. Playing a title needs a viewer chosen on
Andrew's account and adds to its watch history, so the agent did not. The
fix helps there only if Netflix's bar is a `role="slider"` or a range
input; that is a guess from memory, not from an outline. If the bar still
cannot be reached in 0.3.19, a page outline saved while the controls are
showing will say what the bar is.

## 2026-11-21: apps added from Longboard did not reach the TV's app list (0.3.18)

Andrew, on a Fedora Kinoite box with Plasma Bigscreen: a site added as an
app did not appear in the app list. Cause, found by reading the code and
confirmed by test: run as a Flatpak, Longboard wrote the entry into the
Flatpak's own data folder, which no desktop reads, with a command (a path
inside the box) the desktop could not run; and it said the app was added.

Now: as a Flatpak the entry goes to the desktop's own folder
(`HOST_XDG_DATA_HOME`, else `~/.local/share`), started by `flatpak run
<name> --app=<id>`; the Flatpak asks for that one folder
(`--filesystem=xdg-data/applications:create`). With no picture of the site
the entry used a file inside the package, unseen by the desktop from a
Flatpak and at a new path at each start of an AppImage; a copy is now kept
in the data folder. Entries are written again at every start, so apps
added before this appear once 0.3.18 has been started.

**Verified:** unit tests for where the entry goes and how it starts each
kind of package; an end-to-end scenario with Longboard told it is a
Flatpak; the whole suite in six parts (557 checks, all passed).

**Verified with the real 0.3.18 Flatpak**, installed for this user on the
development machine (Debian, not Kinoite), by script: started with one app
already in its list, it wrote the entry into `~/.local/share/applications`
with `Exec=flatpak run io.github.andrewgbest.Longboard --app=<id>` and a
picture that exists; that command, run while the Flatpak was already
running, handed the request to the running copy, which opened the app.

**Not verified:** on Fedora Kinoite, or that Plasma Bigscreen then shows
the entry in its app list (it reads that folder; not seen). Whether the
AppImage on that box had the same fault is not known: its entries went to
the right folder, but with a picture path that broke at the next start,
which is also mended.

## 2026-11-21: the menu from inside a site's own TV app (0.3.17)

Andrew, at the TV: pressing Up on the video site's TV app did not bring up
Longboard's menu. On such a site the arrows are the site's, so "Up twice at
the top" had nothing to go on. Now Longboard watches from outside whether
the app did anything with an Up (what has its focus, where that is, the
address): an Up the app did nothing with shows "Press Up again for the
menu", and the next one opens it. Not while a video is being watched.

**Verified:** the scenario with the invented TV app (three more checks);
on the live TV app by script, as a guest: Up from the first row goes to
its search field, and Up twice more there opens the menu. The whole
end-to-end suite in six parts (numbers in the commit). **Not verified:**
by a person with a remote; the app's other screens (a screen whose top
item keeps focus but changes something else on Up would be misread).

## 2026-11-21: handing a Steam library back to the program that asked (0.3.16)

Decided by Andrew (DECISIONS.md, top entry) and brought in from the branch
`steam-hand-back`, which was cut at 0.3.13: re-applied on main (the code
applied cleanly; only these two documents conflicted), reviewed, and
changed where the decision table says **[changed]** or **[added]**. Started
with `--hand-back=steam-library --hand-back-to=<file>`, Longboard opens
Steam's sign-in page, asks the person once they are signed in, and on a yes
writes the account number and the ids of what it owns to the file.

**Verified, by script:**

- 596 unit tests, including the rules in `src/main/handback.ts` and telling
  "nobody signed in" from "this page can no longer be read".
- Five end-to-end scenarios against an invented store (24 checks): a yes; a
  no; **the request arriving at a Longboard that is already running** (new),
  including a second request taking the place of an unanswered first; a
  store whose pages have changed (new: nothing shared, the program told no,
  the person told why); Longboard closed with the question unanswered (new).
- Against the real Steam, signed out: started exactly as Bilby starts it,
  Longboard shows Steam's sign-in page and asks nothing; closing it writes
  `{"declined":true}`. Steam's real front page reads as "nobody signed in"
  (not as unreadable), and its real list address answers with an empty
  `rgOwnedApps`, which the code turns into an empty `owned`.
- The whole end-to-end suite on the final code (this change and the one
  below it together), run in six parts because the machine is short of
  memory: 551 checks, all passed, none needing a second run.

**Not verified by anyone: any of it signed in to the real Steam.** That
Steam's front page says who is signed in the way the code expects
(`logged_in: true` with `steamid`) comes from another project's source, not
from seeing it. If it is otherwise, the person will be told Steam's pages
have changed and nothing will be shared. Andrew will sign in on the TV:
Bilby, Settings, "Or sign in to Steam in a browser (Longboard)".

**Also not tried:** Steam's sign-in by QR code; a person who was already
signed in to Steam in Longboard before Bilby asked (expected: the question
comes straight away).

**Open, separate:** Longboard installed through Bilby on Andrew's TV did
not start (it does on a Debian 13 test machine). The next Bilby release
reports why an app closed at once; that message, when it comes, is a bug
report against the AppImage.

## 2026-11-21: Longboard names itself, and a sign-in service lets it in

Andrew asked to get the search company's services working. Its sign-in
refused Longboard by hand and by script ("This browser or app may not be
secure"). Tried on its sign-in page with a made-up address and no password
(DECISIONS.md has the table): the refusal goes away when the user agent
ends with ` Longboard/<version>`, and nothing else tried made a difference.
Andrew chose to say the name to every site; rule 3 is amended. 0.3.16.

**Verified:** by script, the built app on that sign-in page now gets
"Couldn't find this account" for the made-up address where it got the
refusal before; the video site's TV page still serves its TV app; the list
of 68 sites run again signed out with the new identity: none refused it or
served something lesser (six differed from the earlier run; each was looked
at and is a notice in front of the page, an advert's frame, or the earlier
change to the spending guard). **Not verified:** the rest of that sign-in
(password and after), which only Andrew can try.

## 2026-11-21, last: a site's own interface for TVs, and rule 3 amended

0.3.12 is published (six packages). Then Andrew asked how another project
gets a video site's TV interface, and then for profiles that get it for
Longboard, with the rules changed to allow it "because you are afterall a
tv". Hard rule 3 is amended (CLAUDE.md, LEGAL-GUARDRAILS.md, DECISIONS.md).

**What was found first.** That project sends the identity of the engine the
site's own TV apps run on (read in its source). Longboard does not need to:
tried with plain requests, the site's `/tv` page is served to Longboard's
real identity followed by `, Longboard_TV/<version> (Longboard, Linux)`,
and not to the real identity alone.

**What was built (0.3.13).**

- A profile key, `view.device`, whose only value is `"tv"`.
- For pages such a profile matches, the view says the honest identity plus
  that statement, to the server and to the page's scripts, and so does
  everything the page fetches. Set in `src/main/useragent.ts` only; the
  rule checker refuses it anywhere else, and refuses a profile format that
  carries an identity.
- On such pages the site answers the remote: arrows, OK, media keys, and
  Back as Escape or Backspace go through untouched; no highlight.
- A profile in the catalogue for the video site's `/tv` address.

**Verified:** 579 unit tests; a new end-to-end scenario with an invented
TV app (identity to page and to requests, usual identity elsewhere on the
same site, arrows reach the app, the spending guard still refuses OK on a
sign-up button in a scripted run); the whole end-to-end suite; on the live
site by script, the TV app loads and starts under the profile, and the
ordinary site beside it is told only the usual identity.

**Not verified, and it matters:** signing in (the app's own way, with a
code on another device), the app's search and its own keyboard, Back at
the app's top level, and anything by a person with a remote. (What was
seen as a guest is listed further down.) **Andrew needs to try it with a
remote:** open the site.

**Then (0.3.14), at Andrew's word that the profile should apply "when they
go to youtube using the url too":** a second key, `view.entry`. The site's
front page, however reached, opens at the path the profile names; any other
address of the site opens as asked. Seen on the live site by script: the
bare domain, with and without `www`, lands on the TV app; a search address
opens the ordinary search page with the usual identity. 582 unit tests,
the scenario extended (nine checks). The profile in the catalogue is now
1.1.0 and needs 0.3.14: 0.3.13 does not know the key and passes the profile
over.

**Then (0.3.15), at Andrew's word "It should never open the ordinary site
unless you disable the profile":** every address of the site goes to the
TV app (`view.entry`), a link to one video keeps its video (`view.carry`,
`["v"]`), and the site menu has a switch, "Use this site's profile", which
is the way to the ordinary site. Profile 1.2.0 in the catalogue; needs
0.3.15.

**Seen on the live site by script, signed out, as a guest** (the account
screen's "Watch as guest" is not a sign-up control, so a scripted run may
press it): a short link to a video lands on the TV app and, after "Watch
as guest", that video plays; Back (Escape) leaves the player for the app's
start page; the arrows move its mark among the videos there; a search
address lands on the app's start. 584 unit tests; the scenario is now
twelve checks, including the switch off and on again. The end-to-end
suite was run in parts (`npm run e2e -- --part=1/3`, new) because the
machine was short of memory and twice ended a whole run part-way: 528
checks passed in all; one check in the Settings scenario (a remapped key's
label) failed once and passed when that scenario was run again by itself.
It was not looked into further.

**Known gaps.** A link to a search, a channel or a playlist lands on the
app's start, not on that thing. A Back key that is not Escape or Backspace still
goes back in history instead of to the app. Nothing on screen says the site
is being told "TV"; the site menu shows the profile's name only. The site's
terms may reserve the TV interface for its own apps; it can stop serving it.

## 2026-11-21, later: the signed-in run over 49 sites, and whether each wants a profile

0.3.11 is published (six packages). After Andrew closed the last sign-in
window the survey was run again over the 49 sites that take an account,
with his sign-ins, at 1920x1080, by script with the spending guard on
(`survey.mjs --data=`; the data folder is outside the repository and nothing
from it is committed).

**What state each site was in** (seen in the run's own pictures):

- Signed in, 13: two short-video and photo sites, two social sites, a forum,
  three live-video sites, a music player, an anime service, and three film
  services (one of them stops at "who is watching?"; the run does not pick
  a viewer on someone's account, so nothing past that was seen).
- Not offered in Canada, 3: three film services show only a notice.
- Signed out, 33: the search company's sign-in refuses this browser (rule 3:
  not worked round), and the rest were closed without signing in.

**Result:** on no site did the highlight stop with page left to see. Two
real faults, both mended in the general rules, and one site given a profile:

| Seen | Cause | Now |
|---|---|---|
| A photo site, signed in: Down went round three things for ever | Resting on a small profile picture opens a card about its owner. The card was the nearest thing below, the highlight stepped into it, and the site closes the card the moment focus enters it. The highlight was gone and the next press began at the top | When what had the highlight is taken away and the page gives focus back to what the highlight came from, the highlight goes back there too. From there, what was not on the page before it arrived is passed over. With no word from the page, the next press carries on from where the highlight was, not from the top |
| A music player: the whole app slid 61 px up off the screen as the highlight moved | The app has its own scrolling shut off and is 601 high in a 540 window. Bringing something into view inside a pane also moved the page | A page that has shut its scrolling off is not moved, unless what is highlighted would otherwise be cut off |
| The same player: first press on a link in the top bar; the player bar under the bottom of the screen | It is laid out for a taller window than the 960x540 page | A profile in the catalogue (`open.spotify.com`): drawn at 1280x720, where it fits whole; highlight starts in the main pane; the four parts of the app named. Evidence: an outline taken signed out |

Looked into and left: a live-video site walks its long list of followed
channels before anything else (Right goes to the page; correct, slow); a
film service's walk ends on its "which country" strip (that is the end of
the page); one search site showed nothing highlighted once and was fine when
tried again (not explained).

**Would a profile polish each site further?** The agent's judgement, from
this run. A profile can only name elements, set the drawing size, say where
the highlight starts, and group things; it needs class names or attributes
that stay put, shown in an outline that may be committed (so: taken signed
out).

| Sites | Verdict | Why |
|---|---|---|
| The music player | **Yes, done** | Above |
| Two film services that have profiles already | Enough as they are | Both walk top to bottom signed in; nothing new to say |
| The film service behind "who is watching?" | **Not known** | Nothing past the question was seen |
| The live-video site with the long side list | **Maybe** | A profile could start the highlight on the page instead of the list. Not written: no outline taken yet, and it is a preference, not a fault |
| The photo site, the two social sites, the short-video site | No | Their class names are machine-made and change; a profile would have nothing lasting to name. What went wrong there was general and is mended generally |
| The forum, the other live-video site, the anime service, the film and TV guide, the video-sharing sites | No need seen | The general rules walk them without a loop or a stop |
| The 33 signed out and the 3 not offered here | Not known signed in | Signed out they walk as in the earlier runs |

**Verified:** 572 unit tests; the end-to-end suite (516 checks) on the
photo-site rule, and again on the final build; the photo site and the music
player by script on the live sites, signed in; the profile signed in and
signed out. **Not verified:** any of it by a person with a remote; the
music player's other pages; playing anything.

## 2026-11-21: what Andrew found while signing in

Andrew went through the 45 sign-in windows at the real screen and reported
four things. He asked to be brought back to those sites once fixed.

| Reported | Cause | Now |
|---|---|---|
| A streaming site's cookie notice could not be selected | It is pinned to the bottom of the screen. Pinned bars were only reached when the page ran out, and that page never does | A pinned notice that calls itself a dialog is offered when what would be next lies under it or beyond it on screen, and once when what would be next is off the screen |
| The same on a film service | Its notice hangs under the top bar; Down from the bar went over it | The same rule ("beyond it") |
| A film service's sign-in prompt "not working" | The prompt is a frame the highlight cannot enter. It needed OK on the frame to get the pointer, which nothing said; and a click on a field in a frame never brought the keyboard up, so a remote could not type there at all | On a frame over 40% of the screen the arrows hand over to the pointer and say so. A click on a text field inside any frame brings the on-screen keyboard up; its keys type into that field; Back returns to the pointer where it was |
| Another streaming service: the sign-in button could not be reached | **Not known.** Its front page is an offers page the spending guard refuses in a scripted run, so the agent has not seen it | Nothing changed for it on purpose. An outline saved by Andrew on that page (Ctrl+Shift+D) would show the cause |

- **Second round, after Andrew tried the fixes** (same day):

| Reported | Cause | Now |
|---|---|---|
| The film service's notice: "Learn more" can be reached, its X cannot | Its button, a link in its words and its X are at three heights, so Left and Right inside the notice went nowhere | Inside one notice or pop-up, a sideways press that finds nothing level takes the nearest thing that way in it |
| The other film service's sign-in prompt still could not be used | Two things. The prompt is a dialog the browser draws in its top layer, in front of Longboard's own drawings, so the pointer, the highlight and the keyboard were all underneath it. And the rule that keeps the highlight inside a dialog took the cursor out of the frame's field half a second after the keyboard opened | Longboard's drawings are put in front again whenever the page opens a modal dialog or a popover. The dialog rule stands aside while the keyboard is typing into a frame |
| The streaming service whose sign-in button could not be reached | Andrew: "seems to work now, odd it didn't before". Not explained | Nothing done. By script, Down from a fresh page lands on its sign-in button |

- **Third round** (same day). Andrew: the X on the first film service's
  notice does not close it; the other's "which country" strip cannot be
  reached; and "dig deep to see if you can get [that service's sign-in]
  working without a pointer. Even if it needs to be a profile instead."

| Asked | What was done |
|---|---|
| Sign-in without the pointer | **The highlight now goes inside frames.** OK on a frame, or an arrow with nowhere to go on a frame over 40% of the screen, gives the frame the cursor and starts a layer of its own in it: the arrows move among what is in the frame, OK presses it, a press with nowhere to go (or Back with nothing to close) comes back out. A frame inside a frame is entered the same way. The keyboard is still the page's. Only when nothing in the frame can take the highlight (a map, a player) is the pointer brought, as before |
| Why not a profile | A profile names things in the page it is for. The form is in frames inside that page, one of them from the service's sign-in site, where no selector of the page reaches (and a profile cannot run code, Hard rule 7) |
| The "which country" strip | It sits under the pane that scrolls. Since 0.3.8 the pane was not left while it had more to show, so the strip could only be reached from the far end of the page. Now what lies beside the pane in view is offered once, when the pane's next thing is out of sight |
| The X that does not close the notice | **Not reproduced.** By script on the live site OK on the X closes the notice, from either side and with the pointer. Not yet tried with Andrew's own signed-in session |

- **That service's prompt, by script on the live site, arrows only:** Down
  goes into the prompt and walks its email field, its link and its
  Continue button; OK on Continue with nothing typed puts the cursor in
  the field and the keyboard comes up. The step after the email (in a
  frame from the sign-in site, inside the first) has not been seen: it
  needs a real account, and a script types no password (Hard rule 10).
- **What a frame's layer may ask the shell:** to send the highlight into a
  frame inside it, to leave, the menu, the pointer, and that a text field
  has the cursor. Nothing else it sends is passed on, and no API is
  exposed to any page (Hard rule 13).
- **Not done in frames:** a drop-down's own list (it needs a real key
  press, which is not yet sent into frames); profiles; the player.
- **The film service's prompt, by script on the live site:** an arrow
  brings the pointer, OK on the email field brings the keyboard up in
  front of the prompt, and a key typed one letter into the field. Nothing
  was sent.
- **Found on the way:** a frame's "my guard is up" could reach the shell
  before the shell heard the frame had gone to that page, and was then
  forgotten, so a scripted run refused every click into such a frame. The
  frame now says it again once its document is there. The guard itself
  was up all along.
- **A scripted run may now look at a page of offers** (Andrew's decision,
  DECISIONS.md). Sign-up addresses are still refused: on that streaming
  service the sign-in button's own address is one, so no script has seen
  the form behind it.
- **How the keyboard reaches a frame:** the frame's own preload says only
  that a field has the cursor after a click, whether it is a secret one,
  the page's word for Enter and where the field is. The shell takes the
  arrows, OK and Back while the keyboard is up and hands them to the
  page's layer. Letters, Enter and backspace go through the browser's
  DevTools input channel, which pointer mode already uses: Electron's own
  key events and `insertText` do not arrive in a frame from another origin
  (measured here; with `insertText` the page stopped answering).
- **Verified:** `npm run check` (566 unit tests); `npm run e2e` (505 checks, all passing); the two
  notices on their live sites, by script: Down reaches each notice's
  buttons and carries on into the page afterwards.
- **Unverified:** the framed prompt past its first field (the password
  step is never typed by a script, Hard rule 10); any of it by a person
  with a remote. A password field that changes its kind without losing the cursor is not
  noticed (the frame speaks when the cursor arrives).

## 2026-11-20, night: all 68 sites again, and the way in for sign-ins

Andrew: run every site once more, ask of each whether a profile would
polish it, and go past the sign-in pages; he signs in himself.

- **All 68 sites run again signed out**, then once more on the fixed build.
  Up reaches the top on 67; the 68th did not open (a streaming service
  whose front page is an offers page the spending guard refuses).
- **Three faults found and fixed in the general rules** (no profile):

| Seen on | Fault | Rule now |
|---|---|---|
| A film service (shelves in a pane that scrolls, a notice under it) | Down went to the notice and stuck; the rest of the pane was never reached | A pane that scrolls by itself is not left by Down or Up while it has more to show that way |
| A music service | The highlight went to a button in the player bar, which is shut to no height until something plays | A control inside a box closed up to nothing is not a place to go |
| An electronics maker (cookie notice over the whole screen) | Down at the notice's last button scrolled the page hidden behind it | The page behind a layer pinned to the screen stays where it is |

- **Each tried on its live site after the fix:** the film service walks
  to the end of its page; the music service no longer stops on the hidden
  button; the page behind the notice stays at its top.
- **The survey's numbers read differently now on three services** whose
  front page opens with a privacy or welcome dialog: Down "does not move"
  there, because the highlight is in the dialog and the page behind no
  longer scrolls. That is the fix working, not a fault.
- **A mistake of the agent's, corrected:** the first run today had the
  age-question step on for every site. It pressed "accept" on thirteen
  sites' ordinary notices and skewed eleven results. Those were run again
  without it. The step is for the adult sites only.
- **The survey now sees a highlight inside a component's own tree**
  (shadow DOM). One forum's vote buttons had been counted as "nothing
  highlighted".
- **Signing in** (`test/scorecard/sign-in.mjs`): opens each of the 45
  sites that have an account worth having, one at a time, on the real
  screen. No script is attached to that window and there is no debugging
  port. The survey then opens the same data folder with `--data=` under
  `--automation`. The folder is outside the repository.
- **Profiles:** none written. Every fault on the signed-out pages came
  from a habit several sites share. The verdict site by site waits for the
  signed-in pages, where shelves, players and search are.
- **Verified:** `npm run check` (563 unit tests); `npm run e2e` (496
  checks, all passing); the survey runs above; the sign-in window opened
  on the real screen with a harmless page.
- **Unverified:** everything behind a sign-in (waiting on Andrew);
  whether a large site will let an embedded browser sign in at all;
  playing video; any of it with a remote at a TV.
- **A search company's sign-in refuses Longboard** (Andrew, at the real
  screen, 2026-11-20): "This browser or app may not be secure". Not worked
  round, and not to be: Longboard says honestly what it is (Hard rule 3).
  Why it is refused is not known; the agent's guess is that the company
  turns away browsers built into other programs. So its video, music and
  assistant sites can only be used signed out, and "sign in with" that
  company's account on other sites should be expected to fail too
  (untested).
- **Seen, not fixed:** on a music service, Down from the side column goes
  to the bar pinned at the bottom before the main pane (Right goes
  straight there); the first press lands on an advertisement's frame on
  three news sites; one weather site's page ends in a run of
  advertisement frames the highlight stops on.

## 2026-11-20, later still: past the age question

Andrew: "Test beyond the age gate".

- **The survey can answer an age question** (`--answer-gate`) and go one
  page further in (`--open-first`), with the remote's own keys.
- **Results, on the live sites, no pictures taken:**

| Site (by rank in the 50) | Age question | Front page after it | One page in |
|---|---|---|---|
| 26th | Answered with OK | 24 of 24 presses moved; 119 of 119 Tab stops | A page with video elements; 24 of 24 moved; 120 of 120 |
| 27th and 45th (the same site under two names) | None shown here | 24 of 24; 119 of 119 | A page with video elements; 24 of 24; 120 of 120 |
| 35th | None shown here | 24 of 24; 68 of 68 | A page with a video element; 22 of 24; 43 of 43 |
| 38th | Answered with OK | 24 of 24; 12 of 13 | Not opened: the script found no card to open |

- **One thing to know:** on the 26th, answering the question brings the
  on-screen keyboard up, because the site puts the cursor in its search
  field. Back puts it away. Left as it is (DECISIONS.md).
- **A mistake of the agent's, corrected:** it first reported the highlight
  stuck on that search field. It was the on-screen keyboard taking the
  arrows, as it should.
- **Verified:** `npm run check` (560 unit tests); `npm run e2e` (496 checks, all passing); the runs above.
- **Unverified:** playing a video on any of them; anything behind a
  sign-in; the 38th past its front page; any of it with a remote at a TV.

## 2026-11-20, later: the five adult sites in the top 50

Andrew: adults will use this browser, so these sites have to work too. The
five the agent had left out are now in the survey's list (68 sites).

- **Four of the five needed nothing:** on three, every Tab stop is
  reachable (119 of 119, 80 of 80, 120 of 120) and the page walks down
  without a fault. The fourth shows its age question, and all ten controls
  in it are reachable.
- **One had a fault, mended:** its age question is a layer over the whole
  screen with nothing in its markup to say it is a dialog. The highlight
  went among the links behind it, off the screen on 20 of 24 presses. Such
  a layer is now treated as what is in front. After: the first press lands
  on the question's button, and the highlight was never off screen.
- **Verified:** `npm run check` (560 unit tests); `npm run e2e` (494
  checks, all passing) with a new scenario on an invented page; the mended site and two web apps that live
  in one fixed box surveyed again on the live sites.
- **Unverified:** anything past an age question, since the survey does not
  answer one. Playing video on any of them. No pictures were taken or
  looked at; faults were worked out from structure.

## 2026-11-20: a survey of 63 well-known sites, and what it mended

Andrew asked for the top 50 websites and the top streaming services to be
tested as far as they go without signing in, and the faults mended.

- **The list** (`test/scorecard/survey-sites.json`): 45 of Similarweb's 50
  most-visited sites and 18 streaming services. The five adult sites in
  the 50 were not opened. The streaming list is the agent's own.
- **The survey** (`test/scorecard/survey.mjs`) opens each in the real app
  at the TV's size, presses one Down, Up until Longboard says it is at the
  top, 24 Downs, four sideways, and then runs the Tab referee.
- **Seven faults mended, all in generic mode, no profile** (DECISIONS.md
  has each with the site it was measured on): a shop where nothing could
  be reached; a notice in a corner that shut the highlight in; a site where
  no press did anything; Down going round at the foot of a page; Up never
  reaching the top; Down jumping back up a side column; Down going round
  between the top bar and the page.

| Measure, of the 62 that opened | Before | After |
|---|---|---|
| Up reaches the top (so Up twice gives the menu) | 60 | 62 |
| No press did anything | 1 | 0 |
| Every Tab stop reachable | 40 | 37 |
| Under nine in ten Tab stops reachable | 6 | 5 |

"Every Tab stop reachable" fell although nothing got worse that was
looked into: sites show different pages from one visit to the next, and
"skip" links are now passed over on purpose. The site-by-site lines were
compared; the one real regression seen, a loop on a messenger's site, was
mended and checked on the live site afterwards.

- **Verified:** `npm run check` (558 unit tests); `npm run e2e` (490 checks, all passing); each
  mended fault seen gone on its live site, not signed in, headless at
  1920x1080.
- **Found and not mended:**
  - On four news and portal sites the first press lands on an
    advertisement's frame.
  - A pin-board site: 6 of 16 Tab stops reached; its sign-up form's
    password and date fields are among those missed. Not looked into.
  - A free streaming site: nine large cards (360 by 400) that Tab reaches
    and the highlight does not. Not looked into.
  - Three streaming sites showed almost nothing to move between (one or
    two moves in 24 presses). **Guess:** a notice that the service is not
    offered where the build machine is. Not looked into.
  - One video service could not be opened at all in a scripted run: signed
    out, its front page is an offers page, which the automation guard
    refuses (Hard rule 11).
- **Unverified:** everything past each site's front page; anything behind
  a sign-in; playing video on any of them; any of it with a remote at a
  TV. The "loop" count is unreliable in web apps that scroll a pane of
  their own, where places on screen repeat.

## 2026-11-19, late night: suggestions, a top bar, and "Add as an app"

Andrew, at the TV: put "Add as an app" on the menu's first page; on a video
site a suggested search could not be selected and Up twice did not bring
the menu.

- **"Add this site as an app" is on the menu's first page.**
- **Suggestions under a search field can be chosen:** Down and Up go to
  the field as keys, the highlight is drawn on the suggestion the page
  marks, OK takes it (`src/layer/combobox.ts`).
- **Up twice works where a site has a bar across the top:** a link parked
  above the page is not a target, and two things in one row are not above
  or below each other (DECISIONS.md has what was measured).
- **Verified:** `npm run check` (551 unit tests). On the live video site,
  not signed in, headless at 1920x1080: Up, Up opened the menu; Down
  stepped through three suggestions with the ring on each, Up went back
  one, OK opened the results for it. `npm run e2e`: the full run had 475
  passing and one failing, which was a test still walking to the old place
  of "Add as an app"; that scenario and two others touched were corrected
  and re-run alone and pass, as does the new one, "a search field with
  suggestions, and a top bar". The full suite was not run again after
  those test-only corrections.
- **A test that failed once:** the release's arm64 build failed in the
  "downloads" scenario (the "Saved x.bin" notice never came) and passed
  when run again with nothing changed. Not looked into; it may be timing
  on that builder, and that is a guess.
- **Unverified:** with a remote at the TV. Other sites' suggestion lists.
  The scorecard was not re-run, so the effect of the two new rules on the
  ten sites, and whether the referee now counts skip links as missed, is
  not known.

## 2026-11-19, night: Android TV asked for; researched, not started

Andrew: "Make a android tv release."

- **Nothing is built.** It is a second app, not a package of this one
  (DECISIONS.md). What it needs was read from Mozilla's and Android's
  documents (RESEARCH-ANDROID.md).
- **Waiting on Andrew:** Google's Android SDK licence has to be accepted by
  him before the build tools can be installed. A JDK and the SDK's
  command-line tools are under `~/.local/opt` on the build machine. The
  machine can run an Android TV emulator (KVM is usable).
- **Also his to decide before any release:** the signing key.

## 2026-11-19, evening: the legend on Home, and a menu without a Menu key

Andrew, testing at the TV: the legend at the foot of Home is hard to
understand; what is the menu button; are F2 or R3 on remotes?

- **The gap behind the question:** F2 is a keyboard key and R3 is a game
  controller's right stick pressed in. No remote has either. The menu key
  is one some remotes lack, and without it the menu, and so Settings, the
  pointer and giving a button a job, could not be reached at all.
- **Home has a Menu button** at the top right, one press Up from the
  address bar.
- **On a website, Up at the top of the page and Up again opens the menu.**
  The first press says so on screen. Needed because adding an app, the
  pointer and the site's switches are in the menu only while on the site.
- **It is said on screen:** on the first website of each run, until the
  menu has once been opened on a website; and on Home's welcome card and
  under About and help.
- **The legend is gone.** A first version in plain words was built; Andrew,
  on reading it: "Honestly id remove the legend at this point". The
  welcome cards and About and help say what the buttons do.
- **A remote's Home button goes Home** (the key `BrowserHome`), unless
  Settings gave it another job.
- **Verified:** `npm run check` (542 unit tests); the real app headless at
  1920x1080, with a screenshot of Home looked at; `npm run e2e`, 476
  checks, all passing, with new ones in "Home, the address field, the menu
  and Back".
- **Unverified:** which keys Andrew's remote actually sends, so whether its
  Home and Menu buttons (if it has them) arrive as `BrowserHome` and
  `ContextMenu`. Up twice has not been tried with a remote at the TV, nor
  on real sites that keep their own bar at the top.

## 2026-11-19, later still: the referee, and links over two lines

Andrew asked whether the Tab key, which works well in Chromium, should be
used or learned from. Agreed with him: as a second measuring tool, not as
the way to move (DECISIONS.md).

- **The referee** (`src/layer/diagnostics/referee.ts`): a scripted run
  presses Tab through a page and compares where the engine stopped with
  what the highlight can reach. It is in the scorecard (three new columns)
  and in the end-to-end scenario "a page of results". It exists only under
  `--automation`, in the layer's isolated world, which a page's scripts
  cannot see; it reports kinds and sizes, never a page's words.
- **It found a fault on its first run:** a link that runs over two lines of
  text could not be reached (Wikipedia, OpenStreetMap). Fixed.
- **Verified:** `npm run check`, 539 unit tests. The scorecard's ten sites
  and the Google results page: no Tab stop missed after the fix
  (SCORECARD.md has the table and what each miss was). With the two faults
  from the entry below put back for one run it reported 14 misses on the
  Google page, so it does catch that kind. `npm run e2e`: 465 checks, none
  failing.
- **Not verified, not looked into:** archive.org and duckduckgo.com did
  worse on the arrow counts in this run than in earlier ones
  (SCORECARD.md); nobody has looked at why. The referee says nothing about
  whether the arrows reach things in a sensible order.

## 2026-11-19, later: first report from the TV, search results

Andrew, on his first evening with it at a TV, searched Google for "netflix"
and reported that results could not be selected reliably and that the box
round them was clipped. He asked whether Google needs a profile. It does
not: all of it was generic mode, and would have shown on any site built the
same way.

### What was wrong, each seen on the live page under `--automation`

| Seen | Cause | Now |
|---|---|---|
| A result's title could not be reached at all; the highlight went to the result's small menu button | A link with any smaller control inside its box was taken for a backdrop and dropped | Dropped only when it has two or more controls on it, or is over 0.4 of the screen |
| A news card could not be reached; only its menu button | A link holding another control was taken for a wrapper and dropped | A real link stays when what it holds is small beside it |
| The box cut through a result's site name and title | A link laid out as running text reports the line of text, not the blocks set in it | The box takes in what the link holds (`src/layer/spatial/box.ts`), for the ring and for movement |
| A focused text link grew, lay over its neighbours, and the arrow at the end of a sub-link's row jumped under its words | Everything focused was grown as a card is | An inline link never grows; on a site with no profile only something that is mostly a picture grows |
| Down landed on a small button beside a result before the result | Nearness was measured to the middle | Up and down are measured to the near edge; of things that start level, the left-most. A small control inside another's box is reached sideways, not by up and down |
| From a narrow control, Down passed over short links in the rows below for a wide one further down | Anything in line won over anything not in line, however near | A row lying wholly in between, within 300 pixels sideways, is stopped at |
| The ring was cut off by the screen's edge round a control at the edge | Six pixels of padding past the edge | Kept on the screen |

### Verified, and how

- `npm run check`: 537 unit tests (10 new: geometry, the box, candidates).
  One older geometry test was changed: it placed its "sliver" a row above
  the aligned candidate, which is now a row to stop at; it now places it level.
- The live page, by script under `--automation` at the TV's size, several
  loads (its layout varies from load to load): 26 presses of Down from the
  top land on the search field, the tabs, then one result, sub-link or card
  per press to the foot of the page. Pictures looked at for the box. Nothing
  was typed, pressed or signed in to.
- `npm run e2e`: 464 checks, none failing; 6 are a new scenario, "a page
  of results", on an invented page with the same shapes.

### Not verified

- Other search engines and other pages of Google (Images, News).
- With a remote at the TV: Andrew to say.
- The scorecard sites were not run again. Movement up and down changed for
  every site; the end-to-end suite passing is the evidence that fixtures
  did not get worse, not that live sites did not.

### Left as it was

- Under a picture result on the live page, its small menu button sits
  outside the picture's link and is a stop of its own on the way down.

- A sub-link's box goes round its words only. On the live page the whole
  row may be pressable; nothing in the markup says so and the words are
  enough to aim at.
- When the next thing down is more than a screen away the page scrolls
  toward it and the highlight stays where it was, out of sight, until the
  next press (DECISIONS.md, reading scroll). Seen once on the live page.

## 2026-11-19, last: Andrew's nine answers built, and ARM

Andrew answered every open decision (DECISIONS.md, "Andrew answers the nine
open decisions") and asked for ARM after. Each piece has its own entry in
DECISIONS.md.

### What changed

| What | Where it is |
|---|---|
| Rules 1 and 5 reworded | CLAUDE.md |
| Saved passwords | Menu on a sign-in page; Settings, "Passwords" |
| Search suggestions, off as shipped | Settings, "Search and starting" |
| Typing from a phone | Menu, "Type from a phone" |
| Speaking, recognised on the machine | Menu, "Speak"; a button can be given the job |
| Extensions: `browser` filled, signatures checked, a warning for rule-list blockers | Asked when an extension is added |
| The Chrome Web Store's terms read | DECISIONS.md, for Andrew |
| 64-bit ARM packages, and checks on ARM | The three workflows |

### Verified, and how

- `npm run check`: 527 unit tests.
- `npm run e2e` on x64: 458 checks, none failing, before the ARM commit.
  New scenarios: search suggestions on and off, typing from a phone,
  speaking (that nothing is fetched unasked), Passwords in Settings without
  a keyring, `browser` on an extension's page.
- **By hand, under `--automation`, outside the suite:**
  - Speech: a public recording played as the microphone was heard and
    searched for; the model was fetched from its makers and passed its
    checksums.
  - uBlock Origin Lite from the real store: its worker failed before the fix
    and starts after, at install and after a restart. It blocks nothing.
  - A real store file passes the signature check; a one-bit-altered copy
    and a wrong extension are refused.
- **ARM:** the checks and the whole end-to-end suite pass on GitHub's ARM machines (CI on 667de42). Whether the packages build there
  is in the commit and release notes
  that follow this entry; it was not known when this was written.

### Not verified

- **Saving and filling a password in the real app.** No scripted run may
  (Hard rule 10). Only the rules, the form finder and the vault are tested.
  Whether real sites' sign-in forms are found is unknown.
- **A real phone on a real network** for phone typing; a QR code read by a
  real camera.
- **A real microphone.** Whether a TV box has one the system can see.
- **Anything on an ARM TV box:** video, protected playback, speed.
- Search suggestions against the four real search sites: the test uses a
  made-up one. Their addresses were answered when a research agent fetched
  them on 2026-11-19.
- The speech engine in a packaged build (it is read from inside the
  package's archive there).

### Open for Andrew

1. **The Chrome Web Store's terms** speak of Chrome only. Other browsers do
   what Longboard does; the risk is Google closing the door. His to accept
   or not (DECISIONS.md).
2. **Brave's suggestions address** is one Brave's robots file keeps crawlers
   from, and Brave sells a keyed service for the same thing.
3. **Signing releases** ("we will come back to this").
4. **Which ARM box.** What is worth doing about video depends on it.
5. Newer versions of extensions are fetched by the library's updater, which
   does not check signatures.

## 2026-11-19, later: the design gone over against the major browsers

Andrew asked for the design to be scrutinised against the major browsers and
brought to the standard of a large company's product. The reasoning is in
DECISIONS.md; the rules the screens now follow are DESIGN.md section 11, and
what the comparison found is section 12.

### What changed

- **Every screen of Longboard's own was redrawn** on one design system:
  Home, the menu, "This page", Settings and all its pages, tabs, history,
  downloads, questions, the PIN, the reader view, About, the on-screen
  keyboard, the line of text over a page, and the pages shown in place of a
  site.
- **Added:** Forward; Stop while a page arrives; a line along the top while a
  page is arriving; "Carry on" on Home; a clock on Home; a welcome on an
  empty Home; a desk browser's keyboard shortcuts; opening the tab closed
  last; history under days, searched as you type, with one page removable.
- **Fixed, found by looking:** Home's search bar collapsed once Home had
  tiles; the reader view's headings were small capitals and the title came
  twice; some text was under the 24-pixel floor.

### Verified, and how

- `npm run check`: typecheck, unit tests (476, six new for the shortcut
  table and the day headings), build, rule checks.
- `npm run e2e`: the whole suite against the redrawn screens, plus one new
  scenario (Forward, a slow page and Stop, "Carry on", Ctrl+T, L, W,
  Shift+T, H, the history searched and one page taken out). The result of
  the last full run is in the commit message.
- **By eye:** every screen photographed in the real app at 1920 by 1080
  under Xvfb before and after, and the after pictures gone over. The loading
  line was confirmed in a photograph, since the test tool cannot look at a
  page while it is being replaced.

### Not verified

- **Nobody has seen any of this on a TV.** Sizes and contrast were chosen
  from published guidance and arithmetic, and looked at on a 1080-line
  picture, not from a sofa. Colours on a real panel, and whether 26-pixel
  second-line text reads at three metres, are unknown.
- The fonts are whatever `system-ui` is on the machine. The photographs were
  taken with this machine's; a TV box may have another and the layout may
  wrap differently.
- The shortcuts were pressed through the DevTools protocol, not a keyboard.
  Ctrl+Tab, Ctrl+J, Ctrl+D, Ctrl+R, F5, the zoom keys and Alt+arrows are
  covered by the unit test of the table only.
- The line for a page arriving is not shown between a new page's first bytes
  and the moment its structure is ready, because the layer starts then.
- A screen reader has not been tried against the new accessible names.
- The research file marks many rows as taken from search extracts or not
  confirmed; DESIGN.md cites only what it marks as read.

### Open for Andrew

Three gaps against the desk browsers need his decision before work starts:
a password store, search suggestions from the search site (a background
request under Hard rule 12), and typing from a phone or by voice
(DECISIONS.md, same date). The published release, v0.1.0, has none of this
or of extensions; a v0.2.0 would.

## 2026-11-19: the first release, updates tested for real, extensions

Andrew allowed releases and asked for one to test updates, and for
extensions from the Chrome Web Store. DECISIONS.md has every choice.

**Release v0.1.0** is published (AppImage, tar.gz, Flatpak), made by the new
release workflow from a pushed tag.

**Updates, verified against GitHub itself:** an AppImage of 0.0.1 built by
CI was run on the headless VM. It asked GitHub, found v0.1.0, downloaded the
128 MB package, and replaced itself: the file's SHA-256 afterwards is the one
GitHub's API states for the release's AppImage. Started again, the replaced
file drew Home, asked again, found nothing newer, and left itself alone.
The file name and GitHub's `digest` field, assumed yesterday, are confirmed.

**Extensions, built:** added from an extension's page in the store through
the menu, after a question that says what it will be able to do; listed,
opened and removed in Settings; daily check for newer versions with a
switch.

**Extensions, verified and how:**

- Unit tests (470 in all): reading the store address, what an extension is
  said to be able to do, which of its pages may be opened.
- End to end, with a made-up extension: its content script runs on a page,
  Settings lists it, its own page opens in the tab and the arrows move on
  it, and removing it (two presses) takes it off the disk.
- By a one-off scripted run against the real store, sandbox on: Dark Reader
  added through Longboard's screens, its panel opened and working.

**Not verified, or known not to work:**

- **uBlock Origin Lite does not work:** it installs, but its background
  worker fails to start. Other extensions will fail too; only two were tried.
- Extensions in a packaged build: a package built from this code has the
  two libraries inside and starts without complaint, but no extension was
  added in it. v0.1.0 was made before extensions and does not have them.
- Extension updates, and whether any extension's panel is usable with a
  remote on a TV. Panels opened as a page are not attached to another tab.
- The updater: a restart is not forced, so a person keeps the old version
  until they close Longboard; a download cut off half way was not tried on
  a real connection; nothing signs releases.
- The trademark check the guardrails ask for before a public release was
  not done before v0.1.0.

## 2026-11-18, end: the rules gone over, rule 4 removed, automatic updates

Andrew had every Hard rule scrutinised for a whole browser, then: removed
rule 4, changed rules 10 and 12, kept rule 3, and asked for automatic updates
from GitHub releases. `docs/LEGAL-GUARDRAILS.md` was rewritten to match.
Details and every assumption are in DECISIONS.md.

**Built:** a daily check for a new release; an AppImage fetches it, checks it
against the SHA-256 the release states, and replaces itself for the next
start; other packages are told. Settings has "New versions" (install, only
tell, off; look now). About now also discloses the Widevine download.

**Verified, and how:** unit tests (version order, the feed, the setting, and
installing with made-up files: a good package replaces the old one, a wrong
checksum, a missing checksum, an older release and an unreadable feed leave
it alone). End to end, two scenarios against a made-up feed: the file the
app was "started from" is replaced and executable, Settings says so and can
turn looking off; a package with the wrong checksum is left alone and logged.

**Not verified:**

- Anything against GitHub itself: no release exists, and the agent may not
  publish one. The asset's file name and GitHub's `digest` field are assumed.
- A real AppImage replacing itself while running, and starting afterwards.
- A download of real size on a slow connection, or cut off half way.
- Nothing signs releases; the checksum guards the download, not the publisher.

**Open for Andrew:** whether "no region or VPN workarounds" and "pages are
not changed" were meant to go with rule 4 (LEGAL-GUARDRAILS.md, "With rule 4
gone"); rules 1 and 5 still have lagging wording; a password store is now
allowed but not built.

## 2026-11-18, after that: Do Not Track, privacy settings, a PIN, reader view, desktop site, better icons

Andrew asked for all six (DECISIONS.md has his words and every choice made).

**Built:**

- Privacy, in Settings: ask sites not to track (sends `DNT` and `Sec-GPC`;
  off as shipped), refuse known trackers as well as ads (EasyPrivacy; off as
  shipped), hide the device's home-network address from sites.
- Parental lock: a four-digit PIN for Settings, and optionally for every
  site that is not on Home.
- Reader view and "Desktop site", on the menu's site page.
- Icons: a Home tile's icon now comes from the page's own links and its
  web-app manifest, big enough for a TV, for apps and saved pages alike.

**Verified, and how:**

- Unit tests: 448 in all. New: the two signals and that no other header is
  touched, the lists in use, the desktop width, the article finder (on
  made-up pages), the PIN's hash, waits and file, which sites are "on
  Home", which icon is tried first.
- End to end, three new scenarios (37 in all). A request arrives with no
  signal as shipped, with `DNT: 1` and `Sec-GPC: 1` once the setting is on,
  with the same user agent, and without them when it is off again. Desktop
  site widens the page to 1280 and back. Reader view shows the fixture
  article's headline and paragraphs without the links around it, bigger
  words, Down scrolls, Back closes, the page is unchanged, and a page with
  no article says so. A PIN is set from Settings (a mismatched second entry
  starts over), the file holds no PIN, a site not on Home is refused with
  the reason, Settings asks, a wrong PIN is refused, the right one unlocks
  and opens Settings, "Lock again" locks: the page that was open gives
  way to a notice and Back leads nowhere. The whole suite was run once before
  that last change (399 of 400 checks; the one failure was a sentence this
  work reworded) and the lock and Settings scenarios again after it. A saved page and an app each get
  the 192-pixel icon the fixture's manifest lists, not the 32-pixel one or
  the one marked for cutting to a shape.

**Not verified:**

- Whether any real site honours the signals; only that they are sent.
- Tracker blocking with the real EasyPrivacy list (the mechanism is the ad
  blocker's, tested with a made-up list; the real list was not downloaded
  or tried on a site). "Hide the home-network address" was not measured: the
  browser's own setting is switched, and no test looks at what a call reveals.
- Reader view on real articles. The finder was written against made-up
  pages; expect it to pick badly on some sites.
- Desktop site on a real site that folds up at 960 pixels.
- The PIN: the waits after wrong tries (unit-tested, not driven end to end),
  number buttons on a real remote, the PIN asked for at start-up for a start
  page that is not on Home, a sign-in that goes off to another site.
- Icons from real sites' manifests; an SVG icon.
- Any of it by a person on a TV.

*(Rule 4 was removed later the same day; see above.)*

## 2026-11-18, last of the day: features to stand beside the major browsers

Andrew: put Apple on the verified list (done, published); a manual "off"
is respected whatever the setting over all sites (it already was; now his
decision); and research the major browsers and build what makes Longboard
stand beside them on a TV. What was looked at, built and left out is in
DECISIONS.md.

**Built:** saved pages on Home; private tabs; suggestions under the address
field from what is kept on this machine; find on this page; a "not secure"
warning; settings for https-only, the dark or light look, videos starting by
themselves, clearing on closing, and one button that clears everything.

**Verified, and how:**

- Unit tests: 418 in all. New: suggestions, saved pages, the https-only rule.
- End to end, two new scenarios (34 in all, 365 checks). One page is kept on Home, found
  again from three typed letters, and opened from the suggestion; words are
  found on it with the count said; a private tab cannot see another tab's
  cookie, writes no history and no recent site, is marked in the list, and
  leaves nothing behind when closed. With the settings on: sites see the
  dark preference, a sound does not start by itself (and does when the
  setting is as shipped), and a plain http page is refused with the reason.
  The "not secure" line is checked on a plain http page.

**Not verified:**

- "Clear when Longboard closes" and "Clear everything": no test presses them
  (the second says "clear ... what sites stored"; the first runs as the
  program exits). Their code was read, not run.
- Saved pages' icons; taking a saved tile off from the menu on Home.
- Suggestions with a long history (300 pages) on a slow box.
- Find on a page inside a frame, or on a very long page.
- Any of it by a person on a TV.

## 2026-11-18, late night: pages that are not in front stop, a menu for a remote, the castLabs request

- **Everything stops when it is not in front.** A page behind Home, a tab
  behind another, and the page in front when another program takes over are
  frozen by the browser: video, audio and timers stop, and playing waits for
  the person when the page comes back. Verified end to end for a page
  behind Home (a video, a separate sound and a clock all stop; on return the
  page is visible, runs, and is still paused). **Not verified:** the window
  losing its place to another program (the test machine has no window
  manager to do that with), and what real streaming sites make of being
  frozen for a long time.
- **The menu and Settings were gone over for a remote**, from screenshots
  the agent took and looked at: the menu is half as long, with site matters
  on a "This site" page; search site, language and the ad-blocking setting
  are chosen from lists; lists go round at their ends. Verified end to end.
  **Not verified:** by a person on a TV.
- **The request to castLabs is posted**, at Andrew's instruction, after
  checking that it is a real fix (DECISIONS.md):
  https://github.com/castlabs/electron-releases/issues/221#issuecomment-6988958527
  No answer yet. Until they act the engine still claims AC-3 audio.

## 2026-11-18, night: tabs, history, the rest of Settings, and the AC-3 report

Andrew asked for what Settings had left out, and passed on a report from the
session that made the Apple TV profile.

**Built:** tabs; history; a language setting; a downloads-folder chooser;
giving a remote's button a job by pressing it; the program's name in one
file (`src/shared/product.ts`) for apps built from this source.

**Not built, on purpose:** saved passwords and autofill. Hard rule 10
forbids storing passwords. Andrew's decision (DECISIONS.md).

**Investigated, nothing changed:** the engine tells sites it can play AC-3
and E-AC-3 audio, which on Linux it cannot decode. Measured here, including
through the protected-playback (EME) question; Chromium's source shows there
is no run-time switch; castLabs' own issue doubts Linux works. The options
and a draft issue for castLabs are in DECISIONS.md. **Playback on
tv.apple.com was not tried**: it needs Andrew signed in.

**Verified, and how:**

- Unit tests: 411 in all. New: history, the later settings, button mapping.
- End to end: 31 scenarios, 332 checks. New: tabs (open, a second page in a new tab,
  switch, close, the closed one really gone); history (kept, listed in the
  menu, opened from it, off when turned off); the language reaching a page
  (`navigator.language` and the header a site receives); and in the Settings
  scenario the folder chooser, a button given a job and then doing it, and
  the history and language switches.
- A check now holds what the engine says about AC-3 and E-AC-3, so an
  engine update that changes it is noticed.

**Not verified:**

- Tabs with video playing in more than one, with an app that has its own
  sign-ins open, or with eight open on a small box (memory).
- The folder chooser on a real USB stick; a downloads folder on one.
- A real remote's buttons in the button-mapping screen: only F7 from a
  scripted keyboard was tried.
- Languages other than French and Brazilian Portuguese; what the on-screen
  keyboard should do for them (it has one layout).
- Any of it by a person on a TV.

## 2026-11-18, late: Settings

Andrew asked for a Settings screen, a setting for ad blocking over all sites,
and a place to edit the list of sites where it starts off. Built, tested and
pushed. What is in it is in DESIGN.md section 4.8.

**Verified, and how:**

- Unit tests (17 new, 401 in all): what a change does to `config.json` and
  what is refused; the three ad-blocking settings; editing the list; a site
  typed as a person would; kinds of access closed to every site.
- End to end (28 scenarios and 304 checks in all): the whole Settings screen
  driven with the arrows, every page, each change read back from
  `config.json`; ad blocking on for every site on a site from the reviewed
  list; a reviewed site taken off the list; off for every site, with the
  menu's switch greyed out; a kind of access closed, refused without a
  question; opening with the last site.

**Not verified:**

- "Sign out of every site and clear what sites have stored" was never
  pressed: the automation guard stops a scripted run from pressing it
  (DECISIONS.md). Its code was read, not run.
- "Clear saved copies of pages", "Clear the recently opened sites",
  "Download the filter list now", "Look for reviewed profiles now" and the
  hardware-decoding setting taking effect at the next start: none has a test.
- The three search sites other than Google were not searched with.
- How Settings reads on a TV: long lines wrap in the narrow panel beside a
  page, and nobody has looked.

## 2026-11-18, evening: phase 5, ad blocking

Andrew said to start it. Built, tested and pushed.

- Requests that EasyList names are refused on sites where the switch is on.
  Only that: nothing is hidden, injected, redirected or rewritten.
- The switch is in the menu for every site. It starts off on verified
  sites and on everywhere else, and only the person changes it.
- The list is downloaded from easylist.to every four days; the About panel
  says so. `"adBlocking": false` in `config.json` leaves it all out.

**Verified, and how:**

- Unit tests (25 new, 384 in all): where the switch starts, the person's
  choice winning, the verified list, what the filter refuses and never
  refuses, saving and re-reading filters, a failed download keeping the old.
- End to end, two new scenarios (24 in all, 271 checks) against a made-up page and a
  made-up list: listed requests never reach the server and the rest of the
  page loads; nothing on the page is hidden; the menu shows the switch and
  the count; off and on again are kept and take effect; a site on the
  (made-up) verified list starts off and can be switched on; with
  `"adBlocking": false` nothing is fetched or refused and there is no switch.
- The real list, once, by script: EasyList downloaded and was ready 0.6
  seconds after start (2 MB). On www.bbc.com the menu said 9 requests
  refused; on www.theguardian.com, 0; on www.youtube.com the switch was off
  as a verified site.

**Not verified:**

- **That any page looks or works right with blocking on.** Nobody looked at
  a screen. Sites that break, show gaps, or put up a "turn off your ad
  blocker" notice are to be expected, and Longboard does nothing about the
  last on purpose.
- The first-ever start (no list yet) on a real TV box, and the four-day
  refresh actually happening.
- Blocking in an app with its own sign-ins, and inside embedded frames.

**Known limits:** one list, English-language sites mostly; no way to pick
lists or see what was refused from the TV; a request from inside a frame is
judged against the top page; requests a site makes from a background
worker (not from a page) are not filtered (from reading the code: they
carry no page to judge them by).

## 2026-11-18, later still: gaps closed after "keep going"

Andrew said to keep going. Ad blocking is still his to start, so the agent
worked down the known-gaps list below. The lists in the section under this
one were brought up to date in place. What changed:

- Home tiles show the site's own icon, fetched from the site while it is open.
- A tile can be taken off Home: the menu, opened with the highlight on the
  tile, offers it (for an app, to remove the app).
- A profile's `view.safeMargin` is applied: the website is drawn in a
  smaller rectangle in the middle of the screen.
- A site that changes its address without loading a page gets the profile
  that fits the new address, or none.
- Downloads are held in Longboard's own folder while the question is up
  and moved when agreed to. A file made in answer to a form is now saved,
  and the site is asked once, not twice.
- The menu lists this run's downloads, how far each has got, and can cancel
  one.

- **Fixed: pointer mode clicked the wrong place on a scaled page**, which
  is every real TV. Found while testing the safe margin. The end-to-end run
  forced a scale of 1, which is why it was missed. It now runs scaled for a
  TV by default (1.33 times in its window), and passes, with one scenario
  held at a scale of 1 (next item).
- **A drop-down list can start on the wrong entry.** A page's drop-down
  opens as the browser's own list. If the system's mouse pointer (hidden,
  but still somewhere) is where the list opens, the entry under it is
  highlighted, and the arrows move from there. Measured in the form
  scenario drawn scaled: Down then OK chose the third entry; with the
  pointer moved away first, the second, as expected. On a TV box with no
  mouse the pointer usually sits in the middle of the screen (the agent's
  expectation, not checked). The highlight in the list is visible, so a
  person sees where they are; nothing is chosen without OK. Not fixed:
  Longboard cannot move the system pointer. That scenario runs at a scale
  of 1, where the list misses the pointer.
- The package workflow ("Build packages", started by hand, keeps its files
  for 14 days and publishes nothing) built the AppImage, the tarball and the
  Flatpak, last from commit 36673d8, with ad blocking
  (https://github.com/AndrewGBest/Longboard/actions/runs/44366610965). An
  earlier AppImage (from eaf872f) was downloaded and started once on the
  headless machine, with `--automation`: it came up on Home. The latest
  files, the tarball and the Flatpak were not started.

- A site's icon is no longer decoded by the shell. Longboard's own
  sandboxed screen draws it and hands back a PNG (DECISIONS.md).
- An independent review of the shell (a second agent, reading only) found
  nine problems; all but one are fixed and tested. The most serious: a page
  could time a question so the next OK press said yes. Questions now start
  on "no" and ignore a yes in their first moments. The list is in
  DECISIONS.md. Left as it is: an access grant is per host name, so
  `https://site:8443` shares the answer given to `https://site`.
- A second independent review, of the page layer, found twelve problems.
  The ones against the Hard rules are fixed and tested: the purchase guard
  did not see into web components, went up after the page's scripts, and
  missed forms without an address; the on-screen keyboard could be led into
  a password field in a scripted run. What was left alone, and why, is in
  DECISIONS.md. **The guard is still wording in English plus addresses: it
  is a safety net, not a guarantee.**
- **Ad blocking is still not started.** The agent began on it after a
  second "keep going", was stopped by the permission system, and undid the
  one thing it had done (installing the library). It needs Andrew to say
  plainly that phase 5 may start. The licence findings are in DECISIONS.md.

Verified by `npm run check` (unit tests, 359 of them) and the end-to-end run
(22 scenarios, 255 checks), which has new checks for each item above. Not verified: any
of it by a person on a TV; a download bigger than 200 KB.

## 2026-11-18, later: phases 0 to 4 built by the agent working alone

Andrew asked the agent to work through the roadmap without him. Phases 0 to
4 are built and pushed. Phase 4's profile editor is a first, small version.
Ad blocking (phase 5) was not started then: Andrew had said to leave it. Choices the agent made on the way are in
DECISIONS.md, each marked as an assumption.

### What there is

| Phase | Built |
|---|---|
| 0 | Tropic Video's code under the Longboard layout and name, on castLabs Electron 45.2.1 |
| 1 | Home with "go to address or search" and recently opened sites; the menu panel (address, Home, Back, Reload, zoom, pointer, outline, profiles, About, Quit); any web address opens and nothing else does; permissions denied by default; the on-screen keyboard on Longboard's own screens and on pages |
| 2 | Generic mode: finds what can be pressed (including things that only look clickable), scrolls when there is nothing to move to, drop-downs, sliders, native-control video, frames. Pointer mode on F2 / right stick click. Fixture pages and the real-site scorecard |
| 4 | "Add this site as an app": a tile on Home with the site's own icon, an entry in the desktop's app list, optional separate sign-ins, `--app=<id>`, removal. A first on-TV profile editor: point, press OK, mark as selectable / never / a row / the player, see it applied, save |
| 3 | Profile format version 1 with validator, matcher and interpreter; Tropic Video's adapter converted into the first profile; local, imported, catalogue and built-in sources; import from USB and export; the catalogue repository with its checks and index; background fetch with checksums |

### Verified, and how

All of this was checked by scripts on a headless virtual machine. **None of
it was checked by a person, with a remote, on a TV.**

- `npm run check`: 359 unit tests (geometry, input mapping, address rules,
  navigation policy, permission policy, pointer movement, profile validation,
  matching and choosing, the interpreter, the profile store, the catalogue
  fetcher, the guard, the outline sanitiser), the build, and the rule checks.
- `xvfb-run -a npm run e2e`: the real app, always with `--automation`, driven
  over the DevTools protocol against invented fixture pages served from this
  machine. 22 scenarios, 255 checks. They cover: arrows on a grid of
  cards; the on-screen keyboard; pop-ups; refused addresses, downloads and
  permissions; Home, the address field, the menu, zoom and Back; searching;
  notices for blocked and unreachable pages; a full-screen video with the
  site's own keys; reading a long article; a web app with its own scrolling
  pane; a form; things that only look clickable; a video with the browser's
  controls; pointer mode including a click inside a frame from another site
  and the purchase guard inside that frame; a site with no profile, with a
  local one, with one from a (made-up) catalogue, and with an imported one;
  adding a site as an app with its own sign-ins, its entry file and icon,
  opening it from Home and with `--app=`, and removing it; making a profile
  with the editor, saving it, and finishing without saving; a site asking
  for the location, camera and microphone, and notifications, each allowed,
  refused, remembered and forgotten; a download asked about, saved, renamed
  and cancelled.
- Real key events (xdotool under Xvfb), once, by hand: arrows move the
  highlight; F2 starts pointer mode; a held arrow moves the pointer. This is
  how it was found that key releases never reach the shell (DECISIONS.md).
- `xvfb-run -a npm run scorecard`: ten public sites with no profile. Results
  and their limits are in SCORECARD.md.
- The real catalogue, once: the app was started with `--catalogue=` set to
  the published address on GitHub. It fetched the index and the one profile,
  the checksum matched, and the profile was on disk afterwards.
- CI on GitHub: the workflow (check, then the end-to-end run under Xvfb) has
  passed on every commit pushed so far, and the profiles repository's check
  has passed on both of its commits.

### Not verified

- **Anything on a real TV box, with a real remote or controller.** Fullscreen
  start, the 960x540 scale on a real screen, pointer speed, how a remote's
  keys arrive (especially whether a held key repeats), the gamepad paths.
  A controller could not be simulated here at all: every gamepad code path
  is covered only by unit tests of its pure parts.
- **Protected (DRM) playback.** The playback component downloads and reports
  ready here, and a page that asks for the Widevine key system is given it.
  No protected video was played. The "allow protected video?" question is
  never raised on Linux: the browser does not ask (DECISIONS.md).
- **The Prime Video profile in Longboard against the live site.** It is a
  conversion of selectors that worked in Tropic Video, checked against the
  same outlines. Nobody has signed in with Longboard.
- Import from an actual USB stick, and anything inside a Flatpak.
- **The app list entry on a real desktop.** The file is written where the
  desktop looks and its contents are tested; no desktop has been seen to
  show it or start it. Inside a Flatpak it will not work as written.
- Packaging: `electron-builder --linux dir` (the unpacked folder) was built
  once and the program in it started, found its built-in profile and showed
  Home. The AppImage, tarball and Flatpak are built by the workflow on
  GitHub; only the AppImage has been started, once, headless. Nothing has
  been released.

### Known gaps and rough edges

- A held arrow in pointer mode starts moving only when the keyboard's own
  repeat starts (about half a second), because key releases are not
  reported. A controller moves at once.
- With nothing to move to, the highlight can be off screen while a long
  article scrolls. There is then no indicator until a link comes into view.
- Permission questions were tried with the browser's fake camera and
  microphone, and no real device. Whether location works at all on a TV box
  is unknown (there is no positioning hardware; the browser may have nothing
  to answer with even when allowed).
- A site that checks whether it has a permission before asking is told "no"
  until the person has allowed it, so some sites may never ask (DECISIONS.md).
- A download goes on arriving while its question is up. Refused, it is
  deleted, but a very large one has used disk space and the connection until
  then. The list of downloads is of this run only.
- Sites at the 960-pixel TV scale often show their phone layout.
- A profile someone gave the person, still waiting for a yes or no, is asked
  about when a page loads, not when a site changes its address without loading.
- The profile editor marks four things and writes nothing else of the
  format. Its selectors are a first guess at "things like this one". End to
  end it has only been used on a made-up page. On four real pages (a link
  list, an encyclopedia article, a news front page, a site built from web
  components) the agent pointed at three places each and read what was
  picked: the selectors were usable, but where a site has only machine-made
  class names and no test ids, one of those names can end up in a selector,
  and such a profile would stop matching when the site is next rebuilt.
  Nothing was saved or committed from those sites.
- An app's name and choices cannot be changed after it is added; remove it
  and add it again.
- The same shared code lives in Tropic Video and Steamboat. Fixes made here
  to navigation, the keyboard and the shell were **not** carried back.

### Open questions for Andrew

- Saved passwords and autofill conflict with Hard rule 10. Leave them out?
- Typing from a phone, Do Not Track, reader mode and a PIN were looked at and
  not built; each needs a decision (DECISIONS.md, the "not built" table).
- Otherwise none open. Answered on 2026-11-18: Google is the default search; the
  keyboard follows Android TV; the protected-playback row of the ad-blocking
  defaults is dropped; permissions are asked about; downloads work.

**Next:** try it on the TV box with the remote. Everything after that
depends on what that shows.

## 2026-11-18: project started, documents only

- Andrew decided to build a TV browser with generic navigation and per-site
  profiles, named it Longboard and created the repository.
- An interview in chat settled the main choices; they are in DECISIONS.md,
  with the two assumptions the agent made where questions were skipped.
- Written: README, CLAUDE.md, CONTRIBUTING, and docs for design,
  architecture, profiles, guardrails, roadmap and decisions.
- Later the same day: ad blocking became a per-site switch with a reviewed
  verified-sites list; profiles are CC0-1.0; the profiles repository
  `AndrewGBest/Longboard-Profiles` was created and given a skeleton.

Still open from then: that a launcher entry can be created from inside a
Flatpak; that the ad-block library's licence and the filter lists' licences
allow shipping with a GPL-3.0 app; the two live LONGBOARD trademark records.
