# Longboard profiles

A profile tells Longboard how one website is laid out, so the highlight moves
the way a person expects. This document is the draft of format version 1.
Nothing here is implemented yet.

## 1. Rules of the format

- **Data only [Decision, 2026-11-18].** A version 1 profile is a JSON file of
  selectors, names and numbers. It cannot contain code. Longboard rejects a
  file with keys it does not know, so nothing can be smuggled in.
- **Room for scripts later [Decision, 2026-11-18].** The format carries a
  version number and reserves the key `scripts`. A later version may allow
  reviewed scripts with their own permission prompt. Version 1 refuses any
  file that has that key.
- **Evidence, not memory.** A selector goes into a reviewed profile only if a
  page outline from the live site shows it. This is Tropic Video's rule 7.
- **Works without it.** Removing a profile must leave the site usable in
  generic mode.

## 2. What a profile can say

```json
{
  "longboard": 1,
  "id": "example-video",
  "name": "Example Video",
  "version": "1.0.0",
  "authors": ["someone"],
  "licence": "CC0-1.0",

  "match": {
    "hosts": ["example.com", "*.example.com"],
    "paths": ["/"]
  },

  "view": {
    "canvas": "960x540",
    "safeMargin": 0.05
  },

  "focus": {
    "include": ["a.card", "button.play"],
    "exclude": [".cookie-banner a"],
    "initial": "a.card",
    "groups": [
      { "name": "row", "selector": ".carousel", "axis": "horizontal", "remember": true },
      { "name": "menu", "selector": "nav.main", "axis": "vertical" }
    ]
  },

  "player": {
    "container": ".player",
    "controls": ".player .controls button",
    "keys": {
      "playPause": "Space",
      "back": "ArrowLeft",
      "forward": "ArrowRight"
    }
  },

  "text": { "search": "input[type=search]" },

  "dismiss": [".modal .close"],

  "evidence": { "outline": "outlines/example-video-2026-11-18.json" }
}
```

| Key | Meaning |
|---|---|
| `longboard` | Format version. Required |
| `id`, `name`, `version`, `authors`, `licence` | Identity. `id` is unique in the catalogue |
| `match.hosts`, `match.paths` | Which pages the profile applies to. Hosts are exact names or a leading `*.` only |
| `view` | Logical canvas and the margin kept clear at the edges |
| `focus.include` / `exclude` | Elements that can or cannot take the highlight, added to what generic mode finds |
| `focus.initial` | Where the highlight starts |
| `focus.groups` | Containers treated as a row, column or grid; `remember` returns to the last item when you come back |
| `player` | Where the video and its controls are, and which ordinary key presses the site's own player understands |
| `text` | Fields that should open the on-screen keyboard |
| `dismiss` | Close buttons that Back should press first |
| `evidence` | The outline file that shows the selectors exist |

What a profile cannot do, by design: run code, rewrite the page's requests or
content, read what is typed, block or skip ads, press anything by itself, or
change what the site's player does. It only tells Longboard where things are.
The person still presses every button.

## 3. Where profiles come from

Four sources, highest priority first **[Assumption, 2026-11-18]**:

1. **Local:** made or edited on this machine.
2. **Imported:** a file someone gave you. Unreviewed; asks before first use.
3. **Catalogue:** reviewed profiles downloaded from the shared repository.
   Applied automatically.
4. **Built in:** a small set shipped with the app so it works offline.

## 4. The shared catalogue **[Decision, 2026-11-18]**

A separate GitHub repository: `AndrewGBest/Longboard-Profiles`.

- One folder per profile: the JSON file, the outline that is its evidence,
  and a short note on what was tested.
- People contribute by pull request. An automatic check validates each
  file's shape and rejects unknown keys and scripts. Comparing selectors with
  the outline, and checking outlines for text, names or IDs, is done by the
  reviewer until the outline format is fixed and those checks can be
  automated.
- A maintainer reviews and merges. A script builds an index file listing
  every profile with a checksum, plus the verified sites. Publishing that
  index where Longboard can fetch it is not set up yet.
- Longboard downloads the index in the background, at most once a day, and
  checks each profile against its checksum before using it.
- No accounts, no server to run, no upload from the TV.

Privacy note: fetching the index tells GitHub the machine's network address,
as any download does. It sends nothing about which sites are visited, because
the whole index is fetched, not individual profiles on demand.

### The verified-sites list

The same repository holds `verified-sites.json`: websites a person has
reviewed and found to carry non-malicious advertising. Ad blocking starts off
on them (DESIGN.md section 5). It is a plain list of domains with who
reviewed each and when, changed by pull request. It is separate from
profiles; a profile says nothing about ads.

## 5. Files by hand **[Decision, 2026-11-18]**

- **Export:** any profile can be saved as a single
  `name.longboard-profile.json` file.
- **Import:** from a file on disk or a USB stick. Longboard shows the sites
  it matches, validates it, and asks before using it.

An imported file goes through the same validation as a catalogue profile. The
difference is only that nobody reviewed it.

## 6. Making a profile

Until the on-TV editor exists (roadmap phase 4):

1. Open the site in Longboard and press the key that saves a page outline.
2. Copy `profiles/template.json`, fill in `match` and the selectors you see
   in the outline.
3. Put the file in the local profiles folder and reload the site.
4. When it works, export it or open a pull request on the catalogue.

Catalogue profiles are free for anyone to reuse: CC0-1.0 **[Decision,
2026-11-18]**.

## 7. Open questions

- How a profile declares that it supersedes an older `id`.
- Whether Tropic Video's adapter file maps onto this format without loss.
  It is the first profile to convert and will test the format.
