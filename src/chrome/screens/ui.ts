// What every screen shares: the link to the shell, the state it sends, and where the person is in Longboard's own screens.
import { ipcRenderer } from 'electron';
import { type BootData, type BridgeMessage } from '../../shared/actions';
import { type ChromeMessage, type ChromeState } from '../../shared/chrome';
import { type Layer } from '../../layer/index';

export const boot = ipcRenderer.sendSync('longboard:boot') as BootData & { state?: ChromeState };
export const send = (msg: BridgeMessage): void => ipcRenderer.send('longboard:msg', msg);
export const tell = (msg: ChromeMessage): void => ipcRenderer.send('longboard:chrome', msg);
/** Which page of Settings is showing. */
export type SettingsPage =
  | 'main'
  | 'passwords'
  | 'general'
  | 'display'
  | 'ads'
  | 'adsList'
  | 'privacy'
  | 'access'
  | 'profiles'
  | 'downloads'
  | 'remote'
  | 'lock'
  | 'updates'
  | 'extensions';

/** What the screens share and change: the state from the shell, and where the person is in Longboard's own screens. */
export const ui: {
  state: ChromeState | undefined;
  layer: Layer | undefined;
  /** True while the address field stands in for the "go to" button. */
  typing: boolean;
  /** What the person has chosen so far on the "add as an app" panel. */
  draft: { name: string; ownSession: boolean; launcher: boolean };
  /** The menu's own second page, about the site in front. */
  menuPage: 'main' | 'site';
  /** A list to choose one thing from, opened from a Settings page. */
  choosing: 'search' | 'language' | 'ads' | 'theme' | null;
  settingsPage: SettingsPage;
  /** A button that clears something has been pressed once and waits for the second press. */
  confirming: string | null;
  /** The Home tile the highlight was on when the menu was opened from Home; the menu offers to remove it. */
  menuFor:
    | { kind: 'recent'; url: string; name: string }
    | { kind: 'saved'; url: string; name: string }
    | { kind: 'app'; id: string; name: string }
    | null;
  /** What was last typed into "find in page". */
  finding: string;
  /** The digits entered so far on the PIN screen. Never shown, never kept after the fourth. */
  pinDigits: string;
  /** What was typed into history's search field. */
  historyWords: string;
} = {
  state: boot.state,
  layer: undefined,
  typing: false,
  draft: { name: '', ownSession: false, launcher: true },
  menuPage: 'main',
  choosing: null,
  settingsPage: 'main',
  confirming: null,
  menuFor: null,
  finding: '',
  pinDigits: '',
  historyWords: '',
};
