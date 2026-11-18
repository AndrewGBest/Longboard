// The permission policy: what a website may be given, and what the person is
// asked about. Nothing is given without either being on the short "always"
// list or the person saying yes for that site (Hard rule 13: default deny).
// Pure, so the rules are unit-tested; the shell wires them to the session.

export { siteKey } from '../shared/address';

/**
 * What a site can be allowed, in the words the question uses. The person is
 * asked the first time a site wants one, and the answer is kept for the site.
 */
export const ASKABLE = {
  camera: 'use the camera',
  microphone: 'use the microphone',
  location: 'know where this device is',
  notifications: 'show notifications',
  clipboard: 'read what was last copied',
  midi: 'use MIDI instruments',
  pointerLock: 'take over the pointer',
  protectedPlayback: 'play protected (DRM) video',
} as const;
export type Askable = keyof typeof ASKABLE;
export const ASKABLE_NAMES = Object.keys(ASKABLE) as Askable[];

/** What the person has answered for one site. */
export interface SitePermissions {
  answers?: Partial<Record<Askable, 'granted' | 'denied'>>;
}

export type PermissionDecision = { kind: 'grant' } | { kind: 'deny' } | { kind: 'ask'; names: Askable[] };

/**
 * What the browser's name for a request comes to in the person's terms.
 * "media" is the camera, the microphone or both, by what was asked for.
 * Null for anything Longboard never gives.
 */
export function askablesFor(permission: string, mediaTypes: readonly string[] = []): Askable[] | null {
  switch (permission) {
    case 'media': {
      const names: Askable[] = [];
      if (mediaTypes.includes('video')) names.push('camera');
      if (mediaTypes.includes('audio')) names.push('microphone');
      // Asked for without saying which (a check, not a request): both, to be safe.
      return names.length ? names : ['camera', 'microphone'];
    }
    case 'geolocation':
      return ['location'];
    case 'notifications':
      return ['notifications'];
    case 'clipboard-read':
      return ['clipboard'];
    case 'midi':
    case 'midiSysex':
      return ['midi'];
    case 'pointerLock':
      return ['pointerLock'];
    case 'mediaKeySystem':
      return ['protectedPlayback'];
    default:
      return null;
  }
}

/**
 * - Full screen is granted: it is what a video's own full-screen button asks
 *   for, and the browser only honours it after a key or button press. So is
 *   writing to the clipboard on a press (a page's "copy" button).
 * - What is in ASKABLE is asked about once per site, and the answer kept.
 *   A request for two things (camera and microphone) is granted only when
 *   both are, refused when either was refused, and otherwise asks about the
 *   ones not yet answered.
 * - Everything else is refused without asking: USB, serial and HID devices
 *   and screen capture (each needs a chooser Longboard does not have),
 *   opening other programs, and anything not known here.
 */
export function permissionDecision(permission: string, saved: SitePermissions | undefined, mediaTypes: readonly string[] = []): PermissionDecision {
  if (permission === 'fullscreen' || permission === 'clipboard-sanitized-write') return { kind: 'grant' };
  const names = askablesFor(permission, mediaTypes);
  if (!names) return { kind: 'deny' };
  const answers = saved?.answers ?? {};
  if (names.some((n) => answers[n] === 'denied')) return { kind: 'deny' };
  const open = names.filter((n) => answers[n] !== 'granted');
  return open.length === 0 ? { kind: 'grant' } : { kind: 'ask', names: open };
}

/**
 * Whether a site has a permission right now, for the browser's own checks
 * (which cannot wait for an answer). Only what was granted counts; protected
 * playback is the exception, because there "not asked yet" must not read as
 * refused before the site has made its request.
 */
export function hasPermission(permission: string, saved: SitePermissions | undefined, mediaTypes: readonly string[] = []): boolean {
  const decision = permissionDecision(permission, saved, mediaTypes);
  return decision.kind === 'grant' || (decision.kind === 'ask' && permission === 'mediaKeySystem');
}

/** The saved answers with new ones added. */
export function withAnswers(saved: SitePermissions | undefined, names: readonly Askable[], allow: boolean): SitePermissions {
  const answers = { ...saved?.answers };
  for (const name of names) answers[name] = allow ? 'granted' : 'denied';
  return { ...saved, answers };
}

/** "use the camera and use the microphone", for the question. */
export function describeAsk(names: readonly Askable[]): string {
  const parts = names.map((n) => ASKABLE[n]);
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The person is only ever asked on behalf of pages loaded securely (or from this machine, for testing). */
export function mayAsk(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'));
  } catch {
    return false;
  }
}
