# Voice input and search suggestions: research notes (2026-11-19)

Method: npm registry, GitHub API, Hugging Face API, and direct fetches of the engines' own files.
Nothing was installed or run; the code sketches are assembled from the packages' READMEs and
type definitions and are untested. "Not confirmed" means no primary source was found.

## Part A: voice input

### A1. Web Speech API (SpeechRecognition) in Electron
- Cloud recognition does not work in Electron. Issue #46143 (Electron 32 and 35.0.3) reports
  `network` errors; an Electron member reproduced it and pointed at local Whisper as what apps do
  instead. Closed without a fix. https://github.com/electron/electron/issues/46143
  (older: https://github.com/electron/electron/issues/31732)
- On-device Web Speech (`processLocally`, `SpeechRecognition.available()/install()`): shipped in
  Chrome 139; the intent says "Initially supported on Windows, Mac, and Linux", language packs
  about 60 MB each. https://groups.google.com/a/chromium.org/g/blink-dev/c/VNOok2dbmHM ,
  https://developer.chrome.com/release-notes/139 ,
  https://developer.mozilla.org/docs/Web/API/SpeechRecognition/processLocally
- It is NOT available in Electron. Electron PR #52955 (merged 2026-08-19): "Only `//chrome`
  registers a binder for it"; Electron now binds a stub that "answers `Available()` with
  `kUnavailable` and `Install()` with `false`". Before the fix, calling it killed the renderer.
  https://github.com/electron/electron/pull/52955
- Whether the castLabs Electron 45 build has that fix: not confirmed.
- Verdict: unusable for Longboard, both cloud (also a Google request, against the no-telemetry rule) and on-device.

### A2. Vosk (alphacep)
- Engine licence Apache-2.0. https://github.com/alphacep/vosk-api
- Models (https://alphacephei.com/vosk/models): `vosk-model-small-en-us-0.15`, 40 MB, Apache 2.0,
  WER 9.85 (librispeech test-clean) / 10.38 (tedlium); `vosk-model-en-us-0.22-lgraph`, 128 MB,
  Apache 2.0, WER 7.82 / 8.20. Some other English models are AGPL or LGPL (daanzu, zamia).
  Small models need about 300 MB RAM at run time. No latency figures given. 32 languages listed.
  URL pattern: `https://alphacephei.com/vosk/models/<name>.zip`
- `vosk-browser` 0.0.8 (npm, Apache-2.0, 5.8 MB unpacked, dep `uuid` 9.0.0), last published 2022-12-25. WASM build that runs in a Web Worker. It loads the model as a `.tar.gz`
  (`Vosk.createModel('model.tar.gz')`), while the source publishes `.zip`, so the model would have
  to be repackaged or re-hosted. https://github.com/ccoreilly/vosk-browser ,
  https://registry.npmjs.org/vosk-browser/latest
- `vosk` 0.3.39 (npm, Apache-2.0, 85.8 MB unpacked), last published 2022-05-24, depends on `ffi-napi`, `ref-napi`, `mic`, `wav`, `async`. https://registry.npmjs.org/vosk/latest
  Electron 45 and linux-arm64 support: not confirmed.
- Verdict: both JS packages are stale; not recommended.

### A3. whisper.cpp
- Licence MIT (code); OpenAI Whisper weights MIT. https://github.com/ggml-org/whisper.cpp , https://github.com/openai/whisper
- Model sizes on disk / memory: tiny 75 MiB / ~273 MB, base 142 MiB / ~388 MB. `.en` variants are the same size. Download source: https://huggingface.co/ggerganov/whisper.cpp
  (https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md)
- WASM: only as examples to build with Emscripten (`whisper.wasm`, `stream.wasm`); no official npm
  package. https://github.com/ggml-org/whisper.cpp/tree/master/examples/stream.wasm
- Node addons are third-party (`smart-whisper` 0.8.1, MIT, last published 2024-10-02; `nodejs-whisper` 0.4.1, MIT, compiles at install). Prebuilt linux-arm64: not confirmed.
- Low-power suitability: Whisper always processes a 30-second window, so a 3-second query costs
  the same as 30 seconds. Moonshine's published benchmark gives Whisper Tiny 1,141 ms on Linux
  x86 and 5,863 ms on a Raspberry Pi 5 per update (a competitor's figures, not whisper.cpp's own).
  https://github.com/moonshine-ai/moonshine/blob/main/docs/moonshine-vs-whisper.md

### A4. sherpa-onnx (k2-fsa)
- Licence Apache-2.0. https://github.com/k2-fsa/sherpa-onnx
- `sherpa-onnx-node` 2.0.2 (published 2026-11-19): native addon (node-addon-api), 74 KB, no
  dependencies, platform binaries as optionalDependencies. `sherpa-onnx-linux-x64` 2.0.2 is
  34.2 MB unpacked (27 MB of it `libonnxruntime.so`). `sherpa-onnx-linux-arm64` is still at 2.0.1
  (40.2 MB), so pin 2.0.1 if both architectures are needed today.
  https://registry.npmjs.org/sherpa-onnx-node , https://registry.npmjs.org/sherpa-onnx-linux-arm64
- `sherpa-onnx` 2.0.2 (npm) is the WASM build but for Node only (`sherpa-onnx-wasm-nodejs.wasm`,
  15.6 MB, single-threaded). Browser WASM exists only as per-model builds published as demo
  spaces; there is no browser npm package.
  https://github.com/k2-fsa/sherpa-onnx/blob/master/nodejs-addon-examples/README.md
- So in Electron it runs in the main or a utility process, not in a sandboxed renderer.
- English models, from https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models :
  - `sherpa-onnx-streaming-zipformer-en-20M-2023-02-17` (streaming, Apache-2.0): 122 MB archive; int8 files alone are 40.9 + 0.5 + 0.2 MB.
    https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17
  - `sherpa-onnx-moonshine-tiny-en-quantized-2026-02-27`: 28.5 MB archive (Moonshine, MIT).
  - `sherpa-onnx-whisper-tiny.en`: 112.6 MB archive.
- Archives are `.tar.bz2`, so unpacking needs a bzip2 implementation, or fetch the individual files from the Hugging Face mirrors instead.
- Accuracy/latency figures from the project's docs: not confirmed (not collected).

### A5. Transformers.js (Hugging Face)
- `@huggingface/transformers` 4.3.2, Apache-2.0, 10.0 MB unpacked, but depends on `onnxruntime-web` (pinned dev build; 1.31.1 is 150.6 MB unpacked), `onnxruntime-node` 1.30.0
  (1.31.1 is 307.6 MB unpacked), `sharp`, `@huggingface/jinja`, `@huggingface/tokenizers`.
  https://registry.npmjs.org/@huggingface/transformers/latest
- Runs in a page or worker: "By default, when running in the browser, the model will be run on
  your CPU (via WASM)"; `device: 'webgpu'` optional; `dtype` q8 is the WASM default.
  https://huggingface.co/docs/transformers.js/en/index
- Models come from `https://huggingface.co/{model}/resolve/{revision}/` at run time and are kept
  in the Cache API (`env.remoteHost`, `env.useBrowserCache`, `env.allowRemoteModels`).
  https://github.com/huggingface/transformers.js/blob/main/packages/transformers/src/env.js
- Undisclosed-request risk: by default the ONNX Runtime WASM binaries are fetched from
  `https://cdn.jsdelivr.net/npm/onnxruntime-web@<version>/dist/` unless `wasmPaths` is overridden.
  https://github.com/huggingface/transformers.js/blob/main/packages/transformers/src/backends/onnx.js
- Model sizes (q8/int8 files): `onnx-community/whisper-tiny.en` (Apache-2.0) encoder 9.7 MB +
  merged decoder 29.3 MB; `onnx-community/moonshine-tiny-ONNX` (MIT) encoder 7.6 MB + merged
  decoder 19.3 MB; `moonshine-base-ONNX` (MIT) 19.5 + 40.5 MB.
  https://huggingface.co/onnx-community/moonshine-tiny-ONNX ,
  https://huggingface.co/onnx-community/whisper-tiny.en
- Verdict: works, but the dependency tree is far larger than the alternatives.

### A6. Moonshine (Moonshine AI, formerly Useful Sensors)
- Code MIT; "Moonshine models are released under the MIT License by default, in every language and
  at every size", except legacy non-streaming non-English models (non-commercial Community
  licence). https://github.com/moonshine-ai/moonshine/blob/main/LICENSE
- English models (WER = Open ASR Leaderboard average, float reference): Tiny Streaming 34 M params 12.00%; Small Streaming 123 M 7.84%; Medium Streaming 245 M 6.65%;
  Tiny 26 M 12.66%; Base 58 M 10.07%.
  https://github.com/moonshine-ai/moonshine/blob/main/docs/models/available-models.md
  Quantized Tiny Streaming on LibriSpeech-clean: 4.83% (float 4.52%).
  https://github.com/moonshine-ai/moonshine/blob/main/docs/models/accuracy.md
- Download sizes (quantized `.ort`, summed from the asset mirror's file list): Tiny Streaming EN
  about 74 MB, Tiny EN about 71 MB, Small Streaming EN about 214 MB, Base EN about 238 MB.
  https://huggingface.co/moonshine-ai/moonshine-voice-assets
- Latency per update (project's own benchmark): Tiny Streaming 69 ms Linux x86, 237 ms Raspberry
  Pi 5; Small Streaming 165 / 527 ms. No 30-second padding; compute scales with audio length.
  https://github.com/moonshine-ai/moonshine/blob/main/docs/moonshine-vs-whisper.md
- Speech-to-text languages: English, Spanish, German, Mandarin, Japanese, Korean, Vietnamese, Tagalog, Ukrainian, Arabic. https://github.com/moonshine-ai/moonshine
- Browser package `@moonshine-ai/moonshine-wasm` (details below). The older `@moonshine-ai/moonshine-js` 0.1.29 (2025-07-03) depends on Transformers.js and onnxruntime-web.

### Recommendation: `@moonshine-ai/moonshine-wasm` with the English Tiny Streaming model
- Version 0.1.6 (published 2026-11-07), MIT, unpacked 13,734,259 bytes (96 files; 13.2 MB is
  `dist/moonshine.wasm`), no dependencies. https://registry.npmjs.org/@moonshine-ai/moonshine-wasm
- Runs as WASM in a page plus its own Web Worker, so it fits a sandboxed renderer with no Node
  integration. Being WASM it is architecture-neutral (x64 and arm64); tested on arm64 Linux
  Chromium: not confirmed.
- Models are not in the package: "fetched from the Moonshine CDN (`https://download.moonshine.ai`)
  the first time it's needed and cached in the browser via the Cache API" (bucket
  `moonshine-models-v1`). The CDN answered with `access-control-allow-origin: *`. That is the
  original source, so it meets the download-from-source rule; it must be listed in Settings.
  https://unpkg.com/@moonshine-ai/moonshine-wasm@0.1.6/README.md
- Alternative that keeps the request in the main process: download the files there and pass bytes
  with `Transcriber.load({ files, modelArch })`, or use `Transcriber.loadFromUrls(...)`.
- Caveats:
  1. The default build needs `SharedArrayBuffer`, i.e. a cross-origin-isolated page
     (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`).
     Longboard's internal page must be served with those headers; a single-thread build exists
     only by building from source. Behaviour under Electron 45 custom protocols: not confirmed.
  2. `language: 'en'` alone selects Medium Streaming (the first architecture listed is the
     default), so pass `ModelArch.TinyStreaming` explicitly.
  3. The package is three months old (first published 2026-08-07, six versions). Pin the version.
  4. It is ESM with a separate `.wasm` and worker files; esbuild must copy those as assets
     (untested).
- Fallback if the above fails in practice: `sherpa-onnx-node` 2.0.1 in an Electron utility process
  with the Moonshine tiny or streaming-zipformer-en-20M int8 model, PCM sent over a MessagePort.

Sketch (from the README and `dist/transcriber.d.ts`, untested):

```ts
import { Transcriber, ModelArch } from '@moonshine-ai/moonshine-wasm';

let transcriber: Transcriber | undefined;

export async function loadVoiceModel(onProgress?: (loaded: number, total?: number) => void) {
  transcriber ??= await Transcriber.load({
    language: 'en',
    modelArch: ModelArch.TinyStreaming,          // about 74 MB, downloaded once, then cached
    onProgress: (loaded, total) => onProgress?.(loaded, total),
  });
}

/** pcm: 16 kHz mono samples in [-1, 1]. */
export function transcribe(pcm: Float32Array): string {
  const t = transcriber!.transcribe(pcm, { sampleRate: 16000 });
  return t.lines.map((l) => l.text).join(' ').trim();
}
// For live partial text: transcriber.start(); transcriber.addAudio(chunk, 16000); transcriber.stop();
// with transcriber.addListener(...). The package's MicTranscriber does capture plus streaming.
```

### Microphone capture in an Electron renderer on Linux
- `navigator.mediaDevices.getUserMedia({ audio: true })`, then an `AudioContext({ sampleRate:
  16000 })` with an AudioWorklet to collect Float32 frames (standard web API; not Electron-specific).
- "By default, Electron will automatically approve all permission requests unless the developer has manually configured a custom handler."
  https://www.electronjs.org/docs/latest/tutorial/security
- A browser must therefore set both `session.setPermissionRequestHandler` (permission `media`; `details.mediaTypes` lists what was requested) and `setPermissionCheckHandler`
  (`details.mediaType` is `video`, `audio` or `unknown`; `details.securityOrigin`), granting audio
  only to Longboard's own voice page and prompting for web pages.
  https://www.electronjs.org/docs/latest/api/session
- An OS-level microphone permission prompt on Linux: not confirmed (none documented).
- Silent-device pitfall: "`getUserMedia` succeeds and the track delivers digital silence" when
  Chrome's default capture device differs from the OS's; choose the device explicitly via
  `enumerateDevices()`. https://unpkg.com/@moonshine-ai/moonshine-wasm@0.1.6/README.md
- Linux audio backend used by Chromium 156 (PulseAudio/ALSA/PipeWire): not confirmed.

### Bluetooth voice remotes on Linux
- Whether they appear as ordinary ALSA/PulseAudio/PipeWire inputs: not confirmed, and the evidence found points to "generally no".
- Voice remotes do not use a standard audio profile. Nordic's Smart Remote firmware documents the
  Android TV Voice (ATVV) BLE service and a separate "voice over HID over GATT" scheme, with its
  own host-side component needed to expose the remote as a PulseAudio microphone (found via
  search summaries; pages not read in full).
  https://infocenter.nordicsemi.com/topic/com.nordic.infocenter.sr3nrf52.firmware/audio.html ,
  https://infocenter.nordicsemi.com/topic/com.nordic.infocenter.sr3nrf52.firmware/nvs.html
- On Android the audio device comes from a vendor kernel HID driver (forum report): https://devzone.nordicsemi.com/f/nordic-q-a/25002/android-tv-voice-input-with-smart-remote-3
- A webOS OSE forum post (2025) says the remote microphone is not available on Linux. https://forum.webosose.org/t/bluetooth-remotes-voice-input-support/5080
- Mainline BlueZ or PipeWire support for ATVV: not confirmed (none found). Plan on a USB or built-in microphone, or a remote with a USB dongle that enumerates as USB audio.

## Part B: search suggestion endpoints

All four returned OpenSearch suggestions JSON, `["query", ["s1", "s2", ...]]`, when fetched on
2026-11-19 with the query `weather lon`. Google appends two more array elements (an empty array
and an object with `google:suggestsubtypes`); ignore anything after index 1.

| Engine | Suggestions URL | Published by the engine? | Content-Type seen |
|---|---|---|---|
| DuckDuckGo | `https://duckduckgo.com/ac/?q={searchTerms}&type=list` | Yes, opensearch.xml | application/javascript |
| Brave | `https://search.brave.com/api/suggest?q={searchTerms}` | Yes, opensearch.xml | application/json |
| Google | `https://www.google.com/complete/search?client=firefox&q={searchTerms}` | Partly, see below | text/javascript |
| Bing | `https://www.bing.com/osjson.aspx?query={searchTerms}` | Not confirmed; browser configs only | application/json |

### DuckDuckGo
- https://duckduckgo.com/opensearch.xml publishes exactly:
  `<Url type="application/x-suggestions+json" template="https://duckduckgo.com/ac/?q={searchTerms}&amp;type=list"/>`
- No `<link rel="search">` in the homepage's static HTML.
- Firefox uses `https://ac.duckduckgo.com/ac/` with `type=list` (also answered 200); Chromium uses the same URL as the opensearch.xml.
- Terms: https://duckduckgo.com/terms says nothing about automated access or rate limits; it refers to an Acceptable Use Policy that was not read. Rate limits: not confirmed.

### Brave Search
- Homepage: `<link rel="search" type="application/opensearchdescription+xml" title="Brave Search" href="/opensearch.xml"/>`
- https://search.brave.com/opensearch.xml publishes exactly:
  `<Url type="application/x-suggestions+json" method="GET" template="https://search.brave.com/api/suggest?q={searchTerms}"/>`
- Chromium's entry adds `&rich=true&rich_verticals=true` (a richer, non-OpenSearch response; do not add those).
- https://search.brave.com/robots.txt has `Disallow: /api` (addressed to crawlers). Brave sells a
  separate keyed Suggest API at `https://api.search.brave.com/res/v1/suggest/search`.
  https://api-dashboard.search.brave.com/app/documentation/suggest
- Terms or rate limits for the public endpoint: not confirmed (terms page not found).

### Google
- No `<link rel="search">` on the homepage and https://www.google.com/opensearch.xml is 404.
  Google does serve a description at https://www.google.com/searchdomaincheck?format=opensearch :
  `<Url template="https://www.google.com/complete/search?q={searchTerms}&amp;inputencoding={inputEncoding}&amp;outputencoding={outputEncoding}" rel="suggestions" type="application/x-suggestions+json"></Url>`
- That template as published returned HTTP 400 in testing; it needs a `client` parameter. With `client=firefox` it returned the OpenSearch array, as did
  `https://suggestqueries.google.com/complete/search?client=firefox&q=`.
- Firefox's config: base `https://www.google.com/complete/search`, params `client=firefox`,
  `channel=fen`, term param `q`. The `client=` values are known only from browser source, not
  from Google documentation.
- Chromium's Google template is Chrome-specific (`xssi=t` prefixed response); not suitable.
- Terms: Google prohibits "using automated means to access content from any of our services in
  violation of the machine-readable instructions". https://policies.google.com/terms
  https://www.google.com/robots.txt contains no rule mentioning `/complete`. Rate limits: not
  confirmed.

### Bing
- No `<link rel="search">` found in the homepage HTML; `/opensearch.xml` and `/sa/osd/search.xml` are 404. An engine-published description: not confirmed.
- Chromium: `https://www.bing.com/osjson.aspx?query={searchTerms}&language={language}`.
  Firefox: base `https://www.bing.com/osjson.aspx`, param `form=OSDJAS`, term param `query`.
- Response carried `cache-control: public, max-age=300`. `https://api.bing.com/osjson.aspx` also answered. Terms or rate limits: not confirmed.

### Sources for browser configurations
- Chromium `prepopulated_engines.json` (now in a separate repository pulled in by DEPS as `third_party/search_engines_data/resources`):
  https://chromium.googlesource.com/external/search_engines_data/+/refs/heads/main/definitions/prepopulated_engines.json
- Firefox `search-config-v2.json`: https://github.com/mozilla-firefox/firefox/blob/main/services/settings/dumps/main/search-config-v2.json
  (no engine with identifier `brave` was found in it).

### Note
- Each keystroke sent is a background request to the engine: needs its own disclosed switch. No engine states a rate limit, so debounce and cancel stale requests.

