// Pages that are not in front stand still: the browser itself freezes them a
// moment after they are left, and wakes them when they are in front again
// (see DECISIONS.md, 2026-11-18).
import { type WebContents } from 'electron';
import type { Core } from './core';
import { FREEZE_DELAY_MS, isNotice } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface StandstillPart {
  /** The pages that are frozen now. */
  frozen: WeakSet<Electron.WebContents>;
  /** Wakes a page, or calls off a freeze that has not happened yet. */
  thaw: (wc: WebContents) => void;
  /** Freezes a page a moment after it is left, so the site's own pause key (sent first) has been dealt with. */
  freezeSoon: (wc: WebContents) => void;
}

export function createStandstill(core: Core): StandstillPart {
  // A TV shows one thing at a time. A page that is not in front (another tab
  // is, or Home, or another program) is put into the browser's own "frozen"
  // state, the one a phone's browser puts a background tab into: its video
  // and audio pause, its timers stop, and nothing in it runs until it is in
  // front again. Longboard does not touch the site's player to do this; the
  // browser pauses the page as a whole. Measured 2026-11-18: a playing
  // <video>, a playing <audio> and Web Audio all stop, and stay paused when
  // the page is thawed, so playback waits for the person.
  const frozen = new WeakSet<WebContents>();
  const lifecycle = (wc: WebContents, state: 'frozen' | 'active'): void => {
    if (wc.isDestroyed()) return;
    try {
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
      void wc.debugger.sendCommand('Page.setWebLifecycleState', { state }).catch(() => undefined);
    } catch (err) {
      console.error(
        `[longboard] a page could not be ${state === 'frozen' ? 'paused' : 'woken'} (${String(err).slice(0, 120)})`,
      );
    }
  };
  const freeze = (wc: WebContents): void => {
    if (wc.isDestroyed() || frozen.has(wc) || isNotice(wc.getURL())) return;
    frozen.add(wc);
    lifecycle(wc, 'frozen');
  };
  /** Pages that have been left and will be frozen in a moment, unless they come back first. */
  const leaving = new WeakSet<WebContents>();
  const thaw = (wc: WebContents): void => {
    leaving.delete(wc);
    if (!frozen.has(wc)) return;
    frozen.delete(wc);
    lifecycle(wc, 'active');
  };
  const freezeSoon = (wc: WebContents): void => {
    leaving.add(wc);
    setTimeout(() => {
      // Still left? It may have come straight back, which takes it off the list.
      if (wc.isDestroyed() || !leaving.has(wc)) return;
      leaving.delete(wc);
      freeze(wc);
    }, FREEZE_DELAY_MS);
  };
  // A page that goes somewhere new starts awake: the frozen state belongs to the page that was left.
  core.eachPage((wc) =>
    wc.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) thaw(wc);
    }),
  );
  return { frozen, thaw, freezeSoon };
}
