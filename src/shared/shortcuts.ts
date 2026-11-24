// The keyboard shortcuts every desk browser has, for a keyboard that is
// plugged in. Pure, so the table is unit-tested; the shell acts on them.
// A remote never sends these; the person's own button mappings win over them.

export type Shortcut =
  | 'address'
  | 'newTab'
  | 'privateTab'
  | 'closeTab'
  | 'reopenTab'
  | 'nextTab'
  | 'previousTab'
  | 'reload'
  | 'back'
  | 'forward'
  | 'find'
  | 'history'
  | 'downloads'
  | 'savePage'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset';

export interface ShortcutKey {
  key: string;
  control?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

/** What is shown in About and help: the keys, and what they do. */
export const SHORTCUT_HELP: readonly (readonly [string, string])[] = [
  ['Ctrl+L', 'Type an address or search'],
  ['Ctrl+T, Ctrl+Shift+N', 'New tab, new private tab'],
  ['Ctrl+W, Ctrl+Shift+T', 'Close the tab, open the tab closed last'],
  ['Ctrl+Tab', 'Next tab'],
  ['Alt+Left, Alt+Right', 'Back, forward'],
  ['Ctrl+R or F5', 'Reload'],
  ['Ctrl+F', 'Find on this page'],
  ['Ctrl+H, Ctrl+J', 'History, downloads'],
  ['Ctrl+D', 'Keep this page on Home'],
  ['Ctrl+Plus, Ctrl+Minus, Ctrl+0', 'Bigger, smaller, the usual size'],
];

/** The shortcut a key press stands for, or null. `taken` are the keys the person gave a job of their own ("Ctrl+t", "F5"). */
export function shortcutFor(e: ShortcutKey, taken: Readonly<Record<string, unknown>> = {}): Shortcut | null {
  if (e.meta) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (Object.hasOwn(taken, e.control ? `Ctrl+${key}` : key)) return null;
  if (e.alt) {
    if (e.control || e.shift) return null;
    return key === 'ArrowLeft' ? 'back' : key === 'ArrowRight' ? 'forward' : null;
  }
  if (!e.control) return key === 'F5' && !e.shift ? 'reload' : null;
  if (e.shift) {
    switch (key) {
      case 'n':
        return 'privateTab';
      case 't':
        return 'reopenTab';
      case 'Tab':
        return 'previousTab';
      // On most keyboards "+" is Shift and "=".
      case '+':
      case '=':
        return 'zoomIn';
      default:
        return null;
    }
  }
  switch (key) {
    case 'l':
      return 'address';
    case 't':
      return 'newTab';
    case 'w':
      return 'closeTab';
    case 'Tab':
      return 'nextTab';
    case 'r':
      return 'reload';
    case 'f':
      return 'find';
    case 'h':
      return 'history';
    case 'j':
      return 'downloads';
    case 'd':
      return 'savePage';
    case '+':
    case '=':
      return 'zoomIn';
    case '-':
      return 'zoomOut';
    case '0':
      return 'zoomReset';
    default:
      return null;
  }
}
