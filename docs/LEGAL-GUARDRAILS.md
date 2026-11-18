# Longboard: guardrails and why

Not legal advice. These are the lines the project has chosen to stay behind,
most of them inherited from Tropic Video, with the reasoning for each. The
short form is the Hard rules list in [CLAUDE.md](../CLAUDE.md).

| Rule | Why |
|---|---|
| No third-party material in the repo | Copying a service's code, artwork, fonts or text is the plainest copyright problem a project like this can have. The Widevine module is never committed or bundled; the shell fetches it the normal way |
| DRM is left alone | Circumventing access controls is unlawful in many places regardless of intent. Longboard uses the standard interface with the unmodified module and never works around a quality or output limit |
| Honest identity | Claiming to be a TV, console or another system to get service not offered to a Linux browser is misrepresentation, and usually the first step of a DRM workaround |
| Streaming services are not altered | No ad skipping, no region workarounds, no rewriting their pages or responses. This is what keeps Longboard a browser showing a site, not a modified client |
| Ad blocking is a per-site switch with careful defaults | See below |
| No trademarks in names, icons or artwork | Profile names may say which site they are for in plain text. Launcher entries use the site's own icon as served to the user's machine, never one stored in the repo |
| Profiles are data | A profile that could run code would make the catalogue a way to attack users. Data-only profiles can be reviewed by reading them |
| Selectors come from evidence | Keeps profiles honest and reviewable, and keeps guesses out |
| No reverse engineering of services' apps | The only inputs are pages served to a signed-in browser |
| Credentials are the user's business | Sign-in happens on the site's own page. Longboard never reads, logs or stores passwords or codes. Nothing from a signed-in session is ever committed |
| Automation never spends money | Agent- or script-driven runs use the automation flag, which blocks purchase and sign-up controls |
| Privacy by default | No telemetry. Outlines contain structure only. The two background downloads (profile index, filter lists) are disclosed |
| Least privilege in the shell | Sandboxed, isolated pages; nothing exposed to them |

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
