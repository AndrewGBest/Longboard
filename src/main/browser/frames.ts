// Frames inside a page: the layer in each one, full screen, and passing the highlight in and out.
import { ipcMain, type WebContents } from 'electron';
import { playerKeyInfo, cdpKey } from '../../shared/player-keys';
import type { Core } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface FramesPart {
  /** True when every frame inside the page has its guard up. */
  framesGuarded: () => boolean;
  /** The middle of the frame the highlight was asked into from the page itself, in view pixels. */
  frameAt: { x: number; y: number } | null;
  askIntoFrame: (from: Electron.WebFrameMain, stay: boolean, again?: boolean) => void;
  onFrame: (event: Electron.IpcMainEvent, what: unknown) => void;
}

export function createFrames(core: Core): Omit<FramesPart, 'frameAt'> {
  // Embedded frames, in a scripted run only: each says when its purchase
  // guard is up, and when the guard stopped something.
  const guarded = new Set<string>();
  const frameKey = (frame: Electron.WebFrameMain): string => `${frame.processId}:${frame.routingId}`;
  /** True when every frame inside the page has its guard up. */
  const framesGuarded = (): boolean =>
    core.page.mainFrame.framesInSubtree.every((f) => f === core.page.mainFrame || guarded.has(frameKey(f)));
  // The highlight is sent into a frame by whoever holds the frame (the
  // page's layer, or a frame's own for a frame inside it). Every frame of
  // the page is asked; the one with the cursor answers. No answer, or "no",
  // and the asker is told so and falls back (the pointer, on the page).
  let asker: Electron.WebFrameMain | null = null;
  let askTimer: NodeJS.Timeout | undefined;
  /** The highlight is inside some frame of the page. */
  let inFrame = false;
  /** Pages that have something in the browser's own full screen. */
  const fullPages = new WeakSet<WebContents>();
  core.eachPage((wc) => {
    wc.on('enter-html-full-screen', () => fullPages.add(wc));
    wc.on('leave-html-full-screen', () => {
      fullPages.delete(wc);
      // The full screen a player's frame was given has ended (the browser
      // ends it itself on Escape): the highlight is the page's again.
      if (wc === core.page && core.playerInFrame) {
        inFrame = false;
        core.playerInFrame = false;
        core.detach();
        // The frames are told, so no highlight is left showing inside one.
        for (const f of core.page.mainFrame.framesInSubtree)
          if (f !== core.page.mainFrame && !f.isDestroyed()) f.send('longboard:frame-out');
      }
    });
  });
  /** The middle of the frame the highlight was asked into from the page itself, in view pixels. */
  core.frameAt = null;
  /** The frame that had the highlight went to a new page: its new layer is asked to take it again. */
  let reasking = false;
  const frameAnswered = (taken: boolean, player = false): void => {
    clearTimeout(askTimer);
    const to = asker;
    asker = null;
    if (to === core.page.mainFrame || taken) inFrame = taken;
    // A player in the frame: the DevTools input channel is kept while the highlight is in there.
    const wasPlayer = core.playerInFrame;
    core.playerInFrame = taken && player;
    if (core.playerInFrame) core.attach();
    else if (wasPlayer) core.detach();
    if (to && !to.isDestroyed())
      to.send('longboard:frame-in', taken ? 'in' : reasking ? 'lost' : 'none', taken && player);
    reasking = false;
  };
  const askIntoFrame = (from: Electron.WebFrameMain, stay: boolean, again = false): void => {
    clearTimeout(askTimer);
    asker = from;
    reasking = again;
    // A moment for the cursor to arrive in the frame.
    setTimeout(() => {
      if (core.page.isDestroyed() || asker !== from) return;
      for (const f of core.page.mainFrame.framesInSubtree)
        if (f !== core.page.mainFrame && !f.isDestroyed()) f.send('longboard:frame-enter', stay);
    }, 60);
    askTimer = setTimeout(() => frameAnswered(false), 700);
  };
  const onFrame = (event: Electron.IpcMainEvent, what: unknown): void => {
    const frame = event.senderFrame;
    if (!core.isPageView(event.sender) || !frame || frame === event.sender.mainFrame) return;
    if (what && typeof what === 'object') {
      const said = what as {
        field?: unknown;
        secret?: unknown;
        hint?: unknown;
        top?: unknown;
        bottom?: unknown;
        enter?: unknown;
        stay?: unknown;
        entered?: unknown;
        exit?: unknown;
        menu?: unknown;
        pointer?: unknown;
        playerKey?: unknown;
        reveal?: unknown;
        player?: unknown;
        click?: unknown;
      };
      if (event.sender !== core.page || core.active() !== core.page) return;
      // The highlight inside frames: asked in, taken or not, and out again.
      if (said.enter === true) {
        askIntoFrame(frame, said.stay === true);
        return;
      }
      if (typeof said.entered === 'boolean') {
        frameAnswered(said.entered, said.player === true);
        return;
      }
      if (
        said.exit === 'up' ||
        said.exit === 'down' ||
        said.exit === 'left' ||
        said.exit === 'right' ||
        said.exit === 'back'
      ) {
        const to = frame.parent;
        if (to === core.page.mainFrame) {
          inFrame = false;
          if (core.playerInFrame) {
            core.playerInFrame = false;
            core.detach();
          }
        }
        if (to && !to.isDestroyed()) to.send('longboard:frame-exit', said.exit);
        return;
      }
      if (said.menu === true) {
        core.toggleMenu();
        return;
      }
      // A player inside the frame, while the highlight is in there: one of
      // the player's keys, pressed as on any page (it goes to the frame,
      // which has the cursor), or its controls brought up by a pointer
      // movement over the frame.
      // Both go through the DevTools input channel, as pointer mode's
      // clicks do: Electron's own input events do not reach a frame served
      // by another site. They are ordinary, trusted events either way.
      if (inFrame && core.playerInFrame && typeof said.playerKey === 'string') {
        const key = cdpKey(playerKeyInfo(said.playerKey));
        if (key && core.attached) {
          void core.page.debugger
            .sendCommand('Input.dispatchKeyEvent', { type: key.text ? 'keyDown' : 'rawKeyDown', ...key })
            .then(() =>
              core.page.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...key, text: undefined }),
            )
            .catch(() => undefined);
        }
        return;
      }
      if (inFrame && core.playerInFrame && (said.reveal === true || said.click === true)) {
        const [w, h] = core.viewSize(core.page);
        // A frame shown full screen has its middle at the screen's.
        const at = (fullPages.has(core.page) ? null : core.frameAt) ?? { x: Math.round(w / 2), y: Math.round(h / 2) };
        if (said.click === true) {
          // OK on the bare picture of a player that does not answer its key until it has been clicked.
          core.mouse(at.x, at.y, { type: 'move' });
          core.mouse(at.x, at.y, { type: 'down' });
          core.mouse(at.x, at.y, { type: 'up' });
          return;
        }
        core.nudge = !core.nudge;
        const steps = core.nudge ? [0, 20, 40, 60] : [60, 40, 20, 0];
        steps.forEach((dx, i) => setTimeout(() => core.mouse(at.x + dx, at.y, { type: 'move' }), i * 40));
        return;
      }
      if (said.pointer === true) {
        core.setPointer(!core.pointerOn);
        return;
      }
      // A text field inside the frame has the cursor, or has lost it.
      // A scripted run never types a password or a one-time code (Hard rule 10): no keyboard for such a field.
      const open = said.field === 'in' && !(core.options.automation && said.secret === true);
      if (open) {
        if (!core.frameField) core.frameField = { pointer: core.pointerOn };
        core.attach();
        core.page.send('longboard:frame-field', {
          hint: typeof said.hint === 'string' ? said.hint.slice(0, 10) : '',
          top: Number(said.top) || 0,
          bottom: Number(said.bottom) || 0,
        });
      } else if (core.frameField) {
        core.frameField = null;
        if (!core.pointerOn) core.detach();
        core.page.send('longboard:frame-field', null);
      }
      return;
    }
    if (!core.options.automation) return;
    if (what === 'guarded') guarded.add(frameKey(frame));
    else if (what === 'blocked' && event.sender === core.page)
      core.page.send('longboard:notice', 'Blocked: automation mode never activates purchase or sign-up controls');
  };
  ipcMain.on('longboard:frame', onFrame);
  core.eachPage((wc) =>
    wc.on('did-frame-navigate', (_e, _url, _code, _status, isMainFrame, processId, routingId) => {
      // A frame that has gone somewhere new has to say again that it is guarded.
      if (!isMainFrame) guarded.delete(`${processId}:${routingId}`);
      // And if the highlight was inside a frame, the page that has come may be
      // the next step of what was there (a sign-in form's second page): ask
      // it to take the highlight. The page's own layer is told if nothing does.
      if (wc === core.page && inFrame) {
        if (isMainFrame) inFrame = false;
        else
          setTimeout(() => {
            if (!core.page.isDestroyed() && inFrame && !asker) askIntoFrame(core.page.mainFrame, false, true);
          }, 500);
      }
    }),
  );
  return { framesGuarded, askIntoFrame, onFrame };
}
