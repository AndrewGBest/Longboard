// Player control is ordinary input. The layer never calls play(), pause() or
// sets currentTime on the site's video element: doing so goes around the
// site's own player, which is what decides whether a seek is allowed (for
// example during an advertisement). Instead the layer asks the shell to press
// a real key, and the site's player handles it like any other key press.
import type { PlayerKeyName } from './profile';

export type PlayerKey = 'playPause' | 'seekBack' | 'seekForward' | 'close';
/**
 * Other ordinary keys the layer asks for: the on-screen keyboard's delete
 * and enter, and what a controller's buttons stand for while one of the
 * browser's own lists (a drop-down) is open.
 */
export type TextKey = 'backspace' | 'enter' | 'up' | 'down' | 'left' | 'right' | 'space';

interface KeyInfo {
  /** Electron accelerator-style key code for `webContents.sendInputEvent`. */
  code: string;
  /** The `KeyboardEvent.key` value the page will see. */
  domKey: string;
  /** Character to send between key down and key up, where the browser acts on the character (Enter submitting a form). */
  char?: string;
}

const KEYS: Record<PlayerKey | TextKey | PlayerKeyName, KeyInfo> = {
  playPause: { code: 'Space', domKey: ' ' },
  seekBack: { code: 'Left', domKey: 'ArrowLeft' },
  seekForward: { code: 'Right', domKey: 'ArrowRight' },
  close: { code: 'Escape', domKey: 'Escape' },
  backspace: { code: 'Backspace', domKey: 'Backspace' },
  enter: { code: 'Enter', domKey: 'Enter', char: '\r' },
  up: { code: 'Up', domKey: 'ArrowUp' },
  down: { code: 'Down', domKey: 'ArrowDown' },
  left: { code: 'Left', domKey: 'ArrowLeft' },
  right: { code: 'Right', domKey: 'ArrowRight' },
  space: { code: 'Space', domKey: ' ', char: ' ' },
  // The keys a profile may name for a site's player (shared/profile.ts).
  Space: { code: 'Space', domKey: ' ' },
  Enter: { code: 'Enter', domKey: 'Enter' },
  ArrowLeft: { code: 'Left', domKey: 'ArrowLeft' },
  ArrowRight: { code: 'Right', domKey: 'ArrowRight' },
  ArrowUp: { code: 'Up', domKey: 'ArrowUp' },
  ArrowDown: { code: 'Down', domKey: 'ArrowDown' },
  k: { code: 'k', domKey: 'k' },
  j: { code: 'j', domKey: 'j' },
  l: { code: 'l', domKey: 'l' },
  f: { code: 'f', domKey: 'f' },
  m: { code: 'm', domKey: 'm' },
};

/** The player key an action stands for, if any. */
export function playerKeyFor(action: { type: string; seconds?: number }): PlayerKey | null {
  if (action.type === 'playPause') return 'playPause';
  if (action.type === 'seek') return (action.seconds ?? 0) < 0 ? 'seekBack' : 'seekForward';
  return null;
}

/**
 * True when a physical key press is already the key the site's player expects
 * for this action. Such a press is left alone: handling it and pressing the
 * same key again would deliver it to the site twice. `siteKeys` are the keys
 * a profile names for this site's player, when it names any.
 */
export function isNativePlayerKey(
  domKey: string,
  action: { type: string; seconds?: number },
  siteKeys?: { playPause: PlayerKeyName; back: PlayerKeyName; forward: PlayerKeyName },
): boolean {
  const key = playerKeyFor(action);
  if (key === null) return false;
  const name = !siteKeys
    ? key
    : key === 'playPause'
      ? siteKeys.playPause
      : key === 'seekBack'
        ? siteKeys.back
        : key === 'seekForward'
          ? siteKeys.forward
          : key;
  return KEYS[name].domKey === domKey;
}

/** Validates an untrusted value from the page side; anything else yields null. */
export function playerKeyInfo(key: unknown): KeyInfo | null {
  return typeof key === 'string' && Object.hasOwn(KEYS, key) ? KEYS[key as PlayerKey | TextKey | PlayerKeyName] : null;
}

/**
 * A key, as Electron's own input events name it, for passing a key press on
 * from one of the app's views to another. Null for a key that is not passed
 * on (modifiers, function keys, anything unknown).
 */
export function strayKeyCode(key: string): string | null {
  const named: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Enter',
    Escape: 'Escape',
    Backspace: 'Backspace',
    ' ': 'Space',
    Tab: 'Tab',
  };
  if (named[key]) return named[key]!;
  return /^[a-z0-9]$/i.test(key) ? key : null;
}

/**
 * The same key as the DevTools input channel wants it said (the channel that
 * reaches a frame served by another site). Null for no key.
 */
export function cdpKey(
  info: { domKey: string; char?: string } | null,
): { key: string; code: string; windowsVirtualKeyCode: number; nativeVirtualKeyCode: number; text?: string } | null {
  if (!info) return null;
  const named: Record<string, [string, number]> = {
    ' ': ['Space', 32],
    ArrowLeft: ['ArrowLeft', 37],
    ArrowUp: ['ArrowUp', 38],
    ArrowRight: ['ArrowRight', 39],
    ArrowDown: ['ArrowDown', 40],
    Escape: ['Escape', 27],
    Enter: ['Enter', 13],
    Backspace: ['Backspace', 8],
  };
  const key = info.domKey;
  const known = named[key];
  const letter = /^[a-z0-9]$/i.test(key);
  if (!known && !letter) return null;
  const [code, vk] = known ?? [
    (/[0-9]/.test(key) ? 'Digit' : 'Key') + key.toUpperCase(),
    key.toUpperCase().charCodeAt(0),
  ];
  const text = key === ' ' ? ' ' : key === 'Enter' ? '\r' : letter ? key : undefined;
  return { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...(text ? { text } : {}) };
}

/**
 * Remembers which key presses the layer itself asked for, so that when they
 * arrive as real key events the layer lets them through to the site instead
 * of handling them again. Time is passed in to keep this testable.
 */
export class InjectedKeys {
  private pending: Array<{ domKey: string; until: number }> = [];

  constructor(private readonly windowMs = 1000) {}

  expect(domKey: string, now: number): void {
    this.pending = this.pending.filter((p) => p.until > now);
    this.pending.push({ domKey, until: now + this.windowMs });
  }

  /** True, once, for a key press that was asked for and has not expired. */
  consume(domKey: string, now: number): boolean {
    this.pending = this.pending.filter((p) => p.until > now);
    const i = this.pending.findIndex((p) => p.domKey === domKey);
    if (i < 0) return false;
    this.pending.splice(i, 1);
    return true;
  }
}
