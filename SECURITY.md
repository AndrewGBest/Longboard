# Security

Longboard is a web browser, so a flaw in it can put the people using it at
risk. Reports are welcome and taken seriously.

## Reporting a problem

Please report privately, not in a public issue:
[open a private advisory](https://github.com/AndrewGBest/Longboard/security/advisories/new)
on GitHub. Say what you found, how to make it happen, and which version and
package you used.

This is a spare-time project with one maintainer. There is no bounty and no
promised response time; expect an answer within about a week.

## Which versions get fixes

Only the latest release. An AppImage looks for new releases daily and
installs them unless that is switched off in Settings; other packages are
updated by hand.

## What to know about the state of things

Said plainly, so nobody has to find out the hard way:

- **Releases are not signed.** GitHub shows a SHA-256 digest beside each
  file on the release page, and the updater in the AppImage checks the
  file it downloads against that digest before using it.
- **There is no Safe Browsing.** Nothing warns about known phishing or
  malware sites.
- **The engine comes from castLabs' build of Electron**, which follows
  Chromium's stable releases. Longboard moves to each stable release
  promptly, but there is a gap between a Chromium fix and a Longboard
  release carrying it.
- Pages run sandboxed, with context isolation, no Node integration and no
  interface from Longboard exposed to them. Permissions are refused unless
  the person says yes for that site. Certificate errors cannot be clicked
  through.

Flaws in Chromium itself are best reported to the Chromium project; flaws
in a website are that website's.
