// The browser is one object, built from the parts in this folder. Each part's
// file says what it adds; this file puts those together as one type, and
// holds what every part may need: what the shell hands in, and a few constants.
import type { BaseWindow } from 'electron';
import { type HandBack } from '../handback';
import { type UserConfig } from '../../shared/config';
import { type ProfileStore } from '../profiles';
import { type FilterSet } from '../adblock';
import { type UpdateMode } from '../../shared/update';
import { type BlockingMode } from '../../shared/adblock';
import type { ShellPart } from './shell';
import type { StatePart } from './state';
import type { LockPart } from './lock';
import type { TextEntryPart } from './text-entry';
import type { ChromeStatePart } from './chrome-state';
import type { HandBackPart } from './hand-back';
import type { LayoutPart } from './layout';
import type { GoingPlacesPart } from './going-places';
import type { StandstillPart } from './standstill';
import type { PointerModePart } from './pointer-mode';
import type { KeysPart } from './keys';
import type { AwayPart } from './away';
import type { PermissionsPart } from './permissions';
import type { PrivacyPart } from './privacy';
import type { DownloadsPart } from './downloads';
import type { LayerMessagesPart } from './layer-messages';
import type { FramesPart } from './frames';
import type { ProfileEditorPart } from './profile-editor';
import type { IconsPart } from './icons';
import type { AppsPart } from './apps';
import type { MenuPart } from './menu';
import type { ChromeMessagesPart } from './chrome-messages';

/** What main/index.ts hands the browser when it makes it. */
export interface BrowserDeps {
  /** The --dev and --automation options. Automation is a scripted run (Hard rules 10 and 11). */
  options: { dev: boolean; automation: boolean };
  /** The person's settings (config.json). */
  config: UserConfig;
  /** An address given on the command line; Home is shown when there is none. */
  startUrl: string | null;
  /** An app named on the command line with --app=, to open instead. */
  startApp: string | null;
  /** Where typing from a phone listens, when it is not the home-network address. */
  phoneAt?: string | undefined;
  /** A scripted run cannot scan the code on the screen, so it brings its own key. Never set outside one. */
  phoneKey?: string | undefined;
  /** A folder that already has the speech model, so a scripted run fetches nothing. */
  voiceModel?: string | undefined;
  fullscreen: boolean;
  /** The --size=WIDTHxHEIGHT option: the window's size when it is not full screen. */
  size: [number, number] | undefined;
  /** Where downloaded files are saved unless Settings says otherwise: the desktop's Downloads folder. */
  downloads: string;
  /** The --downloads= option, which wins over Settings. */
  downloadsFlag: string | undefined;
  /** The --zoom= option, which wins over everything. */
  zoomOverride: string | undefined;
  /** Resolves when the protected-playback component is ready (or has been given up on). */
  ready: Promise<void>;
  /** The profiles on this machine. */
  profiles: ProfileStore;
  /** Ad blocking: whether it is there at all, the filters (null until downloaded), and the verified sites. */
  adBlock: {
    /** The person's setting over all sites. */
    mode: () => BlockingMode;
    /** The filters, or null until a list has been downloaded. */
    filters: () => FilterSet | null;
    /** The sites where blocking starts off, after the person's own changes. */
    verified: () => readonly string[];
    /** The reviewed list as it came, before those changes. */
    reviewed: () => readonly string[];
    /** When the filters were last downloaded, or null when they never were. */
    fetchedAt: () => number | null;
    /** Downloads the list now. */
    refresh: () => Promise<boolean>;
  };
  /** The Settings screen's way to config.json. `set` is false when the value is not one the setting can take. */
  settings: {
    set: (name: string, value: unknown) => boolean;
    reset: () => void;
    refreshCatalogue: () => Promise<boolean>;
    /** New versions: where things stand in words, the setting, and whether this copy can replace itself. */
    update: () => { words: string; mode: UpdateMode; canInstall: boolean };
    lookForUpdate: () => Promise<unknown>;
  };
}

/** Where Longboard's own screens live. Answered only in their own view's session (shell.ts). */
export const SCREENS_URL = 'longboard://screens/chrome.html';
/** Share of the window's width the menu panel takes over a website. */
export const PANEL_WIDTH = 0.38;
/** How long after a page is left it is frozen: time for the site's own pause key to be dealt with. */
export const FREEZE_DELAY_MS = 600;
/** How long a question has to have been on screen before "yes" is accepted. */
export const PROMPT_SETTLE_MS = 600;
/** How long a Home tile's icon is used before it is fetched from the site again. */
export const ICON_KEPT_MS = 7 * 24 * 60 * 60 * 1000;
/** How long a site is given to send its icon. */
export const ICON_WAIT_MS = 8000;
/** True for one of Longboard's own notice pages (they are data: addresses) and for a view with no page yet. */
export const isNotice = (url: string): boolean => url.startsWith('data:') || url === 'about:blank' || url === '';

/** What the rest of the shell can ask of the window once it is up. */
export interface Browser {
  win: BaseWindow;
  /** Opens an app by its id; false when there is none. */
  openApp: (id: string) => boolean;
  /** Opens an address as if the person had asked for it: it is put on Home. */
  openAddress: (url: string) => void;
  /** Opens the sign-in page for something another program asked to be handed back (main/handback.ts). */
  handBack: (ask: HandBack) => void;
  /** Clears what every site has stored, for "clear when Longboard closes". */
  clearSiteData: () => Promise<void>;
}

/** Everything the parts share. It is filled in part by part, in the order createBrowser lists them. */
export type Core = { deps: BrowserDeps } & ShellPart &
  StatePart &
  LockPart &
  TextEntryPart &
  ChromeStatePart &
  HandBackPart &
  LayoutPart &
  GoingPlacesPart &
  StandstillPart &
  PointerModePart &
  KeysPart &
  AwayPart &
  PermissionsPart &
  PrivacyPart &
  DownloadsPart &
  LayerMessagesPart &
  FramesPart &
  ProfileEditorPart &
  IconsPart &
  AppsPart &
  MenuPart &
  ChromeMessagesPart;
