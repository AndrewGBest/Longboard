// The ad-blocking request filter (Hard rules 4 and 5). This is the only
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
import { listsDue, looksLikeFilterList } from '../shared/adblock';
import { readJson, writeJson } from './store';

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
export type RequestKind = 'mainFrame' | 'subFrame' | 'stylesheet' | 'script' | 'image' | 'font' | 'object' | 'xhr' | 'ping' | 'cspReport' | 'media' | 'webSocket' | 'other';

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
}

export interface FilterStoreDeps {
  /** Where the lists and the prepared filters are kept. */
  folder: string;
  lists: readonly string[];
  /** Fetches an address and returns its bytes, or throws. */
  fetchBytes: (url: string, maxBytes: number) => Promise<Buffer>;
  now: () => number;
  note: (line: string) => void;
}

/** The filters on this machine: read from disk at start, fetched again when old. */
export class FilterStore {
  private set: FilterSet | null = null;

  constructor(private readonly deps: FilterStoreDeps) {}

  /** The filters, or null when none have been downloaded yet. */
  get filters(): FilterSet | null {
    return this.set;
  }

  /** Reads what an earlier run left. Never throws. */
  load(): void {
    const { folder, note } = this.deps;
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
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') note(`ad blocking: the saved lists could not be read (${String(err).slice(0, 120)})`);
    }
  }

  /**
   * Fetches the lists if the copy on disk is old (or `force`). Returns true
   * when new filters are in use. A failure of any kind keeps what was there.
   */
  async refresh(force = false): Promise<boolean> {
    const { folder, lists, fetchBytes, now, note } = this.deps;
    const stateFile = join(folder, 'state.json');
    const state = readJson(stateFile) as { fetchedAt?: unknown; lists?: unknown } | undefined;
    const sameLists = JSON.stringify(state?.lists) === JSON.stringify(lists);
    if (!force && this.set && sameLists && !listsDue(state?.fetchedAt, now())) return false;
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
      note(`ad blocking: ${lists.length} filter list(s) fetched`);
      return true;
    } catch (err) {
      note(`ad blocking: lists not updated (${String(err).slice(0, 160)}); keeping what is on disk`);
      return false;
    }
  }
}

/**
 * Puts the filter on a session. `refuse` is asked about every web request
 * and answers true to refuse it. This is the one place a request handler is
 * installed, and "cancel" is the only thing it can say.
 */
export function filterSession(ses: Electron.Session, refuse: (url: string, kind: RequestKind, contents: Electron.WebContents | undefined) => boolean): void {
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
    let cancel = false;
    try {
      cancel = refuse(details.url, details.resourceType as RequestKind, details.webContents);
    } catch {
      cancel = false;
    }
    callback({ cancel });
  });
}
