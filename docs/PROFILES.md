# Longboard profiles

A profile tells Longboard how one website is laid out, so the highlight moves
the way a person expects. This document describes format version 1 as it is
implemented. What is enforced is `src/shared/profile.ts`; if the two ever
disagree, the code is right and this document needs fixing.

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
    "safeMargin": 0.05,
    "device": "tv",
    "entry": "/tv",
    "carry": ["v"]
  },

  "focus": {
    "include": ["a.card", "button.play"],
    "exclude": [".cookie-banner"],
    "initial": "a.card",
    "groups": [
      { "name": "row", "selector": ".carousel", "axis": "horizontal", "remember": true },
      { "name": "menu", "selector": "nav.main", "axis": "vertical" }
    ],
    "scrollPrevious": ["button.carousel-left"],
    "scrollNext": ["button.carousel-right"]
  },

  "player": {
    "container": ".player",
    "controls": ".player .controls button",
    "close": ".player .close",
    "keys": {
      "playPause": "Space",
      "back": "ArrowLeft",
      "forward": "ArrowRight"
    }
  },

  "text": {
    "search": "input[type=search]",
    "searchOpen": "button.show-search"
  },

  "dismiss": [".modal .close"],

  "guard": { "purchase": [".buy-button"] },

  "evidence": { "outline": "outline.txt" }
}
```

Only `longboard`, the identity fields, `match` and `evidence` are required.

| Key | Meaning |
|---|---|
| `longboard` | Format version. Must be 1 |
| `id`, `name`, `version`, `authors`, `licence` | Identity. `id` is lower-case words joined by hyphens and is unique in the catalogue. `version` looks like 1.0.0. `licence` is CC0-1.0 |
| `match.hosts` | Which sites the profile applies to. Exact domain names, or a leading `*.` for everything under one. No addresses, ports or wildcards elsewhere |
| `match.paths` | Optional. The profile applies only to addresses under one of these paths, by whole path segments. When two profiles from the same source fit, the longer path wins |
| `view.canvas` | The size the site is drawn at before being scaled to the screen. 960x540 without it |
| `view.safeMargin` | The share of the screen kept clear at every edge, 0 to 0.15, for TVs that cut the edges of the picture off. The site is drawn in a smaller rectangle in the middle |
| `view.named` | Only `false`, and not together with `view.device`. The site turns Longboard away for the name at the end of what it says it is. For the pages the profile matches, Longboard leaves its name out and says only what the engine in it says. Nothing can be put in the name's place (Hard rule 3). Use it only with a source or a test showing the name is the reason |
| `view.device` | Only `"tv"`. The site has an interface made for TVs and gives it to devices that say they are one. For the pages the profile matches, Longboard adds to its usual identity that it is Longboard running as a TV (one fixed wording, set in Longboard, Hard rule 3), and the site answers the remote itself: the arrows, OK, the media keys, and Back when pressed as Escape or Backspace go to the site as they are, and Longboard's highlight stays out. The menu, the pointer and the on-screen keyboard are still Longboard's, and Up pressed again where the app has nowhere further up opens the menu, as on any site |
| `view.entry` | A plain path on the site, such as `/tv`: where the site's interface for this kind of device lives. Every address of the profile's hosts that is not already inside the profile's own pages (`match.paths`) is opened there instead, however it was reached: typed, from Home, a link, the site's own redirect. The person gets the site in the form the profile is for and never the other one, unless they switch the profile off for the site (the site menu, "Use this site's profile"). Only this profile's own entry, and only when it is the profile in use there. Never another site |
| `view.carry` | With `view.entry`: the names of query parameters the other interface understands, such as `["v"]`. Their values are copied from the address that was asked for; nothing else of it is kept. Only names shown to work on the live site belong here |
| `focus.include` | Elements that can take the highlight, added to what Longboard finds itself |
| `focus.exclude` | Elements that never take it, nor anything inside them |
| `focus.initial` | Where the highlight starts on a page |
| `focus.groups` | Containers treated as a row (`horizontal`), a column (`vertical`) or a `grid`. Movement along a group stays in it while it has a member that way, and left and right never leave a row. `remember` returns to the member last used when the highlight comes back |
| `focus.scrollPrevious`, `focus.scrollNext` | A row's own arrows. Never highlighted; pressed for the person when left or right runs out |
| `player.container` | What the site's player lives in. A video inside it that fills half the screen counts as being watched |
| `player.controls` | The player's own controls, when Longboard does not find them itself |
| `player.close` | The player's close button, which Back presses |
| `player.keys` | Which ordinary keys the site's player answers to. Only these can be named: Space, Enter, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, k, j, l, f, m |
| `text.search` | The search field, for the search key |
| `text.searchOpen` | A control that reveals the search field when it is hidden |
| `dismiss` | Close buttons that Back presses first |
| `guard.purchase` | Controls that buy, rent or subscribe. Only used when Longboard is driven by a script (`--automation`), which then never presses them, whatever they say |
| `evidence.outline` | The outline file, next to the profile, that shows the selectors exist |

A file with a key not in this table is refused whole, and so is one with a
`scripts` key. A selector is at most 300 characters and a list at most 50
entries. A selector the browser cannot parse is dropped, never a reason to
fail.

What a profile cannot do, by design: run code, rewrite the page's requests or
content, say what Longboard calls itself (it can say `"tv"` and Longboard
chooses the words, or ask for Longboard's name to be left out), read what is typed, block or skip ads, press anything by itself, send the person to another site, or
change what the site's player does. It only tells Longboard where things are.
The person still presses every button: a row's arrow is pressed when the
person presses left or right at the row's end, and a close button when they
press Back.

## 3. Where profiles come from

Four sources, highest priority first **[Assumption, 2026-11-18]**:

1. **Local:** made or edited on this machine. `profiles/*.json` in the data
   folder.
2. **Imported:** a file someone gave you. Unreviewed; Longboard asks before
   first use, says what the profile is and which sites it applies to, and
   remembers the answer. A new version of the same profile is asked about
   again. Until there is an answer the reviewed profile, if any, is used.
3. **Catalogue:** reviewed profiles downloaded from the shared repository.
   Applied automatically.
4. **Built in:** a small set shipped with the app so it works offline.

The data folder is `~/.config/Longboard` on Linux.

## 4. The shared catalogue **[Decision, 2026-11-18]**

A separate GitHub repository: `AndrewGBest/Longboard-Profiles`.

- One folder per site, named after its main domain: `profile.json`,
  `outline.txt` (the evidence) and `NOTES.md` (what was tested).
- People contribute by pull request. An automatic check validates each
  file's shape and rejects unknown keys and scripts. Comparing selectors with
  the outline, and checking outlines for text, names or IDs, is done by the
  reviewer until the outline format is fixed and those checks can be
  automated.
- A maintainer reviews and merges. A script builds `index.json` at the top of
  the repository: every profile with the SHA-256 of its file, plus the
  verified sites. The repository's check fails if the index is out of date.
- Longboard downloads that index from GitHub's raw file address in the
  background, at most once a day, then each profile it lists, and checks
  each against its checksum before keeping it. A profile that fails its
  checksum or the format check is left out. If anything goes wrong the copy
  already on disk stays as it was.
- `"catalogue": false` in `config.json` switches the download off.
- No accounts, no server to run, no upload from the TV.

Privacy note: fetching the index tells GitHub the machine's network address,
as any download does. It sends nothing about which sites are visited, because
the whole index is fetched, not individual profiles on demand.

### The verified-sites list

The same repository holds `verified-sites.json`: websites a person has
reviewed and found to carry non-malicious advertising. Ad blocking starts off
on them (DESIGN.md section 5). It is a plain list of domains with who
reviewed each and when, changed by pull request. It is separate from
profiles; a profile says nothing about ads. A copy of the list ships with
Longboard (`profiles/verified-sites.json` in the application repository) for
the time before the catalogue has been fetched; keep the two in step.

## 5. Files by hand **[Decision, 2026-11-18]**

- **Export:** the menu's "Export this profile" writes the profile in use as
  `<id>.longboard-profile.json` in the data folder's `exports` folder and
  says where it went.
- **Import:** the menu's "Import profiles from USB" looks at the top of every
  USB stick or card that is plugged in, and in the data folder's `import`
  folder, for files named `*.longboard-profile.json`. Valid ones are copied
  in. The next time a site one of them applies to is opened, Longboard says
  what the profile is and which sites it applies to, and asks.

An imported file goes through the same validation as a catalogue profile. The
difference is only that nobody reviewed it.

## 6. Making a profile

### On the TV

The menu's "Make a profile for this site" (or "Edit the profile for this
site") starts a small editor:

1. An on-screen pointer appears. Move it onto something and press OK.
2. A panel says what was picked, as the kind of thing it is, and how many of
   them are on the page; each one gets a dashed box. "Wider" and "Narrower"
   step out to what holds it and back.
3. Mark it: **can be selected**, **never select**, **this is a row**, or
   **this is the player**. Choosing a mark again takes it off. The page is
   driven by your choices at once, so you can try them.
4. Back returns to pointing. "Save and finish" writes the profile to the
   data folder's `profiles` folder, with an outline of the page beside it.

The editor writes only those four things. The rest of the format is written
by hand, and the file it saves is an ordinary profile you can open and
change.

### By hand

1. Open the site in Longboard and choose "Save page outline" in the menu
   (or press Ctrl+Shift+D). The outline is written to the data folder's
   `diagnostics` folder. It holds structure only; look at it anyway.
2. Copy `profiles/template.json`, fill in `match` and the selectors you see
   in the outline. Delete the keys you do not need.
3. Put the file in the data folder's `profiles` folder and open the site
   again. A file Longboard cannot use is named in the terminal with the
   reason.
4. When it works, export it or open a pull request on the catalogue.

Catalogue profiles are free for anyone to reuse: CC0-1.0 **[Decision,
2026-11-18]**.

## 7. Open questions

- How a profile declares that it supersedes an older `id`.
- Whether a profile should be chosen again when a site changes its address
  without loading a new page. Today the choice is made when a page loads.

Answered by the first conversion (2026-11-18): Tropic Video's adapter maps
onto the format without loss, once the format gained `focus.scrollPrevious`
and `focus.scrollNext`, `text.searchOpen`, `player.close` and
`guard.purchase`. See `profiles/primevideo.com/NOTES.md`.
