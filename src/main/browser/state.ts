// What is on screen and what is waiting: the surface, the panel, the question, downloads, history.
import { type WebContents } from 'electron';
import { type HandBack } from '../handback';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { siteKey } from '../../shared/address';
import { type Panel } from '../../shared/chrome';
import { type PickedStep } from '../../shared/editor';
import { type Askable } from '../permissions';
import { readJson, writeJson } from '../store';
import { canvasOf, type Profile, type ProfileSource } from '../../shared/profile';
import { desktopZoom, pageBounds, tvZoom } from '../zoom';
import { type DownloadedExtension } from '../extensions';
import { blockingOn } from '../../shared/adblock';
import { parseHistory, type Visit } from '../../shared/history';
import type { Core } from './core';
import { isNotice } from './core';
import type { Download } from './types';

/** What this part adds to the browser for the other parts to use. */
export interface StatePart {
  surface: 'home' | 'page';
  panel: Panel | null;
  pointerOn: boolean;
  /** The question waiting for an answer: protected playback for a site, or whether to use an imported profile. */
  pending:
    | { what: 'permission'; site: string; names: Askable[]; answer: Array<(granted: boolean) => void> }
    | { what: 'profile'; profile: Profile }
    | { what: 'extension'; extension: DownloadedExtension }
    | { what: 'download'; download: Download }
    | { what: 'password'; place: string; user: string; password: string }
    | { what: 'voiceModel' }
    | { what: 'handBack'; ask: HandBack; steamid: string; from: Electron.Session }
    | null;
  /** What the program that started Longboard asked to be handed back, until it is answered. */
  wanted: HandBack | null;
  lookingForAccount: boolean;
  /** The downloads the person agreed to in this run, newest first. */
  downloads: Download[];
  MAX_LISTED: 30;
  lastDownload: number;
  waitingDir: string;
  /** The profile editor, while it is in use: the draft, and what was last pointed at. */
  edit: { site: string; draft: Profile; chain: PickedStep[]; level: number; saving: boolean } | null;
  /** True when the person switched the profile of the site at this address off (the site menu). */
  profileOffAt: (url: string) => boolean;
  profileFor: (url: string) => { profile: Profile; source: ProfileSource } | null;
  /** Where files are saved: the command line's folder, else the one chosen in Settings, else the desktop's. */
  downloadsDir: () => string;
  /** History: the pages opened, newest first (shared/history.ts). */
  historyFile: string;
  visits: Visit[];
  saveHistory: () => void;
  /** The folder the folder chooser is looking in, while it is open. */
  pickAt: string | null;
  /** The action waiting for a button to be pressed for it, on the Settings screen. */
  capturing: string | null;
  pageSite: () => string | null;
  /** Whether requests are filtered for the site at this address (Hard rule 5): the person's choice, else where the switch starts. */
  blockingAt: (url: string) => boolean;
  /** How many requests were refused for the page each view is showing. */
  refused: WeakMap<Electron.WebContents, number>;
  pageLoaded: () => boolean;
  /** Where the page in front is drawn: the whole window, less the edge its profile asks to be kept clear. */
  pageArea: () => { x: number; y: number; width: number; height: number };
  autoZoom: () => number;
  siteZoom: () => number;
}

export function createState(
  core: Core,
): Omit<
  StatePart,
  | 'surface'
  | 'panel'
  | 'pointerOn'
  | 'pending'
  | 'wanted'
  | 'lookingForAccount'
  | 'lastDownload'
  | 'edit'
  | 'visits'
  | 'pickAt'
  | 'capturing'
> {
  core.surface = 'home';
  core.panel = null;
  core.pointerOn = false;
  /** The question waiting for an answer: protected playback for a site, or whether to use an imported profile. */
  core.pending = null;
  /** What the program that started Longboard asked to be handed back, until it is answered. */
  core.wanted = null;
  core.lookingForAccount = false;
  /** The downloads the person agreed to in this run, newest first. */
  const downloads: Download[] = [];
  const MAX_LISTED = 30;
  core.lastDownload = 0;
  // Where files are held until they are whole and agreed to. Anything left from a run that ended badly is thrown away.
  const waitingDir = join(core.dataDir, 'downloads-waiting');
  rmSync(waitingDir, { recursive: true, force: true });

  /** The profile editor, while it is in use: the draft, and what was last pointed at. */
  core.edit = null;

  /** The profile that applies to an address now, without asking about one that still needs an answer. */
  /** True when the person switched the profile of the site at this address off (the site menu). */
  const profileOffAt = (url: string): boolean => core.sites[siteKey(url) ?? '']?.profile === false;
  const profileFor = (url: string): { profile: Profile; source: ProfileSource } | null => {
    if (profileOffAt(url)) return null;
    const choice = core.deps.profiles.choose(url);
    return choice.kind === 'use' ? choice : choice.kind === 'ask' ? choice.fallback : null;
  };

  /** Where files are saved: the command line's folder, else the one chosen in Settings, else the desktop's. */
  const downloadsDir = (): string => core.deps.downloadsFlag ?? core.config.downloads ?? core.deps.downloads;
  /** History: the pages opened, newest first (shared/history.ts). */
  const historyFile = join(core.dataDir, 'history.json');
  core.visits = parseHistory(readJson(historyFile, core.complain('history.json')));
  const saveHistory = (): void => writeJson(historyFile, { visits: core.visits });
  /** The folder the folder chooser is looking in, while it is open. */
  core.pickAt = null;
  /** The action waiting for a button to be pressed for it, on the Settings screen. */
  core.capturing = null;
  const pageSite = (): string | null => siteKey(core.page.getURL());
  /** Whether requests are filtered for the site at this address (Hard rule 5): the person's choice, else where the switch starts. */
  const blockingAt = (url: string): boolean => {
    const key = siteKey(url);
    return blockingOn(
      key,
      key ? core.sites[key]?.adBlocking : undefined,
      core.deps.adBlock.verified(),
      core.deps.adBlock.mode(),
    );
  };
  /** How many requests were refused for the page each view is showing. */
  const refused = new WeakMap<WebContents, number>();
  const pageLoaded = (): boolean => core.page.navigationHistory.getAllEntries().some((e) => !isNotice(e.url));
  /** Where the page in front is drawn: the whole window, less the edge its profile asks to be kept clear. */
  const pageArea = (): { x: number; y: number; width: number; height: number } => {
    const [width = 0, height = 0] = core.win.getContentSize();
    return pageBounds({ width, height }, profileFor(core.page.getURL())?.profile.view?.safeMargin);
  };
  const autoZoom = (): number => {
    const { width, height } = pageArea();
    // A profile may say what size the site should be drawn at.
    const canvas = canvasOf(profileFor(core.page.getURL())?.profile ?? null);
    const usual = tvZoom(
      { width, height },
      core.deps.zoomOverride ?? (core.config.zoom === undefined ? undefined : String(core.config.zoom)),
      canvas ?? undefined,
    );
    // "Desktop site": the person asked for this site at the width of a desk screen.
    return (
      (core.sites[pageSite() ?? '']?.desktop ? desktopZoom({ width, height }, usual) : usual) *
      (core.config.pageSize ?? 1)
    );
  };
  const siteZoom = (): number => {
    const key = pageSite();
    return (key ? core.sites[key]?.zoom : undefined) ?? 1;
  };
  return {
    downloads,
    MAX_LISTED,
    waitingDir,
    profileOffAt,
    profileFor,
    downloadsDir,
    historyFile,
    saveHistory,
    pageSite,
    blockingAt,
    refused,
    pageLoaded,
    pageArea,
    autoZoom,
    siteZoom,
  };
}
