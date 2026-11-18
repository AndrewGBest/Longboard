# Generic-mode scorecard

What happens on a fixed list of public websites with no profile. The list is
in `test/scorecard/sites.json`; the run is `xvfb-run -a npm run scorecard`.

**What this measures and what it does not.** A script opens each site in the
real app (always with `--automation`), presses the same twelve arrow keys,
and records what it can see: whether a highlight appears, whether each press
moved it or scrolled the page, how long the app took to deal with each key,
and whether pointer mode comes up. It cannot tell whether the highlight went
somewhere *sensible*, or whether the site is pleasant to use from a couch.
That still needs a person with a remote, and has not been done.

## 2026-11-18, second run (commit 388f736)

Same machine and settings, after the changes to held keys, profiles that
change with the address, and downloads. Every site still loads, gets a
highlight and has pointer mode. Some counts moved, in both directions
(github.com 12 to 9 presses that moved or scrolled, www.youtube.com 7 to 5,
developer.mozilla.org 9 to 12 with the highlight twice left off screen).
**Not known** whether that is the sites serving different pages (the element
counts changed on five of them) or the changes here: one run each is not
enough to tell, and nobody looked at the screens.

| Site | Kind | Loaded | First press lands on | Presses that moved or scrolled (of 12) | Highlight left off screen | Key press, median / worst (ms) | Elements | Pointer mode |
|---|---|---|---|---|---|---|---|---|
| example.com | one link | yes | a | 2 | 2 | 2 / 7 | 23 | yes |
| en.wikipedia.org | long article | yes | a | 12 | 0 | 29 / 152 | 11812 | yes |
| news.ycombinator.com | dense list of links | yes | a | 12 | 0 | 7 / 26 | 811 | yes |
| www.bbc.com | news front page | yes | a | 10 | 0 | 6 / 23 | 1389 | yes |
| developer.mozilla.org | documentation | yes | a | 12 | 2 | 5 / 18 | 1573 | yes |
| github.com | web app | yes | a | 9 | 0 | 11 / 44 | 1794 | yes |
| archive.org | grid of cards | yes | nothing | 7 | 0 | 5 / 18 | 72 | yes |
| duckduckgo.com | search form | yes | a | 11 | 3 | 5 / 29 | 1705 | yes |
| www.youtube.com | video site | yes | button | 5 | 0 | 4 / 22 | 1952 | yes |
| www.openstreetmap.org | map | yes | a | 10 | 0 | 3 / 10 | 503 | yes |

## 2026-11-18, first run

Run headless on a 4-core virtual machine with no graphics chip, in a
1920x1080 window drawn at the 960x540 TV scale. Not a TV box: the timings are
for comparing runs, not for judging the 50 ms target in DESIGN.md section 9.

| Site | Kind | Loaded | First press lands on | Presses that moved or scrolled (of 12) | Highlight left off screen | Key press, median / worst (ms) | Elements | Pointer mode |
|---|---|---|---|---|---|---|---|---|
| example.com | one link | yes | a | 2 | 2 | 2 / 8 | 23 | yes |
| en.wikipedia.org | long article | yes | a | 12 | 0 | 30 / 184 | 11812 | yes |
| news.ycombinator.com | dense list of links | yes | a | 12 | 0 | 7 / 28 | 815 | yes |
| www.bbc.com | news front page | yes | a | 11 | 0 | 4 / 23 | 1398 | yes |
| developer.mozilla.org | documentation | yes | nothing | 9 | 0 | 5 / 19 | 1573 | yes |
| github.com | web app | yes | a | 12 | 0 | 7 / 46 | 1727 | yes |
| archive.org | grid of cards | yes | nothing | 7 | 0 | 5 / 25 | 72 | yes |
| duckduckgo.com | search form | yes | button | 11 | 4 | 5 / 31 | 1678 | yes |
| www.youtube.com | video site | yes | button | 7 | 0 | 4 / 25 | 2007 | yes |
| www.openstreetmap.org | map | yes | a | 10 | 0 | 3 / 13 | 503 | yes |

Reading the columns:

- **First press lands on** is the kind of element, never its text. "nothing"
  means the first press scrolled the page toward content below the screen
  instead of jumping to it.
- **Highlight left off screen** counts presses after which the highlighted
  element was not in view when looked at 0.7 s later. On the one-link page
  that is by design (Up scrolled back to the top of the text, away from the
  only link). On the search page it was the page still sliding to its place.
- **Worst key press** is the first one on each page, which includes the one
  look for clickable-looking elements that is otherwise done in idle time.

What the agent saw in the pictures it took of each run (not kept: a picture
of a site is that site's material): the highlight was visible and on a real
control on every site; text was readable at the TV scale; sites switched to
their narrow layouts at 960 pixels wide, as expected.

What changed because of this run:

- The on-screen keyboard used to open whenever a text field got the
  highlight or the page focused one. Two of the ten sites put the cursor in
  their search box as they load, and greeted the visitor with a keyboard over
  half the page. It now opens on OK (DECISIONS.md).
- A key press on the 12,000-element article took about 90 ms. Looking for
  clickable-looking elements was moved out of the key press into idle time,
  and two all-pairs comparisons were replaced; it now takes about 30 ms.

Known and not fixed:

- Sites at 960 pixels wide often show their phone or tablet layout, with
  navigation folded into a menu button. That is the site's choice for that
  width; the per-site zoom in the menu changes it.
- Nothing here was tried signed in, and nothing was played.
