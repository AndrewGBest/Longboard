# Decisions

Newest first. Each entry says who decided and why, so a later session does not
re-argue it without new information.

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
| Search engine | DuckDuckGo (`https://duckduckgo.com/?q=%s`), changeable with `"search"` in config.json | Something has to be the default, and one that does not need an account or build a profile of the person fits principle 7. No arrangement with them exists; it is an ordinary link |
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
