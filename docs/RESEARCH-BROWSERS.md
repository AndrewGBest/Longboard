# TV browser UX research: guidelines and browser comparison

Compiled 2026-11-19 from vendor/primary pages only. Evidence grades:
- **[F]** = page fetched and the claim read from its text.
- **[S]** = claim taken from a search-result extract of the official page at that URL (page itself not readable by the fetcher, usually JS or bot-blocked). Re-check before quoting verbatim.
- **not confirmed** = no primary source found/readable; do not cite.

Pages that could not be read directly: support.mozilla.org (all articles, client challenge), support.brave.app (403), support.xbox.com (JS only), amazon.com help (503; an Amazon-hosted mirror was readable), Google Play listings (JS), developer.vewd.com (connection refused).

---

## Part 1 - TV design guidelines

### 1.1 Android TV / Google TV

| Topic | Rule / number | G | Source |
|---|---|---|---|
| Design canvas | "Always design at MDPI resolution at 960px * 540px. At MDPI 1px = 1dp." Assets target 1080p. TVs are fixed 16:9. | F | https://developer.android.com/design/ui/tv/guides/styles/layouts |
| Overscan margin (principle text) | "position the elements with a 5% margin of 48dp on the left and right sides, and 27dp on the top and bottom" | F | https://developer.android.com/design/ui/tv/guides/styles/layouts |
| Overscan margin (layout section) | "use a 5% margin layout (58dp on the sides and 28dp on the top and bottom edges)". NOTE: the same page gives both 48/27 and 58/28; the 12-column grid uses 58dp side margins. Page also notes "Most modern TVs no longer have overscan issues." | F | https://developer.android.com/design/ui/tv/guides/styles/layouts |
| Backgrounds | "Don't adjust or clip background screen elements to the overscan safe area"; let backgrounds fill the full screen. | F | https://developer.android.com/design/ui/tv/guides/styles/layouts |
| Grid | 12 columns, 52dp wide, 20dp gutters, 58dp side margins, 4dp vertical spacing unit. | F | https://developer.android.com/design/ui/tv/guides/styles/layouts |
| Card widths | 1-up 844dp, 2-up 412dp, 3-up 268dp, 4-up 196dp, 5-up 124dp. | F | https://developer.android.com/design/ui/tv/guides/styles/layouts |
| Grid spacing | "consider the padding between items and the size increase of focused states" to prevent overlap. | F | https://developer.android.com/design/ui/tv/guides/styles/layouts |
| Layout advice | Give each axis one purpose; avoid too many panes ("cognitive overload"); focus path follows reading order. Templates include left/right/centre/bottom overlays. | F | https://developer.android.com/design/ui/tv/guides/styles/layouts |
| Typography | Larger type for distance viewing; default typeface Roboto; sans-serif for body/labels; avoid thin and decorative fonts; 15-style type scale (display/headline/title/body/label). | F | https://developer.android.com/design/ui/tv/guides/styles/typography |
| Minimum text size (sp) | **not confirmed** - the type scale numbers are in an image only; no minimum sp is stated in page text. The older training/tv layouts page now redirects to Compose docs with no numbers. | - | https://developer.android.com/design/ui/tv/guides/styles/typography |
| Focus: one at a time | "At any given time, users should be able to focus on only one focusable element." States: default, focused, pressed (+ enabled/disabled/selected). | F | https://developer.android.com/design/ui/tv/guides/styles/focus-system |
| Focus: scale | "Default scaling values are: 1.025, 1.05 and 1.1x"; value varies with element size. | F | https://developer.android.com/design/ui/tv/guides/styles/focus-system |
| Focus: glow/elevation | Glow level "ranging from 2dp - 32dp"; glow colour from image or brand. | F | https://developer.android.com/design/ui/tv/guides/styles/focus-system |
| Focus: outline | Outline width, inset (gap between element and outline), colour. No numeric width given. | F | https://developer.android.com/design/ui/tv/guides/styles/focus-system |
| Focus: colour | Change background (surface) colour and content colour; tonal elevation levels +1 to +5; mix scale/border/glow/colour per context. | F | https://developer.android.com/design/ui/tv/guides/styles/focus-system |
| Colour | Material colour roles; "Build from dark themes, to create cinematic experiences." No contrast ratio stated on the page. | F | https://developer.android.com/design/ui/tv/guides/styles/color-system |
| Text scaling | Apps "should respect the user's preference for text scaling"; layouts must still fit at larger scales. No contrast ratio stated. | F | https://developer.android.com/training/tv/accessibility |
| D-pad | "The D-pad moves focus from one element to the nearest element in the corresponding direction." All focusable elements reachable; direction predictable; up/down scroll whole lists. | F | https://developer.android.com/design/ui/tv/guides/foundations/navigation-on-tv |
| Select | "Selects the on-screen item with focus. Press and hold can be used to show more options." | F | https://developer.android.com/design/ui/tv/guides/foundations/navigation-on-tv |
| Back | Back goes to previous destination; repeated Back must end at the launcher; with top nav, Back first scrolls to top and focuses the menu; with left nav, Back opens the side menu. | F | https://developer.android.com/design/ui/tv/guides/foundations/navigation-on-tv |
| Back: no gating | "Avoid exit gating. Users should be able to exit out of the app without any confirmation." No infinite loops. | F | https://developer.android.com/design/ui/tv/guides/foundations/navigation-on-tv |
| No on-screen Back | "Avoid showing a back button on the screen." Show a Cancel button only if the visible actions are confirming/destructive/purchase. | F | https://developer.android.com/design/ui/tv/guides/foundations/navigation-on-tv |
| Reachability | "If there isn't a straight path to get to a control, consider relocating it." Avoid nested hierarchies. | F | https://developer.android.com/design/ui/tv/guides/foundations/navigation-on-tv |

### 1.2 Apple tvOS (Human Interface Guidelines)

| Topic | Rule / number | G | Source |
|---|---|---|---|
| Viewing distance | People are "often 8 feet or more" from the TV; UI must be "clear, legible, and captivating from across the room". | F | https://developer.apple.com/design/human-interface-guidelines/designing-for-tvos |
| Safe area | "Inset primary content 60 points from the top and bottom of the screen, and 80 points from the sides." | F | https://developer.apple.com/design/human-interface-guidelines/layout |
| Grids | Horizontal spacing 40pt, minimum vertical spacing 100pt. Unfocused content width: 2-col 860, 3-col 560, 4-col 410, 5-col 320, 6-col 260, 7-col 217, 8-col 184, 9-col 160 pt. | F | https://developer.apple.com/design/human-interface-guidelines/layout |
| Spacing | "Include appropriate padding between focusable elements" (focused items grow); partially hidden content should look symmetrical. | F | https://developer.apple.com/design/human-interface-guidelines/layout |
| Text size | tvOS default 29pt, minimum 23pt. | F | https://developer.apple.com/design/human-interface-guidelines/typography |
| Text styles (pt size/leading) | Title 1 76/96, Title 2 57/66, Title 3 48/56, Headline 38/46, Subtitle 1 38/46, Callout 31/38, Body 29/36, Caption 1 25/32, Caption 2 23/30. Font SF Pro; weights Medium (Bold when emphasised). | F | https://developer.apple.com/design/human-interface-guidelines/typography |
| Focus model | "tvOS uses directional focus"; "make sure that people can bring focus to every element". | F | https://developer.apple.com/design/human-interface-guidelines/focus-and-selection |
| Focus look | Focused item stands out "through elevation to the foreground, illumination, and animation"; parallax for depth; focus "often increases its scale" so supply larger assets and avoid crowding. | F | https://developer.apple.com/design/human-interface-guidelines/focus-and-selection |
| States | Up to five visually distinct states: unfocused, focused, highlighted, selected, unavailable. | F | https://developer.apple.com/design/human-interface-guidelines/focus-and-selection |
| Pointer | "Avoid displaying a pointer." "People expect to navigate a fixed number of items by changing focus, not by trying to drag a tiny pointer around a huge screen." If required, make it "highly visible". | F | https://developer.apple.com/design/human-interface-guidelines/focus-and-selection |
| Focus stability | "Avoid changing focus without people's interaction." Use a focus ring for text/search fields, a highlight in lists/collections. Prefer system focus effects. | F | https://developer.apple.com/design/human-interface-guidelines/focus-and-selection |

(Apple pages are JS-rendered; text was read from the page's own data feed, e.g. https://developer.apple.com/tutorials/data/design/human-interface-guidelines/layout.json.)

### 1.3 Amazon Fire TV

| Topic | Rule / number | G | Source |
|---|---|---|---|
| Safe zone | "avoid placing any of your app's UI elements within the outer 5% of any edge"; focused items and text "fully within the inner 90% (the safe zone)". | F | https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html |
| Text size | Body text "at least 14sp, which is approximately 19px on 720p, 28px on 1080p". Minimise the amount of text. | F | https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html |
| Resolution | 1080p = 1920x1080px at 320dpi (xhdpi); logical 960x540dp. | F | https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html |
| Colour | "use less saturated colors"; "Cool colors (blue, purple, gray) work better than warmer colors (red, orange)." | F | https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html |
| Focus | "Your app should clearly indicate which on-screen element currently has the focus"; on Select the element "should momentarily change to the selected state". | F | https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html |
| Navigation | "every actionable on-screen element should be reachable with the D-pad"; up/down between rows, left/right within a row; focusing a text field opens the system keyboard. | F | https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html |
| Remote: Home | Returns to Home; system event, cannot be intercepted. | F | https://developer.amazon.com/docs/fire-tv/remote-input.html |
| Remote: Back | "Return the user to the previous operation or screen." | F | https://developer.amazon.com/docs/fire-tv/remote-input.html |
| Remote: Menu | "Invoke the Android context menu" (options menu). | F | https://developer.amazon.com/docs/fire-tv/remote-input.html |
| Remote: Select / D-pad | Select activates the focused item; D-pad moves focus. | F | https://developer.amazon.com/docs/fire-tv/remote-input.html |
| Remote: media keys | Play/Pause toggle, Rewind, Fast Forward; may be absent on some remotes, so D-pad alternatives are advised. | F | https://developer.amazon.com/docs/fire-tv/remote-input.html |
| Remote: Voice | Invokes system voice search; cannot be intercepted; absent on some remotes. | F | https://developer.amazon.com/docs/fire-tv/remote-input.html |
| No pointer events | "None of the Amazon Fire TV remotes raises motion events." | F | https://developer.amazon.com/docs/fire-tv/remote-input.html |

### 1.4 W3C WCAG 2.2 contrast

| Criterion | Number | G | Source |
|---|---|---|---|
| 1.4.3 Contrast (Minimum), AA | Text: at least 4.5:1. Large text (at least 18pt, or 14pt bold; about 24px / 18.5px CSS): at least 3:1. | F | https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html |
| 1.4.11 Non-text Contrast, AA | UI components, their states and focus indicators: at least 3:1 against adjacent colours (inactive components exempt). | F | https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html |

WCAG sizes are defined for desktop viewing; no W3C page mapping them to 10-foot viewing was found (**not confirmed**). The platform minimums above (tvOS 23pt, Fire TV 14sp = 28px at 1080p) are the TV-specific numbers.

### 1.5 Cross-platform summary (derived from the rows above)

| | Android TV | tvOS | Fire TV |
|---|---|---|---|
| Canvas | 960x540dp | (not stated on page) | 960x540dp |
| Safe margin | 5%: 48 or 58dp sides, 27/28dp top-bottom | 80pt sides, 60pt top-bottom | 5% each edge |
| Min body text | not confirmed | 23pt min, 29pt default | 14sp (28px at 1080p) |
| Focus | scale 1.025-1.1, glow 2-32dp, outline, colour | elevation, illumination, scale, parallax | "clearly indicate", selected state flash |
| Pointer | not discussed | avoid | remotes emit no motion events |

---

## Part 2 - TV and console browsers

### 2.1 Amazon Silk (Fire TV)

| Aspect | Finding | G | Source |
|---|---|---|---|
| Engine | "Silk is built on the Chromium Project". | F | https://docs.aws.amazon.com/silk/latest/developerguide/what-is-silk.html |
| Navigation model | Cursor: the directional pad moves a cursor; centre button selects icons or text fields. | F | https://digprjsurvey.amazon.com/csad/help/node/TZ6CJ7nVQJW26yiItl (mirror of https://www.amazon.com/gp/help/customer/display.html?nodeId=TZ6CJ7nVQJW26yiItl) |
| Keyboard | Arrow keys move the cursor, Enter selects; "Press F to fast forward, R to rewind, M to open the menu, and Esc to go back." | F | same |
| Address bar | "Select the address bar to enter a web address or search term using the Fire TV keyboard." | F | same |
| Toolbar | Back, Forward, Refresh, bookmark add/remove, desktop/mobile layout switch, Menu. | F | same |
| Private mode | "Enter Private Browsing to have any pages you visit removed from your history after you close the private browsing tab"; downloads and bookmarks kept. | F | same |
| Bookmarks / home | Bookmarks and trending videos on the home screen. | F | https://docs.aws.amazon.com/silk/latest/developerguide/what-is-silk.html |
| History | Browsing History list; revisit or delete some or all. "Clear History and Data" clears history, most visited, cookies, cache. | F | https://digprjsurvey.amazon.com/csad/help/node/T0KC6MtUZYTMa4X1U0 (mirror of nodeId=T0KC6MtUZYTMa4X1U0) |
| Cursor settings | "Change your cursor speed or your scrolling speed." | F | same |
| Other settings | Peek Row (Silk shortcuts on Fire TV home), Customize the Menu (choose/reorder rows), Calibrate Screen Size, Passwords, Privacy and security, Accessibility, Parental controls, Site settings, Help and Support. | F | same |
| Voice | "Just Say 'Alexa, open Amazon Silk'"; "control videos and music with Alexa". Voice text entry: not confirmed. | F | https://docs.aws.amazon.com/silk/latest/developerguide/what-is-silk.html |
| Tabs, zoom, ad blocking, loading indicator, first-run help | **not confirmed** (not on the readable pages; an in-browser "Help and Support" entry exists). | - | - |

### 2.2 Samsung Internet for TV (Tizen)

| Aspect | Finding | G | Source |
|---|---|---|---|
| Launch / navigation | Home > Internet app; "Use the directional buttons on your remote to move around the screen." | F | https://www.samsung.com/us/support/answer/ANS10005237/ |
| Start page | "You can select from Featured, Most visited, and Bookmarks, or enter a URL or keyword to search". | F | same |
| Tabs | "open multiple tabs just like you would on a traditional browser". | F | same |
| Pointer vs link mode (older F-series) | Starts in pointer browsing; a "Link browsing" icon at upper right switches to "selecting link by link". | F | https://www.samsung.com/in/support/tv-audio-video/how-to-turn-on-link-browsing-in-samsung-f-series-smart-tv/ |
| Mouse / keyboard | "Connected mice will only work in the Internet app"; right-click offers "Open, Open in a New Tab or Enable Scroll Mode"; Page Up/Down scroll. | F | https://www.samsung.com/in/support/tv-audio-video/how-to-connect-a-keyboard-or-mouse-in-samsung-smart-tv/ |
| History, private mode, zoom, ad blocking, voice, keyboard layout, loading indicator, onboarding | **not confirmed** (the model e-manuals are PDFs not located). | - | - |

### 2.3 LG webOS web browser

| Aspect | Finding | G | Source |
|---|---|---|---|
| Top bar | Back, Refresh, address bar ("entering its URL or a keyword"), Favorites/settings, Exit. | F | https://www.lg.com/us/support/help-library/lg-tv-how-to-use-the-web-browser--20153257222107 |
| "More" menu | Zoom in/out; Block Ads (only when "Use Ad Blocker" is on); TV View (split screen with live TV); History (view or delete); Add to Bookmarks; Bookmarks; Settings; User Guide; Close App. | F | same |
| In-app help | A "User Guide" entry lives in the menu. | F | same |
| Pointer vs arrows (platform) | Magic Remote pointer mode behaves like a mouse; pressing an arrow key switches to 5-way mode (cursor hidden); shaking the remote returns to pointer mode; apps "MUST also support 5-way mode". | F | https://webostv.developer.lge.com/develop/guides/magic-remote |
| Key codes (platform) | Left 37, Up 38, Right 39, Down 40, OK 13, Back 461. | F | same |
| Tabs, private browsing, voice, keyboard layout, loading indicator | **not confirmed** on the readable pages. | - | - |

### 2.4 Microsoft Edge on Xbox

| Aspect | Finding | G | Source |
|---|---|---|---|
| Navigation model | Controller-driven cursor (stick moves cursor, A selects/highlights); hold Menu to "switch between your gamepad and mouse". | F | https://www.microsoft.com/en-us/edge/learning-center/how-to-use-microsoft-edge-on-xbox |
| Address bar | View button: "open the address bar". | F | same |
| Tabs | X: "open a new tab"; RB next tab; LB previous tab. | F | same |
| Back | B: "return to the previous page". | F | same |
| History | Y: "To view your history, use the Y button." | F | same |
| Scroll / zoom | Left stick scrolls; right stick zooms. | F | same |
| Mouse and keyboard | USB mouse/keyboard supported; keyboard shortcuts work as on a PC. | F | same |
| Sync | Profile picture > "Turn on Sync"; history, favourites, passwords and more. | F | same |
| Xbox support article | Exists but JS-only, body not readable. | - | https://support.xbox.com/en-US/help/hardware-network/console/use-microsoft-edge-on-xbox |
| Private mode, ad blocking, voice, keyboard layout, loading indicator, onboarding | **not confirmed**. | - | - |

### 2.5 Steam Big Picture / Steam Deck browser

| Aspect | Finding | G | Source |
|---|---|---|---|
| Navigation model | "The world's first first person web browser": reticle-based navigation (a crosshair cursor), driven by controller. | F | https://store.steampowered.com/bigpicture |
| Tabs / favourites | Tabs and cloud-synced favourites. | F | same |
| Text entry | Daisywheel controller keyboard ("QWERTY is for keyboards. Daisywheel is for controllers."). This page describes the original Big Picture; the current Steam Deck UI keyboard is **not confirmed** from an official page. | F | same |
| Controller mapping, history, private mode, zoom, ad blocking, voice, current Steam Deck Game Mode browser details | **not confirmed** - only community forum posts were found, which are not primary sources. | - | - |

### 2.6 TV Bro (open source, Android TV)

| Aspect | Finding | G | Source |
|---|---|---|---|
| Positioning | "Simple web browser optimized to use with TV remote". | F | https://github.com/truefedex/tv-bro |
| Features (README) | Tabs and bookmarks; voice search; switch user agent; built-in download manager; browsing history; shortcuts; Android WebView engine. | F | https://github.com/truefedex/tv-bro |
| Navigation model | Cursor; "Cursor speed ... is now configurable" (v2.1.4); "Direct navigation mode (activated by new contextual menu)" and "Contextual menu on long press" (v2.1.4). | F | https://github.com/truefedex/tv-bro/releases |
| Ad blocking | "New ad blocker optimized for TV" (v3.0.5); ad-block list configurable (v2.1.4); popup blocking. | F | https://github.com/truefedex/tv-bro/releases |
| Private mode | Incognito mode exists (v1.8.5: "Do not log temporary history in incognito mode"). | F | https://github.com/truefedex/tv-bro/releases |
| Engine choice | GeckoView added in v2.0.0; split into a separate app variant in v3.0.5; WebView recommended for weaker devices. | F | https://github.com/truefedex/tv-bro/releases |
| Zoom, keyboard layout, loading indicator, onboarding | **not confirmed**. | - | - |

### 2.7 Puffin TV

| Aspect | Finding | G | Source |
|---|---|---|---|
| Positioning | "Puffin TV Browser removes the traditional web browser UI for a fully-immersive TV experience"; "Optimized for Android TV". | F | https://www.puffin.com/tv-browser |
| Phone companion | "Send URLs from your phone to your TV fast"; save pages as channels. | F | https://www.puffin.com/tv-browser |
| Remote app | Companion app offers a digital D-pad or touchpad for the home page and browser menu. | S | https://play.google.com/store/apps/details?id=com.cloudmosa.puffintvcontroller |
| Cloud rendering, subscription, tabs, history, private, zoom, ad blocking, voice | **not confirmed** for the TV product. | - | - |

### 2.8 Vewd (formerly Opera TV) browser

| Aspect | Finding | G | Source |
|---|---|---|---|
| Navigation model | "'Virtual mouse' navigation and on-screen keyboard". | F | https://business.tivo.com/products-solutions/smart-tv/vewd-browser |
| Tabs / speed dial | "Full-screen tabbed browsing"; speed dial; bookmarks and history. | F | same |
| Private / zoom | "Supports 'incognito mode' or private mode, and page zoom." | F | same |
| Spatial navigation | Vewd documents spatial (arrow-key) navigation and CSS nav-up/left/right hints for TV pages. | S | https://developer.vewd.com/display/OTV/Tweaking+Spatial+Navigation+for+TV+Browsing |
| Ad blocking, voice, loading indicator, onboarding | **not confirmed**. | - | - |

### 2.9 TV browser matrix (confirmed items only; blank = not confirmed)

| | Silk | Samsung | LG | Xbox Edge | Steam BP | TV Bro | Puffin TV | Vewd |
|---|---|---|---|---|---|---|---|---|
| Pointing model | cursor | arrows; pointer/link modes on older sets | pointer + 5-way | cursor | reticle | cursor + direct mode | D-pad/touchpad app | virtual mouse (+ spatial) |
| Address bar reach | select bar with cursor | start page field | top bar | View button | | | phone sends URL | |
| Tabs | | yes | | yes (X, LB/RB) | yes | yes | | yes |
| Bookmarks/home tiles | yes | Featured / Most visited / Bookmarks | Favorites | synced favourites | synced favourites | yes + shortcuts | "channels" | speed dial + bookmarks |
| History | yes, per-item delete | | view/delete | Y button | | yes | | yes |
| Private mode | yes | | | | | incognito | | yes |
| Zoom | | | yes | right stick | | | | yes |
| Ad blocking | | | optional | | | yes | | |
| Voice | Alexa launch/media | | | | | voice search | | |
| Cursor speed setting | yes | | | | | yes | | |
| In-app help | Help and Support | | User Guide | | | | | |

No vendor page describing a loading indicator or first-run onboarding was found for any of the eight (**not confirmed** across the board).

---

## Part 3 - Desktop majors

### 3.1 Shortcut pages

| Browser | Vendor shortcut page | Readable? |
|---|---|---|
| Chrome | https://support.google.com/chrome/answer/157179 | F |
| Firefox | https://support.mozilla.org/en-US/kb/keyboard-shortcuts-perform-firefox-tasks-quickly | S only |
| Safari | https://support.apple.com/guide/safari/keyboard-and-other-shortcuts-cpsh003/mac | F |
| Edge | https://support.microsoft.com/en-us/microsoft-edge/keyboard-shortcuts-in-microsoft-edge-50d3edab-30d9-c7e4-21ce-37fe2713cfad | F |
| Brave | https://support.brave.app/hc/en-us/articles/360032272171-What-keyboard-shortcuts-can-I-use-in-Brave | no (403) |
| Vivaldi | https://help.vivaldi.com/desktop/shortcuts/keyboard-shortcuts/ | F, but lists no defaults; says shortcuts are customisable in Settings > Keyboard |

### 3.2 Standard shortcuts (Windows/Linux; Safari column is macOS)

| Shortcut | Chrome [F] | Edge [F] | Firefox | Safari [F] |
|---|---|---|---|---|
| Ctrl+L | focus address bar | select address bar | focus address bar [S] | Cmd-L |
| Ctrl+T | new tab | new tab | not confirmed | not listed on page |
| Ctrl+W | close tab | close tab | not confirmed | Cmd-W |
| Ctrl+Shift+T | reopen closed tabs, most recent first | reopen last closed tab | reopen last closed tab/window; restores previous session if none [S] | Shift-Cmd-T |
| Ctrl+R / F5 | reload | refresh | not confirmed | not listed on page |
| Esc | stop loading | stop loading / close dialog | not confirmed | not listed on page |
| Ctrl+F | find bar | find on page | not confirmed | Cmd-F |
| Ctrl+H | History page in new tab | history | History sidebar; Ctrl+Shift+H opens Library [S] | not listed on page |
| Ctrl+J | Downloads page in new tab | downloads | not confirmed | not listed on page |
| Ctrl+D | bookmark page | add favourite | not confirmed | not listed on page |
| Alt+Left / Alt+Right | back / forward | back / forward | not confirmed | Cmd-[ / Cmd-] |
| Ctrl+Tab | next tab | next tab | not confirmed | Ctrl-Tab |
| Ctrl + / - / 0 | zoom in / out / reset | zoom in / out / reset | Ctrl+0 resets zoom [S]; +/- not confirmed | Cmd-+ / Cmd-- ; reset not listed |
| F11 | full screen | full screen | not confirmed | not listed on page |
| Private window | Ctrl+Shift+N | Ctrl+Shift+N | Ctrl+Shift+P [S] | not listed on page |
| Reader | Alt+Shift+R (reading mode) | F9 (Immersive Reader) | not confirmed | Shift-Cmd-R |
| Clear data | Ctrl+Shift+Delete | Ctrl+Shift+Delete | not confirmed | - |

Brave: default shortcuts **not confirmed** (page blocked). Vivaldi: Ctrl+H opens History and Ctrl+Shift+Del opens Delete Browsing Data [F] https://help.vivaldi.com/desktop/navigation/history/ ; other defaults **not confirmed**.
Reading-mode shortcut source: https://support.google.com/chrome/answer/14218344

### 3.3 Feature checklist

| Feature | Browser | Finding | G | Source |
|---|---|---|---|---|
| Back/forward/reload/stop | Chrome, Edge | Present with shortcuts (table 3.2). | F | 3.1 pages |
| Reopen closed tab | Chrome, Edge, Safari | Yes (table 3.2). | F | 3.1 pages |
| Reopen closed tab | Firefox | Yes; falls back to restoring previous session. | S | https://support.mozilla.org/en-US/kb/keyboard-shortcuts-perform-firefox-tasks-quickly |
| Restore session | Chrome | Startup option "Continue where you left off". | F | https://support.google.com/chrome/answer/95314 |
| Restore session | Firefox | Settings > General > Startup can reopen previous windows and tabs; History > Restore Previous Session. | S | https://support.mozilla.org/en-US/kb/restore-previous-session |
| Private window | Chrome | Incognito; cookies/site data removed on close; third-party cookies blocked by default in Incognito. | F/S | https://support.google.com/chrome/answer/95647 ; https://support.google.com/chrome/answer/95464 |
| Private window | Safari | History and AutoFill not saved; each tab isolated; advanced fingerprinting protection on by default in private windows. | F | https://support.apple.com/guide/safari/browse-privately-ibrw1069/mac |
| Private window | Edge | InPrivate: history, cookies, form data not kept; "no typed characters are sent to your default search engine". | F | https://learn.microsoft.com/en-us/legal/microsoft-edge/privacy |
| Private window | Brave | Private windows plus built-in Tor windows (slower). | F | https://brave.com/privacy-features/ |
| Private window | Vivaldi | Private windows minimise what is stored locally. | S | https://vivaldi.com/desktop/ |
| History | Chrome | Search and remove individual items; Ctrl+H opens the History page. Per-day grouping not stated on the page. | F | https://support.google.com/chrome/answer/95589 |
| History | Vivaldi | Search field in History Manager/Panel; "@history" in the address field; clear by Past Hour/Day/Week/4 Weeks/Everything. Calendar view and single-entry delete not stated on the page. | F | https://help.vivaldi.com/desktop/navigation/history/ |
| History | Safari | Clear History with a range; clears across iCloud devices. Search/single delete not stated. | F | https://support.apple.com/guide/safari/clear-your-browsing-history-sfri47acf5d6/mac |
| History | Firefox | History sidebar (Ctrl+H) and Library; "Forget About This Site" removes all data for a domain. Per-day grouping not confirmed. | S | https://support.mozilla.org/en-US/kb/keyboard-shortcuts-perform-firefox-tasks-quickly |
| History | Edge, Brave | not confirmed beyond the Ctrl+H shortcut (Edge). | - | - |
| Downloads list | Chrome, Edge | Ctrl+J opens downloads. | F | 3.1 pages |
| Find in page | Chrome, Edge, Safari | Ctrl+F / Cmd-F. | F | 3.1 pages |
| Zoom per site | Chrome | "The chosen zoom level will be saved for this specific site"; default zoom slider for all sites. | F | https://support.google.com/chrome/answer/96810 |
| Zoom per site | Firefox | Zoom saved per hostname; default zoom setting for all pages. | S | https://support.mozilla.org/en-US/kb/font-size-and-zoom-increase-size-of-web-pages |
| Zoom per site | Safari | Per-website Page Zoom percentage. | F | https://support.apple.com/guide/safari/websites-ibrwe2159f50/mac |
| Reader view | Chrome | Reading mode, full view or side panel. | F | https://support.google.com/chrome/answer/14218344 |
| Reader view | Safari | Reader, can be default per site. | F | https://support.apple.com/guide/safari/websites-ibrwe2159f50/mac |
| Reader view | Edge | Immersive Reader (F9). | F | Edge shortcut page (3.1) |
| Reader view | Vivaldi | Listed as supported. | S | https://vivaldi.com/compare/ |
| Reader view | Firefox, Brave | not confirmed (Brave lists "Speedreader" among its features [S] https://support.brave.app/hc/en-us/articles/15872271230221-What-are-all-the-features-Brave-Browser-offers). | - | - |
| Passwords/autofill | Chrome | Google Password Manager built in. | S | https://support.google.com/chrome/answer/95606 |
| Passwords/autofill | Firefox | Built-in password manager; optional Primary Password. | S | https://support.mozilla.org/en-US/kb/password-manager-remember-delete-edit-logins |
| Passwords/autofill | Edge | Form entries saved by default; passwords and cards "only saved with your explicit permission". | F | https://learn.microsoft.com/en-us/legal/microsoft-edge/privacy |
| Passwords/autofill | Safari | AutoFill saves and fills user names and passwords. | S | https://support.apple.com/guide/safari/autofill-ibrwa005/mac |
| Sync | Chrome | Signing in saves bookmarks, passwords and other data to the Google Account. | S | https://support.google.com/chrome/answer/13948160 |
| Sync | Firefox | Sync covers bookmarks, passwords, history; logins encrypted before upload. | S | https://support.mozilla.org/en-US/kb/how-do-i-set-sync-my-computer |
| Sync | Edge | Per-type sync toggles under Profiles > Sync. | F | https://learn.microsoft.com/en-us/legal/microsoft-edge/privacy |
| Sync | Brave | Sync data encrypted on the device. | F | https://brave.com/privacy-features/ |
| Sync | Safari | iCloud Tabs keeps open tabs in step across devices. | S | https://support.apple.com/en-us/108409 |
| Sync | Vivaldi | End-to-end encrypted Sync. | S | https://vivaldi.com/desktop/ |
| Translation | Chrome | Translate icon in address bar; "Use Google Translate" toggle. | F | https://support.google.com/chrome/answer/173424 |
| Translation | Firefox | Built-in "Firefox Translations" setting; on-device claim not confirmed. | S | https://support.mozilla.org/en-US/kb/firefox-options-preferences-and-settings |
| Translation | Safari | Translate a webpage (guide page exists; not read). | F (title) | https://support.apple.com/guide/safari/translate-a-webpage-ibrw646b2ca2/mac |
| Translation | Vivaldi | Vivaldi Translate, engine hosted on Vivaldi's servers. | S | https://vivaldi.com/blog/vivaldi-translates-selected-text-into-a-selection-of-languages-more-privately/ |
| Translation | Edge, Brave | not confirmed. | - | - |
| Search suggestions | Chrome | With "Improve search suggestions" on, focusing/typing in the address bar sends data to the default search engine; sensitive-looking input is withheld. Default state not stated in the extract. | S | https://support.google.com/chrome/answer/13730681 |
| Search suggestions | Edge | On by default: "characters that you type into the Address bar are immediately sent to your default search provider." Off in InPrivate. | F | https://learn.microsoft.com/en-us/legal/microsoft-edge/privacy |
| Search suggestions | Brave | Off by default ("As you type, text is sent to your search engine ... This is off by default."). | S | https://support.brave.app/hc/en-us/articles/360017989132-How-do-I-change-my-Privacy-Settings |
| Search suggestions | Firefox | Disabled by default in Private Browsing; when enabled typed text goes to the default engine. Normal-window default not confirmed. | S | https://support.mozilla.org/en-US/kb/search-suggestions-firefox |
| Search suggestions | Safari | Suggestions shown while typing in the Smart Search field; default and data sent not stated. | F | https://support.apple.com/guide/safari/search-the-internet-sfrid73436cb/mac |
| Search suggestions | Vivaldi | not confirmed. | - | - |
| Tracker/ad blocking default | Chrome | No built-in tracker/ad blocker described; third-party cookies blocked by default only in Incognito. | F | https://support.google.com/chrome/answer/95647 |
| Tracker/ad blocking default | Firefox | Enhanced Tracking Protection "Standard" by default: cross-site tracking cookies, social trackers, cryptominers, fingerprinters; Total Cookie Protection on. | S | https://support.mozilla.org/en-US/kb/enhanced-tracking-protection-firefox-desktop |
| Tracker/ad blocking default | Edge | Tracking prevention with Basic/Balanced/Strict; Balanced is the default. | S | https://learn.microsoft.com/en-us/microsoft-edge/web-platform/tracking-prevention |
| Tracker/ad blocking default | Brave | Shields on for every site by default; blocks "trackers, cross-site cookie tracking, fingerprinting"; ads and trackers blocked by default. | F/S | https://brave.com/privacy-features/ ; https://brave.com/shields/ |
| Tracker/ad blocking default | Vivaldi | Levels Off / Light / Strong / Aggressive [F]; Light is stated as default on the feature page [S]. | F/S | https://help.vivaldi.com/desktop/privacy/tracking-and-ad-blocking/ ; https://vivaldi.com/features/ad-blocker/ |
| Tracker/ad blocking default | Safari | "Prevent cross-site tracking" setting deletes third-party cookies/data unless visited first-party; default state not stated. | F | https://support.apple.com/guide/safari/prevent-cross-site-tracking-sfri40732/mac |
| Do Not Track / GPC | Chrome | DNT "turned off by default"; most sites do not change behaviour. GPC not mentioned. | F | https://support.google.com/chrome/answer/2790761 |
| Do Not Track / GPC | Firefox | GPC since Firefox 120 under Privacy settings; desktop default not confirmed. | S | https://support.mozilla.org/en-US/kb/global-privacy-control |
| Do Not Track / GPC | Edge | Opt-in "Send 'Do Not Track' requests" toggle. GPC not mentioned. | F | https://learn.microsoft.com/en-us/legal/microsoft-edge/privacy |
| Do Not Track / GPC | Brave | GPC enabled by default on desktop and Android. | S | https://support.brave.app/hc/en-us/articles/360017989132-How-do-I-change-my-Privacy-Settings |
| Do Not Track / GPC | Safari, Vivaldi | not confirmed. | - | - |
| HTTPS upgrade | Chrome | "Always use secure connections": upgrades to HTTPS and warns before a site that lacks it; default state not stated. | F | https://support.google.com/chrome/answer/10468685 |
| HTTPS upgrade | Firefox | HTTPS-Only Mode exists (all windows or private only); default not confirmed. | S | https://support.mozilla.org/en-US/kb/https-only-prefs |
| HTTPS upgrade | Edge | Automatic HTTPS / HTTPS-First, enabled by default. | S | https://support.microsoft.com/en-us/edge/secure-your-web-browsing-with-https-first-mode-in-microsoft-edge |
| HTTPS upgrade | Brave | Upgrades to HTTPS first, falls back to HTTP; optional Strict mode. | S | https://brave.com/privacy-updates/22-https-by-default/ |
| HTTPS upgrade | Safari | Security setting warns before connecting over HTTP; default not stated. | F | https://support.apple.com/guide/safari/security-ibrw1074/mac |
| HTTPS upgrade | Vivaldi | not confirmed. | - | - |
| Permission prompts | Chrome | Location/camera/microphone/notifications prompt with "Allow this time", "Allow while visiting the site", "Never allow"; permissions auto-removed from unused sites. | F | https://support.google.com/chrome/answer/114662 |
| Permission prompts | Safari | Per-site Ask / Deny / Allow for camera, microphone, location, downloads; pop-ups Block and Notify / Block / Allow. | F | https://support.apple.com/guide/safari/websites-ibrwe2159f50/mac |
| Permission prompts | Edge | "By default, Microsoft Edge asks for your permission before granting a site access to your precise location." | F | https://learn.microsoft.com/en-us/legal/microsoft-edge/privacy |
| Permission prompts | Firefox, Brave, Vivaldi | not confirmed. | - | - |
| Extensions | Safari | "Get extensions" guide page exists. | F (title) | https://support.apple.com/guide/safari/get-extensions-sfri32508/mac |
| Extensions | Edge | Microsoft Edge Add-ons store. | S | https://support.microsoft.com/en-us/edge/securely-browse-the-web-in-microsoft-edge |
| Extensions | Chrome, Firefox, Brave, Vivaldi | not confirmed from a page read in this session. | - | - |
| Automatic updates | Chrome | "Google Chrome can automatically update"; applied on restart. | F | https://support.google.com/chrome/answer/95414 |
| Automatic updates | Edge | "Automatic updates are turned on by default"; checks at startup and periodically. | F | https://learn.microsoft.com/en-us/legal/microsoft-edge/privacy |
| Automatic updates | Firefox, Safari, Brave, Vivaldi | not confirmed. | - | - |
| Loading indicator | all six | not confirmed - no help page describing the tab spinner/progress bar was found. | - | - |
| Bookmarks | Chrome, Edge | Ctrl+D adds a bookmark/favourite. | F | 3.1 pages |
| Bookmarks | Safari | Bookmarks, Favorites and Reading List guide pages exist. | F (titles) | https://support.apple.com/guide/safari/bookmark-webpages-to-revisit-ibrw1039/mac |

---

## Gaps to close before citing (ranked by usefulness)

1. Firefox help pages: all [S]; open each in a real browser to confirm wording, especially defaults for HTTPS-Only, GPC and search suggestions.
2. Brave and Vivaldi default shortcuts; Vivaldi search-suggestion default; Brave/Vivaldi extensions and updates.
3. Android TV minimum text size in sp (only in an image on the typography page).
4. Samsung and LG model e-manuals for tabs, private mode, on-screen keyboard.
5. Steam Deck Game Mode browser: no official description found.
6. Loading indicators and first-run onboarding: no vendor documentation found for any browser.
