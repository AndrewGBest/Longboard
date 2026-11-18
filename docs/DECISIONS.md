# Decisions

Newest first. Each entry says who decided and why, so a later session does not
re-argue it without new information.

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
