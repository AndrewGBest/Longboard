// What every screen shares: the link to the shell, the state it sends, and
// where the person is in Longboard's own screens.
import { ipcRenderer } from 'electron';

import { type Layer } from '../../layer/index';
import { type BootData, type BridgeMessage } from '../../shared/actions';
import { type ChromeMessage, type ChromeState } from '../../shared/chrome';

/** What the shell hands over as the view starts: the layer's options, and the first state if there is one. */
export const boot = ipcRenderer.sendSync('longboard:boot') as BootData & { state?: ChromeState };
/** The layer's messages to the shell, the same ones it sends from a website. */
export const send = (msg: BridgeMessage): void => ipcRenderer.send('longboard:msg', msg);
/** What a screen asks the shell to do. The shell answers with a new state. */
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
  /** The last state the shell sent; undefined until the first arrives. */
  state: ChromeState | undefined;
  /** The navigation layer that moves the highlight on these screens; undefined until the document is ready. */
  layer: Layer | undefined;
  /** True while the address field stands in for the "go to" button. */
  typing: boolean;
  /** What the person has chosen so far on the "add as an app" panel. */
  draft: { name: string; ownSession: boolean; launcher: boolean };
  /** The menu's own second page, about the site in front. */
  menuPage: 'main' | 'site';
  /** A list to choose one thing from, opened from a Settings page. */
  choosing: 'search' | 'language' | 'ads' | 'theme' | null;
  /** The page of Settings that is showing. */
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
