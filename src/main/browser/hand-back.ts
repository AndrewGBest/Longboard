// What becomes of a question that leaves the screen unanswered (dropQuestion),
// and handing an account back to the program that asked for it
// (main/handback.ts): nothing is shared before the person says yes. Also
// holds the reader view's article, and which panel the last layout showed.
import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { type WebContents } from 'electron';
import { DECLINED, HAND_BACKS, steamStorePage, steamWho, type HandBack } from '../handback';
import { type Panel } from '../../shared/chrome';
import { type Article } from '../../shared/reader';
import { PRODUCT } from '../../shared/product';
import type { Core } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface HandBackPart {
  /** The article shown in the reader view, while it is open. */
  reading: (Article & { site: string }) | null;
  /** When the question now on screen was put there. */
  promptShownAt: number;
  /** The panel as of the last layout, which is how layout tells that one has opened or closed. */
  shownPanel: Panel | null;
  /**
   * A question that is no longer on screen cannot be answered, so it is
   * answered "not now": the site is refused this once, the file is dropped,
   * the profile is asked about another time. Left waiting, it would refuse
   * every later question until Longboard was closed.
   */
  dropQuestion: () => void;
  /** Writes the answer where the asking program looks for it: whole or not at all, and for this user only. */
  writeHandBack: (ask: HandBack, line: string) => void;
  /** Opens the sign-in page for what was asked for. One request at a time: a new one replaces one not yet answered. */
  handBack: (ask: HandBack) => void;
}

export function createHandBack(core: Core): Omit<HandBackPart, 'reading' | 'promptShownAt' | 'shownPanel'> {
  /** The article shown in the reader view, while it is open. */
  core.reading = null;
  /** When the question now on screen was put there. */
  core.promptShownAt = 0;
  core.shownPanel = null;
  const dropQuestion = (): void => {
    const asked = core.pending;
    if (!asked) return;
    core.pending = null;
    if (asked.what === 'permission') for (const answer of asked.answer) answer(false);
    else if (asked.what === 'download') {
      if (!asked.download.arrived) asked.download.item.cancel();
      rmSync(asked.download.temp, { force: true });
    } else if (asked.what === 'extension') core.extensions.discard(asked.extension);
    // A question that went unanswered is a no, and the program waiting is told.
    else if (asked.what === 'handBack') writeHandBack(asked.ask, DECLINED);
  };

  const writeHandBack = (ask: HandBack, line: string): void => {
    if (core.wanted === ask) core.wanted = null;
    try {
      writeFileSync(`${ask.to}.part`, line, { mode: 0o600 });
      renameSync(`${ask.to}.part`, ask.to);
    } catch (err) {
      console.error(`[longboard] the answer could not be written: ${String(err).slice(0, 200)}`);
    }
  };

  /**
   * Once the person is past Steam's sign-in page: sees who is signed in, by
   * fetching Steam's front page as this browser, and asks whether to share.
   * Nothing is put into the page, and nothing leaves before the answer.
   */
  const lookForHandBack = async (wc: WebContents, url: string): Promise<void> => {
    const ask = core.wanted;
    if (!ask || core.lookingForAccount || core.pending || wc !== core.page || !steamStorePage(url, ask.at)) return;
    core.lookingForAccount = true;
    const site = HAND_BACKS[ask.what].site;
    try {
      const response = await wc.session.fetch(ask.at.home, { credentials: 'include', cache: 'no-store' });
      if (!response.ok) throw new Error(`answered ${response.status}`);
      const who = steamWho(await response.text());
      if (core.wanted !== ask) return;
      // Nobody yet: the person is still on their way through signing in.
      if (who === 'nobody') return;
      if (who === 'unreadable') {
        // The site's page no longer says who is signed in the way known here.
        // Nothing can be shared, and both the person and the program waiting are told so.
        writeHandBack(ask, DECLINED);
        core.notify(
          `${site}'s pages have changed and ${PRODUCT.name} can no longer tell who is signed in, so nothing was shared`,
        );
        return;
      }
      if (core.pending || core.win.isDestroyed() || wc !== core.page || core.surface !== 'page') return;
      core.pending = { what: 'handBack', ask, steamid: who.steamid, from: wc.session };
      core.panel = 'prompt';
      core.layout();
    } catch {
      // Not reachable just now. Said once; the next page the person opens there looks again.
      if (core.wanted === ask && !saidUnreachable.has(ask)) {
        saidUnreachable.add(ask);
        core.notify(
          `${site} did not answer when asked who is signed in. ${PRODUCT.name} will look again on the next ${site} page you open`,
        );
      }
    } finally {
      core.lookingForAccount = false;
    }
  };
  const saidUnreachable = new WeakSet<HandBack>();
  // A page of the store reached either way: by a new page, or by the site changing the address of the one it is on.
  core.eachPage((wc) => wc.on('did-navigate', (_e, url) => void lookForHandBack(wc, url)));
  core.eachPage((wc) =>
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (isMainFrame) void lookForHandBack(wc, url);
    }),
  );

  const handBack = (ask: HandBack): void => {
    if (core.wanted && core.wanted !== ask) writeHandBack(core.wanted, DECLINED);
    core.wanted = ask;
    core.open(ask.at.signIn, false);
  };
  return { dropQuestion, writeHandBack, handBack };
}
