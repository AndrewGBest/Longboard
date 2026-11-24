// Pointer mode: an on-screen pointer for what the highlight cannot reach.
import { type WebContents } from 'electron';
import { type Direction } from '../../shared/actions';
import { cdpPoint, PointerHolds, pointerGlide, pointerTap, type PointerStep } from '../pointer';
import type { Core } from './core';
import type { Mouse } from './types';

/** What this part adds to the browser for the other parts to use. */
export interface PointerModePart {
  pointer: {
    x: number;
    y: number;
    holds: PointerHolds;
    timer: NodeJS.Timeout | undefined;
    last: number;
    checkId: number;
  };
  pageSize: () => { width: number; height: number };
  /** Keys Longboard has just sent a view itself, so they are not taken for a person's. */
  ownKeys: Array<{ to: WebContents; key: string; until: number }>;
  strayLogged: boolean;
  /** The highlight is in a frame that is a player (see onFrame). */
  playerInFrame: boolean;
  attached: boolean;
  attach: () => void;
  detach: () => void;
  mouse: (x: number, y: number, what: Mouse) => void;
  stopGlide: () => void;
  /** A direction key of a keyboard or remote went down. */
  keyPointer: (dir: Direction, isRepeat: boolean) => void;
  /** What a game controller holds now. */
  padPointer: (dirs: readonly Direction[]) => void;
  click: () => void;
  /** OK in pointer mode. A scripted run asks the layer first whether the spot is safe (Hard rule 11). */
  pressPointer: () => void;
  setPointer: (on: boolean, at?: { x: number; y: number } | null) => void;
}

export function createPointerMode(core: Core): Omit<PointerModePart, 'strayLogged' | 'playerInFrame' | 'attached'> {
  // An on-screen pointer moved with the arrows, for what the highlight cannot
  // reach: maps, canvases, embedded frames. Everything it does is an ordinary
  // mouse event sent to the page, so the page cannot tell it from a mouse and
  // nothing in the page is touched. The layer only draws the arrow.
  const pointer = {
    x: 0,
    y: 0,
    holds: new PointerHolds(),
    timer: undefined as NodeJS.Timeout | undefined,
    last: 0,
    checkId: 0,
  };
  const pageSize = (): { width: number; height: number } => {
    const b = core.pageView.getBounds();
    return { width: b.width, height: b.height };
  };
  /** Keys Longboard has just sent a view itself, so they are not taken for a person's. */
  const ownKeys: Array<{ to: WebContents; key: string; until: number }> = [];
  core.strayLogged = false;
  /** The highlight is in a frame that is a player (see onFrame). */
  core.playerInFrame = false;
  core.attached = false;
  // Mouse events for pointer mode go through the browser's DevTools input
  // channel, attached only while pointer mode is on. Electron's own
  // sendInputEvent does not deliver mouse events into frames served by
  // another site (seen 2026-11-18), and those frames are what pointer mode is
  // for. They are the same ordinary, trusted mouse events either way.
  const attach = (): void => {
    if (core.attached || core.page.isDestroyed()) return;
    try {
      if (!core.page.debugger.isAttached()) core.page.debugger.attach('1.3');
      core.attached = true;
    } catch (err) {
      console.error(`[longboard] pointer mode: falling back to plain input events (${String(err).slice(0, 120)})`);
    }
  };
  const detach = (): void => {
    // Kept while the on-screen keyboard is typing into a frame: its letters go this way too.
    // And while a player in a frame has the keys: its keys and the pointer movement that brings its controls up do.
    if (!core.attached || core.frameField || core.playerInFrame) return;
    core.attached = false;
    try {
      // Left attached while the page is frozen: letting go would wake it.
      if (!core.page.isDestroyed() && core.page.debugger.isAttached() && !core.frozen.has(core.page))
        core.page.debugger.detach();
    } catch {
      // already gone
    }
  };
  core.eachPage((wc) =>
    wc.debugger.on('detach', () => {
      if (wc === core.page) core.attached = false;
    }),
  );
  const mouse = (x: number, y: number, what: Mouse): void => {
    if (core.page.isDestroyed()) return;
    if (core.attached) {
      // This channel counts in the page's own pixels, not the screen's.
      // Measured: with the page drawn at 1.33 times, a click sent in screen
      // pixels landed 1.33 times too far from the corner.
      const at = cdpPoint(x, y, core.page.getZoomFactor());
      const params =
        what.type === 'move'
          ? { type: 'mouseMoved', ...at }
          : what.type === 'wheel'
            ? { type: 'mouseWheel', ...at, deltaX: what.dx, deltaY: what.dy }
            : { type: what.type === 'down' ? 'mousePressed' : 'mouseReleased', ...at, button: 'left', clickCount: 1 };
      core.page.debugger.sendCommand('Input.dispatchMouseEvent', params).catch(() => undefined);
      return;
    }
    if (what.type === 'move')
      core.page.sendInputEvent({ type: 'mouseMove', x, y, globalX: x, globalY: y, movementX: 0, movementY: 0 });
    // A wheel's "up" is positive for sendInputEvent; the amounts here are "down is positive".
    else if (what.type === 'wheel')
      core.page.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: -what.dx, deltaY: -what.dy, canScroll: true });
    else
      core.page.sendInputEvent({
        type: what.type === 'down' ? 'mouseDown' : 'mouseUp',
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
  };
  const showPointer = (): void => {
    if (core.page.isDestroyed()) return;
    const zoom = core.page.getZoomFactor() || 1;
    core.page.send('longboard:pointer', core.pointerOn ? { x: pointer.x / zoom, y: pointer.y / zoom } : null);
  };
  const applyStep = (step: PointerStep): void => {
    if (core.page.isDestroyed()) return;
    const x = Math.round(step.x);
    const y = Math.round(step.y);
    const moved = x !== Math.round(pointer.x) || y !== Math.round(pointer.y);
    pointer.x = step.x;
    pointer.y = step.y;
    if (moved) {
      mouse(x, y, { type: 'move' });
      showPointer();
    }
    // Pushing against an edge scrolls, as a wheel would.
    const dx = Math.round(step.scrollX);
    const dy = Math.round(step.scrollY);
    if (dx !== 0 || dy !== 0) mouse(x, y, { type: 'wheel', dx, dy });
  };
  const stopGlide = (): void => {
    clearInterval(pointer.timer);
    pointer.timer = undefined;
    pointer.holds.clear();
  };
  /** Runs while something is held or a press may still turn into a hold, and not otherwise. */
  const glide = (): void => {
    if (pointer.timer) return;
    pointer.last = Date.now();
    pointer.timer = setInterval(() => {
      if (!core.pointerOn || core.page.isDestroyed() || core.active() !== core.page) {
        stopGlide();
        return;
      }
      const now = Date.now();
      const held = pointer.holds.held(now);
      if (held.size > 0) applyStep(pointerGlide(pointer, held, now, now - pointer.last, pageSize()));
      pointer.last = now;
      if (pointer.holds.idle(now)) {
        clearInterval(pointer.timer);
        pointer.timer = undefined;
      }
    }, 16);
  };
  /** A direction key of a keyboard or remote went down. */
  const keyPointer = (dir: Direction, isRepeat: boolean): void => {
    if (pointer.holds.keyDown(dir, isRepeat, Date.now())) applyStep(pointerTap(pointer, dir, pageSize()));
    glide();
  };
  /** What a game controller holds now. */
  const padPointer = (dirs: readonly Direction[]): void => {
    for (const dir of pointer.holds.setPad(dirs, Date.now())) applyStep(pointerTap(pointer, dir, pageSize()));
    glide();
  };
  const click = (): void => {
    if (core.page.isDestroyed()) return;
    const x = Math.round(pointer.x);
    const y = Math.round(pointer.y);
    mouse(x, y, { type: 'down' });
    mouse(x, y, { type: 'up' });
  };
  /** OK in pointer mode. A scripted run asks the layer first whether the spot is safe (Hard rule 11). */
  const pressPointer = (): void => {
    if (!core.options.automation) {
      click();
      return;
    }
    const zoom = core.page.getZoomFactor() || 1;
    pointer.checkId += 1;
    core.page.send('longboard:pointer-check', { id: pointer.checkId, x: pointer.x / zoom, y: pointer.y / zoom });
  };
  const setPointer = (on: boolean, at?: { x: number; y: number } | null): void => {
    if (on === core.pointerOn && !at) return;
    stopGlide();
    core.pointerOn = on && core.surface === 'page';
    if (core.pointerOn) {
      attach();
      const size = pageSize();
      pointer.x = at?.x ?? size.width / 2;
      pointer.y = at?.y ?? size.height / 2;
      mouse(Math.round(pointer.x), Math.round(pointer.y), { type: 'move' });
    } else {
      detach();
    }
    showPointer();
  };
  // A new page has a new layer, which has to be told the pointer is out.
  core.eachPage((wc) =>
    wc.on('dom-ready', () => {
      if (wc === core.page && core.pointerOn) showPointer();
    }),
  );
  return {
    pointer,
    pageSize,
    ownKeys,
    attach,
    detach,
    mouse,
    stopGlide,
    keyPointer,
    padPointer,
    click,
    pressPointer,
    setPointer,
  };
}
