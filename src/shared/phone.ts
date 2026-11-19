// Typing from a phone: what a phone may send, how it is sealed, and which
// of this machine's addresses the phone is given. Pure (the sealing uses
// tweetnacl, which is pure too), so it is unit-tested; the little web
// server is main/phone.ts and the page the phone shows is src/phone.
//
// The phone and the TV are on the same home network and talk over plain
// http, because a TV has no certificate a phone would trust. So everything
// the phone sends is sealed with a key that never crosses the network: it is
// in the part of the address after "#", which a browser keeps to itself, and
// reaches the phone through the camera, from the code on the TV's screen.
import nacl from 'tweetnacl';

export type PhoneKey = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'menu' | 'delete' | 'enter' | 'playPause';
export const PHONE_KEYS: readonly PhoneKey[] = ['up', 'down', 'left', 'right', 'ok', 'back', 'menu', 'delete', 'enter', 'playPause'];

export type PhoneMessage = { t: 'hello' } | { t: 'text'; v: string } | { t: 'key'; v: PhoneKey };

export const MAX_PHONE_TEXT = 2000;
/** The most a sealed message can be, as sent: enough for the longest text, and no more. */
export const MAX_SEALED = 12_000;

const b64 = {
  to: (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  from: (text: string): Uint8Array | null => {
    if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
    try {
      return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    } catch {
      return null;
    }
  },
};

/** A new key for one run of phone typing, as it is written after the "#". */
export const newPhoneKey = (): string => b64.to(nacl.randomBytes(nacl.secretbox.keyLength));

const keyBytes = (key: string): Uint8Array | null => {
  const bytes = b64.from(key);
  return bytes && bytes.length === nacl.secretbox.keyLength ? bytes : null;
};

/** Seals a message. `n` is a number that only ever goes up, so a message heard on the network cannot be sent again. */
export function sealPhoneMessage(key: string, n: number, message: PhoneMessage): string | null {
  const k = keyBytes(key);
  if (!k) return null;
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(new TextEncoder().encode(JSON.stringify({ n, ...message })), nonce, k);
  const all = new Uint8Array(nonce.length + box.length);
  all.set(nonce);
  all.set(box, nonce.length);
  return b64.to(all);
}

/**
 * Opens what a phone sent. Null unless it was sealed with this run's key,
 * its number is higher than the last one taken, and it is one of the few
 * things a phone may say.
 */
export function openPhoneMessage(key: string, sealed: string, lastN: number): { n: number; message: PhoneMessage } | null {
  const k = keyBytes(key);
  if (!k || typeof sealed !== 'string' || sealed.length > MAX_SEALED) return null;
  const all = b64.from(sealed);
  if (!all || all.length <= nacl.secretbox.nonceLength) return null;
  const plain = nacl.secretbox.open(all.subarray(nacl.secretbox.nonceLength), all.subarray(0, nacl.secretbox.nonceLength), k);
  if (!plain) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const n = r['n'];
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= lastN) return null;
  if (r['t'] === 'hello') return { n, message: { t: 'hello' } };
  if (r['t'] === 'key' && (PHONE_KEYS as readonly unknown[]).includes(r['v'])) return { n, message: { t: 'key', v: r['v'] as PhoneKey } };
  if (r['t'] === 'text' && typeof r['v'] === 'string' && r['v'].length >= 1 && r['v'].length <= MAX_PHONE_TEXT) return { n, message: { t: 'text', v: r['v'] } };
  return null;
}

export interface NetAddress {
  address: string;
  family: string | number;
  internal: boolean;
}

/**
 * This machine's address on the home network, for the phone to reach: the
 * first IPv4 address that is not the machine talking to itself, preferring
 * the ranges home networks use. Null when there is no network.
 */
export function homeAddress(interfaces: Readonly<Record<string, readonly NetAddress[] | undefined>>): string | null {
  const all = Object.values(interfaces).flatMap((list) => list ?? []).filter((a) => !a.internal && (a.family === 'IPv4' || a.family === 4) && !a.address.startsWith('169.254.'));
  const home = all.find((a) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address));
  return (home ?? all[0])?.address ?? null;
}

/** The address the phone opens, with the key after the "#". */
export const phoneUrl = (address: string, port: number, key: string): string => `http://${address}:${port}/#${key}`;

/** The page the phone is given. It has no secrets in it: the key is in the phone's own address bar. */
export const PHONE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<title>Longboard remote</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; padding: 16px; background: #0b0e13; color: #f1f3f6; font: 17px/1.4 system-ui, sans-serif; }
  main { max-width: 440px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
  h1 { margin: 4px 0 0; font-size: 20px; }
  #state { margin: 0; color: #b7bfcb; font-size: 15px; min-height: 21px; }
  #state.bad { color: #f2bd6b; }
  textarea { width: 100%; min-height: 92px; padding: 12px; border: 2px solid #2b3441; border-radius: 12px; background: #141920; color: inherit; font: inherit; resize: vertical; }
  textarea:focus { outline: none; border-color: #5fd6c4; }
  button { min-height: 54px; border: 0; border-radius: 12px; background: #1d242e; color: inherit; font: 600 17px system-ui, sans-serif; touch-action: manipulation; }
  button:active { background: #f1f3f6; color: #0b0e13; }
  button.main { background: #5fd6c4; color: #062521; }
  .row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .pad button { min-height: 64px; font-size: 22px; }
  .pad .gap { visibility: hidden; }
  small { color: #8d97a6; }
</style>
</head>
<body>
<main>
  <h1>Longboard remote</h1>
  <p id="state">Connecting to the TV</p>
  <textarea id="text" placeholder="Type or dictate here, then Send" autocapitalize="off" autocomplete="off" spellcheck="false"></textarea>
  <div class="row"><button id="send" class="main">Send</button><button data-key="delete">Delete</button><button data-key="enter">Enter</button></div>
  <div class="pad">
    <button data-key="back">Back</button><button data-key="up" aria-label="Up">&#9650;</button><button data-key="menu">Menu</button>
    <button data-key="left" aria-label="Left">&#9664;</button><button data-key="ok" class="main">OK</button><button data-key="right" aria-label="Right">&#9654;</button>
    <button class="gap" tabindex="-1" aria-hidden="true"></button><button data-key="down" aria-label="Down">&#9660;</button><button data-key="playPause" aria-label="Play or pause">&#9654;&#10074;&#10074;</button>
  </div>
  <small>What you send goes into the text field that is selected on the TV. It is sealed with a key from the code you scanned, so others on your network cannot read it.</small>
</main>
<script src="/app.js"></script>
</body>
</html>
`;
