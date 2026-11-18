import type { ActionName } from './config';
import type { PlayerKey, TextKey } from './player-keys';

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
  | { kind: 'playerKey'; key: PlayerKey | TextKey }
  /** Ask the shell to type text into whatever has focus, as a keyboard would. */
  | { kind: 'typeText'; text: string }
  /** Ask the shell to move the pointer a little, which makes a site's player show its controls. */
  | { kind: 'revealControls' }
  /** Ask the shell to rest the pointer on a point of the page (CSS pixels), for menus that open on hover. */
  | { kind: 'hover'; x: number; y: number }
  | { kind: 'diagnostics'; outline: string; url: string }
  /** Go back one page; the shell goes Home when there is no page to go back to. */
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
  | { kind: 'pointerClickOk'; id: number; frame: boolean };

/** Which of Longboard's two views a layer is running in. */
export type Surface = 'page' | 'chrome';

export interface LayerOptions {
  dev: boolean;
  automation: boolean;
  surface?: Surface;
  /** Key mappings from the user's config file. */
  keys?: Record<string, ActionName>;
  /** Gamepad button mappings from the user's config file. */
  buttons?: Record<string, ActionName>;
}

/** Where the on-screen pointer is, in the page's CSS pixels; null when pointer mode is off. */
export type PointerSpot = { x: number; y: number } | null;

/** What the shell hands a preload when a page starts. */
export interface BootData {
  options: LayerOptions;
  /** Site adapter data for this address, or null. */
  adapter: unknown;
}
