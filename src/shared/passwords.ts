// Saved sign-ins: the rules, with no secrets in sight. Pure, so they are
// unit-tested. What is kept is a user name and a password already encrypted
// by the system's keyring (main/passwords.ts); nothing here ever sees a
// password in the clear except to check its shape (Hard rule 10).

/** One saved sign-in. `secret` is the password, encrypted, as base64. */
export interface Login {
  user: string;
  secret: string;
  /** When it was saved, milliseconds since 1970. */
  at: number;
}

export interface Vault {
  /** By the address of the site's sign-in page: scheme, name and port, nothing after. */
  sites: Record<string, Login[]>;
  /** Sites the person said never to offer for. */
  never: string[];
}

export const MAX_LOGIN_SITES = 300;
export const MAX_LOGINS_PER_SITE = 6;
const MAX_USER = 200;
const MAX_PASSWORD = 500;

export const emptyVault = (): Vault => ({ sites: {}, never: [] });

/**
 * Where a sign-in belongs: "https://name" (with the port when it is not the
 * usual one). Only pages sent privately have one; so does this machine
 * itself, for trying things out. A password is offered back only at exactly
 * the place it was saved, never at another name that merely ends the same.
 */
export function loginPlace(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
  if (u.username || u.password) return null;
  return u.origin;
}

const cleanUser = (text: unknown): string | null => {
  if (typeof text !== 'string') return null;
  const user = text.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return user.length <= MAX_USER ? user : null;
};

/** What a page said was typed into its sign-in form, checked for shape. Null when it is not usable. */
export function cleanCredentials(raw: unknown): { user: string; password: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const user = cleanUser(r['user']);
  const password = r['password'];
  if (user === null || typeof password !== 'string') return null;
  if (password.length < 1 || password.length > MAX_PASSWORD || /[\u0000-\u001f\u007f]/.test(password)) return null;
  return { user, password };
}

/** Validates passwords.json. Anything unusable is dropped, never thrown on. */
export function parseVault(raw: unknown): Vault {
  const out = emptyVault();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  const sites = r['sites'];
  if (sites && typeof sites === 'object' && !Array.isArray(sites)) {
    for (const [place, list] of Object.entries(sites as Record<string, unknown>)) {
      if (loginPlace(place) !== place || !Array.isArray(list)) continue;
      const logins: Login[] = [];
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const l = item as Record<string, unknown>;
        const user = cleanUser(l['user']);
        if (user === null || typeof l['secret'] !== 'string' || !/^[A-Za-z0-9+/=]{1,4000}$/.test(l['secret'])) continue;
        if (logins.some((x) => x.user === user)) continue;
        logins.push({
          user,
          secret: l['secret'],
          at: typeof l['at'] === 'number' && Number.isFinite(l['at']) ? l['at'] : 0,
        });
        if (logins.length >= MAX_LOGINS_PER_SITE) break;
      }
      if (logins.length) out.sites[place] = logins;
      if (Object.keys(out.sites).length >= MAX_LOGIN_SITES) break;
    }
  }
  if (Array.isArray(r['never'])) {
    for (const place of r['never']) {
      if (
        typeof place === 'string' &&
        loginPlace(place) === place &&
        !out.never.includes(place) &&
        out.never.length < MAX_LOGIN_SITES
      )
        out.never.push(place);
    }
  }
  return out;
}

/** The vault with a sign-in saved: one per user name at a place, the newest first. Null when there is no room for another site. */
export function addLogin(vault: Vault, place: string, user: string, secret: string, now: number): Vault | null {
  if (loginPlace(place) !== place) return null;
  const old = vault.sites[place] ?? [];
  if (!vault.sites[place] && Object.keys(vault.sites).length >= MAX_LOGIN_SITES) return null;
  const list = [{ user, secret, at: now }, ...old.filter((l) => l.user !== user)].slice(0, MAX_LOGINS_PER_SITE);
  return { sites: { ...vault.sites, [place]: list }, never: vault.never.filter((n) => n !== place) };
}

export function removeLogin(vault: Vault, place: string, user: string): Vault {
  const list = (vault.sites[place] ?? []).filter((l) => l.user !== user);
  const sites = { ...vault.sites };
  if (list.length) sites[place] = list;
  else delete sites[place];
  return { sites, never: vault.never };
}

export function setNever(vault: Vault, place: string, never: boolean): Vault {
  if (loginPlace(place) !== place) return vault;
  const rest = vault.never.filter((n) => n !== place);
  return { sites: vault.sites, never: never ? [...rest, place].slice(-MAX_LOGIN_SITES) : rest };
}

/** The user names saved for a place, newest first. */
export const usersAt = (vault: Vault, place: string | null): string[] =>
  place ? (vault.sites[place] ?? []).map((l) => l.user) : [];

/**
 * Whether to offer to keep what was just typed into a sign-in form. Never in
 * a scripted run (Hard rule 10), never in a private tab, never where the
 * person said never, and not when it is already kept as it is.
 */
export function shouldOffer(q: {
  automation: boolean;
  privateTab: boolean;
  enabled: boolean;
  available: boolean;
  place: string | null;
  never: readonly string[];
  alreadyKept: boolean;
}): boolean {
  if (q.automation || q.privateTab || !q.enabled || !q.available || !q.place) return false;
  return !q.never.includes(q.place) && !q.alreadyKept;
}

/** The every-saved-sign-in list for Settings: by site name, then user. No secrets. */
export function listLogins(vault: Vault): Array<{ place: string; site: string; user: string }> {
  const out: Array<{ place: string; site: string; user: string }> = [];
  for (const place of Object.keys(vault.sites).sort()) {
    const site = place.replace(/^https?:\/\//, '');
    for (const l of vault.sites[place] ?? []) out.push({ place, site, user: l.user });
  }
  return out;
}
