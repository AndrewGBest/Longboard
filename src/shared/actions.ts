import type { ActionName } from './config';
import type { PlayerKey, TextKey } from './player-keys';
import type { PlayerKeyName } from './profile';

// Every input device is reduced to one of these actions before anything else
// sees it. Adding a device means writing a mapper to Action, nothing more.
export type Direction = 'up' | 'down' | 'left' | 'right';

export type Action =
  | { type: 'move'; dir: Direction }
  | { type: 'select' }
  | { type: 'back' }
  | { type: 'playPause' }
  | { type: 'seek'; seconds: number }
  | { type: 'search' }
  /** Open or close Longboard's menu panel. */
  | { type: 'menu' }
  /** Switch pointer mode on or off. */
  | { type: 'pointer' }
  | { type: 'diagnostics' }
  | { type: 'exit' };

export type ActionType = Action['type'];

/** Messages a layer (in the page view or in Longboard's own screens) may send to the shell. Keep this list short. */
export type BridgeMessage =
  | { kind: 'exit' }
  | { kind: 'playback'; playing: boolean }
  | { kind: 'playerKey'; key: PlayerKey | TextKey | PlayerKeyName }
  /** Ask the shell to type text into whatever has focus, as a keyboard would. */
  | { kind: 'typeText'; text: string }
  /** Ask the shell to move the pointer a little, which makes a site's player show its controls. */
  | { kind: 'revealControls' }
  /** Ask the shell to rest the pointer on a point of the page (CSS pixels), for menus that open on hover. */
  | { kind: 'hover'; x: number; y: number }
  | { kind: 'diagnostics'; outline: string; url: string }
  /** The icons the page's own `link` elements name, and its web-app manifest: for the site's tile on Home. */
  | { kind: 'icons'; list: Array<{ href: string; rel: string; sizes: string }> }
  /** The article on the page, read for the reader view; null when the page has none. */
  | { kind: 'reader'; article: { title: string; blocks: Array<{ kind: string; text: string }> } | null }
  /** Go back one page; the shell goes Home when there is no page to go back to. */
  /** The page has a sign-in form (told once), and what was typed into it when it was sent. Never in a scripted run. */
  | { kind: 'loginSeen' }
  | { kind: 'credentials'; user: string; password: string }
  | { kind: 'back' }
  /** The menu button was pressed. */
  | { kind: 'menu' }
  /** The pointer button was pressed. With a point (CSS pixels), pointer mode starts there. */
  | { kind: 'pointer'; x?: number; y?: number }
  /** OK was pressed on a game controller while pointer mode is on. */
  | { kind: 'pointerClick' }
  /** Pointer mode cannot continue (the on-screen keyboard needs the arrows). */
  | { kind: 'pointerOff' }
  /** Directions held on a game controller while pointer mode is on. */
  | { kind: 'pointerHeld'; dirs: Direction[] }
  /**
   * Under automation: the layer has checked the point and a click there is
   * allowed. `frame` says the point is on an embedded frame, which the layer
   * cannot see into; the shell then clicks only if that frame has its own guard.
   */
  | { kind: 'pointerClickOk'; id: number; frame: boolean }
  /** The profile editor: what is at the point the person chose, as a chain of selectors outward. */
  | { kind: 'editPicked'; chain: Array<{ selector: string; matches: number }> };

/** What the profile editor asks the layer to draw: the selector just picked, and everything marked so far. */
export interface EditView {
  picked: string | null;
  marks: { include: string[]; exclude: string[]; row: string[]; player: string[] };
}

/** Which of Longboard's two views a layer is running in. */
export type Surface = 'page' | 'chrome';

export interface LayerOptions {
  dev: boolean;
  automation: boolean;
  surface?: Surface;
  /** Key mappings from the user's config file. */
  keys?: Record<string, ActionName>;
  /** True when sign-in forms may be watched and filled: saved sign-ins are on, and this is not a scripted run or a private tab. */
  logins?: boolean;
  /** Gamepad button mappings from the user's config file. */
  buttons?: Record<string, ActionName>;
}

/** Where the on-screen pointer is, in the page's CSS pixels; null when pointer mode is off. */
export type PointerSpot = { x: number; y: number } | null;

/** What the shell hands a preload when a page starts. */
export interface BootData {
  options: LayerOptions;
  /** The profile for this address, already validated by the shell, or null for generic mode. */
  profile: unknown;
}
