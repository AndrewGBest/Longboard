import { describe, expect, it } from 'vitest';
import {
  askablesFor,
  describeAsk,
  hasPermission,
  mayAsk,
  permissionDecision,
  withAnswers,
} from '../src/shared/permissions';
import { progressText, safeFileName, sizeText, uniqueName } from '../src/shared/downloads';

describe('permissionDecision', () => {
  it('grants full screen and a copy button, without asking', () => {
    expect(permissionDecision('fullscreen', undefined)).toEqual({ kind: 'grant' });
    expect(permissionDecision('clipboard-sanitized-write', undefined)).toEqual({ kind: 'grant' });
  });

  it('asks about what a person can sensibly be asked, once, then keeps the answer', () => {
    expect(permissionDecision('geolocation', undefined)).toEqual({ kind: 'ask', names: ['location'] });
    expect(permissionDecision('notifications', {})).toEqual({ kind: 'ask', names: ['notifications'] });
    expect(permissionDecision('clipboard-read', undefined)).toEqual({ kind: 'ask', names: ['clipboard'] });
    expect(permissionDecision('midiSysex', undefined)).toEqual({ kind: 'ask', names: ['midi'] });
    expect(permissionDecision('pointerLock', undefined)).toEqual({ kind: 'ask', names: ['pointerLock'] });
    expect(permissionDecision('mediaKeySystem', undefined)).toEqual({ kind: 'ask', names: ['protectedPlayback'] });
    expect(permissionDecision('geolocation', { answers: { location: 'granted' } })).toEqual({ kind: 'grant' });
    expect(permissionDecision('geolocation', { answers: { location: 'denied' } })).toEqual({ kind: 'deny' });
  });

  it('treats camera and microphone as two things that can be asked for together', () => {
    expect(permissionDecision('media', undefined, ['video'])).toEqual({ kind: 'ask', names: ['camera'] });
    expect(permissionDecision('media', undefined, ['audio'])).toEqual({ kind: 'ask', names: ['microphone'] });
    expect(permissionDecision('media', undefined, ['video', 'audio'])).toEqual({
      kind: 'ask',
      names: ['camera', 'microphone'],
    });
    // One already answered: only the other is asked about.
    expect(permissionDecision('media', { answers: { camera: 'granted' } }, ['video', 'audio'])).toEqual({
      kind: 'ask',
      names: ['microphone'],
    });
    expect(
      permissionDecision('media', { answers: { camera: 'granted', microphone: 'granted' } }, ['video', 'audio']),
    ).toEqual({ kind: 'grant' });
    // Either refused refuses the pair, and nothing is asked.
    expect(permissionDecision('media', { answers: { microphone: 'denied' } }, ['video', 'audio'])).toEqual({
      kind: 'deny',
    });
    expect(askablesFor('media')).toEqual(['camera', 'microphone']);
  });

  it('one answer does not carry over to another permission', () => {
    expect(permissionDecision('notifications', { answers: { camera: 'granted', location: 'granted' } })).toEqual({
      kind: 'ask',
      names: ['notifications'],
    });
  });

  it('refuses everything else without asking, whatever is saved', () => {
    const everything = {
      answers: {
        camera: 'granted',
        microphone: 'granted',
        location: 'granted',
        notifications: 'granted',
        clipboard: 'granted',
        midi: 'granted',
        pointerLock: 'granted',
        protectedPlayback: 'granted',
      },
    } as const;
    for (const permission of [
      'openExternal',
      'display-capture',
      'idle-detection',
      'window-management',
      'hid',
      'serial',
      'usb',
      'keyboardLock',
      'storage-access',
      'top-level-storage-access',
      'speaker-selection',
      'fileSystem',
      'unknown',
      'something-new',
    ]) {
      expect(permissionDecision(permission, everything), permission).toEqual({ kind: 'deny' });
    }
  });
});

describe('hasPermission', () => {
  it('is true only for what was granted', () => {
    expect(hasPermission('notifications', undefined)).toBe(false);
    expect(hasPermission('notifications', { answers: { notifications: 'granted' } })).toBe(true);
    expect(hasPermission('notifications', { answers: { notifications: 'denied' } })).toBe(false);
    expect(hasPermission('media', { answers: { camera: 'granted' } }, ['video'])).toBe(true);
    expect(hasPermission('media', { answers: { camera: 'granted' } }, ['video', 'audio'])).toBe(false);
    expect(hasPermission('fullscreen', undefined)).toBe(true);
    expect(hasPermission('usb', undefined)).toBe(false);
  });

  it('does not read "not asked yet" as refused for protected playback', () => {
    expect(hasPermission('mediaKeySystem', undefined)).toBe(true);
    expect(hasPermission('mediaKeySystem', { answers: { protectedPlayback: 'denied' } })).toBe(false);
  });
});

describe('answers and wording', () => {
  it('adds answers without losing earlier ones', () => {
    const first = withAnswers(undefined, ['camera', 'microphone'], true);
    expect(withAnswers(first, ['location'], false)).toEqual({
      answers: { camera: 'granted', microphone: 'granted', location: 'denied' },
    });
  });

  it('says what is being asked in plain words', () => {
    expect(describeAsk(['location'])).toBe('know where this device is');
    expect(describeAsk(['camera', 'microphone'])).toBe('use the camera and use the microphone');
  });

  it('only asks on behalf of secure pages and this machine', () => {
    expect(mayAsk('https://example.com/watch')).toBe(true);
    expect(mayAsk('http://127.0.0.1:9000/')).toBe(true);
    expect(mayAsk('http://example.com/')).toBe(false);
    expect(mayAsk('data:text/html,x')).toBe(false);
    expect(mayAsk('nonsense')).toBe(false);
  });
});

describe('download names', () => {
  it('keeps an ordinary name', () => {
    expect(safeFileName('Report 2026.pdf')).toBe('Report 2026.pdf');
  });

  it('never lets a name leave the downloads folder, hide itself or be empty', () => {
    expect(safeFileName('../../.bashrc')).toBe('_.._.bashrc');
    expect(safeFileName('/etc/passwd')).toBe('_etc_passwd');
    expect(safeFileName('..\\..\\x.exe')).toBe('_.._x.exe');
    expect(safeFileName('.hidden')).toBe('hidden');
    expect(safeFileName('  ')).toBe('download');
    expect(safeFileName('a\u0000b\nc')).toBe('abc');
    for (const name of ['../../.bashrc', '/etc/passwd', '..', '.', ''])
      expect(safeFileName(name)).not.toMatch(/^\.|[/\\]/);
  });

  it('shortens a very long name and keeps its ending', () => {
    const name = safeFileName(`${'x'.repeat(300)}.tar.gz`);
    expect(name.length).toBeLessThanOrEqual(120);
    expect(name.endsWith('.gz')).toBe(true);
  });

  it('never writes over a file that is already there', () => {
    const there = new Set(['report.pdf', 'report (2).pdf', 'notes']);
    const taken = (n: string): boolean => there.has(n);
    expect(uniqueName('fresh.pdf', taken)).toBe('fresh.pdf');
    expect(uniqueName('report.pdf', taken)).toBe('report (3).pdf');
    expect(uniqueName('notes', taken)).toBe('notes (2)');
  });

  it('says a size in words a person uses', () => {
    expect(sizeText(0)).toBe('');
    expect(sizeText(512)).toBe('512 bytes');
    expect(sizeText(3_565_158)).toBe('3.4 MB');
    expect(sizeText(250 * 1024 * 1024)).toBe('250 MB');
  });
});

describe('progressText', () => {
  it('says how far a download of known size has got', () => {
    expect(progressText(0, 2048)).toBe('0% of 2.0 KB');
    expect(progressText(1024, 2048)).toBe('50% of 2.0 KB');
    expect(progressText(2047, 2048)).toBe('99% of 2.0 KB');
    expect(progressText(4096, 2048)).toBe('100% of 2.0 KB');
  });
  it('says what has come so far when the size is not known', () => {
    expect(progressText(0, 0)).toBe('starting');
    expect(progressText(3_565_158, 0)).toBe('3.4 MB so far');
  });
});
