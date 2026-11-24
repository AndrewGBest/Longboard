// Speaking to Longboard, on this machine: fetching the model once (when the
// person agrees), and running a page of Longboard's own that listens and
// recognises (src/voice). The page lives in a session of its own that can
// reach nothing but voice://longboard/ and is allowed the microphone and
// nothing else. Nothing said leaves the machine.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, normalize } from 'node:path';
import { session, WebContentsView, type WebContents } from 'electron';
import { VOICE_MODEL_FILES, VOICE_MODEL_URL } from '../shared/voice';

const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
};
const PAGE =
  '<!doctype html><meta charset="utf-8"><title>Longboard: listening</title><script type="module" src="/voice.js"></script>';
const HEADERS = {
  // Its own files only: no other site can be fetched from, sent to, or shown. The engine's own loader builds
  // functions from text, which is why "unsafe-eval" is allowed here, on a page that loads nothing from anywhere else.
  'content-security-policy':
    "default-src 'none'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:; worker-src 'self' blob:; connect-src 'self'; media-src 'self' blob:; base-uri 'none'; form-action 'none'",
  // Threads in the engine need the page set apart from every other origin: these three do that.
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'same-origin',
  'cache-control': 'no-store',
};

/** What the listening page reports as it goes. */
export type VoiceEvent =
  | { kind: 'listening' }
  | { kind: 'working' }
  | { kind: 'heard'; text: string }
  | { kind: 'failed'; why: 'microphone' | 'nothing' | 'engine' };

export interface VoiceOptions {
  /** Where the model is kept. */
  modelDir: string;
  /** Longboard's own built files (the listening page's script and preload). */
  distDir: string;
  /** The engine's package, as installed. */
  engineDir: string;
  fetch: (url: string) => Promise<Response>;
  event: (e: VoiceEvent) => void;
}

/** The speech model on disk and the hidden page that listens. */
export class Voice {
  private view: WebContentsView | null = null;
  private pageReady = false;
  private wanted = false;
  private giveUp: NodeJS.Timeout | undefined;

  constructor(private readonly o: VoiceOptions) {}

  /** True when every file of the model is here and the right size. */
  modelReady(): boolean {
    return VOICE_MODEL_FILES.every((f) => {
      try {
        return statSync(join(this.o.modelDir, f.name)).size === f.size;
      } catch {
        return false;
      }
    });
  }

  /** Fetches the model from its makers. Each file must be the size and have the SHA-256 written in shared/voice.ts, or nothing is kept. */
  async fetchModel(progress: (share: number) => void): Promise<boolean> {
    mkdirSync(this.o.modelDir, { recursive: true });
    const total = VOICE_MODEL_FILES.reduce((n, f) => n + f.size, 0);
    let done = 0;
    try {
      for (const f of VOICE_MODEL_FILES) {
        const to = join(this.o.modelDir, f.name);
        if (!(existsSync(to) && statSync(to).size === f.size)) {
          const response = await this.o.fetch(VOICE_MODEL_URL + f.name);
          if (!response.ok) throw new Error(`${f.name}: ${response.status}`);
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length !== f.size || createHash('sha256').update(bytes).digest('hex') !== f.sha256)
            throw new Error(`${f.name} is not the file expected`);
          writeFileSync(`${to}.part`, bytes);
          renameSync(`${to}.part`, to);
        }
        done += f.size;
        progress(done / total);
      }
      return true;
    } catch (err) {
      console.error(`[longboard] the speech model could not be fetched: ${String(err).slice(0, 200)}`);
      return false;
    }
  }

  removeModel(): void {
    this.close();
    rmSync(this.o.modelDir, { recursive: true, force: true });
  }

  private serve(path: string): Response {
    const send = (body: Buffer | string, type: string): Response =>
      new Response(typeof body === 'string' ? body : new Uint8Array(body), {
        headers: { ...HEADERS, 'content-type': type },
      });
    try {
      if (path === '/') return send(PAGE, 'text/html; charset=utf-8');
      if (path === '/voice.js') return send(readFileSync(join(this.o.distDir, 'voice.js')), 'text/javascript');
      if (path.startsWith('/model/')) {
        const name = basename(path);
        if (!VOICE_MODEL_FILES.some((f) => f.name === name)) throw new Error('not a model file');
        return send(readFileSync(join(this.o.modelDir, name)), 'application/octet-stream');
      }
      if (path.startsWith('/m/')) {
        const file = normalize(join(this.o.engineDir, path.slice(3)));
        if (!file.startsWith(this.o.engineDir) || !TYPES[extname(file)]) throw new Error('not an engine file');
        return send(readFileSync(file), TYPES[extname(file)]!);
      }
    } catch {
      // falls through to "not found"
    }
    return new Response('not found', { status: 404, headers: HEADERS });
  }

  private page(): WebContents {
    if (this.view) return this.view.webContents;
    const ses = session.fromPartition('longboard-voice');
    ses.protocol.handle('voice', (request) => this.serve(new URL(request.url).pathname));
    // The microphone and nothing else. That the page reaches nothing but its own files is its content policy (HEADERS).
    ses.setPermissionRequestHandler((_wc, permission, done, details) =>
      done(permission === 'media' && !(details as { mediaTypes?: string[] }).mediaTypes?.includes('video')),
    );
    ses.setPermissionCheckHandler((_wc, permission) => permission === 'media');
    this.view = new WebContentsView({
      webPreferences: {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        preload: join(this.o.distDir, 'voice-preload.js'),
      },
    });
    const wc = this.view.webContents;
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', (e) => e.preventDefault());
    wc.ipc.on('longboard:voice', (_event, message: unknown) => this.heard(message));
    // Its errors go to the log: there is no screen to see them on.
    wc.on('console-message', (e) => {
      if (e.level === 'error') console.error(`[longboard] the listening page: ${e.message.slice(0, 300)}`);
    });
    void wc.loadURL('voice://longboard/');
    return wc;
  }

  private heard(message: unknown): void {
    if (!message || typeof message !== 'object') return;
    const m = message as Record<string, unknown>;
    if (m['kind'] === 'ready') {
      this.pageReady = true;
      if (this.wanted) this.view?.webContents.send('longboard:voice-do', 'listen');
    } else if (m['kind'] === 'listening' || m['kind'] === 'working') {
      this.o.event({ kind: m['kind'] });
      // An engine that never answers must not leave "Speak" stuck.
      clearTimeout(this.giveUp);
      this.giveUp = setTimeout(
        () => {
          if (!this.wanted) return;
          this.close();
          this.o.event({ kind: 'failed', why: 'engine' });
        },
        m['kind'] === 'working' ? 30_000 : 50_000,
      );
    } else if (m['kind'] === 'heard') {
      clearTimeout(this.giveUp);
      this.wanted = false;
      this.o.event({ kind: 'heard', text: typeof m['text'] === 'string' ? m['text'].slice(0, 500) : '' });
    } else if (m['kind'] === 'failed') {
      clearTimeout(this.giveUp);
      this.wanted = false;
      const why = m['why'];
      if (typeof m['detail'] === 'string') console.error(`[longboard] the speech engine: ${m['detail'].slice(0, 300)}`);
      this.o.event({ kind: 'failed', why: why === 'microphone' || why === 'nothing' ? why : 'engine' });
    }
  }

  /** True while it is listening or working out what was said. */
  get busy(): boolean {
    return this.wanted;
  }

  listen(): void {
    if (this.wanted) return;
    this.wanted = true;
    const wc = this.page();
    if (this.pageReady) wc.send('longboard:voice-do', 'listen');
  }

  stop(): void {
    if (!this.wanted) return;
    this.wanted = false;
    this.view?.webContents.send('longboard:voice-do', 'stop');
  }

  close(): void {
    clearTimeout(this.giveUp);
    this.wanted = false;
    this.pageReady = false;
    this.view?.webContents.close();
    this.view = null;
  }
}
