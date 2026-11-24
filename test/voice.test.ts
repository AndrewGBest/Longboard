import { describe, expect, it } from 'vitest';
import {
  heardText,
  LISTEN,
  Listener,
  loudness,
  VOICE_MODEL_BYTES,
  VOICE_MODEL_FILES,
  VOICE_MODEL_URL,
  voiceModelSize,
} from '../src/shared/voice';

/** Feeds a listener `seconds` of sound at one loudness; the last verdict, or the first that is not "go on". */
const feed = (l: Listener, rms: number, seconds: number): string => {
  let verdict = 'go on';
  for (let t = 0; t < seconds && verdict === 'go on'; t += LISTEN.frame) verdict = l.hear(rms);
  return verdict;
};

describe('deciding when someone has finished speaking', () => {
  it('goes on through speech and stops after a pause', () => {
    const l = new Listener();
    expect(feed(l, 0.003, 0.5)).toBe('go on');
    expect(feed(l, 0.2, 2)).toBe('go on');
    expect(feed(l, 0.003, LISTEN.quietAfter - 0.3)).toBe('go on');
    expect(feed(l, 0.003, 0.5)).toBe('done');
  });
  it('does not stop for a short pause between words', () => {
    const l = new Listener();
    feed(l, 0.003, 0.3);
    feed(l, 0.2, 1);
    expect(feed(l, 0.003, 0.5)).toBe('go on');
    expect(feed(l, 0.2, 1)).toBe('go on');
  });
  it('gives up when nobody speaks', () => {
    expect(feed(new Listener(), 0.004, LISTEN.noSpeech + 1)).toBe('nothing');
  });
  it('is not fooled by a noisy room: only what is well above the room counts as a voice', () => {
    const l = new Listener();
    expect(feed(l, 0.05, LISTEN.noSpeech + 1)).toBe('nothing');
    const loud = new Listener();
    feed(loud, 0.05, 1);
    feed(loud, 0.4, 1.5);
    expect(feed(loud, 0.05, LISTEN.quietAfter + 0.2)).toBe('done');
  });
  it('never listens for ever', () => {
    // Someone who talks on and on, with only the short gaps there are between words.
    const l = new Listener();
    let verdict = 'go on';
    for (let t = 0; t < LISTEN.longest + 2 && verdict === 'go on'; t += 0.5) {
      verdict = feed(l, 0.3, 0.4);
      if (verdict === 'go on') verdict = feed(l, 0.01, 0.1);
    }
    expect(verdict).toBe('done');
  });
});

describe('sound and words', () => {
  it('measures loudness as the root mean square', () => {
    expect(loudness(new Float32Array(0))).toBe(0);
    expect(loudness(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
  });
  it('makes what was heard fit to type or search for', () => {
    expect(heardText([' Weather  tomorrow. ', 'In Leeds.'])).toBe('Weather tomorrow. In Leeds');
    expect(heardText(['one\ntwo', 5, null])).toBe('one two');
    expect(heardText('not a list')).toBe('');
    expect(heardText(['x'.repeat(900)])).toHaveLength(500);
  });
});

describe('the speech model', () => {
  it('comes from its makers over https, each file with a size and a checksum to hold it to', () => {
    expect(VOICE_MODEL_URL).toMatch(/^https:\/\/download\.moonshine\.ai\/.+\/$/);
    for (const f of VOICE_MODEL_FILES) {
      expect(f.name).toMatch(/^[a-z_.]+$/);
      expect(f.size).toBeGreaterThan(0);
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(VOICE_MODEL_BYTES).toBe(VOICE_MODEL_FILES.reduce((n, f) => n + f.size, 0));
    expect(voiceModelSize()).toBe('51 MB');
  });
});
