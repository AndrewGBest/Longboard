// The listening page: takes sound from the microphone, decides when the
// person has finished (shared/voice.ts), and has the Moonshine engine turn
// it into words, all on this machine. It is served by Longboard itself under
// voice://longboard/ and can reach nothing else.
import { heardText, LISTEN, Listener, loudness, VOICE_MODEL_FILES } from '../shared/voice';
// The engine as its package ships it, served beside this page.
// @ts-expect-error the address is only real when the page is served
import { ModelArch, Transcriber } from '/m/index.js';

interface Engine {
  transcribe: (audio: Float32Array, options: { sampleRate: number }) => { lines: Array<{ text: string }> };
}

const say = (message: Record<string, unknown>): void => window.postMessage({ from: 'voice-page', ...message }, '*');
let engine: Promise<Engine> | null = null;
let stop: (() => void) | null = null;

/** Loads the engine with the model's files, once. */
const ready = (): Promise<Engine> =>
  (engine ??= (async () => {
    const files = new Map<string, Uint8Array>();
    for (const f of VOICE_MODEL_FILES) {
      const got = await fetch(`/model/${f.name}`);
      if (!got.ok) throw new Error('model');
      files.set(f.name, new Uint8Array(await got.arrayBuffer()));
    }
    return (await Transcriber.load({ files, modelArch: ModelArch.TinyStreaming })) as Engine;
  })().catch((err) => {
    engine = null;
    throw err;
  }));

async function listen(): Promise<void> {
  if (stop) return;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
  } catch {
    say({ kind: 'failed', why: 'microphone' });
    return;
  }
  const loading = ready();
  // The engine wants 16,000 samples a second; the browser resamples to that.
  const audio = new AudioContext({ sampleRate: 16000 });
  const source = audio.createMediaStreamSource(stream);
  const frame = Math.round(audio.sampleRate * LISTEN.frame);
  const tap = audio.createScriptProcessor(1024, 1, 1);
  const listener = new Listener();
  const kept: Float32Array[] = [];
  let pending = new Float32Array(0);
  let over = false;
  const finish = (heard: boolean): void => {
    if (over) return;
    over = true;
    stop = null;
    tap.disconnect();
    source.disconnect();
    for (const track of stream.getTracks()) track.stop();
    void audio.close();
    if (!heard) {
      say({ kind: 'failed', why: 'nothing' });
      return;
    }
    say({ kind: 'working' });
    const all = new Float32Array(kept.reduce((n, k) => n + k.length, 0));
    let at = 0;
    for (const k of kept) {
      all.set(k, at);
      at += k.length;
    }
    loading.then(
      (e) => say({ kind: 'heard', text: heardText(e.transcribe(all, { sampleRate: 16000 }).lines.map((l) => l.text)) }),
      // What went wrong is for the log, to mend it by; it holds nothing that was said.
      (err) => say({ kind: 'failed', why: 'engine', detail: String(err).slice(0, 300) }),
    );
  };
  stop = () => finish(false);
  tap.onaudioprocess = (e) => {
    if (over) return;
    const block = e.inputBuffer.getChannelData(0);
    kept.push(new Float32Array(block));
    const joined = new Float32Array(pending.length + block.length);
    joined.set(pending);
    joined.set(block, pending.length);
    let i = 0;
    for (; i + frame <= joined.length; i += frame) {
      const verdict = listener.hear(loudness(joined.subarray(i, i + frame)));
      if (verdict !== 'go on') return finish(verdict === 'done');
    }
    pending = joined.slice(i);
  };
  source.connect(tap);
  // A processor only runs while it leads somewhere; this leads to silence.
  const mute = audio.createGain();
  mute.gain.value = 0;
  tap.connect(mute);
  mute.connect(audio.destination);
  say({ kind: 'listening' });
}

window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data || e.data.from !== 'voice-shell') return;
  if (e.data.what === 'listen') void listen();
  else if (e.data.what === 'stop') stop?.();
});
say({ kind: 'ready' });
