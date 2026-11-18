// The profile interpreter: turns a validated profile into what the layer
// works from. A profile only ever supplies selectors, names of ordinary keys
// and a few numbers; nothing in it is run (Hard rule 7). With no profile the
// rules are empty and everything is worked out from the page (generic mode).
import { validateProfile, type PlayerKeyName, type Profile, type ProfileGroup } from '../../shared/profile';

export interface SiteRules {
  /** The profile's id, or "none" in generic mode. */
  id: string;
  name: string;
  version: string;
  /** True when no profile applies: the page is all there is to go on. */
  generic: boolean;
  selectors: {
    extraFocusable: string[];
    exclude: string[];
    searchInput: string[];
    /** Controls that reveal the search input when it is hidden. */
    searchOpen: string[];
    /** Carousel arrows: pressed by the layer when left/right runs out, never focus targets themselves. */
    rowPrev: string[];
    rowNext: string[];
    /** Elements the site's player lives in; see findMainVideo. */
    playerRoot: string[];
    playerClose: string[];
    purchaseControls: string[];
    /** Close buttons Back presses first. */
    dismiss: string[];
  };
  /** Where the highlight starts, or null. */
  initial: string | null;
  groups: ProfileGroup[];
  /** The ordinary keys the site's player answers to. */
  playerKeys: { playPause: PlayerKeyName; back: PlayerKeyName; forward: PlayerKeyName };
}

const LISTS = ['extraFocusable', 'exclude', 'searchInput', 'searchOpen', 'rowPrev', 'rowNext', 'playerRoot', 'playerClose', 'purchaseControls', 'dismiss'] as const;

export function genericRules(): SiteRules {
  return {
    id: 'none',
    name: '',
    version: '',
    generic: true,
    selectors: { extraFocusable: [], exclude: [], searchInput: [], searchOpen: [], rowPrev: [], rowNext: [], playerRoot: [], playerClose: [], purchaseControls: [], dismiss: [] },
    initial: null,
    groups: [],
    playerKeys: { playPause: 'Space', back: 'ArrowLeft', forward: 'ArrowRight' },
  };
}

/** True when the browser accepts `sel` as a selector. A profile's selector is only ever used to find elements. */
function usable(sel: string, doc?: Document): boolean {
  if (!doc) return true;
  try {
    // Tried as it will be used: in a list with others. A selector left open
    // at its end can be read alone and still spoil the list.
    doc.querySelector(sel);
    doc.querySelector(`${sel}, a`);
    return true;
  } catch {
    return false;
  }
}

/** The rules a validated profile gives. Selectors this browser cannot parse are dropped, never thrown on. */
export function rulesFrom(profile: Profile, doc?: Document): SiteRules {
  const ok = (list: readonly (string | undefined)[]): string[] => list.filter((s): s is string => typeof s === 'string' && usable(s, doc));
  const rules = genericRules();
  rules.id = profile.id;
  rules.name = profile.name;
  rules.version = profile.version;
  rules.generic = false;
  rules.selectors = {
    extraFocusable: ok([...(profile.focus?.include ?? []), profile.player?.controls]),
    exclude: ok(profile.focus?.exclude ?? []),
    searchInput: ok([profile.text?.search]),
    searchOpen: ok([profile.text?.searchOpen]),
    rowPrev: ok(profile.focus?.scrollPrevious ?? []),
    rowNext: ok(profile.focus?.scrollNext ?? []),
    playerRoot: ok([profile.player?.container]),
    playerClose: ok([profile.player?.close]),
    purchaseControls: ok(profile.guard?.purchase ?? []),
    dismiss: ok(profile.dismiss ?? []),
  };
  const initial = profile.focus?.initial;
  rules.initial = initial && usable(initial, doc) ? initial : null;
  rules.groups = (profile.focus?.groups ?? []).filter((g) => usable(g.selector, doc));
  rules.playerKeys = { ...rules.playerKeys, ...profile.player?.keys };
  return rules;
}

/**
 * Rules from what the shell handed over. The shell has validated it already;
 * it is validated again here because this side trusts nothing it is given.
 * Anything that is not a valid profile gives generic mode.
 */
export function rulesFromUntrusted(raw: unknown, doc?: Document): SiteRules {
  if (raw === null || raw === undefined) return genericRules();
  const { profile } = validateProfile(raw);
  return profile ? rulesFrom(profile, doc) : genericRules();
}

/** How many elements each of the profile's lists matches on this page: a quick sign that the site has changed. */
export function rulesReport(rules: SiteRules, doc: Document): string {
  if (rules.generic) return 'no profile (generic mode)';
  const counts = LISTS.filter((key) => rules.selectors[key].length > 0).map((key) => {
    let n = 0;
    for (const sel of rules.selectors[key]) {
      try {
        n += doc.querySelectorAll(sel).length;
      } catch {
        // counted as no match
      }
    }
    return `${key}=${n}`;
  });
  return `profile ${rules.id} ${rules.version}: ${counts.join(' ') || 'no selectors'}`;
}

export function firstMatch(doc: Document, selectors: readonly string[]): Element | null {
  for (const sel of selectors) {
    try {
      const el = doc.querySelector(sel);
      if (el) return el;
    } catch {
      // A bad selector must never break navigation.
    }
  }
  return null;
}
