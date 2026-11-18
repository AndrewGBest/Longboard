# Status

Update this at the end of every working session.

## 2026-11-18: project started, documents only

- Andrew decided to build a TV browser with generic navigation and per-site
  profiles, named it Longboard and created the repository.
- An interview in chat settled the main choices; they are in DECISIONS.md,
  with the two assumptions the agent made where questions were skipped.
- Written: README, CLAUDE.md, CONTRIBUTING, and docs for design,
  architecture, profiles, guardrails, roadmap and decisions.

- Later the same day: ad blocking became a per-site switch with a reviewed
  verified-sites list; profiles are CC0-1.0; the profiles repository
  `AndrewGBest/Longboard-Profiles` was created and given a skeleton
  (validator, index builder, template, the verified list with the two sites
  Andrew named).

**Verified:** in this repository, nothing: no code exists and every behaviour
in the documents is intended, not observed. In the profiles repository, the
validator was run locally against a good profile and a deliberately bad one
and accepted and rejected them as expected; its GitHub workflow has not been
seen to run.

**Unverified and worth checking early:**
- that Tropic Video's code moves over with its tests passing (phase 0);
- that a launcher entry can be created from inside a Flatpak;
- that the ad-block library's licence and the filter lists' licences allow
  shipping with a GPL-3.0 app;
- the two live LONGBOARD trademark records.

**Open questions for Andrew:**
- Keep or drop the agent's addition that sites with protected playback start
  with ad blocking off even when not yet verified.

**Next:** phase 0 of the roadmap.
