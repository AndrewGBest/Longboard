// The ad-blocking request filter (Hard rule 5). This is the only
// module that may touch a website's requests, and all it ever does is refuse
// one: it never redirects a request, changes a header, puts anything into a
// page or hides anything on one. The shell asks, before each refusal, whether
// blocking is on for the site in front (shared/adblock.ts).
//
// The filter lists are public ones, fetched at run time and never part of
// the repository or a package (Hard rule 1). Fetching them is the second of
// Longboard's two background requests (Hard rule 12): the whole list, from
// its publisher, with no cookies and nothing about the sites visited.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FiltersEngine, Request } from '@ghostery/adblocker';
import { LISTS_KEPT_MS, listsDue, looksLikeFilterList } from '../shared/adblock';
import { readJson, writeJson } from './store';

/** The most one fetched list may weigh; a bigger answer is not taken. */
const MAX_LIST_BYTES = 30_000_000;

/**
 * Network filters only. Everything that would change a page or a response
 * is left out when the lists are read: cosmetic (hiding) filters, scriptlets,
 * HTML filtering, and filters that add security-policy headers.
 */
const ENGINE_OPTIONS = {
  loadNetworkFilters: true,
  loadExceptionFilters: true,
  loadCosmeticFilters: false,
  loadGenericCosmeticsFilters: false,
  loadExtendedSelectors: false,
  loadCSPFilters: false,
  loadPreprocessors: false,
  enableHtmlFiltering: false,
  enableMutationObserver: false,
  enablePushInjectionsOnNavigationEvents: false,
} as const;

/** The kinds of request the shell reports. */
export type RequestKind =
  | 'mainFrame'
  | 'subFrame'
  | 'stylesheet'
  | 'script'
  | 'image'
  | 'font'
  | 'object'
  | 'xhr'
  | 'ping'
  | 'cspReport'
  | 'media'
  | 'webSocket'
  | 'other';

/** A set of filters read from list text. */
export class FilterSet {
  private constructor(private readonly engine: FiltersEngine) {}

  static parse(text: string): FilterSet {
    return new FilterSet(FiltersEngine.parse(text, ENGINE_OPTIONS));
  }

  /** From `save()`. Throws when the bytes are from another version of the engine. */
  static load(bytes: Uint8Array): FilterSet {
    return new FilterSet(FiltersEngine.deserialize(bytes));
  }

  save(): Uint8Array {
    return this.engine.serialize();
  }

  /**
   * True when the lists say this request should be refused. `pageUrl` is the
   * page in front, which the request is for. The page the person asked for
   * is never refused. A filter that would swap the response for a stand-in
   * is treated as a plain refusal: nothing is ever served in a site's place.
   */
  refuses(url: string, pageUrl: string, kind: RequestKind): boolean {
    if (kind === 'mainFrame') return false;
    try {
      return this.engine.match(Request.fromRawDetails({ url, sourceUrl: pageUrl, type: kind })).match === true;
    } catch {
      return false;
    }
  }

  /**
   * True when the lists name this address as a page: used for the warning
   * before a site on a list of harmful sites (shared/harmful.ts), which is
   * asked about the page the person is opening and nothing else.
   */
  listsPage(url: string): boolean {
    try {
      return this.engine.match(Request.fromRawDetails({ url, sourceUrl: url, type: 'mainFrame' })).match === true;
    } catch {
      return false;
    }
  }
}

/** What the store needs from outside, so the unit tests can stand in for the clock and the network. */
export interface FilterStoreDeps {
  /** Where the lists and the prepared filters are kept. */
  folder: string;
  lists: readonly string[];
  /** Fetches an address and returns its bytes, or throws. */
  fetchBytes: (url: string, maxBytes: number) => Promise<Buffer>;
  now: () => number;
  note: (line: string) => void;
  /** What the lists are for, in the lines written to the terminal. "ad blocking" without it. */
  label?: string;
  /** How long a fetched copy is used before it is fetched again. Four days without it. */
  keptMs?: number;
}

/** The filters on this machine: read from disk at start, fetched again when old. */
export class FilterStore {
  private set: FilterSet | null = null;

  constructor(private readonly deps: FilterStoreDeps) {}

  /** The filters, or null when none have been downloaded yet. */
  get filters(): FilterSet | null {
    return this.set;
  }

  /** When the lists were last fetched, or null when they never were. */
  get fetchedAt(): number | null {
    const at = (readJson(join(this.deps.folder, 'state.json')) as { fetchedAt?: unknown } | undefined)?.fetchedAt;
    return typeof at === 'number' && Number.isFinite(at) ? at : null;
  }

  /** Reads what an earlier run left. Never throws. */
  load(): void {
    const { folder, note, label = 'ad blocking' } = this.deps;
    try {
      this.set = FilterSet.load(readFileSync(join(folder, 'filters.bin')));
      return;
    } catch {
      // none yet, or written by another version of the engine: read the lists again
    }
    try {
      this.set = FilterSet.parse(readFileSync(join(folder, 'lists.txt'), 'utf8'));
      writeFileSync(join(folder, 'filters.bin'), this.set.save());
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
        note(`${label}: the saved lists could not be read (${String(err).slice(0, 120)})`);
    }
  }

  /**
   * Fetches the lists if the copy on disk is old (or `force`). Returns true
   * when new filters are in use. A failure of any kind keeps what was there.
   */
  async refresh(force = false): Promise<boolean> {
    const { folder, lists, fetchBytes, now, note, label = 'ad blocking', keptMs = LISTS_KEPT_MS } = this.deps;
    const stateFile = join(folder, 'state.json');
    const state = readJson(stateFile) as { fetchedAt?: unknown; lists?: unknown } | undefined;
    const sameLists = JSON.stringify(state?.lists) === JSON.stringify(lists);
    if (!force && this.set && sameLists && !listsDue(state?.fetchedAt, now(), keptMs)) return false;
    try {
      const texts: string[] = [];
      for (const url of lists) {
        const text = (await fetchBytes(url, MAX_LIST_BYTES)).toString('utf8');
        if (!looksLikeFilterList(text)) throw new Error(`${new URL(url).host} did not send a filter list`);
        texts.push(text);
      }
      const all = texts.join('\n');
      const next = FilterSet.parse(all);
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, 'lists.txt'), all);
      writeFileSync(join(folder, 'filters.bin'), next.save());
      writeJson(stateFile, { fetchedAt: now(), lists });
      this.set = next;
      note(`${label}: ${lists.length} filter list(s) fetched`);
      return true;
    } catch (err) {
      note(`${label}: lists not updated (${String(err).slice(0, 160)}); keeping what is on disk`);
      return false;
    }
  }
}

/**
 * Puts the filter on a session. `refuse` is asked about every web request
 * and answers true to refuse it. This is the one place a request handler is
 * installed, and "cancel" is the only thing it can say.
 */
export function filterSession(
  ses: Electron.Session,
  refuse: (
    url: string,
    kind: RequestKind,
    contents: Electron.WebContents | undefined,
    from: { topDocument: boolean; referrer: string },
  ) => boolean,
): void {
  ses.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, callback) => {
      let cancel: boolean;
      try {
        const frame = details.frame;
        cancel = refuse(details.url, details.resourceType, details.webContents, {
          topDocument: !!frame && frame.parent === null,
          referrer: details.referrer,
        });
      } catch {
        cancel = false;
      }
      callback({ cancel });
    },
  );
}
