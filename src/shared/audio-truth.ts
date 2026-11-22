// The engine Longboard is built on tells pages on Linux that it can play
// AC-3 and E-AC-3 sound (Dolby Digital and Digital Plus). It cannot: there
// is no decoder for them there. A site that trusts the answer sends that
// sound and its player fails. (Measured 2026-11-22 on a large streaming
// site: asked through `MediaSource.isTypeSupported`, told yes, and the
// player stopped with "audio decoder initialization failed"; with the answer
// corrected it played with ordinary sound. docs/DECISIONS.md.)
//
// This puts the answer right. It runs in the page's own world, before the
// page's scripts, on Linux only, and does nothing at all if the engine
// already answers no. It changes three answers about what can be decoded
// and nothing else: no request, no response, nothing of the page's, and
// nothing of protected playback (the key-system interface is not touched;
// Hard rule 2).
//
// The function must stand alone: it is handed to the page's world as text.

/** True for a media type that names AC-3 or E-AC-3 sound. Exported for tests; the same test is repeated inside `correctAudioAnswers`. */
export function namesDolbyAudio(type: unknown): boolean {
  return typeof type === 'string' && /codecs\s*=\s*"?[^";]*\b(ac-3|ec-3|mp4a\.a5|mp4a\.a6)\b/i.test(type);
}

export function correctAudioAnswers(): void {
  const names = (type: unknown): boolean => typeof type === 'string' && /codecs\s*=\s*"?[^";]*\b(ac-3|ec-3|mp4a\.a5|mp4a\.a6)\b/i.test(type);
  const w = globalThis as unknown as {
    MediaSource?: { isTypeSupported: (type: string) => boolean };
    ManagedMediaSource?: { isTypeSupported: (type: string) => boolean };
    HTMLMediaElement?: { prototype: { canPlayType: (type: string) => string } };
    navigator?: { mediaCapabilities?: { decodingInfo: (config: { audio?: { contentType?: string } }) => Promise<unknown> } };
  };
  try {
    const source = w.MediaSource;
    // An engine that already says no needs nothing from here.
    if (!source || !source.isTypeSupported('audio/mp4; codecs="ec-3"')) return;
    for (const holder of [source, w.ManagedMediaSource]) {
      if (!holder) continue;
      const asked = holder.isTypeSupported.bind(holder);
      holder.isTypeSupported = (type: string): boolean => (names(type) ? false : asked(type));
    }
    const media = w.HTMLMediaElement?.prototype;
    if (media) {
      const asked = media.canPlayType;
      media.canPlayType = function (this: unknown, type: string): string {
        return names(type) ? '' : asked.call(this, type);
      };
    }
    const capabilities = w.navigator?.mediaCapabilities;
    if (capabilities) {
      const asked = capabilities.decodingInfo.bind(capabilities);
      capabilities.decodingInfo = (config) =>
        names(config?.audio?.contentType) ? Promise.resolve({ supported: false, smooth: false, powerEfficient: false, keySystemAccess: null }) : asked(config);
    }
  } catch {
    // Never in a page's way: with nothing changed the page gets the engine's own answers.
  }
}
