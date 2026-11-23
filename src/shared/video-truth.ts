// Some sites ask a browser what it can play in more detail than the web's
// standard question allows: they add the picture's width, height, frame
// rate, bit rate and the like to the media type, and expect a browser to
// say no to what it cannot do. The engine Longboard is built on ignores
// those additions and says yes to all of them, the impossible included
// ("a picture 99,999 pixels wide? yes").
//
// A large video site's TV app asks exactly such impossible questions first,
// to find out whether the answers can be trusted. Told yes, it stops
// trusting them and plays everything at 1280x720 and 30 pictures a second.
// (Measured 2026-11-23, signed out, in a 1920x1080 window: 1280x720 at 30
// before; with the answers below, 1920x1080 at 60 for the same video.)
// That a TV app behaves this way, and the list of additions, were learned
// from the open-source program VacuumTube, which corrects the same answers
// for the same reason; no code of it is used here.
//
// This puts the answers right: an addition whose value is beyond what the
// engine can do makes the answer no; the rest of the question goes to the
// engine unchanged. It runs in the page's own world before the page's
// scripts, as the correction for sound does (shared/audio-truth.ts). It
// changes this one answer and nothing else, and nothing of protected
// playback (the key-system interface is not touched; Hard rule 2). It is
// not a way round any limit a site sets: it stops Longboard saying it can
// do things it cannot.
//
// The function must stand alone: it is handed to the page's world as text.

/**
 * The limits the answers go by. Exported for tests; repeated inside
 * `correctVideoAnswers`, which cannot refer to anything outside itself.
 */
export const VIDEO_LIMITS = { width: 7680, height: 4320, framerate: 120, bitrate: 200_000_000, channels: 8 } as const;

/**
 * False when a media type carries an addition the engine cannot meet.
 * `hdr`: the screen shows high dynamic range. Exported for tests.
 */
export function additionsCanBeMet(type: unknown, hdr: boolean): boolean {
  if (typeof type !== 'string') return true;
  for (const part of type.split(';').slice(1)) {
    const at = part.indexOf('=');
    if (at === -1) continue;
    const key = part.slice(0, at).trim().toLowerCase();
    const value = part.slice(at + 1).trim().replace(/^"|"$/g, '');
    const n = Number(value);
    if (key === 'width' && !(n > 0 && n <= 7680)) return false;
    if (key === 'height' && !(n > 0 && n <= 4320)) return false;
    if (key === 'framerate' && !(n > 0 && n <= 120)) return false;
    if (key === 'bitrate' && !(n > 0 && n <= 200_000_000)) return false;
    if (key === 'channels' && !(n > 0 && n <= 8)) return false;
    if (key === 'eotf' && !(value === 'bt709' || ((value === 'smpte2084' || value === 'arib-std-b67') && hdr))) return false;
    if (key === 'cryptoblockformat' && value !== 'subsample') return false;
    if (key === 'decode-to-texture' && value !== 'true' && value !== 'false') return false;
    if (key === 'codecs' && !hdr) {
      // A picture coded for a high-dynamic-range screen (transfer 16 or 18), on a screen that is not one.
      for (const codec of value.split(',')) {
        const p = codec.trim().split('.');
        const transfer = p[0] === 'vp09' ? p[6] : p[0] === 'av01' ? p[7] : undefined;
        if (transfer === '16' || transfer === '18') return false;
      }
    }
  }
  return true;
}

export function correctVideoAnswers(): void {
  const w = globalThis as unknown as {
    MediaSource?: { isTypeSupported: (type: string) => boolean };
    ManagedMediaSource?: { isTypeSupported: (type: string) => boolean };
    matchMedia?: (q: string) => { matches: boolean };
  };
  const met = (type: unknown, hdr: boolean): { ok: boolean; rest: string } => {
    if (typeof type !== 'string') return { ok: true, rest: String(type) };
    const parts = type.split(';');
    const kept = [parts[0] ?? ''];
    for (const part of parts.slice(1)) {
      const at = part.indexOf('=');
      const key = (at === -1 ? part : part.slice(0, at)).trim().toLowerCase();
      const value = at === -1 ? '' : part.slice(at + 1).trim().replace(/^"|"$/g, '');
      const n = Number(value);
      let known = true;
      if (key === 'width') { if (!(n > 0 && n <= 7680)) return { ok: false, rest: '' }; }
      else if (key === 'height') { if (!(n > 0 && n <= 4320)) return { ok: false, rest: '' }; }
      else if (key === 'framerate') { if (!(n > 0 && n <= 120)) return { ok: false, rest: '' }; }
      else if (key === 'bitrate') { if (!(n > 0 && n <= 200000000)) return { ok: false, rest: '' }; }
      else if (key === 'channels') { if (!(n > 0 && n <= 8)) return { ok: false, rest: '' }; }
      else if (key === 'eotf') { if (!(value === 'bt709' || ((value === 'smpte2084' || value === 'arib-std-b67') && hdr))) return { ok: false, rest: '' }; }
      else if (key === 'cryptoblockformat') { if (value !== 'subsample') return { ok: false, rest: '' }; }
      else if (key === 'decode-to-texture') { if (value !== 'true' && value !== 'false') return { ok: false, rest: '' }; }
      else known = false;
      if (key === 'codecs' && !hdr) {
        for (const codec of value.split(',')) {
          const p = codec.trim().split('.');
          const transfer = p[0] === 'vp09' ? p[6] : p[0] === 'av01' ? p[7] : undefined;
          if (transfer === '16' || transfer === '18') return { ok: false, rest: '' };
        }
      }
      // What the engine does not know either is left for it to answer.
      if (!known) kept.push(part);
    }
    return { ok: true, rest: kept.join(';') };
  };
  try {
    const source = w.MediaSource;
    // An engine that already says no to the impossible needs nothing from here.
    if (!source || !source.isTypeSupported('video/webm; codecs="vp9"; width=99999')) return;
    const hdr = (): boolean => {
      try {
        return w.matchMedia?.('(dynamic-range: high)').matches === true;
      } catch {
        return false;
      }
    };
    for (const holder of [source, w.ManagedMediaSource]) {
      if (!holder) continue;
      const asked = holder.isTypeSupported.bind(holder);
      holder.isTypeSupported = (type: string): boolean => {
        const answer = met(type, hdr());
        return answer.ok ? asked(typeof type === 'string' && type.includes(';') ? answer.rest : type) : false;
      };
    }
  } catch {
    // Never in a page's way: with nothing changed the page gets the engine's own answers.
  }
}
