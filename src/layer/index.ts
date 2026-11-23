// Entry point of the page-side layer. Runs in the preload's isolated world:
// it shares the DOM with the site but not its JavaScript, so the site cannot
// tamper with it and it does not modify the site's own scripts.
import type { Action, BridgeMessage, Direction, EditView, LayerOptions, PointerSpot } from '../shared/actions';
import type { PlayerKeyName } from '../shared/profile';
import { firstMatch, rulesReport, type SiteRules } from './profile/rules';
import { buildOutline, sanitizeUrl } from './diagnostics/outline';
import { elementAt, matchesOf, pickChain } from './edit/selector';
import { scrollBy } from './generic/scroll';
import { installPurchaseGuard, isSpendControl } from './guard/purchase-guard';
import { startPolling } from './input/gamepad';
import { isEmptyField, looksLikeSearch } from './search-field';
import { TopEdge } from './input/top-edge';
import { activeOption, openCombo } from './combobox';
import { keyToAction, ownRemoteKey, type Mode } from './input/keys';
import { isSecretField, oskDock, OskModel } from '../shared/osk';
import { deepActiveElement, deepContains } from './spatial/deep';
import { InjectedKeys, isNativePlayerKey, playerKeyFor, playerKeyInfo, type PlayerKey, type TextKey } from '../shared/player-keys';
import { findMainVideo, GENERIC_PLAYER_SHARE, isPlayerActive, coversPicture, isSeekBar, playControl, playerIsOwnPage, playerScope } from './player';
import { coveredByScreen, coveringLayer, edgeControl, isSidewaysSlider, isVisible, MENU_ENTRY, openDialog, press, SpatialNavigator, type NavigatorOptions } from './spatial/navigator';
import { HOST_TAG, Overlay } from './ui/overlay';

export interface LayerDeps {
  doc: Document;
  options: LayerOptions;
  /** What the profile for this site says, or the empty rules of generic mode. */
  rules: SiteRules;
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
 * Controls that lead to search when the adapter names none, or names one the
 * site has since renamed: a link whose address says search. Only a link, so
 * nothing is pressed whose effect is not written on it.
 */
const GENERIC_SEARCH_OPEN = ['a[href$="/search" i]', 'a[href*="/search?" i]'];
const GENERIC_SEARCH = ['input[type="search"]', '[role="search"] input', 'input[name*="search" i]', 'input[aria-label*="search" i]'];

/** A frame showing over this share of the screen is where the page's business is: the arrows hand over to the pointer on it. */
const BIG_FRAME_SHARE = 0.4;

function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['button', 'submit', 'checkbox', 'radio', 'range', 'reset', 'file', 'image', 'color'].includes(el.type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

export interface Layer {
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
  stop: () => void;
}

export function startLayer({ doc, options, rules, send, hooks, frame }: LayerDeps): Layer {
  const view = doc.defaultView;
  if (!view) throw new Error('layer needs a window');

  const playerRoots = rules.selectors.playerRoot;
  // With no profile for this page everything is worked out from the page
  // itself. Read each time: the profile can change while the page stays (setRules).
  const playerShare = (): number => (rules.generic ? GENERIC_PLAYER_SHARE : 0.5);
  const mainVideo = (): HTMLVideoElement | null => findMainVideo(doc, playerRoots, playerShare());
  // An embedded frame that a video fills is a player whether or not the
  // video has started: the frame is there for nothing else.
  const inPlayer = (): boolean => isPlayerActive(doc, playerRoots, playerShare()) || (!!frame && mainVideo() !== null);
  /** The pop-up or covering layer in front, when it is pinned to the screen and so does not move with the page. */
  const pinnedLayer = (): Element | null => {
    const layer = openDialog(doc) ?? (inPlayer() ? null : coveringLayer(doc));
    for (let el: Element | null = layer; el; el = el.parentElement) if (view.getComputedStyle(el).position === 'fixed') return layer;
    return null;
  };
  /** While the player is open, focus stays among its own controls. */
  const scope = (): Element | null => {
    // A pop-up the page opened in front of everything: only it can be reached.
    const dialog = openDialog(doc);
    // An open hover menu lies over the page; what is underneath is not
    // reachable until it is closed. A pop-up opened from the menu is in front of both.
    if (hoverHost?.isConnected && !(dialog && !deepContains(hoverHost, dialog))) return hoverHost;
    if (dialog) return dialog;
    // A gate or notice laid over the whole screen without saying it is a dialog.
    if (!inPlayer()) return coveringLayer(doc);
    const v = mainVideo();
    return v ? playerScope(v, playerRoots) : null;
  };

  const overlay = new Overlay(doc);
  /** A scripted run never types a password or a one-time code (Hard rule 9). A person may. */
  const keyboardBarred = (el: Element): boolean =>
    options.automation && isSecretField(el.getAttribute('type'), el.getAttribute('autocomplete'), `${el.getAttribute('name') ?? ''} ${el.id}`);
  /** Things that jump elsewhere when they get the cursor (moveInPage finds them). */
  const jumpers = new WeakSet<Element>();
  // The navigator keeps this object, so setRules can change what it goes by.
  const navOptions: NavigatorOptions = {
    extraFocusable: rules.selectors.extraFocusable,
    ignoreWithin: HOST_TAG,
    avoid: (el) => jumpers.has(el) || (coversPicture(el, view) && inPlayer()),
    onFocusChange: (el) => {
      overlay.track(el);
      // The highlight passing over a text field does not bring the keyboard
      // up: OK on the field does (DESIGN.md 3.2).
      if (typedInto !== el) typedInto = null;
    },
    scope,
    skip: [...rules.selectors.rowPrev, ...rules.selectors.rowNext],
    exclude: rules.selectors.exclude,
    groups: rules.groups,
    initial: rules.initial ?? undefined,
    looksClickable: rules.generic,
    cursorHiddenClass: 'longboard-no-pointer',
    readingScroll: rules.generic,
    growPicturesOnly: rules.generic,
  };
  const nav = new SpatialNavigator(doc, navOptions);

  /** When the person last pressed OK or clicked: a text field the page focuses soon after is one they asked for. */
  let lastPressAt = 0;
  const PRESS_ANSWER_MS = 1500;
  /** The text field a plugged-in keyboard has typed into; while it has focus the keys are the field's. */
  let typedInto: Element | null = null;

  // Pointer mode. The shell owns it: it moves the pointer and clicks with
  // ordinary mouse events, so it works in embedded frames this layer cannot
  // see into. The layer only draws the pointer and stays out of the way.
  let pointerOn = false;

  // One of the browser's own lists may be open (a drop-down). While it is,
  // the browser gives it the keyboard's keys directly; a game controller's
  // buttons come through this layer and have to be turned into those keys.
  // There is no event for the list closing, so this is "may be": it is
  // dropped on the first key that reaches the page, and when focus moves on.
  let nativeList: HTMLSelectElement | null = null;
  const listOpen = (): boolean => {
    if (nativeList && deepActiveElement(doc) !== nativeList) nativeList = null;
    return nativeList !== null;
  };

  // Some menus open only when the pointer rests on their button. If Enter on
  // a button that says it is collapsed leaves it collapsed, the shell is asked
  // to put the pointer there. The pointer is taken away again on Back, or
  // when focus leaves the button and whatever it opened.
  let hoverHost: Element | null = null;
  let hoverTrigger: Element | null = null;
  let hoverTimer: number | undefined;
  const unhover = (): void => {
    if (!hoverHost) return;
    hoverHost = null;
    ignorePointerUntil = Date.now() + 500;
    send({ kind: 'hover', x: 1, y: 1 });
  };
  const hoverOn = (target: Element): void => {
    const r = target.getBoundingClientRect();
    hoverHost = target.parentElement ?? target;
    hoverTrigger = target;
    ignorePointerUntil = Date.now() + 500;
    send({ kind: 'hover', x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
  };
  const hoverIfStillCollapsed = (target: Element): void => {
    if (target.getAttribute('aria-expanded') !== 'false') return;
    const page = view.location.href;
    view.clearTimeout(hoverTimer);
    hoverTimer = view.setTimeout(() => {
      // Not if the click went somewhere: the menu belongs to the page that was left.
      if (view.location.href !== page) return;
      if (target.isConnected && target.getAttribute('aria-expanded') === 'false') hoverOn(target);
    }, 300);
  };
  /**
   * A link that is also the button of a collapsed menu: Enter opens the menu
   * instead of following the link, so the menu's entries can be reached. The
   * menu is open after that, and Enter on the link follows it as usual.
   */
  const opensMenuFirst = (target: Element): boolean =>
    target instanceof HTMLAnchorElement && target.getAttribute('aria-expanded') === 'false' && hoverHost === null;

  // Left or right with nowhere to go: press the strip's own arrow, if the
  // adapter knows it. A carousel that swaps slides leaves focus on something
  // no longer shown, so focus then moves to the new slide.
  let edgeTimer: number | undefined;
  let scrollTimer: number | undefined;
  const topEdge = new TopEdge();
  const moveInPage = (dir: Direction): void => {
    // A slider takes left and right itself, as the keys they are.
    const slider = nav.focused;
    if (slider && isSidewaysSlider(slider) && (dir === 'left' || dir === 'right') && deepActiveElement(doc) === slider) {
      pressKey(dir === 'left' ? 'seekBack' : 'seekForward');
      return;
    }
    if (dir !== 'up') topEdge.reset();
    const cameFrom = nav.focused;
    const wasAt = cameFrom ? cameFrom.getBoundingClientRect().top + view.scrollY : 0;
    let moved = nav.move(dir);
    // Up that does not end higher is not up. (Seen on a meetings site: a
    // "skip" link hidden in the top bar moves to a place lower down when it
    // gets the cursor; Up went to it and back without end, and the top was
    // never reached.) Such a thing is not landed on again, and Up is tried
    // once more from where it started.
    for (let tries = 0; tries < 3 && moved && dir === 'up' && cameFrom?.isConnected && nav.focused && nav.focused !== cameFrom; tries++) {
      if (nav.focused.getBoundingClientRect().top + view.scrollY < wasAt - 1) break;
      jumpers.add(nav.focused);
      nav.focus(cameFrom);
      moved = nav.move(dir);
    }
    // Sideways out of an open menu: close it and carry on along the bar.
    if (!moved && hoverHost && (dir === 'left' || dir === 'right')) {
      const trigger = hoverTrigger;
      unhover();
      if (trigger?.isConnected) nav.focus(trigger);
      moved = nav.move(dir);
    }
    if (moved) return;
    // On a frame that fills most of the screen (a sign-in prompt from the
    // service's own sign-in site) the arrows have nothing to move to here:
    // the highlight goes into the frame, as OK on the frame would have it.
    const framed = nav.focused;
    if (!hooks && framed instanceof HTMLIFrameElement) {
      const b = framed.getBoundingClientRect();
      const shown = Math.max(0, Math.min(b.right, view.innerWidth) - Math.max(b.left, 0)) * Math.max(0, Math.min(b.bottom, view.innerHeight) - Math.max(b.top, 0));
      if (shown >= BIG_FRAME_SHARE * view.innerWidth * view.innerHeight) {
        enterFrame(framed, false);
        return;
      }
    }
    // Longboard's own lists go round at their ends.
    if (hooks?.edge?.(dir)) return;
    const from = nav.focused;
    const hit =
      from && (dir === 'left' || dir === 'right')
        ? edgeControl(from, dir === 'left' ? rules.selectors.rowPrev : rules.selectors.rowNext, view)
        : null;
    if (!hit) {
      // Nothing to move to: scroll, and take up whatever comes into view.
      // Sideways only inside something that scrolls sideways itself; a page
      // a little wider than the screen must not slide about under the arrows.
      const sideways = dir === 'left' || dir === 'right';
      const here = from && isVisible(from, view) && !nav.focusIsOffScreen() ? from : null;
      // In a layer pinned over the page, the page behind stays where it is.
      const scrolled = !sideways || here ? scrollBy(doc, here, dir, false, pinnedLayer()) : null;
      if (scrolled) {
        view.clearTimeout(scrollTimer);
        scrollTimer = view.setTimeout(() => {
          const f = nav.focused;
          // The highlight follows the reading: it moves on when what had it
          // has gone out of sight, or was never in what is being scrolled.
          if (!f || nav.focusIsOffScreen() || !deepContains(scrolled, f)) nav.focusOnScreen(dir, scrolled);
        }, 350);
        return;
      }
      // Inside a frame, a press with nowhere to go leaves it for what holds it.
      if (frame) {
        frame.exit(dir);
        return;
      }
      // Up at the very top of a website: pressed again, it opens the menu,
      // which a remote may have no key for. Not on Longboard's own screens.
      if (dir === 'up' && !hooks) {
        const edge = topEdge.up(Date.now());
        if (edge === 'menu') {
          send({ kind: 'menu' });
          return;
        }
        if (edge === 'hint') overlay.toast('Press Up again for the menu');
      }
      // Nowhere to go: say so, rather than seeming not to have heard the key.
      if (from) overlay.feedback(dir);
      return;
    }
    press(hit.control);
    view.clearTimeout(edgeTimer);
    // Twice: the new slide can still be sliding in at the first look, and
    // what was picked then may itself be put away when it settles.
    const settle = (again: boolean): void => {
      edgeTimer = view.setTimeout(() => {
        const f = nav.focused;
        if (!f || !isVisible(f, view)) nav.focusFirstIn(hit.container);
        if (again) settle(false);
      }, 700);
    };
    settle(true);
  };

  /**
   * True while the user is on one of the player's own controls (reached with
   * up or down). The controls hide themselves after a while; focus is dropped
   * when that happens, which returns the keys to playback.
   */
  const onPlayerControl = (): boolean => {
    const f = nav.focused;
    // Outside the player this must answer without touching focus: it is also
    // asked by timers, and clearing here would drop focus on a browse page.
    if (!f || !inPlayer()) return false;
    const within = scope();
    if (within && deepContains(within, f) && isVisible(f, view)) return true;
    nav.clear();
    return false;
  };

  // On-screen keyboard: shown when layer focus lands on a text field, so a
  // remote can type. It types through the shell, like a real keyboard would.
  const osk = new OskModel();
  let oskOpen = false;
  let oskSubmit = 'enter';
  let oskSide: 'top' | 'bottom' = 'bottom';
  /** The keyboard is up for a text field inside an embedded frame: the frame has the cursor, and the shell hands the keys over. */
  let frameTyping = false;
  const drawOsk = (): void => overlay.keyboard(oskOpen ? osk.rows : null, { row: osk.row, index: osk.index }, oskSubmit, oskSide);
  const isSearchField = (el: Element): boolean => {
    try {
      if (el.matches([...rules.selectors.searchInput, ...GENERIC_SEARCH].join(','))) return true;
    } catch {
      // a profile's selector the browser cannot read: go by the field itself
    }
    return looksLikeSearch(el);
  };
  /** The highlight is inside this frame of the page (the frame has the keys and its own layer). */
  let frameInside: HTMLIFrameElement | null = null;
  /** A frame the highlight has been asked into, until the shell says whether anything in it took it. */
  let frameAsked: HTMLIFrameElement | null = null;
  /**
   * Into a frame: it is given the cursor, and the shell tells the layer
   * inside it to take the highlight. `stay`: carry on where it was.
   */
  const enterFrame = (el: HTMLIFrameElement, stay: boolean): void => {
    frameAsked = el;
    try {
      el.focus({ preventScroll: true });
      el.contentWindow?.focus();
    } catch {
      // A frame from another site may refuse; the shell's answer decides.
    }
    const box = el.getBoundingClientRect();
    send({ kind: 'frameEnter', stay, at: { x: (Math.max(box.left, 0) + Math.min(box.right, view.innerWidth)) / 2, y: (Math.max(box.top, 0) + Math.min(box.bottom, view.innerHeight)) / 2 } });
  };
  /** The shell's answer: something in the frame took the highlight, nothing did, or what had it is gone. */
  /** The frame this page has put in full screen because a player in it took the keys. */
  let frameFull: HTMLIFrameElement | null = null;
  const leaveFull = (): void => {
    const el = frameFull;
    frameFull = null;
    if (!el || doc.fullscreenElement !== el) return;
    // Leaving full screen can hand the cursor back to the frame; the keys
    // are the page's again, so it is taken back once the screen has changed.
    doc.addEventListener('fullscreenchange', () => {
      if (!frameInside && !frameAsked && doc.activeElement === el) {
        el.blur();
        view.focus();
      }
    }, { once: true });
    void doc.exitFullscreen().catch(() => undefined);
  };
  // While something of the page is shown full screen, a highlight on what
  // lies underneath is not drawn: the ring is drawn above everything, and
  // showed round an element behind the picture. (Andrew, at a TV, with a
  // player put full screen by its own button.) A frame or a video that is
  // itself the thing full screen gets no ring round the whole screen either.
  // The highlight is kept, and drawn again when the full screen ends.
  doc.addEventListener('fullscreenchange', () => {
    const full = doc.fullscreenElement;
    const f = nav.focused;
    if (!f) return;
    if (full) {
      const under = f === full ? full instanceof HTMLIFrameElement || full instanceof HTMLVideoElement : !deepContains(full, f);
      if (under) overlay.track(null);
    } else if (f.isConnected && !frameInside) overlay.track(f);
  });
  // Full screen can also end without this layer asking: the browser itself
  // ends it on Escape, which is Back on many remotes, and the key never
  // reaches a page. That is leaving the player all the same: the keys come
  // back to the page and the highlight to the frame.
  doc.addEventListener('fullscreenchange', () => {
    const el = frameFull;
    if (!el || doc.fullscreenElement === el) return;
    frameFull = null;
    if (frameInside !== el) return;
    frameInside = null;
    el.blur();
    view.focus();
    nav.focus(el);
  });
  const frameIn = (state: 'in' | 'none' | 'lost', player = false): void => {
    const el = frameAsked ?? frameInside;
    if (state === 'in') {
      frameInside = frameAsked ?? frameInside;
      frameAsked = null;
      overlay.track(null);
      // A player in a frame is watched full screen, as a TV shows anything:
      // inside a page its controls are small and may lie under the page's
      // own bars. (Seen on a video site: a bar pinned to the bottom of the
      // screen covered the embedded player's whole control row.) This is
      // the browser's own full screen for the frame, which the page allows
      // or refuses; Back leaves the frame and the full screen with it.
      if (player && !frame && frameInside && !doc.fullscreenElement && doc.fullscreenEnabled) {
        const into = frameInside;
        frameFull = into;
        void into.requestFullscreen().catch(() => {
          if (frameFull === into) frameFull = null;
        });
      }
      return;
    }
    leaveFull();
    frameAsked = null;
    frameInside = null;
    if (!el?.isConnected) return;
    if (doc.activeElement === el) {
      el.blur();
      view.focus();
    }
    nav.focus(el);
    if (state === 'none' && !frame) {
      // Nothing in it can take the highlight (a player, a map): the pointer, on it.
      const box = el.getBoundingClientRect();
      overlay.toast('Pointer mode: this part of the page needs the pointer');
      send({ kind: 'pointer', x: (Math.max(box.left, 0) + Math.min(box.right, view.innerWidth)) / 2, y: (Math.max(box.top, 0) + Math.min(box.bottom, view.innerHeight)) / 2 });
    }
  };
  /** The highlight has left a frame of this page by `how`: carry on from the frame, that way. */
  const frameExit = (how: Direction | 'back'): void => {
    const el = frameInside ?? (doc.activeElement instanceof HTMLIFrameElement ? doc.activeElement : null);
    frameInside = null;
    leaveFull();
    if (!el) return;
    el.blur();
    view.focus();
    nav.focus(el);
    if (how === 'back') {
      back();
      return;
    }
    if (nav.move(how)) return;
    // Nowhere to go from the frame either: out of this frame too, or back into the one just left.
    if (frame) frame.exit(how);
    else enterFrame(el, true);
  };
  const openOsk = (field: Element): void => {
    // Inside a frame the keyboard is the page's: the shell is told of the field.
    if (frame) {
      frame.field(field);
      return;
    }
    // The keyboard needs the arrows; the pointer gives them up.
    if (pointerOn) send({ kind: 'pointerOff' });
    if (!oskOpen) osk.reset();
    // The key says what it does: the page's own word for it when it gives
    // one (the standard enterkeyhint attribute), "search" in a search field.
    const hint = (field.getAttribute('enterkeyhint') ?? '').toLowerCase();
    oskSubmit = ['go', 'search', 'send', 'next', 'done'].includes(hint) ? hint : isSearchField(field) ? 'search' : 'enter';
    // Keep the keyboard off the field, so what is typed can be seen.
    const box = field.getBoundingClientRect();
    oskSide = oskDock({ top: box.top, bottom: box.bottom }, doc.defaultView?.innerHeight ?? 0);
    oskOpen = true;
    drawOsk();
  };
  const closeOsk = (): void => {
    if (!oskOpen) return;
    oskOpen = false;
    if (frameTyping) {
      frameTyping = false;
      send({ kind: 'frameFieldDone' });
    }
    drawOsk();
  };
  /** The shell says a click put the cursor in a text field inside a frame (or that it has left). */
  const frameField = (field: { hint: string; top: number; bottom: number } | null): void => {
    if (!field) {
      if (frameTyping) closeOsk();
      return;
    }
    if (pointerOn) send({ kind: 'pointerOff' });
    if (!oskOpen) osk.reset();
    oskSubmit = ['go', 'search', 'send', 'next', 'done'].includes(field.hint) ? field.hint : 'enter';
    // Where the field is on the screen, as nearly as can be known from here: the frame's place plus the field's place in it.
    const frame = doc.activeElement instanceof HTMLIFrameElement ? doc.activeElement.getBoundingClientRect() : null;
    oskSide = oskDock({ top: (frame?.top ?? 0) + field.top, bottom: (frame?.top ?? 0) + field.bottom }, doc.defaultView?.innerHeight ?? 0);
    frameTyping = true;
    oskOpen = true;
    drawOsk();
  };
  const pressOsk = (): void => {
    // The field may have changed under the keyboard since it was opened: the
    // page moved the cursor on to the password, or turned the field into one.
    const into = deepActiveElement(doc);
    if (into && keyboardBarred(into)) {
      closeOsk();
      return;
    }
    const key = osk.key;
    if (osk.switchPage()) {
      drawOsk();
      return;
    }
    if (key.kind === 'char' || key.kind === 'space') {
      send({ kind: 'typeText', text: key.text ?? '' });
      return;
    }
    // Delete, enter and the two cursor keys are real key presses in the field.
    const name = key.kind === 'backspace' ? 'backspace' : key.kind === 'left' ? 'left' : key.kind === 'right' ? 'right' : 'enter';
    const info = playerKeyInfo(name);
    if (!info) return;
    injected.expect(info.domKey, Date.now());
    send({ kind: 'playerKey', key: name });
    if (key.kind === 'submit') closeOsk();
  };

  const mode = (): Mode => {
    if (oskOpen) {
      // The keyboard only makes sense while its field still has focus, and is one it may type in.
      const into = deepActiveElement(doc);
      if (frameTyping || (isTextEntry(into) && !(into && keyboardBarred(into)))) return 'browse';
      closeOsk();
    }
    // A text field under the highlight is only that until someone types in
    // it: the arrows still move on, and OK brings the keyboard up.
    const active = deepActiveElement(doc);
    if (isTextEntry(active)) return typedInto === active ? 'text' : 'browse';
    if (!inPlayer()) return 'browse';
    return onPlayerControl() ? 'browse' : 'player';
  };

  // Player control is a real key press made by the shell, so the site's own
  // player decides what it does (it may refuse a seek during an advertisement).
  const injected = new InjectedKeys();
  const pressKey = (key: PlayerKey | TextKey | PlayerKeyName): void => {
    const info = playerKeyInfo(key);
    if (!info) return;
    injected.expect(info.domKey, Date.now());
    send({ kind: 'playerKey', key });
  };
  /** The ordinary key this site's player uses for an action: the usual one, unless the profile names another. */
  const siteKey = (key: PlayerKey): PlayerKey | PlayerKeyName =>
    key === 'playPause' ? rules.playerKeys.playPause : key === 'seekBack' ? rules.playerKeys.back : key === 'seekForward' ? rules.playerKeys.forward : key;
  const pressPlayerKey = (key: PlayerKey): void => {
    if (!inPlayer()) return;
    watchNativeVideo();
    pressKey(siteKey(key));
  };
  // A video with the browser's own controls answers keys only while it has
  // keyboard focus. Giving it focus is all that is done; the keys are still
  // ordinary key presses and the browser's player decides what they do.
  const watchNativeVideo = (): void => {
    const v = mainVideo();
    if (v?.controls && deepActiveElement(doc) !== v && !isTextEntry(deepActiveElement(doc))) v.focus({ preventScroll: true });
  };

  /** Moves focus into a pop-up that has opened, if it is not there already. */
  let openToggle: { label: HTMLLabelElement; input: HTMLInputElement } | null = null;
  let beforeDialog: Element | null = null;
  let dialogTimer: number | undefined;
  const enterDialog = (): boolean => {
    const dialog = openDialog(doc);
    if (!dialog) return false;
    const f = nav.focused;
    // Not while the keyboard is typing into a frame of the dialog: taking
    // the highlight there takes the cursor out of the field. (Seen on a
    // film service's sign-in prompt: the keyboard closed as it opened.)
    if (!frameTyping && !frameInside && !frameAsked && (!f || !deepContains(dialog, f))) {
      beforeDialog = f;
      nav.focusFirstIn(dialog);
    }
    return true;
  };
  /** After asking a pop-up to close: once it has gone, focus returns to what opened it. */
  const leaveDialog = (): void => {
    view.clearTimeout(dialogTimer);
    dialogTimer = view.setTimeout(() => {
      if (openDialog(doc)) return;
      const back = beforeDialog;
      beforeDialog = null;
      if (back?.isConnected && isVisible(back, view)) nav.focus(back);
    }, 600);
  };

  // Up or down in the player: show the site's controls (they appear when the
  // pointer moves) and put focus on the nearest one in that direction.
  let ignorePointerUntil = 0;
  let controlsTimer: number | undefined;
  const revealControls = (): void => {
    ignorePointerUntil = Date.now() + 500;
    send({ kind: 'revealControls' });
  };
  // The site hides its controls soon after the pointer stops (under two
  // seconds on the live site; a movement every second holds them). While the
  // user is on one, keep them up, so focus does not vanish mid-thought; give
  // up after a while without a key so the picture is not covered forever.
  const CONTROLS_LINGER_MS = 20_000;
  let lastControlKeyAt = 0;
  const keepAlive = view.setInterval(() => {
    if (doc.hidden) return;
    if (Date.now() - lastControlKeyAt < CONTROLS_LINGER_MS && onPlayerControl()) revealControls();
  }, 1000);
  const moveInPlayer = (dir: Direction): void => {
    lastControlKeyAt = Date.now();
    revealControls();
    if (onPlayerControl()) {
      // On the progress bar, left and right are sent to the site as its seek
      // keys: nothing lies beside a bar that spans the screen. (On Steamboat's
      // site the focused bar answers them with its own small steps.)
      const f = nav.focused;
      if (f && (dir === 'left' || dir === 'right') && isSeekBar(f, view)) {
        pressPlayerKey(dir === 'left' ? 'seekBack' : 'seekForward');
        return;
      }
      // Any other slider that lies sideways (a volume track) takes them as the keys they are.
      if (f && (dir === 'left' || dir === 'right') && isSidewaysSlider(f) && deepActiveElement(doc) === f) {
        pressKey(dir === 'left' ? 'seekBack' : 'seekForward');
        return;
      }
      if (!nav.move(dir)) overlay.feedback(dir);
      return;
    }
    // The controls are created and faded in after the pointer moves; wait for them.
    let tries = 0;
    view.clearInterval(controlsTimer);
    controlsTimer = view.setInterval(() => {
      // Up brings the controls up with the highlight on the play button;
      // the nearest thing above the middle is the player's Close. Down goes
      // to what is below the middle, the progress bar first where there is one.
      const all = inPlayer() ? nav.candidates() : [];
      const play = dir === 'up' ? playControl(all, view) : null;
      const done = !inPlayer() || (all.length > 0 && (play ? nav.focus(play) : nav.moveFrom({ x: view.innerWidth / 2, y: view.innerHeight / 2 }, dir)));
      if (done || ++tries >= 15) view.clearInterval(controlsTimer);
    }, 100);
  };

  let refocusTimer: number | undefined;
  let followTimer: number | undefined;
  let coverTimer: number | undefined;
  let lastCloseAt = 0;
  let backStreak = 0;
  /** A menu was seen to open in the player and no Escape has been sent for it yet. */
  let playerMenuSeen = false;
  /** The address the user was last browsing at, outside the player. */
  let browseUrl: string | null = null;
  const back = (): void => {
    const active = deepActiveElement(doc);
    if (isTextEntry(active)) {
      (active as HTMLElement).blur();
      // A field that takes the cursor straight back must not make Back useless.
      if (deepActiveElement(doc) !== active) return;
    }
    if (hooks?.back?.()) return;
    // Something the profile says Back closes first (a banner, a panel).
    const closer = visibleMatch(rules.selectors.dismiss);
    if (closer) {
      press(closer);
      return;
    }
    if (openToggle) {
      const { label, input } = openToggle;
      openToggle = null;
      if (label.isConnected && input.checked) {
        label.click();
        nav.focus(label);
        return;
      }
    }
    if (openDialog(doc)) {
      // The site closes its own pop-ups on Escape.
      pressKey('close');
      leaveDialog();
      return;
    }
    if (hoverHost) {
      // Close the menu and put focus back on the button that opened it.
      unhover();
      if (hoverTrigger?.isConnected) nav.focus(hoverTrigger);
      return;
    }
    if (inPlayer()) {
      // First Back leaves the controls and returns to the picture.
      if (onPlayerControl()) {
        nav.clear();
        return;
      }
      // A player in an embedded frame is left by leaving the frame: the page
      // round it is still there, and the highlight goes back to the frame.
      if (frame) {
        frame.exit('back');
        return;
      }
      const close = firstMatch(doc, rules.selectors.playerClose);
      if (close) {
        press(close);
        return;
      }
      // A player that is a page of its own is left like any page, once any
      // menu it has open is closed with the site's own Escape key.
      // A menu's entry can open a view with no entries of its own (a slider,
      // on Steamboat's service), so having seen the menu open counts until one
      // Escape has been sent for it.
      const menuOpen = playerMenuSeen || nav.candidates().some((el) => el.matches(MENU_ENTRY));
      playerMenuSeen = false;
      if (!menuOpen && playerIsOwnPage(browseUrl, view.location.href) && view.history.length > 1) {
        view.history.back();
        return;
      }
      // Ask the site's player with its own Escape key. With a menu open the
      // first Escape closes the menu and the next one the player, so history
      // is only the last resort: the third Back in a row that leaves the
      // player still open. Nothing is done on a timer; a closing player can
      // linger for a moment, and going back then would lose the title page.
      backStreak = Date.now() - lastCloseAt < 4000 ? backStreak + 1 : 1;
      lastCloseAt = Date.now();
      if (backStreak >= 3) {
        backStreak = 0;
        if (view.history.length > 1) view.history.back();
        return;
      }
      pressPlayerKey('close');
      return;
    }
    goBack();
  };
  // The shell does the going back: it knows whether there is a page to go
  // back to, and shows Home when there is not.
  const goBack = (): void => (frame ? frame.exit('back') : send({ kind: 'back' }));

  // Some sites keep the search field hidden until a control is activated.
  // The control is clicked like any other; the field is focused once it shows.
  const visibleMatch = (selectors: readonly string[]): Element | null => {
    for (const sel of selectors) {
      try {
        for (const el of doc.querySelectorAll(sel)) if (isVisible(el, view)) return el;
      } catch {
        // A bad selector must never break navigation.
      }
    }
    return null;
  };
  /** Puts the highlight on a text field and brings the keyboard up: the person has asked to type there. */
  const typeIn = (field: Element): void => {
    nav.focus(field);
    if (isTextEntry(field) && !keyboardBarred(field)) openOsk(field);
  };
  let searchPoll: number | undefined;
  const openSearch = (): void => {
    const inputs = [...rules.selectors.searchInput, ...GENERIC_SEARCH];
    const input = visibleMatch(inputs);
    if (input) {
      typeIn(input);
      return;
    }
    const opener = visibleMatch([...rules.selectors.searchOpen, ...GENERIC_SEARCH_OPEN]);
    if (!opener) return;
    press(opener);
    let tries = 0;
    view.clearInterval(searchPoll);
    searchPoll = view.setInterval(() => {
      const shown = visibleMatch(inputs);
      if (shown) typeIn(shown);
      if (shown || ++tries >= 15) view.clearInterval(searchPoll);
    }, 100);
  };

  const dispatch = (a: Action): void => {
    if (!inPlayer()) {
      browseUrl = view.location.href;
      playerMenuSeen = false;
    }
    doc.documentElement.classList.add('longboard-no-pointer');
    // (Saving an outline is asked for by the shell, pointer or no pointer.)
    if (pointerOn && a.type !== 'diagnostics') {
      // From a game controller (the shell takes a remote's keys itself). The
      // directions arrive as held buttons, not as moves.
      if (a.type === 'select') send({ kind: 'pointerClick' });
      else if (a.type === 'back') send({ kind: 'pointerOff' });
      else if (a.type === 'pointer') send({ kind: 'pointer' });
      else if (a.type === 'menu') send({ kind: 'menu' });
      else if (a.type === 'exit') send({ kind: 'exit' });
      return;
    }
    if (listOpen()) {
      // From a game controller: its buttons become the list's own keys.
      if (a.type === 'move' && (a.dir === 'up' || a.dir === 'down')) pressKey(a.dir);
      else if (a.type === 'select') {
        nativeList = null;
        pressKey('enter');
      } else if (a.type === 'back') {
        nativeList = null;
        pressKey('close');
      }
      if (a.type === 'move' || a.type === 'select' || a.type === 'back') return;
    }
    view.clearTimeout(scrollTimer);
    // A pending "pick focus up again" belongs to the previous key; a new key
    // overrides it (Back right after Enter must not have focus put back).
    view.clearTimeout(refocusTimer);
    view.clearTimeout(followTimer);
    view.clearInterval(coverTimer);
    if (oskOpen) {
      if (a.type === 'move') {
        // Up from the top row leaves the keyboard for the page.
        if (!osk.move(a.dir) && a.dir === 'up') {
          // (A field inside a frame keeps the cursor: the keys go back to the frame.)
          const inFrame = frameTyping;
          closeOsk();
          if (!inFrame) {
            (doc.activeElement as HTMLElement | null)?.blur();
            nav.move('up');
          }
        }
        drawOsk();
        return;
      }
      if (a.type === 'select') {
        pressOsk();
        return;
      }
      if (a.type === 'back') {
        // Back out of a search box with nothing typed is "not searching
        // after all". The site is told so with its own Escape key, while the
        // cursor is still in the box: a search box that has spread over the
        // page's menu closes on that, and on nothing Longboard does
        // otherwise. (Seen on a film service: left open, the box covered
        // half the menu for good; moving the highlight away did not close
        // it, Escape with the cursor in it did.) Not inside a pop-up, where
        // Escape would close the pop-up, and not for a field in a frame.
        const field = deepActiveElement(doc);
        const dropSearch = !frameTyping && !!field && isTextEntry(field) && isSearchField(field) && isEmptyField(field) && !openDialog(doc);
        closeOsk();
        if (dropSearch) pressKey('close');
        return;
      }
      closeOsk();
    }
    // A field with its list of suggestions open: Up and Down go to the
    // field as the keys they are, the page marks a suggestion, and OK
    // chooses the marked one. The cursor stays in the field throughout.
    const combo = inPlayer() ? null : openCombo(doc);
    if (combo) {
      const before = activeOption(combo);
      if (a.type === 'move' && (a.dir === 'down' || (a.dir === 'up' && before))) {
        const dir = a.dir;
        pressKey(dir);
        view.setTimeout(() => {
          if (deepActiveElement(doc) !== combo) return;
          const now = activeOption(combo);
          overlay.track(now ?? nav.focused);
          // A page that does nothing with the key: move as on any page.
          // (Seen on a video site: its search field says its list is open
          // and one entry is always marked; the keys change nothing, and
          // the highlight could not leave the field.)
          if (now === before) {
            overlay.track(nav.focused);
            moveInPage(dir);
          }
        }, 150);
        return;
      }
      if (a.type === 'select' && before) {
        pressKey('enter');
        overlay.track(nav.focused);
        return;
      }
      if (before) overlay.track(nav.focused);
    }
    switch (a.type) {
      case 'move':
        if (inPlayer()) moveInPlayer(a.dir);
        else moveInPage(a.dir);
        break;
      case 'select': {
        lastControlKeyAt = Date.now();
        lastPressAt = Date.now();
        const target = nav.focused;
        const box = target?.getBoundingClientRect();
        if (target && !inPlayer() && opensMenuFirst(target)) {
          hoverOn(target);
          break;
        }
        // OK on a text field brings up the keyboard.
        if (target && isTextEntry(target) && !inPlayer()) {
          if (deepActiveElement(doc) !== target) nav.focus(target);
          if (!keyboardBarred(target)) openOsk(target);
          break;
        }
        // An embedded frame: the highlight goes into it (the pointer, on it, when that cannot be).
        if (target instanceof HTMLIFrameElement && box) {
          enterFrame(target, false);
          break;
        }
        // A drop-down opens as the browser's own list, with the key that opens it.
        if (target instanceof HTMLSelectElement && !target.multiple) {
          target.focus({ preventScroll: true });
          nativeList = target;
          pressKey('space');
          break;
        }
        if (!nav.activate()) {
          nav.move('down');
          break;
        }
        overlay.feedback('press');
        // A label that opens a list by ticking a hidden checkbox: remember it, so Back can close the list.
        if (target instanceof HTMLLabelElement && target.control instanceof HTMLInputElement && target.control.type === 'checkbox') {
          openToggle = target.control.checked ? { label: target, input: target.control } : null;
        }
        if (target && !inPlayer()) {
          hoverIfStillCollapsed(target);
          // Some controls scroll the page to another section (tabs that are
          // really jump links). Focus follows to what is now on screen.
          // What was selected may open something over the whole screen (the
          // player, while its video is still loading). The ring goes as soon
          // as that is in front, not when the video finally starts.
          let looks = 0;
          view.clearInterval(coverTimer);
          coverTimer = view.setInterval(() => {
            if (++looks > 60 || nav.focused !== target || openDialog(doc)) view.clearInterval(coverTimer);
            else if (coveredByScreen(target, view)) {
              view.clearInterval(coverTimer);
              nav.clear();
            }
          }, 150);
          view.clearTimeout(followTimer);
          followTimer = view.setTimeout(() => {
            if (enterDialog()) return;
            if (!inPlayer() && nav.focused === target && nav.focusIsOffScreen()) nav.focusFirstOnScreen();
          }, 900);
        }
        // Activating a player control can replace it (a menu opens, a list
        // changes). Pick focus up again next to where it was.
        if (box && inPlayer()) {
          const before = new Set(nav.candidates());
          view.clearTimeout(refocusTimer);
          refocusTimer = view.setTimeout(() => {
            if (!inPlayer()) return;
            const point = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
            // A menu opened: go into it, rather than leave the user to find it.
            const opened = nav.candidates().filter((el) => !before.has(el) && el.matches(MENU_ENTRY));
            if (opened.length > 0) playerMenuSeen = true;
            if (opened.length > 0 && nav.focused === target) nav.focusNearest(point, opened);
            else if (!onPlayerControl()) nav.focusNearest(point);
          }, 500);
        }
        break;
      }
      case 'back':
        back();
        break;
      case 'playPause':
      case 'seek': {
        const key = playerKeyFor(a);
        if (key) pressPlayerKey(key);
        // A player may not answer its keys until it has been clicked (seen
        // on an open-source player a video site embeds, and on a sports
        // network's live player: their shortcuts work only once the player
        // has "focus", which a click gives). OK that changed nothing is
        // followed by one ordinary click on the picture, which every player
        // takes as play or pause. Whether it changed is only looked at; the
        // video is not touched. Not on a site with a profile, which names
        // its player's own key.
        const v = (frame || rules.generic) && a.type === 'playPause' ? mainVideo() : null;
        if (v) {
          const was = v.paused;
          let answered = false;
          const heard = (): void => {
            answered = true;
          };
          v.addEventListener('pause', heard, { once: true });
          v.addEventListener('play', heard, { once: true });
          view.setTimeout(() => {
            v.removeEventListener('pause', heard);
            v.removeEventListener('play', heard);
            if (answered || !v.isConnected || v.paused !== was || !inPlayer() || onPlayerControl()) return;
            const box = v.getBoundingClientRect();
            send({ kind: 'pictureClick', x: (Math.max(box.left, 0) + Math.min(box.right, view.innerWidth)) / 2, y: (Math.max(box.top, 0) + Math.min(box.bottom, view.innerHeight)) / 2 });
          }, 600);
        }
        break;
      }
      case 'search':
        openSearch();
        break;
      case 'voice':
        send({ kind: 'voice' });
        break;
      case 'diagnostics':
        // The first line says how much of the adapter still matches this page:
        // a zero where there used to be matches is the site having changed.
        send({ kind: 'diagnostics', outline: `# ${rulesReport(rules, doc)}\n${buildOutline(doc.documentElement)}`, url: sanitizeUrl(view.location.href) });
        overlay.toast('Page outline saved (structure only, no text)');
        break;
      case 'menu':
        closeOsk();
        send({ kind: 'menu' });
        break;
      case 'pointer':
        closeOsk();
        send({ kind: 'pointer' });
        break;
      case 'exit':
        send({ kind: 'exit' });
        break;
    }
  };

  // In an app that answers the remote itself, Up pressed again where the
  // app has nowhere further up still opens the menu: a remote may have no
  // key for it. Whether the app went anywhere is seen from outside: what
  // has its focus, where that is, and the address, a moment after the key.
  // Not while a video is being watched, where Up is the player's.
  const ownRemoteUp = (key: string): void => {
    if (key !== 'ArrowUp' || inPlayer()) {
      topEdge.reset();
      return;
    }
    const at = Date.now();
    const mark = (): string => {
      const el = deepActiveElement(doc);
      const r = el?.getBoundingClientRect();
      return `${view.location.href} ${view.scrollY} ${el?.tagName ?? ''} ${r ? [r.left, r.top, r.width, r.height].map(Math.round).join(',') : ''}`;
    };
    const before = mark();
    const held = deepActiveElement(doc);
    view.setTimeout(() => {
      if (deepActiveElement(doc) !== held || mark() !== before) {
        topEdge.reset();
        return;
      }
      const edge = topEdge.up(at);
      if (edge === 'menu') send({ kind: 'menu' });
      else if (edge === 'hint') overlay.toast('Press Up again for the menu');
    }, 200);
  };

  const onKey = (e: KeyboardEvent): void => {
    // Only keys that were really pressed (by a person, or by a script through
    // the browser's own input channel). A key event the page made up is not one.
    if (!e.isTrusted) return;
    // A key the layer asked the shell to press: it belongs to the site.
    if (e.isTrusted && injected.consume(e.key, Date.now())) return;
    // A real keyboard is in use: typing a character puts the on-screen one away.
    // Not Space: on some remotes that is the OK button, and it must press the highlighted key.
    // Backspace in a text field deletes, as it always has; it is only Back elsewhere.
    if (e.isTrusted && e.key === 'Backspace' && !oskOpen && isTextEntry(deepActiveElement(doc))) return;
    const typing = e.isTrusted && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.altKey && !e.metaKey;
    if (typing && isTextEntry(deepActiveElement(doc))) {
      // From here on the field has the keys, as in any browser, until focus moves.
      typedInto = deepActiveElement(doc);
      closeOsk();
      return;
    }
    // An open list takes its keys itself and the page never sees them. A
    // key that arrives here therefore means the list has closed.
    nativeList = null;
    const action = keyToAction(e, mode(), options.keys);
    if (!action) return;
    // In the player, a key that is already the site's own key for the action
    // goes straight to the site, untouched.
    if (isNativePlayerKey(e.key, action, rules.playerKeys) && inPlayer()) return;
    // An app made for TVs answers the remote itself. With Longboard's own
    // things out of the way (keyboard, menu, pointer), the arrows and OK are
    // the site's, and so is Back when it is a key such an app knows as Back.
    if (rules.ownRemote && !oskOpen && !pointerOn && ownRemoteKey(action.type, e.key)) {
      ownRemoteUp(e.key);
      return;
    }
    e.preventDefault();
    // Immediate: the site may also listen on the window, and must not see a
    // key the layer has taken.
    e.stopImmediatePropagation();
    dispatch(action);
  };
  view.addEventListener('keydown', onKey, true);

  // An embedded frame that takes the keys for itself would leave the remote
  // dead: nothing pressed would reach here again. Outside pointer mode (where
  // a click into a frame is the point) the keys are taken back.
  const reclaim = (): void => {
    view.setTimeout(() => {
      const active = doc.activeElement;
      if (pointerOn || frameTyping || frameInside || frameAsked || !(active instanceof HTMLIFrameElement)) return;
      active.blur();
      view.focus();
    }, 0);
  };
  view.addEventListener('blur', reclaim);
  // The blur is not always heard: a frame can have the keys before this
  // page's window is the one in front. (Seen on a news site reached by a
  // redirect: an advertisement's frame had them from the start and no press
  // of the remote did anything.) So it is also looked for now and then.
  view.setInterval(() => {
    if (!pointerOn && !frameTyping && !frameInside && !frameAsked && doc.visibilityState === 'visible' && doc.activeElement instanceof HTMLIFrameElement) reclaim();
  }, 1000);

  // A text field the page focused by itself (a sign-in page puts the cursor
  // in its first field): take it as the remote's focus too, so the ring is on
  // it and the on-screen keyboard is up without a key press.
  const adoptField = (el: Element | null): void => {
    // Not the highlight's own arrival on a field: only focus given by the
    // page, or by a click in pointer mode, says that typing is wanted.
    if (nav.focusing) return;
    if (!el || !isTextEntry(el) || el.closest(HOST_TAG)) return;
    if (nav.focused !== el) nav.focus(el);
    // The keyboard comes up only when the page is answering something the
    // person just did (OK on a search button, a click on the field). A page
    // that puts the cursor in a field as it loads, as search pages do, gets
    // the highlight there and no more; OK then brings the keyboard up.
    if (Date.now() - lastPressAt < PRESS_ANSWER_MS && !oskOpen && !keyboardBarred(el)) openOsk(el);
  };
  const onMouseDown = (e: MouseEvent): void => {
    if (e.isTrusted) lastPressAt = Date.now();
  };
  view.addEventListener('mousedown', onMouseDown, true);
  const onFocusIn = (e: FocusEvent): void => {
    const el = e.target instanceof Element ? e.target : null;
    // The page drew again what had the highlight and gave the new one its
    // focus: the highlight goes with it, rather than vanish until a key is pressed.
    if (el && !nav.focusing && !el.closest(HOST_TAG)) {
      // A moment later: the new one is given focus before the old one is taken away.
      view.setTimeout(() => {
        // Only back to what the highlight came from: a page that focuses
        // something else as it draws is not telling the highlight where to go.
        if (el.isConnected && doc.activeElement === el) nav.comeBack(nav.candidates(true), el);
      }, 50);
    }
    adoptField(el);
  };
  doc.addEventListener('focusin', onFocusIn, true);
  adoptField(deepActiveElement(doc));

  const onPointer = (): void => {
    // The shell's own nudge (see revealControls) is not the user reaching for a mouse.
    if (pointerOn || Date.now() < ignorePointerUntil) return;
    doc.documentElement.classList.remove('longboard-no-pointer');
  };
  view.addEventListener('mousemove', onPointer, { passive: true });

  /** What the shell has said: this view is the one in front, or is behind another. */
  let toldFront: boolean | undefined;
  const stopPads = startPolling(view, mode, dispatch, options.buttons, {
    active: () => pointerOn,
    held: (dirs) => send({ kind: 'pointerHeld', dirs }),
  }, () => toldFront);

  // Tell the shell when video is playing so it can hold off the screensaver.
  let lastPlaying = false;
  let lastAwayAt = 0;
  const playbackTimer = view.setInterval(() => {
    // Minimised or behind another window: nothing to look after. Playback
    // was paused on the way out, and the shell must hear that it stopped.
    if (doc.hidden) {
      if (lastPlaying) {
        lastPlaying = false;
        send({ kind: 'playback', playing: false });
      }
      return;
    }
    const v = mainVideo();
    const playing = !!v && !v.paused && !v.ended;
    if (v && inPlayer() && !pointerOn) watchNativeVideo();
    // Mark the player so the stylesheet can hide controls the site has disabled.
    if (v && inPlayer()) playerScope(v, playerRoots).setAttribute('data-longboard-player', '');
    // Focus left over from the page behind must not carry into the player, and
    // the ring must not sit on the picture unless the user is on a control.
    // (onPlayerControl drops focus that is outside the player. Focus on a
    // control is kept: pausing and resuming from the control bar must not lose it.)
    if (playing && !onPlayerControl()) overlay.track(null);
    // A pop-up that opened on its own takes focus too.
    if (!playing) enterDialog();
    if (playing !== lastPlaying) {
      lastPlaying = playing;
      send({ kind: 'playback', playing });
    }
  }, 2000);

  const stopGuard = options.automation
    ? installPurchaseGuard(doc, rules.selectors.purchaseControls, () =>
        overlay.toast('Blocked: automation mode never activates purchase or sign-up controls'),
      )
    : (): void => undefined;

  return {
    dispatch,
    notice: (text) => overlay.toast(text, 6000),
    loading: (on) => overlay.loading(on),
    frameField,
    frameIn,
    frameExit,
    framePlayer: () => !!frame && mainVideo() !== null,
    front: (on) => {
      toldFront = on ?? undefined;
    },
    dropHighlight: () => nav.clear(),
    takeHighlight: (stay) => {
      if (stay && nav.focused?.isConnected) return nav.focus(nav.focused);
      // A player that is running takes the keys with nothing highlighted,
      // as a player that fills the page does: OK plays and pauses, left and
      // right seek, up and down bring its controls up.
      if (frame && isPlayerActive(doc, playerRoots, playerShare())) {
        nav.clear();
        return true;
      }
      return nav.focusFirstOnScreen() || nav.focusFirstIn(doc.documentElement) || (!!frame && mainVideo() !== null);
    },
    phoneText: (id) => {
      const into = deepActiveElement(doc);
      if (!into || !isTextEntry(into)) {
        send({ kind: 'phoneNo', id });
        return;
      }
      // A scripted run never types a password or a one-time code, whatever the text came from (Hard rule 10).
      if (keyboardBarred(into)) return;
      // The phone is the keyboard now: the field has the keys, as with a real one, and the on-screen one goes away.
      typedInto = into;
      closeOsk();
      send({ kind: 'phoneOk', id });
    },
    away: () => {
      // The window is no longer in front. Pause through the site's own key,
      // and only if something is playing: the key is a toggle.
      // The shell may say it more than once for one departure (focus lost,
      // then minimised); a second key would start playback again.
      if (Date.now() - lastAwayAt < 3000) return;
      const v = mainVideo();
      if (v && inPlayer() && !v.paused && !v.ended) {
        lastAwayAt = Date.now();
        pressKey(siteKey('playPause'));
      }
    },
    pointer: (spot) => {
      const was = pointerOn;
      pointerOn = spot !== null;
      overlay.pointer(spot);
      if (pointerOn && !was) {
        // One indicator at a time: the ring goes while the pointer is out.
        closeOsk();
        nav.clear();
        doc.documentElement.classList.add('longboard-no-pointer');
      }
      if (!pointerOn && was) {
        // A click may have left the keys inside an embedded frame, where
        // this layer would never hear them. Take them back.
        const active = doc.activeElement;
        if (active instanceof HTMLIFrameElement && !frameTyping && !frameInside) active.blur();
      }
    },
    editPick: (x, y) => {
      const el = elementAt(doc, x, y);
      // Nothing of the layer's own, and nothing inside a frame, can be marked.
      if (!el || el.closest(HOST_TAG) || el === doc.documentElement || el === doc.body) {
        overlay.toast('Nothing there can be marked');
        return;
      }
      send({ kind: 'editPicked', chain: pickChain(el) });
    },
    editShow: (show) => {
      if (!show) {
        overlay.marks([]);
        return;
      }
      const list: Array<{ el: Element; kind: string }> = [];
      const add = (selector: string, kind: string): void => {
        for (const el of matchesOf(doc, selector)) if (list.length < 120 && !el.closest(HOST_TAG)) list.push({ el, kind });
      };
      for (const kind of ['include', 'exclude', 'row', 'player'] as const) for (const selector of show.marks[kind]) add(selector, kind);
      if (show.picked) add(show.picked, 'picked');
      overlay.marks(list);
    },
    setRules: (next) => {
      // In place: the navigator and the player rules hold on to these lists.
      for (const key of Object.keys(rules.selectors) as Array<keyof SiteRules['selectors']>) {
        rules.selectors[key].length = 0;
        rules.selectors[key].push(...next.selectors[key]);
      }
      rules.groups.length = 0;
      rules.groups.push(...next.groups);
      rules.initial = next.initial;
      rules.generic = next.generic;
      navOptions.skip = [...next.selectors.rowPrev, ...next.selectors.rowNext];
      navOptions.initial = next.initial ?? undefined;
      navOptions.looksClickable = navOptions.readingScroll = navOptions.growPicturesOnly = next.generic;
      rules.playerKeys = next.playerKeys;
      rules.id = next.id;
      rules.name = next.name;
      rules.version = next.version;
    },
    mayClickAt: (x, y) => {
      const el = elementAt(doc, x, y);
      // What is inside a frame cannot be seen from here; the shell asks the frame's own guard.
      if (el instanceof HTMLIFrameElement) return 'frame';
      if (el && !(el instanceof HTMLEmbedElement) && !(el instanceof HTMLObjectElement) && !isSpendControl(el, rules.selectors.purchaseControls, view.location.href)) return 'yes';
      overlay.toast('Blocked: automation mode never activates purchase or sign-up controls');
      return 'no';
    },
    typeIn,
    candidates: () => nav.candidates(),
    focusFirstIn: (container) => nav.focusFirstIn(container),
    focus: (el) => nav.focus(el),
    stop: () => {
      view.removeEventListener('keydown', onKey, true);
      view.removeEventListener('blur', reclaim);
      doc.removeEventListener('focusin', onFocusIn, true);
      view.removeEventListener('mousemove', onPointer);
      view.removeEventListener('mousedown', onMouseDown, true);
      view.clearInterval(playbackTimer);
      view.clearInterval(searchPoll);
      view.clearInterval(controlsTimer);
      view.clearInterval(keepAlive);
      view.clearTimeout(refocusTimer);
      view.clearInterval(coverTimer);
      view.clearTimeout(dialogTimer);
      view.clearTimeout(hoverTimer);
      view.clearTimeout(edgeTimer);
      view.clearTimeout(scrollTimer);
      stopPads();
      stopGuard();
    },
  };
}
