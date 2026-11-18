// What passes between the shell and Longboard's own screens (Home, the menu
// panel, prompts). Those screens are drawn by a preload in the isolated
// world of a view that only ever loads Longboard's own file; no website can
// send or receive any of this.
import type { RecentSite } from './home';

export type Panel = 'menu' | 'about' | 'prompt' | 'addApp' | 'edit' | 'downloads';

export interface ChromeState {
  /** What fills the window behind any panel. */
  surface: 'home' | 'page';
  panel: Panel | null;
  version: string;
  /** `profile` says what Longboard has for the site: a reviewed profile, the person's own, or nothing. */
  home: {
    /** Sites added as apps. `icon` is the site's own icon, fetched from the site when the app was added, as a data: address. */
    apps: Array<{ id: string; name: string; site: string; icon: string | null; ownSession: boolean }>;
    /** `icon` is the site's own icon, fetched from the site while it was open, as a data: address. */
    recents: Array<RecentSite & { profile: 'reviewed' | 'own' | null; icon: string | null }>;
  };
  /** About the page in the page view; null when none has been opened. */
  page: {
    site: string;
    title: string;
    canGoBack: boolean;
    /** Zoom relative to the automatic TV scale, in percent. */
    zoomPercent: number;
    pointer: boolean;
    /** The profile in use, as said on screen, or null in generic mode. */
    profile: string | null;
    /** What this site has been allowed or refused, in words, or null when nothing was ever answered. */
    answers: string | null;
    /** The app this site was added as, if it was. */
    app: { id: string; name: string } | null;
    /** Whether the TV's app list can be written to on this system. */
    canAddToAppList: boolean;
  } | null;
  /** The downloads agreed to in this run, newest first. `progress` says how far one under way has got. */
  downloads: Array<{ id: number; name: string; state: 'going' | 'saved' | 'cancelled' | 'failed'; progress: string }>;
  /** The profile editor, while it is in use. */
  edit: {
    /** The site being edited for. */
    site: string;
    /** What was pointed at, at the level now chosen; null before anything is picked. */
    picked: { selector: string; matches: number; canWiden: boolean; canNarrow: boolean; marks: Record<'include' | 'exclude' | 'row' | 'player', boolean> } | null;
    /** How many things are marked in all. */
    marked: number;
  } | null;
  /** The question being asked, while panel is 'prompt'. */
  prompt:
    /** A site wants something it has to be allowed: `wants` says what, in plain words. */
    | { what: 'permission'; site: string; wants: string }
    /** A file is about to be downloaded. */
    | { what: 'download'; site: string; name: string; size: string; folder: string }
    /** A profile someone gave the person, which nobody has reviewed: use it? */
    | { what: 'profile'; name: string; version: string; hosts: string[] }
    | null;
}

export type MenuAction =
  | 'home' | 'resume' | 'back' | 'reload' | 'zoomIn' | 'zoomOut' | 'zoomReset'
  | 'pointer' | 'outline' | 'exportProfile' | 'importProfiles' | 'editProfile' | 'addApp' | 'removeApp' | 'forgetAnswers' | 'downloads' | 'about' | 'quit' | 'close';

export const MENU_ACTIONS: readonly MenuAction[] = [
  'home', 'resume', 'back', 'reload', 'zoomIn', 'zoomOut', 'zoomReset', 'pointer', 'outline', 'exportProfile', 'importProfiles', 'editProfile', 'addApp', 'removeApp', 'forgetAnswers', 'downloads', 'about', 'quit', 'close',
];

export type ChromeMessage =
  /** Open what was typed: an address, or words to search for. */
  | { kind: 'open'; input: string }
  /** Open a Home tile. */
  | { kind: 'openRecent'; url: string }
  | { kind: 'openApp'; id: string }
  /** Take a tile off Home. Removing an app also removes what `removeApp` in the menu does. */
  | { kind: 'cancelDownload'; id: number }
  | { kind: 'removeRecent'; url: string }
  | { kind: 'removeApp'; id: string }
  /** The profile editor's buttons. */
  | { kind: 'edit'; action: EditAction }
  /** Add the site in front as an app. */
  | { kind: 'addApp'; name: string; ownSession: boolean; launcher: boolean }
  | { kind: 'menu'; action: MenuAction }
  /** `remember` false is "not now": the question comes again another time. */
  | { kind: 'answer'; allow: boolean; remember?: boolean };

export type EditAction = 'include' | 'exclude' | 'row' | 'player' | 'wider' | 'narrower' | 'pickAgain' | 'save' | 'discard';
export const EDIT_ACTIONS: readonly EditAction[] = ['include', 'exclude', 'row', 'player', 'wider', 'narrower', 'pickAgain', 'save', 'discard'];
