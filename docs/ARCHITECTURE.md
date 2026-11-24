# Longboard: architecture

Labels as in DESIGN.md. Sections 2 to 5, 8 and 10 describe what is built
(roadmap phases 0 to 3); sections 6 and 7 are still design. `docs/STATUS.md`
says what has been checked and how.

## 1. Shape

```
+--------------------------------------------------------------+
| Shell (main process)                                         |
|  windows, sessions, permissions, updates, launcher entries   |
|  profile store, catalogue fetcher, ad-block engine           |
+-------------------+----------------------+-------------------+
| Chrome views      | Page view            | Platform layer    |
|  Home, menu,      |  the website, in a   |  everything that  |
|  keyboard, editor |  sandboxed renderer  |  differs per OS   |
+-------------------+----------+-----------+-------------------+
                               |
                    +----------v-----------+
                    | Layer (preload,      |
                    | isolated world)      |
                    |  navigation engine   |
                    |  profile interpreter |
                    |  generic mode        |
                    |  pointer, player     |
                    +----------------------+
```

## 2. The shell

**castLabs Electron (ECS), as in Tropic Video.** It is Electron with the
Widevine component, so protected video plays through the browser's standard
interface with the unmodified module. castLabs publishes builds for Linux x64
and arm64, Windows and macOS, and follows upstream closely: 45.2.1 on
5 November 2026 [Sourced: castLabs releases].

Carried over from Tropic Video and kept:

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`;
- nothing exposed to the page through `contextBridge`;
- one function is run in the page's own world, on Linux only: it corrects
  the engine's wrong answer that it can play AC-3 and E-AC-3 sound
  (`src/shared/audio-truth.ts`; a stopgap until the engine is fixed), and
  another, on every system, makes it say no to picture sizes and frame
  rates it cannot play (`src/shared/video-truth.ts`);
- the user agent is Chromium's own, without the toolkit's tokens and with
  `Longboard/<version>` at the end; for a site
  whose profile says `view.device: "tv"` Longboard instead says the engine
  TV apps run on, with itself as the device (`src/main/useragent.ts`, Hard rule 3).

These match Electron's own security checklist [Sourced: Electron].

**What changes for a general browser.** Tropic Video only loads one service's
domains. Longboard loads anything, so the allowlist is replaced by:

- a permission policy: nothing given by default. Full screen is allowed;
  camera, microphone, location, notifications, clipboard reading, MIDI and
  pointer lock are asked about per site with a TV-friendly question and the
  answer kept; everything else is refused. The decision is a pure function;
- downloads asked about one at a time and saved to the Downloads folder.
  While the question is up the file goes on arriving under a random name in
  `downloads-waiting/` in Longboard's data folder; agreed to, it is moved to
  the Downloads folder when whole, and refused, it is deleted;
- `file:` and other local schemes blocked in the page view;
- pop-ups open in the same view;
- certificate errors cannot be clicked through;
- a commitment to ship each new ECS stable release promptly, checked by a
  scheduled job. This is the main ongoing cost of being a browser.

Longboard has no Safe Browsing service. That is a real gap compared with
mainstream browsers and is stated in the README of the first release.

### 2.1 How the shell's code is laid out

`src/main/index.ts` starts the app: it reads the command line and the
settings, sets up the profile store, ad blocking and updates, and calls
`createBrowser` (`src/main/browser.ts`) to make the window.

The browser is **one object built from parts**. Each file in
`src/main/browser/` is a part: one subject, written as a function that
takes the shared `core` object and returns what it adds to it. The file
begins with an interface listing exactly that, so the top of each file is
its table of contents. `core.ts` puts the interfaces together as one type.

| Part | Subject |
|---|---|
| `shell.ts` | The window, its views, and Home's lists on disk |
| `state.ts` | What is on screen and what is waiting for an answer |
| `lock.ts` | The parental lock and its PIN |
| `text-entry.ts` | Saved sign-ins, typing from a phone, speech |
| `chrome-state.ts` | What Longboard's own screens are told to show |
| `hand-back.ts` | The question on screen; handing an account back to another program |
| `layout.ts` | Where the views sit, the loading cover, notices, zoom |
| `going-places.ts` | Home, tabs, Back, and pages arriving, failing or trying to leave |
| `standstill.ts` | Freezing pages that are not in front |
| `pointer-mode.ts` | The on-screen pointer |
| `keys.ts` | Which keys the shell answers itself |
| `away.ts` | Losing the screen to another program and getting it back |
| `permissions.ts` | Asking before a site gets a permission |
| `privacy.ts` | Ad blocking, identity, privacy signals, extensions |
| `downloads.ts` | Downloads |
| `layer-messages.ts` | Messages from the layer in the page |
| `frames.ts` | Frames inside a page |
| `profile-editor.ts` | Making a profile by pointing |
| `icons.ts` | Site icons for Home |
| `apps.ts` | Sites added as apps |
| `menu.ts` | What the menu's and Settings' entries do |
| `chrome-messages.ts` | Messages from Longboard's own screens |

Two things to know before changing a part:

- **The parts are built in the order `createBrowser` lists them**, and a
  part's set-up code may use only what the parts above it made. Once the
  app is running any part may call any other through `core`.
- **A part holds wiring, not decisions.** Whether a request is refused,
  where a download is saved, what a key means: those are pure functions in
  `src/shared/` (or beside the part in `src/main/`), with unit tests. If a
  part is growing an `if` that decides behaviour, move it out and test it.

The parts were one long function until 2026-11-24 and were separated
without changing what runs, so they still share more through `core` than
a fresh design would. Narrowing what each part needs is welcome work.

## 3. The layer

The layer runs in the preload's isolated world, in the top frame of the page
view. It is Tropic Video's layer, generalised:

| Part | Job | Comes from |
|---|---|---|
| Navigation engine | geometry scoring, rows, focus memory | Tropic Video, with its tests |
| Profile interpreter | reads a validated profile, feeds the engine | new |
| Generic mode | finds targets on unknown pages | new, built on the engine |
| Pointer | on-screen cursor, synthesised pointer events | new |
| Player | detects full-screen video, sends ordinary keys | Tropic Video |
| Outline | structure-only page dump for evidence and bug reports | Tropic Video |
| Guard | blocks purchase controls during automated runs | Tropic Video |

The layer never calls the site's player directly and never rewrites the page.
It draws its own highlight in a closed shadow root and sends ordinary input.

Frames: the layer starts in the top frame. An embedded frame gets a layer of
its own the first time the highlight is sent into it (OK on the frame, or an
arrow with nowhere to go on a large one): it moves the highlight there and
hands back at its edges, and has no keyboard, menu or pointer of its own
(DECISIONS.md, 2026-11-21). A frame with nothing to select is handled by
pointer mode.

### 3.1 How the layer's code is laid out

`startLayer` (`src/layer/index.ts`) is built the same way as the browser
(section 2.1): parts in `src/layer/parts/`, each one subject, sharing one
`core` object.

| Part | Subject |
|---|---|
| `page.ts` | The page as the layer sees it: its player, the overlay, the navigator |
| `moving.ts` | The arrows: moving the highlight, hover menus, scrolling |
| `frames.ts` | Handing the highlight into a frame and taking it back |
| `keyboard.ts` | The on-screen keyboard |
| `page-keys.ts` | Keys given to the page and its player |
| `dialogs.ts` | Pop-ups and dialogs |
| `player-controls.ts` | A playing video's controls |
| `back.ts` | What Back closes, in order |
| `search.ts` | Finding the site's search field |
| `dispatch.ts` | What each action from the remote does |
| `input.ts` | Listening to keys, focus and the mouse |

The folders beside it hold what the parts use and what can be tested on
its own: `spatial/` (which element an arrow leads to: the navigator, and
beside it what counts as visible, as a dialog, as a control, and how lists
scroll), `profile/` (reading
a profile's rules), `generic/`, `input/` (keys and controllers to
actions), `guard/`, `edit/`, `diagnostics/`, `ui/` (the highlight and the
keyboard as drawn).

## 4. Chrome views

Home, the menu, the on-screen keyboard and the profile editor are Longboard's
own page, served from an address of Longboard's own (`longboard://screens/`,
answered only in that view's session) in a separate view from the website.
They use the same navigation engine, so Longboard's own interface is the first
and best-tested user of it.

The code is `src/chrome/`: `index.ts` listens to the shell and starts the
layer; `screens/render.ts` draws whichever screen the state calls for;
each screen is a function in `screens/` (`home.ts`, `menu.ts`,
`settings.ts` with its pages in `screens/settings/`, `site-panels.ts`,
`panels.ts`) that returns the elements to show; `screens/ui.ts` holds what they share; `parts.ts` has the pieces
they are built from (rows, switches, icons). How they look is
`chrome.html`. The shell sends one state object (`src/shared/chrome.ts`)
and the screens send back messages; nothing else crosses.

## 5. Profiles in the shell

- **Store:** local, imported, catalogue and built-in profiles on disk, each
  validated against the schema when loaded.
- **Matcher:** given an address, returns the profile to use by the priority
  in PROFILES.md.
- **Catalogue fetcher:** background download of the index, checksum
  verification, atomic replace. Failure leaves the previous copy in place.
- The shell hands the layer a validated, frozen copy of the matched profile
  at page start. The page cannot see or change it.

## 6. Ad blocking

`src/main/adblock.ts` is the only module that may touch a website's
requests, and refusing one is all it can do. `scripts/check-rules.mjs`
enforces both halves: no request handler anywhere else, and nothing in that
module that redirects, rewrites or injects.

- **Matching** is done by the request matcher of Ghostery's adblocker
  library (MPL-2.0) [Sourced: its package]. Only its core is used. Its
  ready-made Electron wrapper also injects scripts and styles and adds
  headers, which Hard rule 5 forbids, so it is not a dependency.
- **What is read from a list:** network filters and their exceptions. Hiding
  (cosmetic) filters, scriptlets, HTML filtering and header filters are
  dropped when the list is read. A filter that would swap a response for a
  stand-in is treated as a plain refusal.
- **What is never refused:** the page the person asked for (the top-level
  document), and any request that does not come from a website view.
- **The decision** "is blocking on for the site in front?" is the pure
  function `blockingOn` in `src/shared/adblock.ts`: the person's saved
  choice for the site if there is one, otherwise off for verified sites and
  on for the rest (DESIGN.md section 5). It is asked for every request.
- **The verified sites** come from the catalogue index once it has been
  fetched. Until then a copy that ships with Longboard
  (`profiles/verified-sites.json`) is used, so a verified site never starts
  with blocking on.
- **The lists** are fetched in the background from their publishers, whole,
  with no cookies, every four days, into `filters/` in the data folder:
  EasyList unless `"filterLists"` in `config.json` names others. They are
  never in the repository or a package. Until a list has arrived nothing is
  refused, and the menu says so. `"adBlocking": false` leaves the whole
  feature out. A scripted run fetches no list unless given one with
  `--filters=`.

### 6.1 The one thing added to requests

`src/main/signals.ts` adds the `DNT` and `Sec-GPC` headers when the person
turns "ask sites not to track" on (shared/privacy.ts, DECISIONS.md
2026-11-18). It is the only module that touches request headers, and a unit test holds
it to those two. Nothing reads or changes a reply anywhere.

### 6.2 Reader view, the parental lock

Reader view: the page's layer reads the article's text (`src/layer/reader.ts`)
and sends it to the shell, which checks it (`src/shared/reader.ts`) and has
Longboard's own screen draw it. The page is only read.

The parental lock: `lock.json` holds a salted hash of the PIN
(`src/main/lock.ts`). The rules are pure (`src/shared/lock.ts`); "only the
sites on Home" is one more reason in `blockReason` (`src/main/navigation.ts`),
so it is applied wherever a page view is about to go anywhere.

## 7. Web apps

An app entry is a small record: address, name, icon taken from the site,
whether it has its own session. Launching `longboard --app=<id>` opens that
site directly. Launcher entries for the desktop are written by the platform
layer.

## 8. Portability **[Decision, 2026-11-18]**

Linux x86_64 only at first, built so other systems can follow:

- everything OS-specific sits behind `src/platform/` (paths, launcher
  entries, power management, packaging hooks);
- no Linux-only assumptions in the layer or the chrome views;
- packaging config kept per target;
- CI builds one target now; the matrix is where others get added.

castLabs already ships the other targets, including Linux arm64 [Sourced].
Whether protected video actually plays on each is unverified.

## 9. Layout of the repository

| Path | What |
|---|---|
| `src/main/` | Shell: starting up, sessions, the profile store, ad blocking, updates |
| `src/main/browser/` | The window and everything in it, in parts (section 2.1) |
| `src/preload/` | Boots the layer in the isolated world |
| `src/layer/` | Navigation engine, profile interpreter, generic mode, pointer, player |
| `src/chrome/` | Home, menu, keyboard, editor |
| `src/platform/` | Per-OS code |
| `src/shared/` | Types and the profile schema |
| `profiles/` | Built-in profiles and the template |
| `test/` | Unit tests, invented fixture pages, end-to-end harness |
| `scripts/` | Build and rule checks |
| `docs/` | These documents |

## 10. Testing

- **Unit tests first** for geometry, input mapping, profile validation and
  matching, the ad-block decision and the outline sanitiser.
- **Fixture pages** are invented layouts that stand in for kinds of site: a
  grid of cards, a long article, a form, a video page, a page with pop-ups.
- **End to end:** the real app driven over the DevTools protocol against the
  fixtures, as Tropic Video does now.
- **Generic mode scorecard:** a fixed list of real public sites tried by
  hand each release, with what worked recorded in STATUS.md. Generic mode is
  the part most likely to disappoint, so it gets measured.

## Sources

- castLabs Electron releases: https://github.com/castlabs/electron-releases/releases
- Electron security tutorial: https://electronjs.org/docs/latest/tutorial/security
- Ghostery adblocker: https://github.com/ghostery/adblocker

Handing something back to another program (`src/main/handback.ts`): started
with `--hand-back=<name> --hand-back-to=<file>`, the shell opens the named
site's own sign-in page, learns who is signed in by fetching the site's
front page from the main process with the page's session (nothing is put
into the page), asks the person, and only on a yes fetches the one thing
named and writes it to the file. The names are a list in that module; a
program cannot name an address, a page or a cookie.
