// The warning before a site that is on a public list of harmful sites: the
// lists used, how often they are fetched, and the words shown. Longboard has
// no service of its own to ask and may not use Google's (its terms forbid a
// key in open-source code; DECISIONS.md, 2026-11-24), so this is what a small
// browser can do: whole lists, fetched from their publishers, matched on this
// machine. No address the person opens is sent anywhere. Pure, so the rules
// are unit-tested; the shell fetches the lists and asks the question.

/** One list: where it is fetched from, and who to credit for it. */
export interface HarmfulList {
  url: string;
  /** Named in Settings and About: the list, its publisher, its licence. */
  credit: string;
}

/**
 * The lists, each fetched whole from its publisher. They cover different
 * things: addresses seen handing out malware; scam and fake-download sites
 * picked by hand; and sites imitating others to take passwords.
 */
export const HARMFUL_LISTS: readonly HarmfulList[] = [
  {
    url: 'https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-online.txt',
    credit: 'Online Malicious URL Blocklist (malware-filter, from abuse.ch URLhaus; CC0)',
  },
  {
    url: 'https://ublockorigin.github.io/uAssets/filters/badware.txt',
    credit: 'Badware risks (uBlock Origin; GPL-3.0)',
  },
  {
    url: 'https://phishing.army/download/phishing-army-adblock.txt',
    credit: 'Phishing Army blocklist (Andrea Draghetti)',
  },
];

/** How long a fetched copy is used before the lists are fetched again. Their publishers renew them twice a day or more. */
export const HARMFUL_KEPT_MS = 12 * 60 * 60 * 1000;

/** Whether the warning is on: yes, unless the person switched it off in Settings. */
export function warnsOfHarm(config: { harmfulSites?: boolean }): boolean {
  return config.harmfulSites !== false;
}

/**
 * What an "open it anyway" covers: the site's host, for the rest of this
 * run. Null for an address that cannot be read.
 */
export function harmKey(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** The question's words. The lists can be wrong, and one of them lists risks, not certainties: it says "may". */
export const HARMFUL_WORDS = {
  title: 'This site may be harmful',
  lead: (site: string): string =>
    `${site} is on a public list of sites that hand out harmful software, imitate other sites to take passwords, or trick people.`,
  more: 'The lists are made by other people and can be wrong. If you are not sure why you are being sent here, go back.',
  no: 'Go back',
  yes: 'Open it anyway',
} as const;
