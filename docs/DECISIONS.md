# Decisions

Newest first. Each entry says who decided and why, so a later session does not
re-argue it without new information.

## 2026-11-19: Andrew answers the nine open decisions

Asked what decisions were open, Andrew answered each (2026-11-19):

| Question | Andrew's answer |
|---|---|
| A password store | "yes" |
| Search suggestions from the search site | "build and ship off" |
| Typing from a phone, and voice | "build both" |
| Extension compatibility (uBlock Origin Lite, store signatures) | "spend time on it" |
| The sentence added to rule 12 about the Widevine download | "sounds fine" |
| Rules 1 and 5, whose wording lagged | "reword them" |
| The trademark check on the name | "longboard is fine". The searches are not owed any more; the name stays |
| Signing releases | "we will come back to this" |
| The Chrome Web Store's terms | "check it" |

He also reported that **castLabs replied and will make the AC-3 fix in their
December update**. Nothing in Longboard changes for it; when that release is
out, Hard rule 14 has it taken promptly and the claim is measured again.

And: "Once youre done all that, get to work on arm support."

**Rules 1 and 5 were reworded by the agent on that instruction.** The wording
is the agent's; the meaning was not meant to change:

- Rule 1 now covers the packages as well as the repo, says libraries are
  declared dependencies, and names what is fetched at run time for the
  person (filter lists, profiles, site icons, extensions).
- Rule 5 now names the three settings there are (each site's switch, the
  list, on or off for every site) and says none of them is changed for the
  person.

## 2026-11-19: the design gone over against the major browsers

Andrew: "scrutinize the design choices made for Longboard, compare it to all
major browsers out there and make it competitive. Make sure everything
follows a top quality level of design that you'd expect from a major
corporation, spend time on the polish and look at it all, with a focus on
user experience."

How it was done: every screen was photographed in the real app at 1920 by
1080, looked at, redrawn, and photographed again. The comparison was gathered
from vendors' own pages into `docs/RESEARCH-BROWSERS.md`; rows there say
whether the page itself was read. What the screens now follow is DESIGN.md
section 11, and what the comparison found is section 12.

**All of the following are the agent's assumptions:**

- **One design system**, in `chrome.html` and `chrome/parts.ts`: colours, a
  type scale and spacing as variables; rows with icons; switches drawn as
  switches; the highlighted thing turns light as well as getting the ring.
  The numbers come from Android TV's, tvOS's and Fire TV's guidance and
  WCAG's contrast ratios (sources in the research file).
- **Words were changed only where they were in the way.** "Go to address or
  search" became "Search or enter an address"; switches lost their "yes" and
  "no"; "This site" on the menu became "This page", since most of what is
  there is about the page. The plain voice is kept. A row's accessible name
  is still the full sentence it used to show.
- **Icons are drawn in code**, about forty line drawings of the project's
  own on a 24 by 24 grid. No icon set is used (Hard rule 1).
- **Five tiles to a row on Home**, not four. tvOS's own grid has five at 320
  points and Android TV's has five-up cards [Sourced].
- **A clock on Home.** A TV's own screens show the time; Longboard fills the
  whole screen and had hidden it.
- **Forward, Stop, and the line that shows a page arriving.** The line is
  drawn by the layer inside the page, told by the shell when a navigation
  starts and stops; it appears after 0.25 s so a page that comes at once
  shows nothing.
- **Desk-browser keyboard shortcuts**, for a keyboard that is plugged in
  (`shared/shortcuts.ts`, unit-tested). The person's own button mappings win
  over them. Ctrl+O (menu), Ctrl+Q and Ctrl+Shift+D keep the jobs they had,
  so Ctrl+O does not "open a file" as it does elsewhere; Longboard opens no
  files.
- **A closed tab can be opened again**, the last ten, for this run only,
  never a private one.
- **History** is shown under days, can be searched as words are typed (on
  this machine; nothing is sent), and one page can be taken out of it.
- **On-screen "Back" rows stay**, against Android TV's advice, as the quiet
  last row of a page (DESIGN.md 11).
- **The on-screen keyboard stays alphabetical** (the earlier decision
  stands); only its look changed.

**Left for Andrew, because each needs a decision that is his:**

1. **A password store.** Allowed since rule 10 was reworded and the largest
   gap against every desk browser. It was not started in this pass because
   it is a feature with security weight, not polish.
2. **Search suggestions from the search site.** They send what is typed, as
   it is typed, to the search site: a background request under Hard rule 12
   that would have to be disclosed and switchable, and a choice between
   Brave's default (off) and Edge's (on).
3. **Typing from a phone, and voice.**

## 2026-11-19: a release to test updates; extensions from the Chrome Web Store

Andrew: "You can make releases, make a release to test the updates. Now that
rule 4 is gone they aren't forbidden. Also this is a chromium based browser
right? We should add plugin support with the chrome store."

**Releases are now the agent's to make** (Andrew, 2026-11-19). A release is
made by pushing a version tag; `.github/workflows/release.yml` runs the
checks, builds the packages and publishes them. The name check in
LEGAL-GUARDRAILS.md ("before a public release: look both up on the USPTO
register") **was not done before v0.1.0**; the repository was already public
under the name. It still should be done.

**"They aren't forbidden"** confirms the agent's reading of what removing
rule 4 allows (LEGAL-GUARDRAILS.md, "With rule 4 gone").

**Extensions.** Longboard is built on Chromium by way of Electron, and
Electron by itself loads only unpacked extensions and has a small part of
the extension interfaces: no toolbar buttons, no store. Two libraries fill
the gap, both by Samuel Maddock, both **MIT licensed**, both new runtime
dependencies:

- `electron-chrome-web-store` 0.13.0: downloads an extension from the
  store's own download address and unpacks it. Its own dependencies:
  `adm-zip` (MIT), `pbf` (BSD-3-Clause), `debug` (MIT).
- `electron-chrome-extensions` 4.10.0: the extension interfaces (tabs,
  windows, toolbar action, context menus, and so on). Depends on `debug`.

Choices, each **the agent's assumption**:

| Choice | As built | Why |
|---|---|---|
| How one is added | The person opens the store in Longboard and goes to an extension's page; the menu's site page then has "Add this extension" | The store's own "Add to Chrome" button needs an interface put into the store's page. Hard rule 13 says nothing is exposed to web pages, so the library's store-page script is not used |
| Asked first | The extension is fetched and unpacked, then a question says its name, version and what it will be able to do, read from its manifest. Refused, it is deleted | It is someone else's program. The question starts on "Do not add it", like every question |
| Parental lock | With a PIN set, adding an extension asks for it | An extension can see everything that is browsed |
| Its pages | "Open" in Settings shows the extension's settings page, or else its toolbar panel, as a page in the tab. The arrows work on it as on any page | A toolbar and pop-up windows are a desk idea. **A panel opened this way is not attached to another tab**, so "this site" switches in a panel act on nothing |
| Where they run | The session everything shares. Not private tabs, not apps with their own sign-ins | The library cannot run them in sessions kept in memory; and it is what private means |
| Updates | The store is asked daily for newer versions of what is installed; a setting turns that off; disclosed in About | Rule 12. An extension left old is a risk |
| Bundling | The two libraries are left in `node_modules`, not bundled into `dist/main.js` | Bundled, the library could not find its own preload file (seen) |
| Identity | The download request gives the engine's real version, as the library does. The user agent is not changed | Rule 3 |

**What was found by trying it (2026-11-19, on the headless VM):**

- Through Longboard's own screens, with the sandbox on: Dark Reader was
  added from its store page, the question listed "Read and change every page
  you open", and its panel opened as a page with its 48 controls and worked
  with the extension interfaces present.
- uBlock Origin Lite was added and its dashboard opened, but **its
  background worker does not start** (`chrome.commands` is missing in it;
  the worker is a module, which is the agent's guess at why), so it would
  block nothing. Not every extension works, and Settings says so.
- With the sandbox off (`--no-sandbox`, which the test harness and CI use),
  the library's interfaces do not reach extension workers at all. A person's
  copy runs with the sandbox on. The end-to-end test therefore uses a
  made-up extension that needs only a content script.
- **The library does not verify a package's signature.** It checks that the
  package's own key matches the extension asked for, over https from the
  store's address. Chrome verifies the signature; this does not.

**Also to know:** an extension that blocks ads does so by its own rules, on
every site including the verified ones. Hard rule 5 is about Longboard's own
switch; an extension is the person's choice. And Google's terms for the
store are written for Chrome; other Chromium browsers use it in the same
way, but nobody has asked Google about this one **[the agent has not read
the store's terms closely; a guess that this is tolerated, not a finding]**.

## 2026-11-18: the Hard rules gone over for a whole browser; automatic updates

Andrew asked for every rule to be scrutinised now that Longboard is a browser
and not Tropic Video. The agent's review kept seven as they were and put five
to him. **His decisions:**

- **Rule 4 is removed.** ("Remove rule 4.") Its number is kept so references
  to the other rules stay right. Nothing Longboard does changed with it; see
  "With rule 4 gone" in LEGAL-GUARDRAILS.md for what the remaining rules
  still forbid, and for the agent's reading of what they no longer do.
- **Rule 10** now lets Longboard keep a password when the person asks,
  encrypted with the system keyring, on the machine only. Everything about
  agents, scripts, logs and commits is unchanged. No password store is built.
- **Rule 12** no longer names two background requests. Every such request
  must be disclosed in Settings, be possible to turn off there, and be a
  recorded decision. **The agent added one sentence Andrew did not see
  first:** the engine's own download of the Widevine component cannot be
  turned off by Longboard and is disclosed. Without it the rule would be
  untrue. That download was missing from the rule and from Settings before
  today; About now says it.
- **Rule 3 stays.**
- **Rule 14: automatic updates from GitHub releases.** Built; below.
- Rules 1 and 5 have wording that lags what was decided (dependencies; the
  setting over all sites). Andrew did not ask for those to be reworded, so
  they are not; LEGAL-GUARDRAILS.md describes them as they are applied.

The rule check lost its rule-4 checks (changing traffic, touching a video
element, the limits on the Do Not Track module). The limits on the
ad-blocking module stay, under rule 5.

**Automatic updates, each choice the agent's assumption:**

| Choice | As built | Why |
|---|---|---|
| Where from | GitHub's public API for this repository's latest release, once a day and at start | What Andrew asked for. One request, no identifier |
| Written here, not a library | About 250 lines | The usual library needs files a release would have to carry and cannot be tested without a real release; this can be, against a made-up feed |
| What can replace itself | Only an AppImage, in a folder it can write to. The new file takes the old one's place in one step and is used from the next start | It is the one package that is a single file the person owns. A Flatpak is updated by Flatpak; an unpacked folder is told a new version is out |
| Trust | The package is installed only if the release states its SHA-256 and the file has it. Only later versions; never drafts or pre-releases | Guards against a damaged or swapped download. **It is not a signature:** whoever can publish a release on the repository can publish an update. Signing needs a key Andrew would hold |
| Setting | Install (as shipped), only tell, or off; a button to look now | Rule 12: disclosed, and can be turned off |
| Restart | Not forced. Settings says a new version is in place | A TV browser should not close under someone watching |

**No release exists yet, and the agent is not to publish one.** So this has
only ever run against made-up feeds. Before the first release that relies on
it: confirm the AppImage's file name is the one looked for
(`Longboard-x86_64.AppImage`), and that GitHub's API states a `digest` for it.

## 2026-11-18: Andrew asks for Do Not Track, privacy features, a PIN, reader view, desktop site, and icons

Andrew, in chat, after reading the "not built" table in the entry below:
"Add do not track features and other privacy/security features like it you'd
expect in brave for example. Parental pin is a good idea, do that too. Reader
mode sounds good, lets allow requesting a desktop site. Also add in
functionality that when you save a web app or save a website to the browsers
homepage it pulls the icon in both scenarios."

**Decisions (Andrew's):** Do Not Track is wanted, although it adds to what a
site is sent; a parental PIN; reader view; a desktop site; icons for both
kinds of Home tile. **Everything about their shape below is the agent's
assumption.**

**Do Not Track and Hard rule 4.** Rule 4 says "no rewriting of ... headers
... on any site". Sending `DNT: 1` and `Sec-GPC: 1` adds two headers to every
request. The agent had said so and listed it as Andrew's call; he made it.
It is built as narrowly as it can be:

- One module (`src/main/signals.ts`) adds exactly those two headers, with
  fixed values, to every site alike, and only when the person turns the
  setting on. **Off as shipped (assumption):** Brave ships Global Privacy
  Control on, but Longboard's first job is streaming sites working as their
  owners intend, so adding anything is the person's choice.
- It changes and removes no other header and never sees a reply. A unit
  test holds it to those two. (The rule check also did, until rule 4 was removed.)
- **Not done:** the page-side half of Global Privacy Control
  (`navigator.globalPrivacyControl`). Setting it would mean putting script
  into pages, which Longboard does not do. Sites that read the signal on
  their servers get it; a script that reads only the page-side property does not.
- *(Later the same day Andrew removed rule 4; see the entry above.)* **The wording of rule 4 in CLAUDE.md has not been changed.** The agent does
  not reword Hard rules. As written the rule and this feature disagree;
  Andrew should amend it. Suggested: after "on any site" add "except the two
  standard do-not-track signals (DNT, Sec-GPC), added only when the person
  asks".

**"Request a desktop site" and Hard rule 3.** Longboard already tells every
site it is a desk browser: its user agent is the engine's own, on Linux, and
that is not changed (rule 3 forbids a switcher, and there is nothing to
switch to). What makes a site show its phone or tablet layout in Longboard is
width: the TV scale gives a site about 960 CSS pixels. So "Desktop site" is a
per-site switch that gives the site 1280 instead, with smaller text. It is
ordinary page zoom. **Confirmed by Andrew the same day** ("Desktop site
presenting as it normally would"), as the agent read it: the site is shown
as a desk browser would show it, and the user agent stays the real one.

**Reader view and Hard rule 4.** The page is not altered: its article text is
read by the layer and drawn on a screen of Longboard's own. Nothing is hidden,
removed or injected, nothing leaves the machine, nothing is kept. The article
is found by where the page's paragraphs are; no site is known by name (rule
8 does not come into it). Pictures are not shown. Written here rather than
taking a library: the well-known one is much bigger than what a TV needs.

**Parental lock.**

| Choice | As built | Why |
|---|---|---|
| The PIN | Four digits, entered with OK on a pad or a remote's number buttons, shown as dots | What TVs and set-top boxes use |
| Kept as | A salted scrypt hash in `lock.json`; never the PIN, never logged | Rule 10 is about sites' passwords, but the same care costs nothing |
| What it guards | Always: Settings. Optionally: any site that is not on Home (an app or a saved page), and then also changes to Home | "Only these sites" is what a parent wants on a TV, and Home already is the list |
| Unlocking | "Unlock every site" in the menu, or opening a site by name: until "Lock again" or Longboard closes | A parent unlocks for themselves, not per page |
| Wrong tries | Two free, then waits of 30 seconds, 5 minutes, 30 minutes | Ten thousand PINs must not be guessable in an evening |
| Forgotten | Deleting `lock.json` removes the lock; Settings says so | It guards against a child with a remote, not someone with a keyboard and the files, and says so |
| Limit | A Home site that sends the person to another site to sign in needs unlocking for that | Longboard cannot know which other sites a site depends on |

**Privacy features, "like Brave".** Built: the two signals above; refusing
trackers as well as ads (the public EasyPrivacy list, by the same per-site
switch, so rule 5 holds: off on verified sites until the person says
otherwise; **off as shipped**, since the list is larger and breaks more);
hiding the device's home-network address from sites that set up calls.
Already there: ad blocking, https-only, private tabs, clear on closing,
default-deny access.

Not built, with the reason:

| Brave feature | Why not |
|---|---|
| Fingerprinting protection | Works by changing what pages' scripts see: altering sites (rule 4), and close to anti-detection |
| Blocking other sites' cookies | Still untestable here without https test pages, and likely to break streaming sites' sign-in frames |
| Removing tracking words from addresses | Means redirecting requests, which Longboard never does |
| Blocking scripts per site | Possible, but breaks most sites; not asked for |
| Hiding cookie banners, social buttons | Cosmetic filtering: changes pages (rule 4) |
| Tor windows, a VPN | Rule 4: no region or VPN workarounds |

**Icons.** A tile's icon was already fetched from the site, but only from
what the browser reported, often a 16-pixel picture, and an app added before
the page said what its icon was got none. Now the page's own `link` elements
and its web-app manifest are read too, the smallest picture of at least 128
pixels is preferred, `/favicon.ico` is the last resort, and an app or saved
page with no icon gets one the next time its site is open. Rule 6 holds:
every icon comes from the site at run time.

## 2026-11-18: Andrew on Apple and manual switches; features to stand beside the major browsers

Andrew, in chat:

- **"Apple should go on the verified list."** Done: `tv.apple.com` is in
  `verified-sites.json` in the profiles repository (published) and in the
  copy that ships with Longboard. **Assumption:** `tv.apple.com`, the site
  that was looked at, not all of `apple.com`.
- **"A manual switch off by the user should be respected regardless of the
  override."** That is what was built: with ad blocking "on for every site",
  a site the person switched off from the menu stays off. Now a decision, not
  an assumption. Unit tests hold it.
- **"Do research into major browsers and implement features that make us
  competitive with them, just on the TV instead."**

What the agent looked at: Amazon's pages for Silk on Fire TV (bookmarks,
private tabs, history, passwords, parental controls), round-ups of Android TV
browsers (TV Bro: tabs, bookmarks, voice search, downloads, user-agent
switching; Puffin TV; Brave and DuckDuckGo for blocking and a one-press
"clear everything"), and what desktop Chrome, Firefox, Safari and Edge all
have (find on page, address-bar suggestions, a "not secure" mark, an
https-only mode, dark-mode preference, autoplay control, clear on exit,
cookie controls, restoring tabs). Sources are at the end of this entry.
**The round-ups are other people's summaries, some a year or more old; no
other browser was run.**

Built, each **an assumption** on shape:

| Feature | As built | Why this way |
|---|---|---|
| Saved pages (bookmarks) | "Keep this page on Home" in the menu's site page; a "Saved pages" row on Home; the menu on a tile takes it off | Home is where a TV browser's bookmarks belong: one press away, as tiles |
| Private tab | "New private tab" beside "New tab". Its own session, kept in memory only: no history, no recent site, answers to access questions not remembered, and what its sites stored is cleared when it is closed | What Silk, Chrome and the rest mean by it. Downloads and saved pages made in one are kept, as theirs are |
| Address suggestions | As the address is typed, up to five matching places from saved pages, apps, recent sites and history appear under the field | Typing is the worst part of a TV browser; a known site should take three letters. Nothing typed leaves the machine: major browsers also ask a search engine, which sends every keystroke to it (rule 12) |
| Find on this page | A field, Next and Previous; the count is said ("2 of 7") | The browser's own find. The panel covers part of the page, which is said on the panel |
| "Not secure" | The menu says so for a page sent over plain http | Every major browser marks these |
| Only pages sent privately | A setting: plain http pages are refused with a notice. Off as shipped. Addresses typed without a scheme already try https | The https-only mode of Firefox, Chrome and Brave. This machine's own addresses are exempt |
| Dark or light | A setting for the look sites are asked for: the system's, dark, or light | `prefers-color-scheme`; a dark page suits a TV in a dark room |
| Videos starting by themselves | A setting, on as shipped (streaming sites expect it). Off: a press is needed first | The browsers differ here; a TV app's job is mostly video, so the default is to allow |
| Clear on closing, and clear everything | A setting to clear what sites stored each time Longboard closes; and one button that clears history, recent sites and what sites stored | Firefox and Brave have the first; the second is the one-press clear of the privacy browsers |

Looked at and **not built**, with the reason:

| Feature | Why not |
|---|---|
| User-agent switching | Hard rule 3 forbids it. ("Desktop site" was later built as width only; see the entry above) |
| Saved passwords, autofill, sync | Hard rule 10, and no account system (and no telemetry, rule 12) |
| Search suggestions from a search engine | Sends each keystroke to a third party in the background (rule 12) |
| Do Not Track / Global Privacy Control | Adds a header to every request; rule 4 says no rewriting of headers. Andrew's call if he wants it. **He did: built, see the entry above** |
| Reader mode | Shows a site's text without the site's page around it; too close to altering a site (rule 4) to do without asking. **Asked for and built, see the entry above** |
| Blocking other sites' cookies | The browser has a switch for it, but it could not be tested here (it needs https test pages), and it is likely to break the sign-in frames streaming sites use. Not shipped untested |
| Voice search, translation | Each needs a speech or translation service, which means sending what is said or read to a third party |
| Typing from a phone | Worth having on a TV and on the roadmap, but it is a small server on the home network and would carry passwords typed on the phone through Longboard (rule 10). Needs a design and Andrew's decision |
| Parental controls, a PIN | Not started; a real one needs more than a hidden setting. **Asked for and built, see the entry above** |
| Safe Browsing | Needs a service and a key from its provider; listed in the README as missing |
| Restoring tabs after a restart | Not started; "open with the last site" covers one page |

Sources:
- https://docs.aws.amazon.com/silk/latest/developerguide/what-is-silk.html
- https://digprjsurvey.amazon.com/csad/help/node/200775270
- https://www.aftvnews.com/tag/silk/
- https://www.airdroid.com/screen-mirror/browser-for-android-tv/
- https://ovrclock.com/best-browser-for-android-tv/
- https://www.tcl.com/jp/ja/blog/guides/top-5-best-browsers-for-android-tv

## 2026-11-18: a page that is not in front stands still, and the menu for a remote

Andrew, in chat: "When the app isn't in focus all audio and video should
pause", and "this is a tv app so make sure all the new additions are tv and
remote friendly". Each row is **an assumption** on how.

| Topic | Chosen | Why |
|---|---|---|
| Pausing everything | A page that is not in front is put into the browser's own "frozen" state, 0.6 seconds after the site's own pause key has been sent to its player. That covers another program in front, Home in front, and a tab behind another. It is woken when it comes in front again | Hard rule 4 forbids calling `pause()` on a site's video, and the pause key only reaches a recognised player. Freezing is the browser pausing the page as a whole, as a phone's browser does to a background tab. **Measured:** a playing video, a playing audio element and Web Audio all stop; timers stop; on waking, the media stay paused, so playing waits for the person, and the page is visible again |
| What freezing costs | Nothing in a frozen page runs: a page behind Home does not finish loading or keep a connection alive | The price of "all". A site that drops its session when its page stops for a long time will need loading again. **Unverified on real sites** |
| The window losing its place for a moment | The freeze waits 0.6 seconds and is called off if the page is back in front | One of the browser's own lists opening must not freeze the page under it. **Unverified:** whether a real desktop reports that as the window losing its place for longer than that |
| A shorter menu | Things about the site in front (add as an app, profile, outline, what it may do) moved to "This site". Back and Reload share a row, as do Tabs and History, and About and Quit. Importing profiles is in Settings only | The agent looked at screenshots: Settings was sixteen presses down. It is now eight |
| Choosing from a list | Search site, language and the ad-blocking setting open a list with the one in use marked, instead of changing on each press | Stepping through twelve languages one press at a time is not something to do with a remote |
| Lists go round | In Longboard's own panels, up from the top goes to the bottom and down from the bottom to the top | The usual TV behaviour, and it puts Close and Back one press away |

## 2026-11-18: what Settings left out

Andrew, in chat: "Work on all the stuff you left out" (after the agent
listed passwords, autofill, history, tabs, languages, the downloads folder
and key mappings as not in Settings). Each row is **an assumption** on how.

| Item | Done | Why this way |
|---|---|---|
| **Saved passwords, autofill** | **Not built. Needs Andrew's decision.** | Hard rule 10: "Never read, log or store passwords or one-time codes." A password store is exactly that, and autofill has to read sign-in and payment forms to be of use. CLAUDE.md says to stop and say so when a request conflicts with a rule. If Andrew wants them, rule 10 has to change first, and it is the rule that keeps an agent's hands off credentials, so the agent's advice is to leave it. Sites' own "stay signed in" already works: cookies are kept |
| History | Each page opened, once, newest first, at most 300, in `history.json`. In the menu; Settings can turn it off (`"history": false`) and clear it | The usual browser history, cut to what a remote can browse. Addresses are kept whole, as any browser keeps them, on this machine only (rule 12) |
| Tabs | Up to eight pages open at once, listed in the menu; a new tab starts on Home; not kept across a restart | The smallest thing that is honestly tabs. Each is another view on the shared session, built on what apps with their own sign-ins already used. A background tab is silenced and paused like any page that is not in front |
| Languages | One language, chosen from twelve by name (any code in `config.json`), used from the next start | **Measured:** on Linux the browser ignores its own `--lang` switch and takes the language from the `LANGUAGE` environment variable; setting that variable at the very start of the program, before the browser has read it, works without a restart of its own. It also puts the browser's own few words (in a drop-down list, in form messages) into that language. A list of several languages in order would need the call that also sets the user agent, which the rule checks forbid (rule 3), so it is one language |
| Downloads folder | A folder chooser in Settings, driven with the arrows; `--downloads=` on the command line still wins | It needed a folder picker; this is one, small. Hidden folders are not shown. The folder must exist and be writable |
| Key mappings | Settings waits for a button press and gives that button the chosen job. The arrows, OK, Escape and plain letters and digits cannot be reassigned. Controller buttons are still `config.json` only | Pressing the button is the only way that works for a remote whose key names nobody knows. The protected keys are the ones the screen cannot be used without. Mappings take effect at once in every open page |

## 2026-11-18: the engine says it can play AC-3 (open, Andrew's to decide)

A report from the session that made the Apple TV profile (and Sapling TV, an
app built from Longboard's source) said protected playback on tv.apple.com
is expected to fail on Longboard's engine, and asked for an investigation
and a proposal. **Nothing was changed. No approach is chosen.**

What is established:

| Claim | Status |
|---|---|
| Longboard's engine (castLabs 45.2.1, Chrome 156) tells pages it supports AC-3 and E-AC-3 audio | **Measured** 2026-11-18 by the agent on a fixture page: `MediaSource.isTypeSupported` true, `canPlayType` "probably", `mediaCapabilities` supported. **New:** asking through EME (`requestMediaKeySystemAccess` with an AC-3 or E-AC-3 audio capability, Widevine) also succeeds. An end-to-end check now holds these answers, so a change is noticed |
| There is no run-time switch for it | **Sourced:** Chromium 156.0.8078.75, `media/base/supported_types.cc`, `IsDecoderDolbyAc3Eac3Supported`: with the build flag on, Windows and macOS ask the platform decoder; every other system gets `return true` under the comment "Keep 'true' for other platforms as old code snippet". `media/base/media_switches.cc` has no feature for it. The agent also tried `--disable-features=PlatformAC3EAC3Audio` and a few like it: no change |
| castLabs turned the build flag on from 43.0.0 and doubts it works on Linux | **Sourced:** castlabs/electron-releases issue 221. The maintainer wrote on 2026-06-16 that Linux support "seems to be lacking", after a user reported that the codec is claimed and does not play. The issue was closed on 2026-09-07 for lack of feedback |
| No newer castLabs release differs | Latest stable is 45.2.1 (what Longboard uses); 46 is alpha. **Not checked:** whether 46 alpha behaves differently |
| Playback on the site fails on this engine | **Not observed on 45.** Seen on 44.10.1 by the other session (its report), with the audio decoder refusing AC-3. An expectation here, from the cause being present |

The ways out, as the agent sees them:

1. **Ask castLabs to leave the flag off for Linux builds** (or to answer false there). The right fix: it corrects the engine's answer for everyone. Cost: their timetable, and they may say no. Needs someone to open an issue on their repository; the agent has not, because that is a public post in Andrew's name. A draft is below.
2. **Have Longboard correct the four answers itself**: a small script in the page's own world, on Linux only, that makes `isTypeSupported`, `canPlayType`, `mediaCapabilities.decodingInfo` and `requestMediaKeySystemAccess` say no to AC-3 and E-AC-3. It touches no request, response or site script, and it makes the browser say something true. But it would be the first code Longboard puts into a page's own world, and **Hard rule 4 as written ("the layer adds its own UI and sends ordinary input") does not obviously allow it**, and rule 3's spirit (say what the engine really is) cuts both ways. Andrew's decision; if yes, it should be for every site, not a profile setting, because the answer is wrong for every site. It could be removed the day option 1 lands, and the end-to-end check would say when.
3. **Stay on castLabs 42.x**, which does not make the claim. Against Hard rule 14, and 42 is three majors behind. Listed to rule it out.
4. **Do nothing**: sites that trust the answer and send AC-3 have no sound or do not play; pointer mode and profiles do not help.

The agent's recommendation: 1 now, and 2 only if Andrew wants the site working before castLabs answers.

**2026-11-18, later: Andrew chose option 1**, after the agent checked that it
is a real fix. The check: Chromium's own default for the flag
(`media/media_options.gni`, 156.0.8078.75) is
`proprietary_codecs && (is_cast_media_device || (is_ios && target_platform == "tvos"))`,
so it is off on desktop Linux upstream and castLabs turns it on for every
system; with it off, `IsDecoderDolbyAc3Eac3Supported` returns false, which
is what 42.x answers. A build setting can differ per system, so it is a
small change for them. The request was posted on Andrew's instruction as a
comment on their issue 221:
https://github.com/castlabs/electron-releases/issues/221#issuecomment-6988958527
The issue is closed, so it may not be seen; if there is no answer, a new
issue is the next step. Until they act, the site is expected not to play
sound it sends as AC-3.

Draft for option 1 (not sent):

> **Linux builds claim AC-3/E-AC-3 support they cannot provide (follow-up to #221)**
> Since 43.0.0 the `+wvcus` builds set `enable_platform_ac3_eac3_audio`. On Linux x64 (measured on 45.2.1, Chrome 156.0.8078.75) `MediaSource.isTypeSupported('audio/mp4; codecs="ec-3"')`, `canPlayType`, `mediaCapabilities.decodingInfo` and `requestMediaKeySystemAccess` with that audio capability all report support. Chromium's `IsDecoderDolbyAc3Eac3Supported` returns true unconditionally outside Windows and macOS when the flag is set, and there is no platform decoder on Linux, so a site that trusts the answer sends audio that fails to decode. Could the flag be left off for Linux builds, or the Linux answer made false?

Smaller things from the same report:

| Item | Done |
|---|---|
| tv.apple.com is not on the verified list, so ad blocking starts on there | Nothing. Adding a site is a person's review: Andrew's to do in the profiles repository. With Settings he can also add it for himself on his own box |
| The name "Longboard" was fixed in several places, which an app built on this source had to patch | `src/shared/product.ts` now holds the name, the desktop app ID and the user-agent token in one place; Home, the menu, notices, About, the window title and web-app launcher names all read it. **Assumption:** one file to replace at build time is the seam wanted. Not done: making the catalogue address and the profile store pluggable; they are already separate modules an app can import |
| `launcherFileName()` always began with Longboard's app ID, so the same web app added from two programs wrote the same file | It now begins with the program's own app ID from `product.ts` |
| A layer in frames from other origins (the site's sign-in form is in one) | Not done. It is under "Later" in ROADMAP.md; the other session has an implementation the agent has not read. Pointer mode remains the way in |

## 2026-11-18: Settings, the ad-blocking override, and editing the list

Andrew, in chat: make a Settings with "all the typical things you'd want to
find in a browser settings", a setting to have ad blocking "fully disabled,
or fully enabled for every site ignoring the list that turns it off", and "a
place to edit the list".

How the agent built it. Each row is **an assumption** where Andrew did not say.

| Topic | Chosen | Why |
|---|---|---|
| What "typical" comes to here | Search site, what to open with, size of everything, hardware video decoding, ad blocking, clearing site data / cache / recent sites / per-site settings, which kinds of access sites may ask for, profile updates and import, removing apps, reset, and the disclosure of background downloads | The settings a mainstream browser has that mean something in Longboard. Left out because Longboard has no such thing: passwords, autofill, history, tabs, languages. Left out for lack of a folder picker: the downloads folder |
| Where settings are kept | `config.json`, the file that could already be edited by hand. The screen changes one key at a time and keeps everything else in the file | One place, two ways in. A second file would raise the question of which wins |
| "Fully enabled for every site" | On everywhere, the starts-off list ignored. A site the person switched off themselves from the menu stays off | The request was to ignore *the list*. A person's own "off" for one site is not the list, and overriding it would be Longboard changing a switch they set (Hard rule 5). **If Andrew meant on with no exceptions, say so** |
| "Fully disabled" | Nothing refused anywhere, whatever a site's own switch says; the menu's switch is greyed out and says why; the filter list is not downloaded | "Fully" |
| "The list" | The list of sites where ad blocking starts off (the verified sites). The person can add a site and take a reviewed one off; their changes are kept in `config.json` beside the reviewed list, which is not altered | It is "the list that turns it off" in Andrew's words. The filter list (EasyList) is changed by `"filterLists"` in `config.json`, not on screen: it is addresses of lists, not something to edit by remote |
| Hard rule 5 | Not reworded. It says ad blocking is "a per-site switch the person controls", never changed for them, with no shipped default that turns it on for a verified site. All still true: the setting over all sites is the person's, and a new copy ships on "each site has its own switch". **For Andrew:** the rule's wording does not mention the setting over all sites; reword it if you want it to |
| Hard rule 12 | Its "disclosed in Settings" is now literally true: the Privacy page says what is downloaded and how to stop it | Closes the question the agent raised earlier |
| Search sites offered by name | Google (the usual), DuckDuckGo, Bing, Brave Search | The agent's pick of well-known ones; the addresses are from the agent's memory of their ordinary search links, and each was checked only for being a valid search address, **not by searching with it**. Any other can still be put in `config.json` |
| Kinds of access | A kind can be closed to every site: then no site can even ask, and earlier yeses for it stop counting while it is closed | The usual browser setting "sites can ask / don't allow sites to ask" |
| Clearing | "Sign out of every site" and "forget every site's settings" need a second press | They cannot be undone |
| A scripted run and the sign-out button | The automation guard stops it, because it says "sign out" | Found by the test. Left that way: a script has no business signing the person out (the guard's account words). It means the sign-out button itself has only been read, never pressed, by any test |

## 2026-11-18: phase 5, ad blocking

Andrew, in chat: "start phase 5, ad blocking". How it was built; each row is
**an assumption by the agent** where DESIGN.md did not already say.

| Topic | Chosen | Why |
|---|---|---|
| **Runtime dependency: `@ghostery/adblocker` 2.20.3, MPL-2.0** | Only the core request matcher. Its own dependencies are MPL-2.0 except `tldts-experimental`, MIT (checked with `npm view` on 2026-11-18) | Matching tens of thousands of filter rules quickly is real work and this is a maintained implementation. MPL-2.0 code may be combined into a GPL work (Mozilla's MPL 2.0 FAQ, question 14) |
| Not the library's Electron wrapper | Longboard installs its own request handler | The wrapper also injects scripts and styles into pages and adds headers. Hard rules 4 and 5 allow refusing requests and nothing else |
| What a "block" is | The request is cancelled. Hiding filters, scriptlets, HTML and header filters are not even loaded; a "serve a stand-in" filter becomes a plain cancel | Same rules. The cost is visible gaps where ads were, and more sites noticing. Longboard does nothing about a site that notices (rule 5: never anti-detection) |
| Which list | EasyList alone, from `https://easylist.to/easylist/easylist.txt`; `"filterLists"` in `config.json` replaces it | The design says ad blocking. EasyList is the standard advertising list; tracker and annoyance lists are a wider promise than was made. Dual licensed GPL-3.0-or-later / CC BY-SA 3.0-or-later (https://easylist.to/pages/licence.html) |
| Lists are fetched, never shipped | Downloaded whole from the publisher every four days, no cookies | Hard rule 1 (no third-party material in the repository) and rule 12 (a disclosed background request that says nothing about sites visited). EasyList's own header asks for an update every four days at most (the agent's recollection of the "Expires" line, not re-read) |
| Before a list has arrived | Nothing is refused, and the menu says so | First start, or no network. The alternative, shipping a list, breaks rule 1 |
| Verified sites before the catalogue has arrived | A copy of `verified-sites.json` ships with Longboard and is used until the catalogue's own has been fetched | Otherwise a verified site would start with blocking on at first launch, which rule 5 forbids. It is the project's own file, not third-party material |
| Where the switch is | The menu, per site, with the count of refused requests or the reason it is off. Pressing it keeps the choice and reloads the page | DESIGN.md asks for a switch on every site. A reload is what makes the page match the switch |
| "Settings" | `"adBlocking": false` and `"filterLists"` in `config.json`; disclosure in the About panel. No settings screen | There is no settings screen for anything yet. **For Andrew:** Hard rule 12 says both background requests are "disclosed in Settings". They are disclosed in the About panel, because there is no Settings. The agent did not reword the rule; either the wording or the app should change |
| The top-level page | Never refused, whatever a list says | The person asked for it. A list could otherwise stop a site opening at all |
| Which page a request belongs to | The page in front in the view the request came from, for both the on/off decision and "is this another site's request" | Simple and predictable. A request from inside an embedded frame is judged against the top page, not the frame |
| Rule checks | `onBeforeRequest` and the library may appear only in `src/main/adblock.ts`; that file may not mention redirects, headers or injection; the wrapper packages are banned | The old check banned the words "adblock" everywhere "until the ad-blocking phase" |

## 2026-11-18: gaps closed by the agent after Andrew said "keep going"

All **assumptions**: Andrew asked for more work without saying what, and ad
blocking is still his to start. The agent worked down the "known gaps" list
in STATUS.md.

| Topic | Chosen | Why |
|---|---|---|
| Icons on Home tiles | A site on Home gets its own icon on its tile, fetched from the site once while the site is open, and kept under a name made from a hash of the site | Hard rule 6: the icon comes from the site at run time. The request goes to the site the person is already on, so it tells nobody anything new (rule 12). The file is deleted when the site leaves Home |
| Removing a tile | The menu, opened with the highlight on a Home tile, offers "Remove ... from Home" (or to remove the app) | A remote has no long press that can be relied on, and the Menu key is already "things to do with this". No new key to learn |
| `view.safeMargin` | The website's view is made smaller and centred; the scale is worked out from the smaller rectangle | Nothing in the page is touched (rule 4). The border is black |
| A site that changes its address without loading a page | The shell works out the profile again from the new address and hands the page's layer the new rules; scale and safe margin follow | Most web apps never load a second page, so a profile for some paths would otherwise apply to all of them or none. An imported profile that still needs an answer is not asked about at that moment, only on a page load |
| How a download is held for the question (replaces the choice of earlier the same day) | The file goes on arriving while the question is up, under a random name in a folder of Longboard's own; moved to Downloads once whole and agreed to; deleted when refused, and the folder is emptied at start and at exit | Asking the site twice could not save a file made in answer to a form, and showed the site two requests. This is also what mainstream browsers do with their part-files (the agent's recollection, not looked up). The cost: the file is being written to disk, in Longboard's folder, before the person has answered; a very large one refused late has used the space and the connection until then |
| A list of downloads | The menu has "Downloads" once there has been one: this run's downloads, how far each has got, and a Cancel for each under way. Not kept across runs | The files themselves are the lasting record. It was under "Later" in the roadmap; it came cheaply with the change above |
| Pointer clicks on a scaled page | Clicks and moves sent through the DevTools input channel are divided by the page's zoom | **A bug, found and measured on 2026-11-18:** that channel counts in the page's own pixels. With the page drawn at 1.33 times a click landed 1.33 times too far from the corner, so on any real TV the pointer would have clicked the wrong thing. It was missed because the end-to-end run forces a scale of 1 unless told otherwise; the pointer scenarios now run scaled |
| Who decodes a site's icon | The shell fetches the bytes and hands them to Longboard's own screen, a sandboxed process, which draws the picture at 128 pixels and hands back a PNG it made. The shell checks that it is a PNG of sensible size and saves it | Before, the shell itself decoded whatever a site sent as its icon. Picture decoders are a known place for security bugs, and the shell is the one process with full access to the machine (rule 13) |
| Questions start on "no" | Every question (access, download, imported profile) opens with the highlight on the answer that changes nothing, and a yes in its first 0.6 seconds is not counted | Found by an independent review of the shell: a page can get a person tapping OK and then ask for the camera, so the next press says yes, and the yes was remembered. Mainstream browsers delay their permission buttons for the same reason (the agent's recollection, not looked up) |
| A question that leaves the screen | It is answered "not now" | Review finding: a question hidden by something else (an app opened from the TV's app list) stayed waiting and silently refused every later question until quit |
| Empty pop-up windows | `window.open('about:blank')` and `window.open('')` are refused; the script gets nothing back | Review finding: opened in the same view, as other pop-ups are, it replaced the site with a blank page. Sites that open an empty window and fill it in will not work; there is no second window to give them |
| Whose yes it is | An answer about access counts only for a site's pages loaded securely. An answer about an imported profile is kept with a fingerprint of the file's contents | Review findings: a grant to `https://site` was also honoured for `http://site`, and a second file with the same name and version as an agreed one was used without asking. Still true: a grant is per host name, so another port on the same host shares it |
| Other review fixes | A site's icon is given 8 seconds and 2 MB, then dropped. Removing an app from its own page goes Home. The display may sleep again when a playing app is left. In a scripted run the purchase guard no longer depends on the shell answering the page's first message | Each was a way to be left with a dead panel, a blank view, a screen that never sleeps, or (in theory) a scripted run without its guard |
| The purchase guard, after a second review (of the page layer) | It now judges what was really pressed inside a web component, not the component; goes up before any of the page's scripts run; judges a form with no address of its own by the page it is on; reads a picture button's description; knows more words, a price on a button, and payment host names | Review findings against Hard rule 11. Each was a way for a scripted run to press something the guard exists to stop. **Still open:** a button inside a *closed* web component cannot be seen from outside at all; wording in languages other than English is not recognised; an embedded frame's guard does not get the profile's own list |
| Secret fields | In a scripted run the keyboard checks the field again at every pick, not only when it opens, and takes a field for a secret by what the site calls it (otp, pin, cvv, verification code) as well as by its type | Review finding against Hard rule 10: the page could move the cursor to the password field under an open keyboard |
| Keys the page makes up | Ignored always. A scripted run's keys come through the browser's own input channel and count as real | Review finding: under `--automation` a page could send itself Ctrl+Q, the menu key or OK |
| Smaller fixes from that review | OK on a drawing (SVG) no longer fails; a pop-up opened from a hover menu can be reached; a frame that takes the keys gives them back outside pointer mode; Back still works on a field that takes the cursor straight back; a profile selector left open at its end is dropped | Each could leave the remote doing nothing |
| Left alone from that review | A page that names its own elements after the browser's functions (`<img name="querySelectorAll">`) can break the highlight on itself; pointer mode still works there. Outlines keep short path segments of addresses and raw test ids; they are written locally only and checked before any is committed | The first hurts only the page that does it. The second is covered by the reviewer's check that PROFILES.md already asks for |
| Ad blocking, again | Not started. The agent took "keep going" as leave to begin phase 5, installed the Ghostery library to read it, and was stopped by the permission system before writing any code; the install was undone | Andrew's brief says not to add ad blocking yet, and nothing since has plainly said otherwise. What was learned on the way, for when it is started: the library and all but one of its dependencies are MPL-2.0 (the other is MIT), which Mozilla's FAQ says may be combined with GPL code; EasyList is offered under GPLv3-or-later or CC BY-SA 3.0-or-later and would be fetched at run time, not shipped. The library's ready-made Electron wrapper also injects scripts and headers, which rules 4 and 5 forbid, so only its request matcher should be used. Sources: https://www.mozilla.org/en-US/MPL/2.0/FAQ/ and https://easylist.to/pages/licence.html |

## 2026-11-18: Andrew on ad-blocking defaults, permissions and downloads

Andrew, in chat:

- **Drop the "granted protected playback" row.** Ad blocking starts off only
  on verified sites and on everywhere else. The agent's assumption of
  2026-11-18 is withdrawn, and Hard rule 5 in CLAUDE.md was reworded to
  match, at Andrew's instruction.
- **Permissions are asked about**, and the person can allow or deny.
- **Downloads should work.**

How the agent built the last two, each **an assumption** where Andrew did not
say:

| Topic | Chosen | Why |
|---|---|---|
| What is asked about | Camera, microphone, location, notifications, clipboard reading, MIDI, pointer lock, and protected playback where the browser asks | The things a person can be asked about in one sentence |
| What is still refused | USB, serial and HID devices, screen capture, opening other programs, and anything unknown | Each needs a chooser (which device, which screen) that Longboard does not have. They need a design, not just a yes or no |
| Remembering | "Allow" and "Do not allow" are kept per site; Back is "not now". The menu shows a site's answers and forgets them all at once | Same as the imported-profile question. Forgetting one answer at a time can come later |
| Who is asked about | Only the page in front, and only when it was loaded over https (or from this machine) | A page in the background or loaded insecurely is refused, unremembered |
| A site sees "denied" before it has asked | Unavoidable for now | The browser's own "has it permission?" check cannot wait for an answer, and can only be told yes or no. Until the person has said yes, a site that checks first sees no. Sites that simply ask get the question. **Unverified how many sites check first and give up** |
| Downloads | Asked about one at a time; saved to the desktop's Downloads folder (`--downloads=` changes it) under a name that writes over nothing; never opened | A file landing on a TV box unasked is a surprise, and a save dialog is a small file manager. One question covers both |
| How a download is held for the question | The first attempt is stopped; on "Download" the same address is asked for again and kept | Measured: pausing does not hold it, a small file was on disk before the question could be answered. The cost is that the site sees two requests, and a download that came from submitting a form cannot be repeated this way |
| Held keys and panes | A held key now scrolls whatever holds its target, and jumps when nothing can scroll | Found while testing the longer menu: with the window unable to scroll, quick presses went nowhere |

## 2026-11-18: Andrew's answers after the first autonomous session

Andrew, in chat:

- **Default search is Google** (`https://www.google.com/search?q=%s`). It
  replaces the agent's pick of DuckDuckGo. `"search"` in `config.json` still
  changes it. It is an ordinary link; there is no arrangement with Google.
- **The on-screen keyboard should behave as mainstream Android TV apps do.**
  The agent looked this up and found that what Longboard already does is the
  Android TV convention, so nothing was changed:
  - Moving the highlight onto a text field with the D-pad does not bring the
    keyboard up; pressing the centre (select) button on it does. In Android's
    own text field code the keyboard is shown on the key-up of the D-pad
    centre button **[Sourced: framework commit, below]**, and a third-party
    TV text field describes the same flow: arrows are left to move focus,
    Select or Enter starts editing **[Sourced: tv_textfield]**.
  - Back puts the keyboard away and leaves the field as it was.
  - A web page that focuses a field by script does not get a keyboard unless
    the person just did something. **[Guess: this is how Chromium behaves on
    Android as the agent recalls it; no source was found in this search.]**
  - Reports differ for the older Leanback keyboard, where one person saw the
    keyboard appear on focus **[Sourced: Stack Overflow copy, below]**. The
    agent followed the framework's behaviour, not that report.
  - Not copied: dedicated search screens with their own always-visible
    keyboard, as streaming apps have. Longboard shows websites, which have
    no such screen.

Sources:
- https://gitlab.e.foundation/e/os/android_frameworks_base/-/commit/9d1abc43f5ffdb413fda5d8e39019bb40aad0b94
  ("In onKeyUp for DPAD_CENTER, show the IME"; read as a search result, the
  page itself would not load)
- https://pub.dev/packages/tv_textfield
- https://developer.android.com/training/tv/get-started/onscreen-keyboard
  (says nothing about when the keyboard appears; checked)
- https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/36040285/android-keyboard-not-reachable-in-cordova-app

## 2026-11-18: phase 4 choices made by the agent (the profile editor)

All **assumptions by the agent**. This is a first, small editor: it covers
the four marks DESIGN.md 4.5 names and nothing else of the format.

| Topic | Chosen | Why |
|---|---|---|
| How an element is chosen | With the pointer: point, press OK | The things a profile exists to fix are the ones the highlight cannot reach, so the highlight cannot be what picks them |
| What gets written | A selector for the *kind* of thing pointed at (its tag and up to two hand-written-looking classes, or a structural attribute), with a count of how many match and a box drawn round each | A profile is about "the cards", not "this card". The count and the boxes let a person see what they are about to mark without reading a selector |
| Generated names | Classes and ids that look machine-made are passed over | They change with every build of a site, and a profile built on them would stop working without anyone noticing |
| Wider / Narrower | Steps out through the containers of what was pointed at | Rows and players are containers; nobody can point at one directly |
| Marks | Can be selected, never select, this is a row, this is the player. Choosing one again takes it off | The four in DESIGN.md. Everything else in the format is still written by hand |
| Seeing the result | The page is driven by the draft from the moment a mark is made | DESIGN.md: "see the result immediately" |
| Saving | Writes `<id>.json` to the person's own profiles, validated like any other profile, with an outline of the page saved beside it as the evidence | Hard rule 8 in spirit even for a local profile, and it is exactly what a pull request to the catalogue needs |
| Editing a reviewed profile | Starts from a copy with the version raised, saved as the person's own, which then wins | The reviewed file is not theirs to change, and their fix should not wait for a review |
| Sites named by a bare network address | Cannot have a profile | The format names sites by domain |

## 2026-11-18: protected playback is not asked about on Linux

Measured by the agent, not chosen. A fixture page asked the browser for the
Widevine key system the standard way (`requestMediaKeySystemAccess`). It was
granted at once and Longboard's permission handler was never called: on
Linux the embedded Chromium does not treat this as a permission, as desktop
Chrome does not. The "Allow protected video?" question is therefore never
shown on Linux. The policy and the question stay in the code for systems
where the browser does ask.

Two consequences Andrew should know about:

- On Linux every https site can use protected playback, as in Chrome.
  Longboard cannot make that a question without getting between a site and
  the browser's playback interface, which Hard rules 2 and 4 rule out.
- The ad-blocking default for "sites granted protected playback"
  (DESIGN.md section 5, the agent's own addition) has nothing to go on
  here. Phase 5 will need another sign, or that row should be dropped.

## 2026-11-18: phase 4 choices made by the agent (web apps)

All **assumptions by the agent**, made while working alone.

| Topic | Chosen | Why |
|---|---|---|
| What "an app" is | A record: id, address, name, own sign-ins or not, in the app list or not. One app per site | ARCHITECTURE.md section 7 |
| Its icon | The site's own, fetched from the site when the app is added, by the session the page is in, and kept in the data folder. Longboard's icon when the site offers none that can be read | Hard rule 6. It is fetched once, on the person's own action, from the site they are on: not a background request |
| The app list entry | A desktop entry in the user's XDG `applications` folder, started with `--app=<id>` | It is what Plasma Bigscreen and other desktops read. **Not checked on a real desktop, and it will not work from inside a Flatpak**, where that folder is the sandbox's own: that needs the desktop portal the design guessed at |
| Own sign-ins | A separate session kept on disk for that app, and a second website view to hold it. Opening anything else closes that view; removing the app clears what it stored | "Keeps its own" has to mean cookies and storage apart. One extra view at most keeps memory use bounded |
| Where an address typed in the menu opens | Always in the shared session, even from inside an app with its own | An app's session is for that app; typing an address is leaving it |
| Starting a second copy | The running one comes forward and opens what was asked for | An entry in the app list must work while Longboard is already open |

## 2026-11-18: phase 3 choices made by the agent (profiles)

All **assumptions by the agent**, made while working alone.

| Topic | Chosen | Why |
|---|---|---|
| Additions to format version 1 | `focus.scrollPrevious` / `focus.scrollNext`, `text.searchOpen`, `player.close`, `guard.purchase` | Needed to carry Tropic Video's adapter over without loss, which the roadmap made the test of the format. Each is still only a selector |
| `player.keys` | May only name keys from a short fixed list | A profile that could name any key could have a script-driven press mean anything. The list is what players commonly use |
| Outline format | A text file, `outline.txt`, in the format the app itself saves; several pages in one file, each begun by a `####` line | It is what "Save page outline" produces, so evidence is a copy of what the contributor saw. The catalogue's draft said `outline.json`; nothing produced that |
| Where the catalogue index is published | `index.json` committed at the top of the profiles repository, fetched from GitHub's raw address | No server to run and no publishing step that can be forgotten; the repository's check fails when the index is stale |
| Catalogue under `--automation` | Not fetched, unless `--catalogue=` points the run at one | A scripted run should not depend on, or touch, the network without being told to |
| Import without a file picker | "Import profiles from USB" looks at the top of each plugged-in stick and at `import/` in the data folder, for `*.longboard-profile.json` only | A file picker is a small file manager, hard to drive with six buttons. This covers "from a USB stick" with one menu entry. Unverified inside a Flatpak, which may not see the stick |
| "Not now" on a question | Back on the question refuses for this run only; the buttons give a remembered answer | Dismissing is not deciding |
| Which profile applies | Decided by the shell from the frame's real address when a page loads, and validated again by the layer | The page has no say, and the layer trusts nothing it is handed |
| Built-in copy of the Prime Video profile | Shipped in `profiles/` and also put in the catalogue | So the site works on a first start with no network. The catalogue copy wins once fetched |

## 2026-11-18: phase 2 choices made by the agent (generic mode, pointer mode)

All **assumptions by the agent**, made while working alone.

| Topic | Chosen | Why |
|---|---|---|
| "Looks clickable" | An element the page shows the hand cursor over, taken at the outermost element of each such region, and only on sites with no profile | It is the one sign a script-only control gives. Each element is asked once and remembered, because asking means briefly lifting the layer's own cursor hiding |
| Reading | With nothing to move to, the page (or the pane the highlight is in) scrolls by 80% of a screen. A target more than about a third of a screen past the edge is scrolled toward, not jumped to | So a long article can be read with Down alone and nothing between two links goes by unseen. Tropic Video jumped; it still does where a profile applies |
| Picking up after a scroll | The first control wholly on screen takes the highlight, without moving the page again | DESIGN.md 3.2. When nothing is on screen there is briefly no highlight; the alternative was to stop the reading |
| When a video is "being watched" | On a site with no profile: only when it fills the screen (85% of it, or the page's own full-screen). With a profile's player container: half, as in Tropic Video | A video that is most of a page still has a page around it that the arrows must reach |
| Drop-downs | OK opens the browser's own list with the key that opens it; the list takes the arrows itself | It is the browser's control, not the site's, and already works with a keyboard. A controller's buttons are turned into those keys |
| Embedded frames | The highlight can rest on a frame; OK there starts pointer mode on it | A frame from another site cannot be driven by the layer (ARCHITECTURE.md section 3). This makes the escape hatch discoverable instead of a dead end |
| Pointer speed | One small step per tap; held, it speeds up over 0.9 s to about two screen-heights a second; pushing against an edge scrolls | DESIGN.md 3.3 asks for acceleration. The numbers are a first guess to be tuned on a TV |
| How "held" is known | From key repeats, not key release | Measured with real key events: once the shell takes a key, the browser never reports its release. A hold therefore starts moving when the keyboard's own repeat starts (about half a second in), not at once. A controller reports what is held and moves at once |
| Pointer mode's mouse events | Sent through the browser's DevTools input channel, attached only while pointer mode is on | Measured: Electron's `sendInputEvent` does not deliver mouse events into frames from another site, which is what pointer mode is for. They are the same trusted mouse events. Nothing else of that channel is used |
| Back in pointer mode | Leaves pointer mode | "The same button switches back" plus Back as the universal way out |
| Typing in pointer mode | Clicking a text field ends pointer mode and brings up the keyboard | The keyboard needs the arrows |
| When the on-screen keyboard opens | On OK on a text field; when the person asks to search; when a page focuses a field within 1.5 s of OK or a click. Not when the highlight merely passes over a field, and not when a page focuses a field as it loads | DESIGN.md 3.2 says OK opens it. Tropic Video opened it on any focus, which suited its one sign-in page; on the real sites tried (a search engine, a map) it covered half of every page that puts the cursor in its search box. Sign-in pages now need one press of OK |
| A plugged-in keyboard in a text field | The first character typed hands the keys to the field, as in any browser, until the highlight moves on. Backspace in a field always deletes | Arrows otherwise still move the highlight off a field, so a remote is never trapped in one |
| The preload in embedded frames | It runs there (`nodeIntegrationInSubFrames`) and, only under `--automation`, installs the purchase guard and reports that it has | Pointer mode sends real clicks, which reach frames; Hard rule 11 has to hold there too. A scripted click on a frame is refused unless every frame has reported its guard. The option's name is misleading: the view stays sandboxed and isolated and pages gain nothing |

## 2026-11-18: phase 0 and phase 1 choices made by the agent

Andrew asked the agent to work through the roadmap alone and to record its
own choices here as assumptions. Every row is **an assumption by the agent**
and can be reversed.

| Topic | Chosen | Why |
|---|---|---|
| Electron version | castLabs 45.2.1, not Tropic Video's 44.10.1 | Hard rule 14: it was the current stable on the releases page when the code was carried over. Tropic Video's whole test suite passed on it unchanged |
| Not carried over | The `--spike` protected-playback probe, the live-site walk script and the release workflow | The probe and walk were tools for one service; the release workflow can come back when a release is wanted, and until then nothing can publish one by accident |
| Two views | The website and Longboard's own screens are separate views with separate sessions; the chrome view's session is in memory only | ARCHITECTURE.md section 4. A website can then never reach Home, the menu or a permission question |
| How the chrome screens talk to the shell | Their preload draws them from the isolated world and uses IPC itself. The page has no script and no `contextBridge` API | Keeps Hard rule 13 true for every view, not only the website's, and lets the rule check keep banning `exposeInMainWorld` outright |
| Plain http | Opened, like https | A general browser has to open the devices and old sites on a home network. Typed host names still get https first |
| What is never opened | `file:`, `data:`, `javascript:`, `blob:`, internal pages, and any address with a user name or password in it | ARCHITECTURE.md section 2; the last is a common disguise for a look-alike site |
| Search engine | Superseded: see "Andrew's answers after the first autonomous session" at the top | The agent had picked DuckDuckGo |
| Permissions | Full screen granted. Protected playback asked once per site and remembered. Everything else refused without asking | ARCHITECTURE.md section 2 names those two as the ones that make sense on a TV. The decision is a tested pure function |
| Home tiles | A letter and the site's name; no icons yet | Hard rule 6 wants icons to come from the site at run time, and fetching them when Home opens would contact every listed site again. Needs a cache filled at visit time; not built |
| What goes on Home | Addresses the person typed or opened from a tile; one tile per site, twelve at most. Searches and links followed inside a site do not | "Recently opened sites" in DESIGN.md 4.1, read as sites the person went to on purpose. It is not a history |
| Going Home | The site stays loaded, silenced, with a full-screen video paused by the site's own key; Back on Home returns to it | No tabs yet, and losing a page by pressing Home would be a dead end |
| Back | The shell decides: back one page, past Longboard's own notices and repeated entries; Home from the first page | "Back always goes back" (DESIGN.md section 7) needs one place that knows the history |
| Menu key | Menu/ContextMenu, Info, Help, Ctrl+O; Start on a controller | DESIGN.md section 6 |
| Pointer key | F2; right stick click on a controller | DESIGN.md left it "to be chosen". No remote has a pointer key, F2 collides with nothing a page commonly uses, and config.json can map any other key or button to `pointer` |
| Downloads | Refused with a message | ARCHITECTURE.md section 2 |
| Certificate errors | A notice page, no retry, no way through | Hard rule 13 |

## 2026-11-18: ad blocking, verified sites, profile licence, profiles repo

Andrew, in chat, over two messages:

- **Verified websites** are sites manually reviewed and added to a list as
  having non-malicious ads. Prime Video and YouTube are examples.
- Verified sites start with ad blocking **off**; everything else starts
  **on**. **Every site keeps a switch**, verified ones included.
- Profiles are free for anyone to reuse. Recorded as CC0-1.0.
- The profiles repository is `AndrewGBest/Longboard-Profiles`.

The agent had first read "verified" as "has a reviewed profile" and proposed
locking blocking off on subscription services with protected video. Andrew
corrected both: verified is its own reviewed list, and those sites get a
switch too. The agent's recommendation to lock is on record in
LEGAL-GUARDRAILS.md and was not adopted.

Consequences: the verified list is a separate file from profiles; the profile
format no longer has a `kind` field.

**Assumption by the agent, flagged:** a site granted protected (DRM) playback
that is not yet on the verified list also starts off. Andrew can remove it.

## 2026-11-18: project interview

Andrew's answers, given in chat.

| Topic | Decision | Notes |
|---|---|---|
| Name | **Longboard** | Chosen over Armchair (the agent's pick), Ottoman and Settee. Not cleared; see below |
| Tropic Video | Becomes a profile for the Prime Video website inside Longboard | The Tropic-Video repository is archived: still downloadable, no further work until it is converted to a profile |
| Repository | New repository, created by Andrew | |
| Platforms | Linux x86_64 only at first, built so other systems and architectures can be added | |
| Ad blocking | On by default | Never on streaming services; scope in LEGAL-GUARDRAILS.md |
| Profile power | Data only now, scripts later | Format reserves room for reviewed scripts |
| Sharing profiles | A GitHub profiles repository **and** export/import of files by hand | Both routes |
| First-version features | Add any website as a web app | Tabs, history, bookmarks and downloads go on the roadmap |
| Fallback | Pointer mode on a button | |
| Typing | On-screen keyboard now; leave room for typing from a phone and voice search | |

### Assumptions made where a question went unanswered

Andrew skipped these; the agent chose the option it had recommended. Any of
them can be reversed.

| Topic | Assumed | Why |
|---|---|---|
| Making profiles | An on-TV editor plus readable files | Lets non-programmers contribute; files keep it reviewable |
| Which profile applies | Local first, then the reviewed catalogue profile automatically, then generic mode; unreviewed imports ask once | Automatic for the safe case, a question for the unsafe one, and no usage counting |

### Not asked; defaults taken

| Topic | Default | Why |
|---|---|---|
| Licence | GPL-3.0 for the app | Same as Tropic Video, which Andrew chose |
| Shell | castLabs Electron | Already proven to play Prime Video in Tropic Video |
| Distribution | GitHub Releases: AppImage, Flatpak bundle, tarball | Same as Tropic Video; Flathub's policy on AI-written code ruled it out earlier |
| Telemetry | None | Carried over |

## 2026-11-18: name screening

First screen only: web searches for same-name browsers and TV apps, then
third-party trademark listings. No register was searched directly. Not legal
advice.

| Name | Result |
|---|---|
| Longboard | No same-name browser found. A LONGBOARD registration for telecom software (Longboard, Inc.) was cancelled in 2009. Two live LONGBOARD registrations (serials 77635550 and 87127830) were listed but their goods could not be read |
| Armchair | No same-name browser found. A bare ARMCHAIR registration was cancelled in 2017; live marks are longer phrases |
| Ottoman | Nothing in software found; sounds like the existing Otter Browser |
| Settee | Nothing found on one search |
| Tenfoot | Dropped: an earlier "Ten Foot Browser" and "Tenfoot Media Center" |
| Clicker | Dropped: Clicker.tv, Netclicker, Clikr |
| Loveseat | Dropped: live LOVESEAT registration covering mobile software |
| Hammock | Dropped: several software companies |
| Wayfinder | Dropped: existing open-source navigation software |

**To do before a public release:** read both live LONGBOARD records on the
USPTO register, search the Canadian register, and check GitHub and package
names.

Sources:
- https://markinton.com/trademark/longboard-76060177
- https://trademarks.justia.com/776/35/longboard-77635550.html
- https://trademarks.justia.com/871/27/longboard-87127830.html
- https://trademarks.justia.com/778/85/armchair-77885901.html
- https://markinton.com/trademark/loveseat-86801245
- https://seeita.com/tf/BrowserFeatures.shtml
- https://sourceforge.net/projects/tenfoot/
- https://ubergizmo.com/2010/05/clicker-tv-unveiled-by-clicker-for-tv-browsing
- https://www.wikiwand.com/en/articles/Wayfinder

## 2026-11-18: build a browser, not a set of apps

Andrew proposed a TV browser with a generic navigation system plus per-site
profiles, with Tropic Video as one profile. The agent had suggested building
the engine first and holding back the "browser" label, citing KDE's Aura
Browser, the scope of a browser, security upkeep and discovery. Andrew chose
to build the browser. The earlier plan of separately named apps per service
(Steamboat, Sapling TV) is superseded: each becomes a profile and a web-app
entry. Those names are not used unless Andrew revives them.

Prior art noted: KDE's Aura Browser (virtual cursor and tabs, re-released
2026-11-11); TV Bro on Android TV; the historical Ten Foot Browser.
