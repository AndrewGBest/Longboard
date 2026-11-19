# Generic-mode scorecard

What happens on a fixed list of public websites with no profile. The list is
in `test/scorecard/sites.json`; the run is `xvfb-run -a npm run scorecard`.

**What this measures and what it does not.** A script opens each site in the
real app (always with `--automation`), presses the same twelve arrow keys
(and, since 2026-11-19, Tab: see "The referee"),
and records what it can see: whether a highlight appears, whether each press
moved it or scrolled the page, how long the app took to deal with each key,
and whether pointer mode comes up. It cannot tell whether the highlight went
somewhere *sensible*, or whether the site is pleasant to use from a couch.
That still needs a person with a remote, and has not been done.

## The referee (added 2026-11-19)

The run now also presses Tab through each page, up to 150 times, and
compares where the engine's own Tab order stopped with what the highlight
can reach (`src/layer/diagnostics/referee.ts`). The engine decides what a
page declares as a control, so a Tab stop the highlight cannot reach is a
fault in Longboard. It is a check on *what can be selected*, not on whether
the arrows get there in a sensible order.

- **Tab stops reached**: of the stops a person could see when the count was
  made (not smaller than 10 pixels, not hidden, not parked far to one
  side), how many the highlight reaches: the stop itself, something inside
  it, something that holds it, or something in the same place.
- **Tab stops missed**: the rest, by kind of element. The aim is none.
- **Targets Tab never stops at**: what the highlight reaches beyond the
  stops counted. On a page with more than 150 stops this is mostly the rest
  of the page and means little.

**Does it catch what it is for?** With the two faults Andrew found on a
search engine's results put back for one run, it reported 14 links missed
on that page; with the fixes, none of 85.

## 2026-11-19, fourth run, with the referee

After the changes to movement made that day (STATUS.md). First the table as
first measured, then what was done about it.

| Site | Kind | Loaded | First press lands on | Presses that moved or scrolled (of 12) | Highlight left off screen | Key press, median / worst (ms) | Elements | Pointer mode | Tab stops reached | Tab stops missed | Targets Tab never stops at |
|---|---|---|---|---|---|---|---|---|---|---|---|
| example.com | one link | yes | a | 2 | 2 | 1 / 7 | 23 | yes | 1 of 1 | - | 0 |
| en.wikipedia.org | long article | yes | a | 11 | 0 | 27 / 182 | 11812 | yes | 146 of 150 | 4 a | 2892 |
| news.ycombinator.com | dense list of links | yes | a | 11 | 0 | 8 / 20 | 815 | yes | 150 of 150 | - | 79 |
| www.bbc.com | news front page | yes | a | 11 | 0 | 3 / 22 | 1407 | yes | 75 of 75 | - | 18 |
| developer.mozilla.org | documentation | yes | nothing | 9 | 0 | 5 / 17 | 1573 | yes | 127 of 127 | - | 0 |
| github.com | web app | yes | a | 12 | 0 | 7 / 42 | 1833 | yes | 108 of 108 | - | 0 |
| archive.org | grid of cards | yes | nothing | 2 | 0 | 5 / 16 | 73 | yes | 12 of 12 | - | 76 |
| duckduckgo.com | search form | yes | button | 11 | 4 | 4 / 27 | 1678 | yes | 127 of 138 | 11 a | 6 |
| www.youtube.com | video site | yes | button | 7 | 0 | 4 / 20 | 2011 | yes | 12 of 12 | - | 0 |
| www.openstreetmap.org | map | yes | button | 9 | 0 | 3 / 10 | 503 | yes | 34 of 35 | 1 a | 0 |

What the three sets of misses were:

- **en.wikipedia.org and www.openstreetmap.org: a real fault, fixed.** A
  link that runs on from one line of text to the next has a box round both
  lines, which takes in the other links on them; it was taken for a
  backdrop and dropped. Such a link is now never a backdrop. Run again:
  194 of 194 (with 200 presses) and 35 of 35.
- **duckduckgo.com: the referee's mistake, corrected.** The eleven were
  slides of a carousel several thousand pixels off to one side, which
  nobody could see when the count was made and which Longboard leaves out
  on purpose until they come near. The referee now leaves them out too.
  Run again: 127 of 127.

Not looked into: archive.org moved on only 2 presses of 12 and showed no
highlight after the first press (it had 7 in earlier runs; the page has 73
elements at that moment, so it may not have finished building itself), and
duckduckgo.com left the highlight off screen 4 times.

## 2026-11-18, third run (commit e52c2af)

After the fixes from the two reviews. Every count is the same as in the
second run below, bar one press on www.bbc.com (9, was 10), so the table is
not repeated. Two runs agreeing makes it more likely that the differences
between the first and second runs came from changes here (the held-key and
scrolling changes are the candidates) than from the sites, but nobody has
looked at which.

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

## The survey

`test/scorecard/survey.mjs` is a wider and rougher look: 63 well-known
sites (`test/scorecard/survey-sites.json`), each checked for the faults a
script can see. It is for finding faults, not for scoring. STATUS.md of
2026-11-20 has what the first two runs found.

```
xvfb-run -a -s "-screen 0 1920x1080x24" node test/scorecard/survey.mjs --out=results.jsonl
```

