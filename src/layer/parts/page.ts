// The page as the layer sees it: its player, what the highlight may reach, the overlay and the navigator.
import { type BridgeMessage, type LayerOptions } from '../../shared/actions';
import { type SiteRules } from '../profile/rules';
import { isSecretField } from '../../shared/osk';
import { deepContains } from '../spatial/deep';
import { findMainVideo, GENERIC_PLAYER_SHARE, coversPicture, pageVideo, playerScope } from '../player';
import { coveringLayer, openDialog, SpatialNavigator, type NavigatorOptions } from '../spatial/navigator';
import { HOST_TAG, Overlay } from '../ui/overlay';
import type { LayerCore } from './core';

/** What this part adds for the other parts to use. */
export interface PagePart {
  doc: Document;
  options: LayerOptions;
  rules: SiteRules;
  send: (msg: BridgeMessage) => void;
  hooks: { back?: () => boolean; edge?: (dir: 'up' | 'down' | 'left' | 'right') => boolean } | undefined;
  frame: { exit: (how: 'up' | 'down' | 'left' | 'right' | 'back') => void; field: (el: Element) => void } | undefined;
  view: Window & typeof globalThis;
  playerRoots: string[];
  playerShare: () => number;
  playerInPage: () => boolean;
  mainVideo: () => HTMLVideoElement | null;
  /** True for the length of one move out of such a player: the whole page is in reach. */
  leavingPlayer: boolean;
  inPlayer: () => boolean;
  /** The pop-up or covering layer in front, when it is pinned to the screen and so does not move with the page. */
  pinnedLayer: () => Element | null;
  /** While the player is open, focus stays among its own controls. */
  scope: () => Element | null;
  overlay: Overlay;
  /** A scripted run never types a password or a one-time code (Hard rule 9). A person may. */
  keyboardBarred: (el: Element) => boolean;
  /** Things that jump elsewhere when they get the cursor (moveInPage finds them). */
  jumpers: WeakSet<Element>;
  navOptions: NavigatorOptions;
  nav: SpatialNavigator;
}

export function createPage(core: LayerCore): Omit<PagePart, 'leavingPlayer'> {
  const { doc, options, rules, send, hooks, frame } = core.deps;
  if (!doc.defaultView) throw new Error('layer needs a window');
  const view: Window & typeof globalThis = doc.defaultView;

  const playerRoots = rules.selectors.playerRoot;
  // With no profile for this page everything is worked out from the page
  // itself. Read each time: the profile can change while the page stays (setRules).
  const playerShare = (): number => (rules.generic ? GENERIC_PLAYER_SHARE : 0.5);
  // A player that is one part of a longer page (a sports network's live
  // page: its tabs above the picture, a row of channels below). It is a
  // player while the highlight is in it or nowhere; with the highlight on
  // something else of the page, the page is being browsed. Sites with no
  // profile only, and not in a frame or full screen, where the player is all
  // there is.
  const playerInPage = (): boolean =>
    rules.generic &&
    !frame &&
    !doc.fullscreenElement &&
    (doc.scrollingElement?.scrollHeight ?? 0) > view.innerHeight * 1.25;
  /** The highlight is on something inside that page's big video's own player. */
  const onPagePlayer = (): HTMLVideoElement | null => {
    const on = nav.focused;
    if (!on || !playerInPage()) return null;
    const v = pageVideo(doc);
    return v && deepContains(playerScope(v, playerRoots), on) ? v : null;
  };
  // The video being watched: the one that fills the window. In a longer
  // page it is also the big one whose controls the highlight is on, though
  // bringing a control at its bottom edge on screen has scrolled part of
  // the picture away.
  const mainVideo = (): HTMLVideoElement | null => findMainVideo(doc, playerRoots, playerShare()) ?? onPagePlayer();
  /** True for the length of one move out of such a player: the whole page is in reach. */
  core.leavingPlayer = false;
  const inPlayer = (): boolean => {
    if (core.leavingPlayer) return false;
    const v = mainVideo();
    // An embedded frame that a video fills is a player whether or not the
    // video has started: the frame is there for nothing else.
    if (!v || !(frame || ((!v.paused || v.currentTime > 0) && v.readyState > 0))) return false;
    if (!playerInPage()) return true;
    const on = nav.focused;
    return !on || deepContains(playerScope(v, playerRoots), on);
  };
  /** The pop-up or covering layer in front, when it is pinned to the screen and so does not move with the page. */
  const pinnedLayer = (): Element | null => {
    const layer = openDialog(doc) ?? (inPlayer() ? null : coveringLayer(doc));
    for (let el: Element | null = layer; el; el = el.parentElement)
      if (view.getComputedStyle(el).position === 'fixed') return layer;
    return null;
  };
  /** While the player is open, focus stays among its own controls. */
  const scope = (): Element | null => {
    // A pop-up the page opened in front of everything: only it can be reached.
    const dialog = openDialog(doc);
    // An open hover menu lies over the page; what is underneath is not
    // reachable until it is closed. A pop-up opened from the menu is in front of both.
    if (core.hoverHost?.isConnected && !(dialog && !deepContains(core.hoverHost, dialog))) return core.hoverHost;
    if (dialog) return dialog;
    // A gate or notice laid over the whole screen without saying it is a dialog.
    if (!inPlayer()) return coveringLayer(doc);
    const v = mainVideo();
    return v ? playerScope(v, playerRoots) : null;
  };

  const overlay = new Overlay(doc);
  /** A scripted run never types a password or a one-time code (Hard rule 9). A person may. */
  const keyboardBarred = (el: Element): boolean =>
    options.automation &&
    isSecretField(
      el.getAttribute('type'),
      el.getAttribute('autocomplete'),
      `${el.getAttribute('name') ?? ''} ${el.id}`,
    );
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
      if (core.typedInto !== el) core.typedInto = null;
    },
    scope,
    skip: [...rules.selectors.rowPrev, ...rules.selectors.rowNext],
    exclude: rules.selectors.exclude,
    groups: rules.groups,
    initial: rules.initial ?? undefined,
    closeFirst: rules.selectors.dismiss,
    looksClickable: rules.generic,
    cursorHiddenClass: 'longboard-no-pointer',
    readingScroll: rules.generic,
    growPicturesOnly: rules.generic,
  };
  const nav = new SpatialNavigator(doc, navOptions);
  return {
    doc,
    options,
    rules,
    send,
    hooks,
    frame,
    view,
    playerRoots,
    playerShare,
    playerInPage,
    mainVideo,
    inPlayer,
    pinnedLayer,
    scope,
    overlay,
    keyboardBarred,
    jumpers,
    navOptions,
    nav,
  };
}
