// Downloads: asked about first, held aside until whole, then moved into place.
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { siteName } from '../../shared/address';
import { uniqueName } from '../../shared/downloads';
import type { Core } from './core';
import type { Download } from './types';

/** What this part adds to the browser for the other parts to use. */
export interface DownloadsPart {
  /** Puts a finished download where the person will look for it. */
  keep: (d: Download) => void;
  downloadsTick: NodeJS.Timeout;
}

export function createDownloads(core: Core): DownloadsPart {
  // A file a site sends, or that the person chose to download, is asked about
  // first: what it is called, how big, where from. While the question is up
  // the file goes on arriving, under a meaningless name in a folder of
  // Longboard's own (a download cannot be made to wait, and one that came
  // from sending a form cannot be asked for twice). Agreed
  // to, it is moved to the downloads folder under a name that writes over
  // nothing. Refused, what arrived is deleted. Longboard never opens or runs
  // what it downloads.
  const taken = (n: string): boolean => existsSync(join(core.downloadsDir(), n));
  /** Puts a finished download where the person will look for it. */
  const keep = (d: Download): void => {
    try {
      mkdirSync(core.downloadsDir(), { recursive: true });
      const name = uniqueName(d.name, taken);
      const to = join(core.downloadsDir(), name);
      try {
        renameSync(d.temp, to);
      } catch {
        // The downloads folder is on another disk.
        copyFileSync(d.temp, to);
        rmSync(d.temp, { force: true });
      }
      d.name = name;
      d.state = 'saved';
      core.notify(`Saved ${name} in ${core.downloadsDir()}`);
    } catch (err) {
      console.error(`[longboard] the downloads folder cannot be used: ${String(err).slice(0, 160)}`);
      rmSync(d.temp, { force: true });
      d.state = 'failed';
      core.notify(`${d.name} could not be saved: the downloads folder cannot be used`);
    }
    if (core.panel === 'menu' || core.panel === 'downloads') core.refreshChrome();
  };
  core.eachSession((web) =>
    web.on('will-download', (event, item, wc) => {
      if (core.pending || core.surface !== 'page' || wc !== core.page) {
        event.preventDefault();
        core.notify(
          core.pending ? 'A download was not started: another question was waiting' : 'A download was not started',
        );
        return;
      }
      let temp: string;
      try {
        mkdirSync(core.waitingDir, { recursive: true });
        temp = join(core.waitingDir, `${randomUUID()}.part`);
      } catch (err) {
        console.error(`[longboard] downloads cannot be held: ${String(err).slice(0, 160)}`);
        event.preventDefault();
        core.notify('A download could not be started');
        return;
      }
      // Set now, so the browser never puts up a file chooser of its own.
      item.setSavePath(temp);
      const url = item.getURL();
      const d: Download = {
        id: ++core.lastDownload,
        name: uniqueName(item.getFilename(), taken),
        site: siteName(url) || 'this site',
        item,
        temp,
        state: 'asking',
        agreed: false,
        arrived: false,
      };
      item.once('done', (_e, state) => {
        if (state === 'completed' && !d.agreed) {
          // All of it came before the answer did; it waits where it is.
          d.arrived = true;
          return;
        }
        if (state === 'completed') {
          keep(d);
          return;
        }
        rmSync(temp, { force: true });
        const asking = core.pending?.what === 'download' && core.pending.download === d;
        if (asking) {
          core.pending = null;
          core.panel = null;
          core.layout();
        }
        // Refused by the person: nothing more to say about it.
        if (d.state === 'asking' && !asking) return;
        d.state = state === 'cancelled' ? 'cancelled' : 'failed';
        core.notify(
          state === 'cancelled' ? `The download of ${d.name} was cancelled` : `The download of ${d.name} failed`,
        );
        if (core.panel === 'menu' || core.panel === 'downloads') core.refreshChrome();
      });
      core.pending = { what: 'download', download: d };
      core.panel = 'prompt';
      core.layout();
    }),
  );
  // The list on screen shows how far each download has got.
  const downloadsTick = setInterval(() => {
    if (core.panel === 'downloads' && core.downloads.some((d) => d.state === 'going')) core.refreshChrome();
  }, 1000);
  return { keep, downloadsTick };
}
