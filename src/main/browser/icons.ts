// Icons for Home's tiles and for apps: fetched from the site at run time and
// kept on this machine, never in the repository (Hard rule 6). What a site
// sends is never decoded by the shell: see drawIcon.
import { type WebContents } from 'electron';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { siteKey } from '../../shared/address';
import { appFor } from '../../shared/apps';
import {
  ICON_SIZE,
  iconCandidates,
  iconDataUrl,
  manifestIcons,
  manifestLink,
  MAX_ICON_BYTES,
  type IconLink,
} from '../../shared/icons';
import type { Core } from './core';
import { ICON_KEPT_MS, ICON_WAIT_MS, isNotice } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface IconsPart {
  /** The icon links each page's layer found in the page. */
  iconLinks: WeakMap<Electron.WebContents, IconLink[]>;
  /**
   * The addresses to try for the icon of the page in `wc`, best first. When
   * the page names a web-app manifest that is read too: it is where a site
   * lists the big icons it made for being put on a home screen.
   */
  iconsFor: (wc: WebContents) => Promise<string[]>;
  /**
   * Fetches the icon for whatever on Home the page in front belongs to (an
   * app, a saved page, a recent site) when there is none yet or it is old.
   * Called when the page says what its icons are, and when something is put on Home.
   */
  refreshIcons: (wc: WebContents) => void;
  /** Icons handed to Longboard's own screen to be drawn, waiting to come back as a PNG. */
  drawing: Map<number, (png: Buffer | null) => void>;
  /** Saves the first of the candidates that can be read as a picture, under `id`. False when none can. */
  saveIcon: (id: string, candidates: readonly string[], from: Electron.Session) => Promise<boolean>;
}

export function createIcons(core: Core): IconsPart {
  /** The icons each page says are its own: what the browser found, and what the page's own links name. */
  const favicons = new WeakMap<WebContents, string[]>();
  const iconLinks = new WeakMap<WebContents, IconLink[]>();
  /** Icons being fetched now, by the name they are kept under. */
  const fetchingIcons = new Set<string>();
  const iconsFor = async (wc: WebContents): Promise<string[]> => {
    const url = wc.getURL();
    const links = iconLinks.get(wc) ?? [];
    const manifestUrl = manifestLink(links);
    let listed: Array<{ url: string; size: number }> = [];
    if (manifestUrl) {
      const got = await fetchIcon(manifestUrl, wc.session);
      try {
        if (got) listed = manifestIcons(JSON.parse(got.body.toString('utf8')), manifestUrl);
      } catch {
        // not a manifest
      }
    }
    return iconCandidates(links, listed, favicons.get(wc) ?? [], url);
  };
  const refreshIcons = (wc: WebContents): void => {
    if (wc !== core.page || wc.isDestroyed() || isNotice(wc.getURL())) return;
    const url = wc.getURL();
    const key = siteKey(url);
    if (!key) return;
    const onHome = (): boolean => [...core.recents, ...core.saved].some((r) => siteKey(r.url) === key);
    const ids: string[] = [];
    const item = appFor(core.apps, url);
    if (item) ids.push(item.id);
    if (onHome()) ids.push(core.siteIconId(url));
    for (const id of ids) {
      // Fetched again after a week, in case the site has changed it.
      let age = Infinity;
      try {
        age = Date.now() - statSync(join(core.iconsDir, `${id}.png`)).mtimeMs;
      } catch {
        // not fetched yet
      }
      if (age < ICON_KEPT_MS || fetchingIcons.has(id)) continue;
      fetchingIcons.add(id);
      void iconsFor(wc)
        .then((candidates) => saveIcon(id, candidates, wc.session))
        .catch(() => false)
        .then((done) => {
          fetchingIcons.delete(id);
          if (!done) return;
          const added = core.apps.find((a) => a.id === id);
          if (id.startsWith('site-')) {
            // The site may have been taken off Home while its icon was on the way.
            if (!onHome()) core.saveRecents();
          } else if (!added) {
            rmSync(join(core.iconsDir, `${id}.png`), { force: true });
            core.iconData.delete(id);
          } else if (added.launcher) core.writeAppLauncher(added);
          if (core.surface === 'home' && !core.win.isDestroyed()) core.layout();
        });
    }
  };
  core.eachPage((wc) =>
    wc.on('page-favicon-updated', (_e, urls) => {
      favicons.set(wc, urls.filter((u) => /^https?:/i.test(u)).slice(0, 8));
      refreshIcons(wc);
    }),
  );
  core.eachPage((wc) =>
    wc.on('did-navigate', () => {
      favicons.delete(wc);
      iconLinks.delete(wc);
    }),
  );
  const drawing = new Map<number, (png: Buffer | null) => void>();
  let lastDrawing = 0;
  /**
   * Turns what a site sent into a small PNG without the shell ever decoding
   * it: the sandboxed process that draws Longboard's own screens does, as it
   * would for any picture on a page, and sends back a PNG of its own making.
   */
  const drawIcon = (dataUrl: string): Promise<Buffer | null> =>
    new Promise((resolve) => {
      if (core.chrome.isDestroyed()) return resolve(null);
      const id = ++lastDrawing;
      const timer = setTimeout(() => {
        drawing.delete(id);
        resolve(null);
      }, 8000);
      drawing.set(id, (png) => {
        clearTimeout(timer);
        drawing.delete(id);
        resolve(png);
      });
      core.chrome.send('longboard:icon', { id, dataUrl, size: ICON_SIZE });
    });
  /** A site's icon as the site sends it: given up on after a few seconds or when it is bigger than an icon could be. */
  const fetchIcon = async (
    url: string,
    from: Electron.Session,
  ): Promise<{ body: Buffer; type: string | null } | null> => {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), ICON_WAIT_MS);
    try {
      const response = await from.fetch(url, { cache: 'force-cache', signal: stop.signal });
      if (!response.ok || !response.body || Number(response.headers.get('content-length') ?? 0) > MAX_ICON_BYTES)
        return null;
      const parts: Buffer[] = [];
      let size = 0;
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_ICON_BYTES) {
          stop.abort();
          return null;
        }
        parts.push(Buffer.from(value));
      }
      return { body: Buffer.concat(parts), type: response.headers.get('content-type') };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  /**
   * Saves a site's own icon under `id`, fetched from the site by the session
   * the page is in. Hard rule 6: icons come from the site at run time and are
   * never in the repository. Nothing is saved when the site offers none that
   * can be read as a picture.
   */
  const saveIcon = async (id: string, candidates: readonly string[], from: Electron.Session): Promise<boolean> => {
    for (const url of candidates) {
      try {
        const bytes = await fetchIcon(url, from);
        const dataUrl = bytes ? iconDataUrl(bytes.body, bytes.type) : null;
        const png = dataUrl ? await drawIcon(dataUrl) : null;
        if (!png) continue;
        mkdirSync(core.iconsDir, { recursive: true });
        writeFileSync(join(core.iconsDir, `${id}.png`), png);
        core.iconData.delete(id);
        return true;
      } catch {
        // try the next one
      }
    }
    return false;
  };
  return { iconLinks, iconsFor, refreshIcons, drawing, saveIcon };
}
