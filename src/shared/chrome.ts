// What passes between the shell and Longboard's own screens (Home, the menu
// panel, prompts). Those screens are drawn by a preload in the isolated
// world of a view that only ever loads Longboard's own file; no website can
// send or receive any of this.
import type { RecentSite } from './home';

export type Panel = 'menu' | 'about' | 'prompt';

export interface ChromeState {
  /** What fills the window behind any panel. */
  surface: 'home' | 'page';
  panel: Panel | null;
  version: string;
  home: { recents: RecentSite[] };
  /** About the page in the page view; null when none has been opened. */
  page: {
    site: string;
    title: string;
    canGoBack: boolean;
    /** Zoom relative to the automatic TV scale, in percent. */
    zoomPercent: number;
    pointer: boolean;
    /** The profile in use, or null in generic mode. */
    profile: string | null;
  } | null;
  /** The question being asked, while panel is 'prompt'. */
  prompt: { site: string; what: 'protectedPlayback' } | null;
}

export type MenuAction =
  | 'home' | 'resume' | 'back' | 'reload' | 'zoomIn' | 'zoomOut' | 'zoomReset'
  | 'pointer' | 'outline' | 'about' | 'quit' | 'close';

export const MENU_ACTIONS: readonly MenuAction[] = [
  'home', 'resume', 'back', 'reload', 'zoomIn', 'zoomOut', 'zoomReset', 'pointer', 'outline', 'about', 'quit', 'close',
];

export type ChromeMessage =
  /** Open what was typed: an address, or words to search for. */
  | { kind: 'open'; input: string }
  /** Open a Home tile. */
  | { kind: 'openRecent'; url: string }
  | { kind: 'menu'; action: MenuAction }
  | { kind: 'answer'; allow: boolean };
