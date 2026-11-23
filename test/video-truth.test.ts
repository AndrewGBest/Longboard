import { afterEach, describe, expect, it } from 'vitest';
import { additionsCanBeMet, correctVideoAnswers, VIDEO_LIMITS } from '../src/shared/video-truth';

const g = globalThis as Record<string, unknown>;
const engine = (strict: boolean): string[] => {
  const asked: string[] = [];
  g['MediaSource'] = { isTypeSupported: (t: string) => (asked.push(t), strict ? !/99999|9999/.test(t) : true) };
  return asked;
};
afterEach(() => {
  delete g['MediaSource'];
});
const vp9 = (more: string): string => `video/webm; codecs="vp9"; ${more}`;

describe('the truth about what picture can be played', () => {
  it('says no to what is beyond the engine and yes to the rest', () => {
    for (const more of ['width=99999', 'height=99999', 'framerate=9999', 'bitrate=2000000000', 'eotf=catavision', 'cryptoblockformat=invalidformat', 'decode-to-texture=nope', 'width=0', 'framerate=-1']) expect(additionsCanBeMet(vp9(more), false)).toBe(false);
    expect(additionsCanBeMet('audio/webm; codecs="opus"; channels=99', false)).toBe(false);
    for (const more of ['width=640', `width=${VIDEO_LIMITS.width}; height=${VIDEO_LIMITS.height}; framerate=60; bitrate=30000000`, 'eotf=bt709', 'cryptoblockformat=subsample', 'decode-to-texture=true', 'experimental=allowed', 'tunnelmode=true']) expect(additionsCanBeMet(vp9(more), false)).toBe(true);
    expect(additionsCanBeMet('video/mp4', false)).toBe(true);
    expect(additionsCanBeMet(undefined, false)).toBe(true);
  });

  it('takes a picture made for a bright-range screen only on one', () => {
    const hdrVp9 = 'video/webm; codecs="vp09.02.51.10.01.09.16.09.00"';
    const hdrAv1 = 'video/mp4; codecs="av01.0.12M.10.0.110.09.16.09.0"; eotf=smpte2084';
    expect([additionsCanBeMet(hdrVp9, false), additionsCanBeMet(hdrAv1, false)]).toEqual([false, false]);
    expect([additionsCanBeMet(hdrVp9, true), additionsCanBeMet(hdrAv1, true)]).toEqual([true, true]);
    expect(additionsCanBeMet('video/webm; codecs="vp09.00.51.08.01.01.01.01.00"', false)).toBe(true);
  });

  it('answers through the engine for everything else, without the additions it has judged', () => {
    const asked = engine(false);
    correctVideoAnswers();
    const source = g['MediaSource'] as { isTypeSupported: (t: string) => boolean };
    asked.length = 0;
    expect(source.isTypeSupported(vp9('width=99999'))).toBe(false);
    expect(asked).toEqual([]);
    expect(source.isTypeSupported(vp9('width=3840; height=2160; framerate=60; experimental=allowed'))).toBe(true);
    expect(asked).toEqual(['video/webm; codecs="vp9"; experimental=allowed']);
    expect(source.isTypeSupported('video/mp4; codecs="avc1.64001f"')).toBe(true);
    expect(asked.at(-1)).toBe('video/mp4; codecs="avc1.64001f"');
  });

  it('changes nothing when the engine already says no to the impossible', () => {
    engine(true);
    const before = (g['MediaSource'] as { isTypeSupported: unknown }).isTypeSupported;
    correctVideoAnswers();
    expect((g['MediaSource'] as { isTypeSupported: unknown }).isTypeSupported).toBe(before);
  });

  it('stands alone, and gives the same answers as the tested rule', () => {
    engine(false);
    new Function(`(${correctVideoAnswers.toString()})()`)();
    const source = g['MediaSource'] as { isTypeSupported: (t: string) => boolean };
    for (const more of ['width=99999', 'framerate=9999', 'width=640', 'bitrate=2000000000', 'eotf=bt709', 'decode-to-texture=nope']) expect(source.isTypeSupported(vp9(more))).toBe(additionsCanBeMet(vp9(more), false));
  });
});
