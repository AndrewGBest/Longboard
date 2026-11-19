# Research: an Android TV version

Read from the sources named on 2026-11-19, for the decision in
DECISIONS.md of the same date. **Guess** marks what no source confirmed.
Nothing here has been built or run yet.

## The engine: GeckoView

| Fact | Source |
|---|---|
| Latest stable is `org.mozilla.geckoview:geckoview:160.0.20261116130455`, from `https://maven.mozilla.org/maven2/` | https://maven.mozilla.org/maven2/org/mozilla/geckoview/geckoview/maven-metadata.xml |
| One artifact per processor exists: `geckoview-arm64-v8a` (91.5 MB), `geckoview-armeabi-v7a` (88.9 MB), `geckoview-x86_64` (96.5 MB). There is none for 32-bit x86 | The same repository, by asking for each file |
| Needs Android 8.0 (`minSdk` 26), `compileSdk` 37 or newer, Java 17; depends on Kotlin's library 2.4.21 | The package's own manifest, metadata and POM |
| Licence: MPL 2.0. No rights to the Firefox name or logo | The POM; the repository's LICENSE |
| A package for one processor is about 90 MB to download. **Guess:** about 190 MB installed | Measured from the arm64 package |

## Longboard's layer as a built-in extension

| Fact | Source |
|---|---|
| An extension shipped inside the app is installed with `ensureBuiltIn("resource://android/assets/<folder>/", "<id>")`; it is skipped when the same version is already there | https://firefox-source-docs.mozilla.org/mobile/android/geckoview/consumer/web-extensions.html |
| Its content scripts run in a world of their own (`world` is `ISOLATED` unless set), at `document_start` if asked, on `<all_urls>` | https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts |
| A content script talks to the app with `browser.runtime.sendNativeMessage`, given the permissions `nativeMessaging`, `geckoViewAddons` and `nativeMessagingFromContent`; the last is "only available to privileged extensions such as built-in extensions". The app hears it on a delegate set per session | The web-extensions page above |
| The app can send to the extension over a port opened with `connectNative`. The documents show this from a background script only. **Guess:** it works from a content script too | The same page; `WebExtensionController.java` |
| A page of the extension itself can be shown as the app's own screen: GeckoView's tests load `${extension.metaData.baseUrl}tab.html` | `WebExtensionTest.kt` in mozilla-firefox/firefox |

## The remote's keys

| Fact | Source |
|---|---|
| The D-pad arrives in the page as `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`; the centre button and Enter as `Enter`; the media keys as `MediaPlayPause`, `MediaFastForward`, `MediaRewind` | `widget/NativeKeyToDOMKeyName.inc` |
| Back, Menu, Search and the volume keys are not passed to the page; they fall to the app | `GeckoEditable.java`, `shouldProcessKey` |
| **Guess (ordinary Android, not looked up):** the app sees every key first in `Activity.dispatchKeyEvent` | |

## Identity, protected video, the TV launcher

| Fact | Source |
|---|---|
| The user agent is `Mozilla/5.0 (Android <version>; Mobile; rv:160.0) Gecko/160.0 Firefox/160.0`. `VIEWPORT_MODE_DESKTOP` lays every page out 980 CSS px wide and leaves the user agent alone | `GeckoSession.getDefaultUserAgent()`; https://mozilla.github.io/geckoview/javadoc/mozilla-central/org/mozilla/geckoview/GeckoSessionSettings.html |
| Protected video asks the app through `PermissionDelegate.onContentPermissionRequest` with `PERMISSION_MEDIA_KEY_SYSTEM_ACCESS`. **Guess:** the decoder is the device's own, so nothing is downloaded | https://mozilla.github.io/geckoview/javadoc/mozilla-central/org/mozilla/geckoview/GeckoSession.PermissionDelegate.html |
| To be listed on a TV's home screen an app needs the `LEANBACK_LAUNCHER` category, `android.software.leanback` and `android.hardware.touchscreen` both not required, and a 320 x 180 banner with its name in the picture | https://developer.android.com/training/tv/get-started/create |

## Testing it by script

| Fact | Source |
|---|---|
| geckodriver 0.26 and later can drive an app built on GeckoView, named by `androidPackage` in `moz:firefoxOptions` | `testing/geckodriver/doc/Support.md`; https://developer.mozilla.org/en-US/docs/Web/WebDriver/Reference/Capabilities/firefoxOptions |
| `remoteDebuggingEnabled(true)` opens the developer tools on a socket named `<package>/firefox-debugger-socket` | https://firefox-source-docs.mozilla.org/mobile/android/geckoview/consumer/automation.html |
