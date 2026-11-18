// The permission policy: what a website may be given. Everything is refused
// unless it is listed here (Hard rule 13). Pure, so the rules are unit-tested;
// the shell wires them to the session.

export { siteKey } from '../shared/address';

/** What the person has answered for one site. */
export interface SitePermissions {
  /** Protected (DRM) playback through the browser's standard interface. */
  protectedPlayback?: 'granted' | 'denied';
}

export type PermissionDecision = 'grant' | 'deny' | 'ask';

/**
 * - Full screen is granted: it is what a video's own full-screen button asks
 *   for, and the browser only honours it after a key or button press.
 * - Protected playback is asked about once per site, and the answer kept.
 * - Everything else (camera, microphone, location, notifications, clipboard
 *   reading, MIDI, USB and the rest) is refused. A TV has no use for most of
 *   them and no way yet to ask about them clearly.
 */
export function permissionDecision(permission: string, saved: SitePermissions | undefined): PermissionDecision {
  if (permission === 'fullscreen') return 'grant';
  if (permission === 'mediaKeySystem') {
    if (saved?.protectedPlayback === 'granted') return 'grant';
    if (saved?.protectedPlayback === 'denied') return 'deny';
    return 'ask';
  }
  return 'deny';
}

/** Protected playback is only ever offered to pages loaded securely (or from this machine, for testing). */
export function mayAskProtectedPlayback(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'));
  } catch {
    return false;
  }
}
