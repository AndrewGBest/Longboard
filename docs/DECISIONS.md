# Decisions

Newest first. Each entry says who decided and why, so a later session does not
re-argue it without new information.

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
