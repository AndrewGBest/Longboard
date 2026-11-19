// Speaking to Longboard: the rules that need no microphone. Pure, so they
// are unit-tested. The recognising is done on this machine by the Moonshine
// engine (a dependency) with a model fetched once from its makers; nothing
// said is sent anywhere. main/voice.ts fetches the model and runs the
// listening page; src/voice is that page.

/** Where the model comes from: its makers' own server, one fixed version. */
export const VOICE_MODEL_URL = 'https://download.moonshine.ai/model/tiny-streaming-en/quantized_26_07_30/';

/** The model's files, with the size and SHA-256 each must have. Fetched 2026-11-19. */
export const VOICE_MODEL_FILES: readonly { name: string; size: number; sha256: string }[] = [
  { name: 'frontend.ort', size: 8324920, sha256: '271a563251f11e6311949530f8025ed4d345c5d69d4ac1efa74093779927d636' },
  { name: 'encoder.ort', size: 7675440, sha256: 'a8414e1a5dedf9f2093d7680601dd8a9b0433e7020260eafe0e370ead91134ca' },
  { name: 'adapter.ort', size: 1319664, sha256: '22ecc949e146c49667fda28d102d4e30749a107dc88a396292aa8f277ef1347c' },
  { name: 'cross_kv.ort', size: 1287544, sha256: '143a36667b8d05fd9d04e8c337b7ee121f37ef299aea6b3d82bdb3d3401950b4' },
  { name: 'decoder_kv.ort', size: 32583720, sha256: '8852553f312adb6c9aa4d17418015049b30f412209ee569d336548c0044627de' },
  { name: 'streaming_config.json', size: 509, sha256: '74fe5ddebd63b17caf59e8a3b18c17547ff7bce1642050edbb1c3962674f8950' },
  { name: 'tokenizer.bin', size: 249974, sha256: '6884b35fd6377d4c4d32336a0bc152f36b64d1e45b6503683cdc238250a8472d' },
];

export const VOICE_MODEL_BYTES = VOICE_MODEL_FILES.reduce((n, f) => n + f.size, 0);
export const voiceModelSize = (): string => `${Math.round(VOICE_MODEL_BYTES / 1_000_000)} MB`;

/** How listening decides the person has finished. Times are in seconds. */
export const LISTEN = {
  /** Sound is looked at in pieces this long. */
  frame: 0.05,
  /** Quiet for this long after speech: finished. */
  quietAfter: 1.1,
  /** Nothing said for this long: give up. */
  noSpeech: 6,
  /** Never longer than this. */
  longest: 15,
  /** The least loudness (root mean square, 0 to 1) that counts as a voice, however quiet the room. */
  floor: 0.012,
} as const;

/**
 * Follows how loud each piece of sound is and says when to stop. The room's
 * own noise is learnt from the quietest pieces heard, and a voice is anything
 * well above it.
 */
export class Listener {
  private noise = 1;
  private spoke = false;
  private quiet = 0;
  private total = 0;

  /** Give it the loudness of the next piece. It answers "go on", "done" (speech, then quiet) or "nothing" (no one spoke). */
  hear(rms: number): 'go on' | 'done' | 'nothing' {
    this.total += LISTEN.frame;
    this.noise = Math.min(this.noise, Math.max(rms, 0.0005)) * 1.002;
    const voice = rms > Math.max(LISTEN.floor, this.noise * 3);
    if (voice) {
      this.spoke = true;
      this.quiet = 0;
    } else this.quiet += LISTEN.frame;
    if (this.spoke && this.quiet >= LISTEN.quietAfter) return 'done';
    if (!this.spoke && this.total >= LISTEN.noSpeech) return 'nothing';
    if (this.total >= LISTEN.longest) return this.spoke ? 'done' : 'nothing';
    return 'go on';
  }
}

/** The loudness of a piece of sound: its root mean square. */
export function loudness(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}

/** What was heard, made fit to type or search for: one line, no stray spaces, and no full stop a search does not want. */
export function heardText(lines: unknown): string {
  if (!Array.isArray(lines)) return '';
  const text = lines.filter((l): l is string => typeof l === 'string').join(' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text.replace(/[.。]$/, '').slice(0, 500);
}
