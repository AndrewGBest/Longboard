// Handing something back to the program that started Longboard.
//
// Another program on this machine (the Bilby app store is the first) cannot
// show a website's sign-in page on a TV, and Longboard can. So such a program
// may start Longboard asking for one named thing and a file to put it in.
// Longboard opens the site's own sign-in page; when the person has signed
// in, it asks them whether to share that one thing, and only on a yes does
// it fetch it and write it to the file.
//
// What can be asked for is the short list here, by name. A program cannot
// name an address, a page or a cookie: only one of these, and what each one
// yields is decided in this file. Pure, so it is unit-tested; the shell does
// the asking, the fetching and the writing.

import { isAbsolute } from 'node:path';

/** What may be asked for, and the words the question uses for it. */
export const HAND_BACKS = {
  'steam-library': { site: 'Steam', wants: 'the list of games and tools you own on Steam' },
} as const;
export type HandBackName = keyof typeof HAND_BACKS;

/** The three addresses a hand-back uses: where signing in starts, the page that says who is signed in, and the list. */
export interface Addresses {
  signIn: string;
  home: string;
  owned: string;
}

export interface HandBack {
  what: HandBackName;
  /** The file the answer is written to. */
  to: string;
  /** The site's addresses: Steam's own, except in a scripted run pointed at a stand-in on this machine. */
  at: Addresses;
}

/** Steam's own addresses: where signing in starts, the page that says who is signed in, and the list of what they own. */
export const STEAM: Addresses = {
  signIn: 'https://store.steampowered.com/login/?redir=&redir_ssl=1',
  home: 'https://store.steampowered.com/',
  owned: 'https://store.steampowered.com/dynamicstore/userdata/',
};

/**
 * The same three addresses on a stand-in for the site, for a scripted run:
 * only ever on this machine's own address, so the option cannot point the
 * question at another website. Null for anything else.
 */
export function standInAt(base: string | undefined): Addresses | null {
  if (!base || !/^http:\/\/127\.0\.0\.1:\d{2,5}(\/[A-Za-z0-9_-]+)*$/.test(base)) return null;
  return { signIn: `${base}/login/`, home: `${base}/`, owned: `${base}/dynamicstore/userdata/` };
}

/**
 * The request on a command line: `--hand-back=<name> --hand-back-to=<file>`.
 * Null unless the name is one known here and the file is a whole path to a
 * .json file, so nothing can be asked for by a name Longboard does not know.
 */
export function handBackFrom(args: readonly string[], automation = false): HandBack | null {
  const what = args.find((a) => a.startsWith('--hand-back='))?.slice('--hand-back='.length);
  const to = args.find((a) => a.startsWith('--hand-back-to='))?.slice('--hand-back-to='.length);
  if (!what || !to || !Object.hasOwn(HAND_BACKS, what)) return null;
  if (!isAbsolute(to) || !to.endsWith('.json') || to.includes('\0')) return null;
  // `--hand-back-site=` counts only in a scripted run, like the other options that point one at a stand-in.
  const standIn = automation ? standInAt(args.find((a) => a.startsWith('--hand-back-site='))?.slice('--hand-back-site='.length)) : null;
  return { what: what as HandBackName, to, at: standIn ?? STEAM };
}

/** Whether this address is one of Steam's store pages past its sign-in page: the moment to look at who is signed in. */
export function steamStorePage(url: string, at: Addresses = STEAM): boolean {
  try {
    const u = new URL(url);
    const home = new URL(at.home);
    return u.origin === home.origin && u.pathname.startsWith(home.pathname) && !u.pathname.startsWith(`${home.pathname}login`);
  } catch {
    return false;
  }
}

const unescapeAttribute = (text: string): string =>
  text.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * The number of the account signed in, read from the store's front page as
 * Steam served it, or null when nobody is. [verified 2026-11-21 against the
 * live page, signed out: the page carries
 * `<div id="application_config" data-userinfo="{&quot;logged_in&quot;:false,...}">`.
 * The signed-in form (`logged_in: true` with `steamid`) is from the Playnite
 * project's Steam plugin, which reads the same attribute; not seen here.]
 */
export function steamAccount(html: string): string | null {
  const tag = /<div\s[^>]*id="application_config"[^>]*>/.exec(html)?.[0];
  const raw = tag ? /\sdata-userinfo="([^"]*)"/.exec(tag)?.[1] : undefined;
  if (raw === undefined) return null;
  try {
    const info = JSON.parse(unescapeAttribute(raw)) as { logged_in?: unknown; steamid?: unknown };
    const id = typeof info.steamid === 'string' || typeof info.steamid === 'number' ? String(info.steamid) : '';
    return info.logged_in === true && /^\d{5,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * The line written for a yes: the account's number and the ids of what it
 * owns, and nothing else of what Steam said. Null when Steam's answer is not
 * a list of ids. [verified 2026-11-21, signed out: the address answers
 * `{"rgOwnedApps":[],...}`.]
 */
export function steamAnswer(steamid: string, userdata: unknown): string | null {
  if (!/^\d{5,20}$/.test(steamid) || typeof userdata !== 'object' || userdata === null) return null;
  const apps = (userdata as { rgOwnedApps?: unknown }).rgOwnedApps;
  if (!Array.isArray(apps)) return null;
  const owned = apps.filter((id): id is number => Number.isInteger(id) && id >= 0 && id <= 0xffffffff);
  return JSON.stringify({ steamid, owned });
}

/** The line written for a no. */
export const DECLINED = JSON.stringify({ declined: true });
