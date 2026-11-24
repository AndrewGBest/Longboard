// The layer is one object, built from the parts in this folder. Each part's
// file says what it adds; this file puts those together as one type, and
// holds what every part may need: what the layer is started with, and a few constants.
import type { Action, BridgeMessage, EditView, LayerOptions, PointerSpot } from '../../shared/actions';
import type { SiteRules } from '../profile/rules';
import type { PagePart } from './page';
import type { MovingPart } from './moving';
import type { FramesPart } from './frames';
import type { KeyboardPart } from './keyboard';
import type { PageKeysPart } from './page-keys';
import type { DialogsPart } from './dialogs';
import type { PlayerControlsPart } from './player-controls';
import type { BackPart } from './back';
import type { SearchPart } from './search';
import type { DispatchPart } from './dispatch';
import type { InputPart } from './input';

/** What a layer is started with. */
export interface LayerDeps {
  doc: Document;
  options: LayerOptions;
  /** What the profile for this site says, or the empty rules of generic mode. */
  rules: SiteRules;
  /** Says something to the shell. */
  send: (msg: BridgeMessage) => void;
  /** Longboard's own screens answer some keys themselves. */
  hooks?: {
    /** Back, when nothing on the page claimed it. Return true when handled. */
    back?: () => boolean;
    /** A press with nowhere to go in that direction. Return true when something was done about it. */
    edge?: (dir: 'up' | 'down' | 'left' | 'right') => boolean;
  };
  /**
   * Set when this layer runs inside an embedded frame. It then has no
   * keyboard or menu of its own: a text field is told to the shell, which
   * brings the page's keyboard up for it, and a press with nowhere to go
   * (or Back with nothing to close) leaves the frame for what holds it.
   */
  frame?: {
    exit: (how: 'up' | 'down' | 'left' | 'right' | 'back') => void;
    field: (el: Element) => void;
  };
}

/**
 * Controls that lead to search when the profile names none, or names one the
 * site has since renamed: a link whose address says search. Only a link, so
 * nothing is pressed whose effect is not written on it.
 */
export const GENERIC_SEARCH_OPEN = ['a[href$="/search" i]', 'a[href*="/search?" i]'];
/** Where a search field is looked for when the profile names none, or names one that is not showing. */
export const GENERIC_SEARCH = [
  'input[type="search"]',
  '[role="search"] input',
  'input[name*="search" i]',
  'input[aria-label*="search" i]',
];

/** A frame showing over this share of the screen is where the page's business is: the arrows hand over to the pointer on it. */
export const BIG_FRAME_SHARE = 0.4;

/** True for something text is typed into: a text input of any kind, a text area, an editable region. */
export function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['button', 'submit', 'checkbox', 'radio', 'range', 'reset', 'file', 'image', 'color'].includes(el.type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

/** What a running layer answers to: the preload and Longboard's own screens call these. */
export interface Layer {
  /** Carries out one action, as if its key had been pressed. */
  dispatch: (a: Action) => void;
  /** The shell's answer after the highlight was asked into a frame: taken (`in`), nothing there to take it (`none`), or what had it is gone (`lost`). */
  frameIn: (state: 'in' | 'none' | 'lost', player?: boolean) => void;
  /** The shell says whether this view is the one in front (a game controller's buttons are acted on only there). */
  front: (on: boolean | null) => void;
  /** In a frame's own layer: the highlight has gone back to the page round the frame. */
  dropHighlight: () => void;
  /** In a frame's own layer: the frame is a player (a video fills it). */
  framePlayer: () => boolean;
  /** The highlight has left a frame of this page, by a direction or by Back. */
  frameExit: (how: 'up' | 'down' | 'left' | 'right' | 'back') => void;
  /** In a frame's own layer: take the highlight (the frame was entered). False when nothing here can. `stay`: keep it where it was. */
  takeHighlight: (stay: boolean) => boolean;
  /** A text field inside an embedded frame has the cursor after a click (`null`: no longer). */
  frameField: (field: { hint: string; top: number; bottom: number } | null) => void;
  /** Show a short message from the shell, for example that a navigation was refused. */
  notice: (text: string) => void;
  /** Text has come from a phone or from speech: says back (by the number given) whether there is a text field with the cursor for it. The shell holds the text and types it. */
  phoneText: (id: number) => void;
  /** Shows or hides the line that says a page is arriving. */
  loading: (on: boolean) => void;
  /** The app's window stopped being the one in front: pause what is playing. */
  away: () => void;
  /** Everything the highlight can go to on this page now. For the referee (diagnostics/referee.ts). */
  candidates: () => Element[];
  /** Puts the highlight on the first control inside `container`. */
  focusFirstIn: (container: Element) => boolean;
  /** Puts the highlight on `el`. */
  focus: (el: Element) => boolean;
  /** Puts the highlight on a text field and brings up the on-screen keyboard. */
  typeIn: (field: Element) => void;
  /** Pointer mode: where the shell has put the pointer, or null when it is off. */
  pointer: (spot: PointerSpot) => void;
  /** The profile editor: tells the shell what is at a point of the page. */
  editPick: (x: number, y: number) => void;
  /** The profile editor: draws boxes round what was picked and what is marked; `null` takes them away. */
  editShow: (view: EditView | null) => void;
  /** Replaces the rules the page is driven by, at once (the editor's draft, as it changes). */
  setRules: (next: SiteRules) => void;
  /** Under automation: may the pointer click at this point? Says so on screen when not. */
  mayClickAt: (x: number, y: number) => 'yes' | 'no' | 'frame';
  /** Takes the layer's listeners and timers away. */
  stop: () => void;
}

/** Everything the parts share. It is filled in part by part, in the order startLayer lists them. */
export type LayerCore = { deps: LayerDeps } & PagePart &
  MovingPart &
  FramesPart &
  KeyboardPart &
  PageKeysPart &
  DialogsPart &
  PlayerControlsPart &
  BackPart &
  SearchPart &
  DispatchPart &
  InputPart;
