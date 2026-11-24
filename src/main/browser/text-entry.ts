// Ways text gets into a page other than the on-screen keyboard: saved
// sign-ins, typing from a phone, speech. A password is kept only when the
// person asks, encrypted by the system's keyring, and never in a scripted
// run (Hard rule 10).
import { join } from 'node:path';
import { net, safeStorage, type WebContents } from 'electron';
import qrcode from 'qrcode-generator';
import { Passwords } from '../passwords';
import { PhoneTyping } from '../phone';
import { Voice } from '../voice';
import { resolveAddress } from '../../shared/address';
import type { Core } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface TextEntryPart {
  passwords: Passwords;
  /** True when saved sign-ins are offered: the setting is on, a keyring is there, and this is not a scripted run. */
  loginsOn: () => boolean;
  /** The address of the page whose sign-in form was seen, for each view that has one showing. */
  loginForms: WeakMap<Electron.WebContents, string>;
  /** A sign-in just typed that the person may ask to keep; held in memory for a few minutes and then dropped. */
  typed: WeakMap<Electron.WebContents, { place: string; user: string; password: string; at: number }>;
  /** The sign-in just typed in a view, or null when there is none or it has been held too long. */
  typedNow: (wc: WebContents) => { place: string; user: string; password: string } | null;
  /** Text from a phone or from speech, held until the layer in front says whether a text field has the cursor. */
  phoneHeld: { id: number; text: string; to: WebContents; at: number; from: 'phone' | 'voice' } | null;
  /** Typing from a phone (main/phone.ts): off until the person turns it on from the menu. */
  phone: PhoneTyping;
  /** Speech, recognised on this machine (main/voice.ts). */
  voice: Voice;
  /** Opens what was typed or said: an address, or words to search for. */
  openTyped: (input: string) => void;
  /** Starts listening, or stops when already listening. Asks first when the speech model has not been fetched. */
  speak: () => void;
  /** An address as a square code for a phone's camera: rows of 0 and 1. */
  codeFor: (text: string) => string[];
}

export function createTextEntry(core: Core): Omit<TextEntryPart, 'phoneHeld'> {
  // Kept only when the person says so, encrypted by the system's keyring;
  // without a keyring nothing is kept. Never in a scripted run.
  const passwords = new Passwords(join(core.dataDir, 'passwords.json'), {
    // "basic_text" is Chromium's fallback when the system has no keyring: a fixed key, which keeps nothing safe.
    available: async () =>
      (process.platform !== 'linux' || !['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend())) &&
      (await safeStorage.isAsyncEncryptionAvailable()),
    encrypt: async (text) => {
      const secret = await safeStorage.encryptStringAsync(text);
      // On Linux what the keyring protected starts "v11"; "v10" is the fixed key again, used when the keyring could not be reached after all.
      if (process.platform === 'linux' && secret.subarray(0, 3).toString('latin1') === 'v10')
        throw new Error('the keyring did not protect it');
      return secret;
    },
    decrypt: async (secret) => (await safeStorage.decryptStringAsync(secret)).result,
  });
  // The screens are drawn again once the keyring has answered.
  void passwords.ready.then(() => setImmediate(() => !core.win.isDestroyed() && core.refreshChrome()));
  const loginsOn = (): boolean => core.config.passwords !== false && !core.options.automation && passwords.available();
  const loginForms = new WeakMap<WebContents, string>();
  const typed = new WeakMap<WebContents, { place: string; user: string; password: string; at: number }>();
  const TYPED_KEPT_MS = 5 * 60_000;
  const typedNow = (wc: WebContents): { place: string; user: string; password: string } | null => {
    const held = typed.get(wc);
    if (held && Date.now() - held.at > TYPED_KEPT_MS) typed.delete(wc);
    return typed.get(wc) ?? null;
  };

  // Typing from a phone: off until the person turns it on from the menu, and
  // off again when Longboard closes. What a phone sends is typed where the
  // cursor is, or pressed as a button of the remote would be.
  let phoneCount = 0;
  core.phoneHeld = null;
  /** Holds text from a phone or from speech, and asks the layer in front whether a text field has the cursor for it. */
  const typeHeld = (text: string, from: 'phone' | 'voice'): void => {
    const front = core.active();
    if (front.isDestroyed()) return;
    const id = ++phoneCount;
    core.phoneHeld = { id, text: text.replace(/[\u0000-\u001f\u007f]+/g, ' '), to: front, at: Date.now(), from };
    front.send('longboard:phone-text', id);
  };
  const PHONE_BUTTONS = {
    up: 'Up',
    down: 'Down',
    left: 'Left',
    right: 'Right',
    ok: 'Return',
    enter: 'Return',
    back: 'Escape',
    delete: 'Backspace',
    playPause: 'MediaPlayPause',
  } as const;
  const phone = new PhoneTyping(
    join(__dirname, 'phone.js'),
    (message) => {
      if (core.win.isDestroyed()) return;
      const front = core.active();
      if (front.isDestroyed()) return;
      // The text stays here. The layer is only asked whether a text field has the cursor, and answers by number.
      if (message.t === 'text') typeHeld(message.v, 'phone');
      else if (message.t === 'key' && message.v === 'menu') core.toggleMenu();
      else if (message.t === 'key') {
        const keyCode = PHONE_BUTTONS[message.v as keyof typeof PHONE_BUTTONS];
        front.sendInputEvent({ type: 'keyDown', keyCode });
        if (keyCode === 'Return') front.sendInputEvent({ type: 'char', keyCode: '\r' });
        front.sendInputEvent({ type: 'keyUp', keyCode });
      }
    },
    () => {
      if (core.win.isDestroyed()) return;
      core.refreshChrome();
      core.notify('A phone is connected');
    },
  );
  // Recognised on this machine. The model is fetched once, when the person
  // agrees. What is heard is typed where the cursor is; with no text field
  // selected it is opened as an address or searched for.
  const voice = new Voice({
    modelDir: core.deps.voiceModel ?? join(core.dataDir, 'voice-model'),
    distDir: __dirname,
    engineDir: join(__dirname, '..', 'node_modules', '@moonshine-ai', 'moonshine-wasm', 'dist'),
    fetch: (url) => net.fetch(url, { credentials: 'omit', cache: 'no-store' }),
    event: (e) => {
      if (core.win.isDestroyed()) return;
      if (e.kind === 'listening') core.notify('Listening. Speak now');
      else if (e.kind === 'working') core.notify('Working out what you said');
      else if (e.kind === 'heard') {
        if (e.text) typeHeld(e.text, 'voice');
        else core.notify('Nothing could be made out');
      } else
        core.notify(
          e.why === 'microphone'
            ? 'No microphone could be used on this machine'
            : e.why === 'nothing'
              ? 'Nothing was heard'
              : 'The speech engine could not start',
        );
    },
  });
  const openTyped = (input: string): void => {
    const url = resolveAddress(input, core.config.search);
    // A search is not a site the person asked for by name; it is not put on Home.
    if (url) core.open(url, resolveAddress(input, 'https://search.invalid/?q=%s') === url);
  };
  const speak = (): void => {
    if (core.panel === 'prompt' || core.panel === 'pin') return;
    if (voice.busy) {
      voice.stop();
      return;
    }
    if (!voice.modelReady()) {
      core.pending = { what: 'voiceModel' };
      core.panel = 'prompt';
      core.layout();
      return;
    }
    if (core.panel === 'menu') {
      core.panel = null;
      core.layout();
    }
    voice.listen();
  };

  const codeFor = (text: string): string[] => {
    const code = qrcode(0, 'M');
    code.addData(text);
    code.make();
    const size = code.getModuleCount();
    return Array.from({ length: size }, (_r, row) =>
      Array.from({ length: size }, (_c, col) => (code.isDark(row, col) ? '1' : '0')).join(''),
    );
  };
  return { passwords, loginsOn, loginForms, typed, typedNow, phone, voice, openTyped, speak, codeFor };
}
