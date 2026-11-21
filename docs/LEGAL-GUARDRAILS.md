# Longboard: guardrails and why

Not legal advice. These are the lines the project has chosen to stay behind,
with the reasoning for each. Longboard began from Tropic Video, a client for
streaming sites, and several rules came from there; they were gone over on
2026-11-18 for what Longboard now is, a general web browser for a TV, and
Andrew removed one and changed two (DECISIONS.md). The short form is the Hard
rules list in [CLAUDE.md](../CLAUDE.md); the numbers match.

| # | Rule | Why, for a browser |
|---|---|---|
| 1 | No third-party material in the repo or the packages (reworded 2026-11-19 to say what is fetched at run time) | Copying a site's code, artwork, fonts or text is the plainest copyright problem a project like this can have. Open-source libraries are used as ordinary dependencies, each with its licence recorded in DECISIONS.md; filter lists and the Widevine module are fetched by each copy and never committed or bundled |
| 2 | DRM is left alone | Circumventing access controls is unlawful in many places regardless of intent. Longboard uses the standard interface with the unmodified module and never works around a quality or output limit |
| 3 | Honest identity | Claiming to be another browser, another system or another maker's TV or console to get service not offered to this one is misrepresentation, and usually the first step of a DRM workaround. The cost is accepted: some sites treat a Linux browser worse. "Desktop site" changes only the width a site is given. **Amended by Andrew, 2026-11-21:** saying that Longboard is running as a TV is not a misrepresentation, because it is one. For a site whose profile says `view.device: "tv"`, Longboard adds that one statement after its unchanged identity (real engine, real version, real system, its own name; no other maker, model or serial). Limits that stay: one fixed wording set in the code, no identity from a profile or from the person, and never as a way past DRM, payment, region or resolution limits. **Not legal advice, and a risk that is accepted:** a site's terms may still say its TV interface is only for its own apps or certified devices, and a site can stop serving it to Longboard at any time. **Amended again by Andrew, 2026-11-21:** Longboard's own name and version are part of the identity, to every site. Until then the name was taken out so that Longboard looked like any Chromium; that is the opposite of what the search company's published guidance for browsers asks ("identify itself clearly in its User-Agent", "not use another browser's User-Agent string"), and its sign-in refused the nameless identity and accepted the named one. The cost, accepted: any site can tell a Longboard user from other people, and a site may treat an unfamiliar name worse |
| 4 | *Removed* | It said streaming services were not altered: no rewriting of responses, headers or scripts on any site, no region workarounds, and no direct control of a site's video. It was written for a streaming client. A browser legitimately does things it forbade (sending Do Not Track, showing a reader view), so Andrew removed it. What still holds is in the note below |
| 5 | Ad blocking is the person's to control, with careful defaults (reworded 2026-11-19 to name the settings for every site) | See below |
| 6 | No trademarks in names, icons or artwork | Profile names and settings may name a site in plain text. Tiles and launcher entries use the site's own icon as served to the person's machine, never one stored in the repo |
| 7 | Profiles are data | A profile that could run code would make the catalogue a way to attack users. Data-only profiles can be reviewed by reading them |
| 8 | Selectors come from evidence | Keeps profiles honest and reviewable, and keeps guesses out |
| 9 | No reverse engineering of services' apps | The only inputs are pages served to a browser |
| 10 | Credentials are the user's business | An agent or script never types, reads or handles passwords or codes; they are never logged; nothing from a signed-in session is committed. Changed 2026-11-18: Longboard may keep a password when the person asks, encrypted with the system's keyring, on the machine only. Built 2026-11-19: kept only when asked, only with a real keyring, filled only on a press, never in a scripted run |
| 11 | Automation never spends money | Agent- or script-driven runs use the automation flag, which blocks purchase and sign-up controls |
| 12 | Privacy by default | No telemetry. Changed 2026-11-18 from a fixed list of two background requests to a test every such request must pass: disclosed in Settings, can be turned off there, added only by a recorded decision. Today there are six of Longboard's own (the profile index, the filter lists, the check for a new version, the check for newer versions of extensions when any are installed, search suggestions, which are off unless turned on, and the speech model, fetched once and only when agreed to) and one the engine makes that cannot be turned off (the Widevine component) |
| 13 | Least privilege in the shell | Sandboxed, isolated pages; nothing exposed to them (an extension the person added runs in the pages it asked for, as extensions do; its interfaces exist only in its own pages and workers); no way past a certificate error. Stricter than mainstream browsers on the last point, on purpose |
| 14 | Stay current | A browser on an old engine is unsafe. The project updates the engine promptly, and each copy looks for a new release daily and, as an AppImage, installs it |

## With rule 4 gone

Removing the rule did not change what Longboard does. As of 2026-11-18 it
still changes no response, puts no script or style into a page, and sends a
site's player ordinary key presses rather than driving its video directly.
Those are now how it is built, not promises, and changing any of them is an
ordinary recorded decision.

What remains forbidden, by the rules that are left:

- Anything touching DRM, including getting round a quality or output limit (rule 2).
- Claiming to be another device, system or browser (rule 3).
- Skipping or hiding advertising inside a video stream, and defeating a
  site's detection of ad blocking (rule 5).

What no rule forbids any longer (confirmed by Andrew, 2026-11-19: "Now that
rule 4 is gone they aren't forbidden"): region or VPN workarounds, and
changing pages on sites, within rules 2, 3 and 5. Neither has been built;
each would be an ordinary recorded decision.

## Ad blocking

Andrew's decisions (2026-11-18). This is where Longboard departs from Tropic
Video's rules, so the scope is written down carefully.

- **Every site has a switch.** The person can turn blocking on or off for
  any site, including streaming services.
- **Starts off on verified sites:** websites reviewed by a person and listed
  as having non-malicious advertising. Prime Video and YouTube are Andrew's
  examples.
- **Starts on everywhere else.**
- **Longboard never flips the switch by itself.**
- **The person can set it for all sites at once** (Andrew, 2026-11-18): on
  everywhere, ignoring the list of sites where it starts off, or off
  everywhere. They can also edit that list for themselves. Longboard ships
  with neither: the starting positions above are what a new copy does.
- **Trackers too, when asked** (Andrew, 2026-11-18): a setting adds the
  public EasyPrivacy list. It works by the same per-site switch, so it is
  off wherever ad blocking is off.
- **What it is:** refusing network requests that match public filter lists,
  as many browsers do. As built: only requests are refused. Nothing on a
  page is hidden, no script is put into a page, no response or header is
  changed, and nothing is served in place of what was refused.
- **The lists are not Longboard's and are not shipped.** Each copy
  downloads EasyList from its authors (dual licensed GPL-3.0-or-later and
  CC BY-SA 3.0-or-later; https://easylist.to/pages/licence.html). The
  matching code is Ghostery's adblocker library, MPL-2.0, which Mozilla's
  FAQ says may be combined into a GPL work
  (https://www.mozilla.org/en-US/MPL/2.0/FAQ/). Both are named in the README.
- **What it is not:** skipping, hiding or shortening advertising that is part
  of a video stream, or defeating a site's detection of blocking. Those stay
  forbidden whatever the switch says.

Risk, in the agent's judgment **[Guess]**: letting a person switch blocking
on for a paid, DRM-protected service is the part most likely to draw a
complaint from a service. The agent recommended locking it off there; Andrew
chose a switch that starts off. What keeps the project's own conduct
defensible is that the default respects those sites and the choice to change
it is the person's.

## The name

"Longboard" was chosen on 2026-11-18 after a first screen only. Third-party
trademark listings show a cancelled LONGBOARD registration for telecom
software and at least two live LONGBOARD registrations whose goods the agent
could not read. Before a public release: look both up on the USPTO register,
search the Canadian register, and be ready to rename. Sources are in
DECISIONS.md.

## The notice

Shown on the About panel and in the README of every release, word for word
(a test compares them):

> Longboard is an independent project. It is not affiliated with any website or
> streaming service it can display. It does not provide, unlock or bypass access
> to any content and does not remove or work around DRM.

## Rights holders

If you represent a rights holder and have a concern, open an issue on the
repository and it will be addressed promptly.
