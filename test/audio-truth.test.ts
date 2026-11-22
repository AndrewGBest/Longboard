import { afterEach, describe, expect, it } from 'vitest';
import { correctAudioAnswers, namesDolbyAudio } from '../src/shared/audio-truth';

const g = globalThis as Record<string, unknown>;
const set = (claims: boolean): { asked: string[] } => {
  const asked: string[] = [];
  g['MediaSource'] = { isTypeSupported: (t: string) => (asked.push(t), claims || !/ac-3|ec-3/.test(t)) };
  g['HTMLMediaElement'] = { prototype: { canPlayType: () => 'probably' } };
  Object.defineProperty(g, 'navigator', { value: { mediaCapabilities: { decodingInfo: () => Promise.resolve({ supported: true }) } }, configurable: true });
  return { asked };
};
afterEach(() => {
  delete g['MediaSource'];
  delete g['HTMLMediaElement'];
});

describe('the truth about AC-3 and E-AC-3 sound', () => {
  it('knows the types that name them, and no others', () => {
    for (const t of ['audio/mp4; codecs="ec-3"', 'audio/mp4; codecs="ac-3"', 'audio/mp4;codecs=ec-3', 'video/mp4; codecs="avc1.64001f, ec-3"', 'audio/mp4; codecs="mp4a.a6"', 'audio/mp4; codecs="mp4a.A5"']) expect(namesDolbyAudio(t)).toBe(true);
    for (const t of ['audio/mp4; codecs="mp4a.40.2"', 'video/mp4; codecs="avc1.64001f"', 'audio/webm; codecs="opus"', 'audio/mp4', '', null, undefined, 3]) expect(namesDolbyAudio(t)).toBe(false);
  });

  it('answers no to them three ways and leaves every other answer the engine\'s', async () => {
    set(true);
    correctAudioAnswers();
    const source = g['MediaSource'] as { isTypeSupported: (t: string) => boolean };
    expect(source.isTypeSupported('audio/mp4; codecs="ec-3"')).toBe(false);
    expect(source.isTypeSupported('audio/mp4; codecs="ac-3"')).toBe(false);
    expect(source.isTypeSupported('audio/mp4; codecs="mp4a.40.2"')).toBe(true);
    const media = (g['HTMLMediaElement'] as { prototype: { canPlayType: (t: string) => string } }).prototype;
    expect(media.canPlayType('audio/mp4; codecs="ec-3"')).toBe('');
    expect(media.canPlayType('audio/mp4; codecs="mp4a.40.2"')).toBe('probably');
    const caps = (g['navigator'] as { mediaCapabilities: { decodingInfo: (c: unknown) => Promise<{ supported: boolean }> } }).mediaCapabilities;
    expect((await caps.decodingInfo({ type: 'media-source', audio: { contentType: 'audio/mp4; codecs="ec-3"' } })).supported).toBe(false);
    expect((await caps.decodingInfo({ type: 'media-source', audio: { contentType: 'audio/mp4; codecs="mp4a.40.2"' } })).supported).toBe(true);
    expect((await caps.decodingInfo({ type: 'media-source', video: { contentType: 'video/mp4; codecs="avc1.64001f"' } })).supported).toBe(true);
  });

  it('changes nothing when the engine already says no', () => {
    set(false);
    const before = (g['MediaSource'] as { isTypeSupported: unknown }).isTypeSupported;
    correctAudioAnswers();
    expect((g['MediaSource'] as { isTypeSupported: unknown }).isTypeSupported).toBe(before);
  });

  it('stands alone, so it can be handed to the page as text', () => {
    set(true);
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(`(${correctAudioAnswers.toString()})()`)();
    expect((g['MediaSource'] as { isTypeSupported: (t: string) => boolean }).isTypeSupported('audio/mp4; codecs="ec-3"')).toBe(false);
  });
});
