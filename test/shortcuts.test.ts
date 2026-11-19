import { describe, expect, it } from 'vitest';
import { shortcutFor } from '../src/shared/shortcuts';

describe('keyboard shortcuts', () => {
  it('knows the ones every desk browser has', () => {
    expect(shortcutFor({ key: 'l', control: true })).toBe('address');
    expect(shortcutFor({ key: 'T', control: true })).toBe('newTab');
    expect(shortcutFor({ key: 'w', control: true })).toBe('closeTab');
    expect(shortcutFor({ key: 'T', control: true, shift: true })).toBe('reopenTab');
    expect(shortcutFor({ key: 'N', control: true, shift: true })).toBe('privateTab');
    expect(shortcutFor({ key: 'Tab', control: true })).toBe('nextTab');
    expect(shortcutFor({ key: 'Tab', control: true, shift: true })).toBe('previousTab');
    expect(shortcutFor({ key: 'ArrowLeft', alt: true })).toBe('back');
    expect(shortcutFor({ key: 'ArrowRight', alt: true })).toBe('forward');
    expect(shortcutFor({ key: 'r', control: true })).toBe('reload');
    expect(shortcutFor({ key: 'F5' })).toBe('reload');
    expect(shortcutFor({ key: 'f', control: true })).toBe('find');
    expect(shortcutFor({ key: 'h', control: true })).toBe('history');
    expect(shortcutFor({ key: 'j', control: true })).toBe('downloads');
    expect(shortcutFor({ key: 'd', control: true })).toBe('savePage');
    expect(shortcutFor({ key: '=', control: true })).toBe('zoomIn');
    expect(shortcutFor({ key: '+', control: true, shift: true })).toBe('zoomIn');
    expect(shortcutFor({ key: '-', control: true })).toBe('zoomOut');
    expect(shortcutFor({ key: '0', control: true })).toBe('zoomReset');
  });
  it('leaves plain keys, the arrows and what Longboard already uses alone', () => {
    for (const key of ['l', 't', 'ArrowLeft', 'Enter', 'Tab', 'Backspace', ' ']) expect(shortcutFor({ key })).toBeNull();
    // Ctrl+O is the menu, Ctrl+Q quits, Ctrl+Shift+D saves an outline: none is a shortcut here.
    expect(shortcutFor({ key: 'o', control: true })).toBeNull();
    expect(shortcutFor({ key: 'q', control: true })).toBeNull();
    expect(shortcutFor({ key: 'D', control: true, shift: true })).toBeNull();
    expect(shortcutFor({ key: 'ArrowLeft', alt: true, control: true })).toBeNull();
    expect(shortcutFor({ key: 't', control: true, meta: true })).toBeNull();
  });
  it("gives way to a button the person gave a job of their own", () => {
    expect(shortcutFor({ key: 't', control: true }, { 'Ctrl+t': 'menu' })).toBeNull();
    expect(shortcutFor({ key: 'F5' }, { F5: 'playPause' })).toBeNull();
    expect(shortcutFor({ key: 'w', control: true }, { 'Ctrl+t': 'menu' })).toBe('closeTab');
  });
});
