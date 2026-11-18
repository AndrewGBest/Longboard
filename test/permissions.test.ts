import { describe, expect, it } from 'vitest';
import { mayAskProtectedPlayback, permissionDecision } from '../src/main/permissions';

describe('permissionDecision', () => {
  it('grants full screen', () => {
    expect(permissionDecision('fullscreen', undefined)).toBe('grant');
  });

  it('asks about protected playback once, then keeps the answer', () => {
    expect(permissionDecision('mediaKeySystem', undefined)).toBe('ask');
    expect(permissionDecision('mediaKeySystem', {})).toBe('ask');
    expect(permissionDecision('mediaKeySystem', { protectedPlayback: 'granted' })).toBe('grant');
    expect(permissionDecision('mediaKeySystem', { protectedPlayback: 'denied' })).toBe('deny');
  });

  it('refuses everything else, whatever is saved', () => {
    for (const permission of [
      'media', 'geolocation', 'notifications', 'midi', 'midiSysex', 'pointerLock', 'keyboardLock', 'openExternal', 'clipboard-read',
      'clipboard-sanitized-write', 'display-capture', 'idle-detection', 'window-management', 'hid', 'serial', 'usb', 'storage-access',
      'top-level-storage-access', 'speaker-selection', 'fileSystem', 'unknown', 'something-new',
    ]) {
      expect(permissionDecision(permission, { protectedPlayback: 'granted' }), permission).toBe('deny');
    }
  });
});

describe('mayAskProtectedPlayback', () => {
  it('is only for secure pages and this machine', () => {
    expect(mayAskProtectedPlayback('https://example.com/watch')).toBe(true);
    expect(mayAskProtectedPlayback('http://127.0.0.1:9000/')).toBe(true);
    expect(mayAskProtectedPlayback('http://example.com/')).toBe(false);
    expect(mayAskProtectedPlayback('data:text/html,x')).toBe(false);
    expect(mayAskProtectedPlayback('nonsense')).toBe(false);
  });
});
