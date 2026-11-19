# Research: Chrome Web Store terms and ARM support (checked 2026-11-19)

Quotes are verbatim from the linked primary source. "Assessment" marks my reading; it is not legal advice.

## Part A - Chrome Web Store from a non-Chrome browser

### A1. Clauses that bear on it

Chrome Web Store Terms of Service (user side) - https://ssl.gstatic.com/chrome/webstore/intl/en/gallery_tos.html
- 1.2: "You may use the Web Store to browse, locate, and download Products (defined as software, content and digital materials created for use in connection with Google Chrome and distributed via the Web Store) for use in connection with Google Chrome."
- 3.3: "You agree not to access (or attempt to access) the Web Store by any means other than through the interface that is provided by Google, unless you have been specifically allowed to do so in a separate agreement with Google. You specifically agree not to access (or attempt to access) the Web Store through any automated means (including use of scripts, crawlers, or similar technologies) and shall ensure that you comply with the instructions set out in any robots.txt file present on the Web Store website."
- 3.4: "You agree that you will not engage in any activity that interferes with or disrupts the Web Store (or the servers and networks which are connected to the Web Store)."
- 3.5: "you agree that you will not reproduce, duplicate, copy, sell, trade or resell any Product from the Web Store for any purpose, unless you have been specifically permitted to do so in a separate agreement with the developer of such Product."
- 8.4: "From time to time, Google Chrome may check with remote servers for available updates to Products ... If your browser has this functionality, you agree that such updates will be automatically requested, downloaded, and installed". Also: "Google retains the right to remotely disable or remove those Products from your system at its sole discretion."
- 1.4 is the only "who may use it" rule (age 13+). No date/last-modified string found on the page.

Developer Agreement - https://developer.chrome.com/docs/webstore/program-policies/terms
- Definition of Web Store: "The Google Chrome Web Store site operated by Google, where Developers can publish Products for direct distribution to users of Google Chrome."
- Definition of Products: "Software, content and digital materials created for use in connection with Google Chrome and distributed via the Web Store."
- 5.2 (licence developer gives the user): "You grant to the user a non-exclusive, worldwide, and perpetual license to perform, display, and use the Products". (Fetched via a summarising tool; re-read 5.2 in full before relying on its exact scope.)
- No clause mentioning other browsers was found.

Google Terms of Service ("Effective July 30, 2026") - https://policies.google.com/terms
- Lists as abuse: "using automated means to access content from any of our services in violation of the machine-readable instructions on our web pages" (example given: "robots.txt files that disallow crawling, training, or other activities"), and "You must not abuse, harm, interfere with, or disrupt our services or systems". (Phrases quoted from a summarised fetch; confirm wording on the page.)

robots.txt / API terms for the update endpoint
- https://clients2.google.com/robots.txt returns the generic Google robots file; no Disallow rule matching `/service/update2/crx` was found in it (only `/localservices/` matched "service").
- https://chromewebstore.google.com/robots.txt disallows `/search` and `/detail/*/report|privacy|support|reviews|related|preview` plus tracking-parameter URLs; plain `/detail/<id>` pages are not disallowed.
- Separate published API terms for `clients2.google.com/service/update2/crx`: not confirmed (none found).

### A2. Does any clause restrict access to Chrome users only?
- No clause says "only Google Chrome may access the Web Store" or names other browsers.
- But the grant in 1.2 is scoped: download Products "for use in connection with Google Chrome", and the Developer Agreement describes the store as for "direct distribution to users of Google Chrome". Use in another browser is outside the literal wording of the grant rather than expressly prohibited.
- 3.3 is the clause most directly in tension with a third-party client: an Electron app calling the CRX endpoint itself is arguably not "the interface that is provided by Google" and is "automated means".

### A3. What the library actually does
- electron-chrome-web-store requests `https://clients2.google.com/service/update2/crx` with `acceptformat=crx2,crx3` and a `prodversion` set to the Chrome version; the updater allow-lists that same URL.
  https://github.com/samuelmaddock/electron-browser-shell/blob/master/packages/electron-chrome-web-store/src/browser/installer.ts and .../src/browser/updater.ts
- Its README makes no statement about Google's terms, permission, or affiliation; licence is MIT.
  https://github.com/samuelmaddock/electron-browser-shell/blob/master/packages/electron-chrome-web-store/README.md

### A4. What other Chromium browsers say publicly
- Microsoft Edge: "Extensions designed for Google Chrome can also be used in Microsoft Edge." Steps: "In Microsoft Edge, go to the Chrome Web Store." ... "you may be shown a dialog to Allow extensions from other stores." https://support.microsoft.com/en-us/microsoft-edge/add-turn-off-or-remove-extensions-in-microsoft-edge-9c0ec68c-2fbc-2f2c-9ff0-bdc76f46b026
- Vivaldi: "extensions available in the Chrome Web Store can also be installed in Vivaldi." / "Click Add to Vivaldi to install the extension in Vivaldi." https://help.vivaldi.com/desktop/appearance-customization/extensions/
- Brave: "Thankfully, any extension found in the Chrome Web Store will also work in Brave." / "To install a Chrome extension in Brave, first search the Chrome Web Store and find the extension you want." https://brave.com/learn/using-chrome-extensions-in-brave/
- Opera: help page says only "Opera is based on Chromium, which means it is possible to run CRX files in Opera." https://help.opera.com/en/extensions/ - an Opera statement about installing directly from the Chrome Web Store: not confirmed (add-on page returned 404).
- ungoogled-chromium helper: "This extension brings the following functionality to ungoogled-chromium (and other forks that lack web store support)" - "Allows installing extensions directly from chrome web store." No terms disclaimer. https://github.com/NeverDecaf/chromium-web-store
- Kiwi: README says "Kiwi Browser is now archived. It will no longer be maintained after January 2025." No Chrome Web Store statement in it: not confirmed. https://github.com/kiwibrowser/src.next
- None of these pages claims a licence or agreement with Google for store access; whether any vendor has one: not confirmed.

### A5. Assessment (not legal advice)
- Practice: large vendors (Microsoft, Brave, Vivaldi) openly document installing from the Chrome Web Store, and the store serves CRX files to them. No primary source was found showing Google enforcing the ToS against a browser for this. That is absence of evidence, not permission.
- Text: the ToS wording does not cover Longboard. 1.2 scopes the grant to Google Chrome; 3.3 forbids non-Google interfaces and automated access absent a separate agreement. A strict reading puts any third-party client, and its users, outside the terms.
- Who is bound: the ToS is accepted by the person "using the Web Store"; Longboard's project is the party that built the client. Extension licences come from each developer (Dev Agreement 5.2), not from Longboard.
- Practical exposure looks low-probability but not zero, and the realistic failure mode is technical (Google changes or blocks the endpoint, or changes store UI) rather than legal. Differences from the big vendors: Longboard sends a Chrome `prodversion` from a non-Chrome client, and has no relationship with Google.
- Lower-risk posture consistent with the sources: user-initiated installs only, no bulk crawling or mirroring of CRX files (3.3, 3.5), no rehosting, honour robots.txt for store pages, do not use Chrome/Web Store branding as if affiliated, make the feature optional, and say in docs that the store is Google's and governed by its terms.

## Part B - ARM support

### B1. castLabs builds for v45.x
Release https://github.com/castlabs/electron-releases/releases/tag/v45.2.1%2Bwvcus (published 2026-11-05), assets from `gh api repos/castlabs/electron-releases/releases/tags/v45.2.1+wvcus`:
```
electron-api.json                                  electron.d.ts            SHASUMS256.txt
electron-v45.2.1+wvcus-darwin-arm64.zip            (+ -dsym.tar.xz, -symbols.zip)
electron-v45.2.1+wvcus-darwin-x64.zip              (+ -dsym.tar.xz, -symbols.zip)
electron-v45.2.1+wvcus-linux-arm64.zip             (+ -symbols.zip)
electron-v45.2.1+wvcus-linux-x64.zip               (+ -symbols.zip)
electron-v45.2.1+wvcus-win32-arm64.zip             (+ -pdb.zip, -symbols.zip)
electron-v45.2.1+wvcus-win32-x64.zip               (+ -pdb.zip, -symbols.zip)
```
- Linux arm64: yes. Linux armv7l: no asset.
- Upstream Electron dropped it: PR "feat!: remove 32-bit Windows (ia32) and Linux ARM (armv7l) builds", merged 2026-07-13. https://github.com/electron/electron/pull/51816
- castLabs policy (maintainer khwaaj, 2026-10-06): "you will see monthly `linux-arm64` builds of ECS from `v44` and forward ... Older version will not support `linux-arm64`." https://github.com/castlabs/electron-releases/issues/239

### B2. Widevine CDM on Linux arm64
- Historic position (2025-09-02): "there is no official browser CDM for Linux-arm64 from Google, and thus we can't support it." https://github.com/castlabs/electron-releases/issues/213
- Google announcement (2026-03-12): "We're excited to announce that Google will launch Chrome for ARM64 Linux devices in Q2 2026". The post does not mention Widevine. https://blog.google/chromium/bringing-chrome-to-arm64-linux-devices/
- Chrome for Linux arm64 is in Google's apt repo today: `binary-arm64/Packages` lists google-chrome-stable 158.0.8127.36-1 (also beta, unstable, canary). https://dl.google.com/linux/chrome/deb/dists/stable/main/binary-arm64/Packages
- castLabs, 2026-08-04: "the Widevine CDM is bundled in this build and not yet available through the Component Updater AFAICT." 2026-08-05: "We got official confirmation yesterday that this is being published on all Google Chrome release channels. A test build of ECS does work and get a Widevine CDM on `linux-arm64`". 2026-09-07: "The `v44` series is now stable, and includes `linux-arm64` support". https://github.com/castlabs/electron-releases/issues/223
- castLabs, 2026-10-06: "The `linux-arm64` CDM is only officially supported on Chromium after a certain version, I believe it was `v151` or `v152`". https://github.com/castlabs/electron-releases/issues/239
- So: an official Google desktop-Linux arm64 CDM exists and is delivered by the Component Updater to castLabs v44+ linux-arm64 builds, per castLabs. A Google-authored statement specifically about Widevine on Linux arm64: not confirmed. I did not unpack the Chrome arm64 .deb to check for the bundled CDM.
- VMP: README says castLabs "supports Windows, macOS and Linux, although VMP is not available on Linux." https://github.com/castlabs/electron-releases/blob/master/README.md - README does not mention arm64. What robustness level/resolution services grant on Linux arm64: not confirmed.
- Linux armv7l CDM via Component Updater: not confirmed (and moot, no armv7l builds).
- Raspberry Pi OS `libwidevinecdm0`: Raspberry Pi's own apt archive ships armhf and arm64 debs (latest `libwidevinecdm0_4.10.2662.3+1_arm64.deb`, changelog dated 2023-10-25). https://archive.raspberrypi.org/debian/pool/main/w/widevine/ The source tarball contains prebuilt `libwidevinecdm.so` for linux_arm and linux_arm64 plus `widevine_fixup.py` (David Buchanan / Hector Martin); changelog: "Apply new fixup from Hector Martin, avoiding the need to weaken memory security on Pi5 with 16k bookworm." It has no debian/copyright file and does not state where the binary came from. A Raspberry Pi statement on the origin or on a Google licence: not confirmed.

### B3. electron-builder for linux arm64
- Flag: CLI lists "--arm64  Build for arm64" and "--armv7l  Build for armv7l". https://github.com/electron-userland/electron-builder/blob/master/website/docs/cli.md
- Architecture table: Linux arm64 `--arm64` "Raspberry Pi 4+, ARM servers, cloud instances"; Linux armv7l "Requires `electronVersion` <= 43.x". Multiple archs in one run: `electron-builder --win --x64 --arm64` pattern. Since v27 `arch: "all"` on Linux "expands to **x64 + arm64**". https://github.com/electron-userland/electron-builder/blob/master/website/docs/architecture.md
- Example invocation that follows from the docs: `electron-builder --linux AppImage tar.gz flatpak --arm64` (docs example is `electron-builder --linux deb tar.xz`).
- Cross-building from x64: "If your app has native dependencies, they can only be compiled on the target platform unless prebuild is used." https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/multi-platform-build.md
- AppImage: arm64 is a listed architecture; "Build requirements: Linux host (or Docker) for all architectures."; "AppImages must be built on Linux (or via Docker). They cannot be cross-compiled from macOS or Windows." Since v27 "the default resolves to the **static, FUSE3-compatible runtime**" ("Static runtime (no host FUSE needed)"); it "supports `gzip` and `zstd`", and "`xz` is mapped to `zstd`". A documented restriction on producing an arm64 AppImage from an x64 Linux host: not confirmed (none stated). https://github.com/electron-userland/electron-builder/blob/master/website/docs/appimage.md
- Flatpak: output is a single-file bundle only ("does **not** support publishing apps to Flatpak repositories like Flathub"). Needs "`flatpak` 1.12.4 or newer and `flatpak-builder` 1.2.2 or newer". Runs `flatpak-builder --arch <arch> --build-only ...` per architecture; file name uses "`aarch64` for arm64"; `runtimeVersion` and `baseVersion` "both default to `26.08`"; defaults "take 3.2 GB on disk, measured on aarch64". https://github.com/electron-userland/electron-builder/blob/master/website/docs/flatpak.md
- Flatpak cross-arch: flatpak-builder `--arch`: "Only host compatible architectures can be specified." https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html - so an aarch64 flatpak needs an arm64 host or an emulated one. The electron-builder flatpak doc does not mention qemu; "needs qemu-user-static/binfmt" as a documented requirement: not confirmed. Building natively on an arm64 runner avoids the question.
- tar.gz: no arch-specific limits documented (not confirmed either way beyond the generic `--arm64` flag).
- castLabs + electron-builder: the mirror is static in package.json (khwaaj: "the `electron-builder` mirror configuration is statically defined in `package.json`"), which matters less now that castLabs ships linux-arm64. https://github.com/castlabs/electron-releases/issues/198

### B4. GitHub Actions arm64 runners
- Changelog 2025-01-16: "Now in public preview, Linux arm64 hosted runners are available for free in public repositories." Labels `ubuntu-24.04-arm` and `ubuntu-22.04-arm`; "these labels will not work in private repositories"; "these 4 vCPU runners". https://github.blog/changelog/2025-01-16-linux-arm64-hosted-runners-now-available-for-free-in-public-repositories-public-preview/
- Current docs table for public repos: Linux arm64, 4 CPU, 16 GB RAM, 14 GB storage, labels `ubuntu-24.04-arm`, `ubuntu-22.04-arm`, `ubuntu-26.04-arm`; "Use of the standard GitHub-hosted runners is free and unlimited on public repositories." GA-vs-preview status: not stated on the page. https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- Note the 14 GB disk against the 3.2 GB flatpak runtime download plus Electron and build output.

### B5. Video decode path on ARM boxes
- Chromium build default: `use_v4l2_codec = false`, commented "This is used for all CrOS platforms which have v4l2 hardware encoder / decoder." `use_vaapi` is true for Linux X11/Wayland when `target_cpu` is x86, x64 or arm64. https://github.com/chromium/chromium/blob/main/media/gpu/args.gni
- Electron's build args set `enable_widevine = true` and `proprietary_codecs = true` and contain no v4l2/vaapi override. https://github.com/electron/electron/blob/main/build/args/all.gn
- Runtime features: "Enable vaapi/v4l2 video decoding on linux. This is already enabled by default on chromeos, but needs an experiment on linux." `kAcceleratedVideoDecodeLinux` ("AcceleratedVideoDecoder") is on by default only when built with VA-API; `kAcceleratedVideoDecodeLinuxGL` is enabled by default; `kPreferV4L2VideoAcceleration` is disabled by default. https://github.com/chromium/chromium/blob/main/media/base/media_switches.cc - VA-API flag list (e.g. `--enable-features=AcceleratedVideoDecodeLinuxZeroCopyGL`): https://github.com/chromium/chromium/blob/main/docs/gpu/vaapi.md
- Assessment from those three files: a stock Electron/castLabs linux-arm64 binary is compiled with the VA-API path and without the V4L2 decoders, so on Pi and RK3588 (V4L2 hardware, no VA-API driver) video decode is software unless Chromium is rebuilt with `use_v4l2_codec=true`. No runtime flag adds a decoder that was not compiled in. Not tested on hardware.
- RK3588, kernel side: Collabora (2026-02-25) reports VDPU381 (RK3588) / VDPU383 (RK3576) H.264 and HEVC decoders "merged into the Upstream Linux kernel", using the "V4L2 stateless HEVC UAPI"; GStreamer 1.28 supports it; Chromium not mentioned. https://www.collabora.com/news-and-blog/news-and-events/rk3588-and-rk3576-video-decoders-support-merged-in-the-upstream-linux-kernel.html
- RK3588, Chromium side: a chromium-dev poster needed a patched build: "At the moment chromium's av1 v4l2 decoding support is limitted to ChromeOS, so I added a patch to enable it for linux." https://groups.google.com/a/chromium.org/g/chromium-dev/c/Dq5by1PeJXA
- Raspberry Pi: the Pi HEVC decoder is being upstreamed as a V4L2 driver whose v4l2-compliance output reports "Detected Stateless Decoder". https://lwn.net/Articles/1008367 - Which models it covers, Pi 4 stateful H.264, and "Pi 5 has no H.264 hardware decode": not confirmed from a primary source in this pass. What Raspberry Pi OS's own patched Chromium enables: not confirmed.
- GPU compositing/GL path on these boards (V3D, Panfrost/Panthor) and required flags: not confirmed.

### B6. ChromeOS-extracted Widevine on Linux - what the sources say
- castLabs (2023-02-13): "The CDM which is available for raspbian, i.e. through the `libwidevinecdm0` APT package, is not official or sanctioned by Google. AFAICT it comes from ChromeOS and using it has potential legal implications." https://github.com/castlabs/electron-releases/issues/146
- castLabs (2023-03-28): "these are not official CDMs for use outside of ChromeOS, and they are not available through the Component Updater ... Google may turn a blind eye to them being used in this context, but would likely react on more widespread use, especially in commercial contexts." https://github.com/castlabs/electron-releases/issues/150
- castLabs (2025-03-26): "The CDM provided by the RPi package is not an official Linux/ARM CDM (it is taken from ChromeOS) ... Hosting/bundling a Widevine browser can CDM also has legal implications, in part because it includes certain codecs that require licensing. This is why we only ever recommend installing the CDM dynamically directly from Google". https://github.com/castlabs/electron-releases/issues/198
- Community description of the arm64 origin: "an ARM64 Widevine library was successfully snatched from Google's update servers." (issue opened by a user, not Raspberry Pi staff) https://github.com/raspberrypi/Raspberry-Pi-OS-64bit/issues/248
- Chrome/ChromeOS Additional Terms: contain the AVC notice "NO LICENSE IS GRANTED OR SHALL BE IMPLIED FOR ANY OTHER USE."; the page as fetched has no sentence about extracting or redistributing components, and does not mention Widevine. https://www.google.com/chrome/terms/
- These are castLabs' opinions, not Google's. A Google statement on extracting the ChromeOS CDM: not confirmed. The official route now exists (B2), so the extraction route is unnecessary for arm64; no recommendation to use it is made here.

## Gaps
- Dev Agreement 5.2 and Google ToS quotes came through a summarising fetch; exact wording should be re-read at the URLs.
- Not confirmed: Google's own statement on Linux arm64 Widevine; Opera and Kiwi store statements; Pi model-level decode facts; flatpak-under-qemu as a documented requirement; any vendor agreement with Google for store access.
