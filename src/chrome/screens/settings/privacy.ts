// The pages of Settings about what sites get and what is kept: ad blocking
// and its list, privacy and site data, what sites may ask for, the parental
// lock, and passwords. The wording here is how Hard rules 5, 10 and 12 are
// told to the person: change it with them in mind.
import { BACKGROUND } from '../../../shared/about';
import { PRODUCT } from '../../../shared/product';
import { el, heading, note, row } from '../../parts';
import { tell } from '../ui';
import { back, backTo, flip, go, once, pick, set, sure, twice, type Settings } from './rows';

/** Ad blocking: how it is set for every site, the way to the list, and the filter list's age. */
export function adsPage(st: Settings): Node[] {
  const words = {
    sites: 'each site has its own switch',
    everywhere: 'on for every site',
    off: 'off for every site',
  } as const;
  const short = { sites: 'Per site', everywhere: 'Everywhere', off: 'Off' } as const;
  const mode = st.adBlocking.mode;
  const off = st.adBlocking.startsOff.filter((e) => e.off).length;
  return [
    heading('Ad blocking', 'block'),
    row('set-ads', 'Ad blocking', pick('ads'), {
      value: short[mode],
      chevron: true,
      say: `Ad blocking: ${words[mode]}`,
    }),
    row('set-ads-list', 'Sites where it starts off', go('adsList'), {
      value: String(off),
      chevron: true,
      say: `Sites where it starts off (${off})`,
    }),
    note(
      `Filter list: EasyList${st.blockTrackers ? ' and EasyPrivacy' : ''}, ${st.adBlocking.listUpdated}. Downloaded from easylist.to every four days.`,
    ),
    once('set-ads-update', 'Download the filter list now', 'updateFilters', 'download'),
    back(),
  ];
}

/** The sites where ad blocking starts off: the reviewed list, with what the person added or took off. */
export function adsListPage(st: Settings): Node[] {
  const add = el('input', { id: 'starts-off-add' });
  add.type = 'text';
  add.placeholder = 'Add a site: example.com';
  add.setAttribute('aria-label', 'Add a site');
  add.setAttribute('enterkeyhint', 'done');
  add.autocapitalize = 'off';
  add.spellcheck = false;
  add.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const text = add.value.trim();
    if (!text) return;
    add.value = '';
    add.blur();
    tell({ kind: 'startsOff', op: 'add', domain: text });
  });
  const items: Node[] = [
    heading('Sites where ad blocking starts off'),
    note(
      `Sites whose advertising is left alone unless you switch blocking on for them. The reviewed list comes with ${PRODUCT.name}; you can add to it and take sites off it. Press a site to change it.`,
    ),
    add,
  ];
  st.adBlocking.startsOff.forEach((entry, i) => {
    const what =
      entry.from === 'you'
        ? 'added by you: press to remove'
        : entry.off
          ? 'reviewed list: press to take off'
          : 'taken off by you: press to put back';
    items.push(
      row(`starts-off-${i}`, entry.domain, () => tell({ kind: 'startsOff', op: 'toggle', domain: entry.domain }), {
        sub: what.charAt(0).toUpperCase() + what.slice(1),
        say: `${entry.domain} (${what})`,
      }),
    );
  });
  if (!st.adBlocking.startsOff.length) items.push(note('The list is empty.'));
  items.push(backTo('Back to ad blocking', 'ads'));
  return items;
}

/** Privacy and site data: what sites are told, what is kept, clearing it, and what is fetched in the background. */
export function privacyPage(st: Settings): Node[] {
  return [
    heading('Privacy and site data', 'shield'),
    el('h2', { text: 'Protection' }),
    flip(
      'set-dnt',
      'Ask sites not to track you or sell your data',
      st.doNotTrack,
      set('doNotTrack', st.doNotTrack ? null : true),
      'Sends the "Do Not Track" and "Global Privacy Control" signals. Each site decides whether to honour them',
    ),
    flip(
      'set-trackers',
      'Refuse known trackers as well as ads',
      st.blockTrackers,
      set('blockTrackers', st.blockTrackers ? null : true),
      "Uses the public EasyPrivacy list, and each site's own ad-blocking switch",
    ),
    flip(
      'set-local-address',
      "Hide this device's home-network address from sites",
      st.hideLocalAddress,
      set('hideLocalAddress', st.hideLocalAddress ? null : true),
    ),
    flip(
      'set-https',
      'Open only pages sent privately (https)',
      st.httpsOnly,
      set('httpsOnly', st.httpsOnly ? null : true),
    ),
    el('h2', { text: 'What is kept' }),
    flip('set-history', 'Keep a history of pages opened', st.history, set('history', st.history ? false : null)),
    flip(
      'set-clear-exit',
      `Clear what sites stored when ${PRODUCT.name} closes`,
      st.clearOnExit,
      set('clearOnExit', st.clearOnExit ? null : true),
    ),
    el('h2', { text: 'Clear' }),
    once('clear-history', `Clear the history (${st.visits})`, 'clearHistory', 'history'),
    once('clear-home', 'Clear the recently opened sites on Home', 'clearHome', 'home'),
    once('clear-cache', 'Clear saved copies of pages and pictures', 'clearCache', 'trash'),
    twice(
      'clear-data',
      'Sign out of every site and clear what sites have stored',
      'Press again to sign out everywhere',
      'clearSiteData',
    ),
    twice(
      'clear-sites',
      `Forget every site's own settings (${st.sitesWithChoices})`,
      "Press again to forget every site's settings",
      'forgetSites',
    ),
    note("A site's own settings are what you allowed it, its size and its ad-blocking switch."),
    twice(
      'clear-all',
      'Clear everything: history, recent sites, and what sites stored',
      'Press again to clear everything',
      'clearAll',
    ),
    el('h2', { text: `What ${PRODUCT.name} fetches by itself` }),
    el('p', { text: BACKGROUND }),
    back(),
  ];
}

/** What sites may ask for: a switch for each kind of permission. Off means no site can even ask. */
export function accessPage(st: Settings): Node[] {
  const items: Node[] = [
    heading('What sites may ask for', 'shield'),
    note(
      'A site has to ask before it gets any of these, and you answer for that site. Switch one off here and no site can even ask.',
    ),
  ];
  for (const kind of st.askable) {
    const never = st.neverAsk.includes(kind.name);
    const next = never ? st.neverAsk.filter((n) => n !== kind.name) : [...st.neverAsk, kind.name];
    items.push(
      flip(`ask-${kind.name}`, `Sites may ask to ${kind.words}`, !never, set('neverAsk', next.length ? next : null)),
    );
  }
  items.push(back());
  return items;
}

/** Parental lock: setting, changing and removing the PIN, and what it does not protect against. */
export function lockPage(st: Settings): Node[] {
  const items: Node[] = [heading('Parental lock', 'lock')];
  if (!st.lock) {
    items.push(
      note(
        'Set a PIN and it is asked for before Settings opens. You can also have it asked for before any site that is not on Home.',
      ),
      row('lock-set', 'Set a PIN', () => tell({ kind: 'lock', op: 'set' }), { icon: 'lock', chevron: true }),
    );
  } else {
    items.push(
      note('A PIN is set: it is asked for before Settings opens.'),
      flip('lock-home-only', 'Only the sites on Home open without the PIN', st.lock.homeOnly, () =>
        tell({ kind: 'lock', op: 'homeOnly' }),
      ),
      note(
        'The sites on Home are your apps and saved pages. With this on, adding to Home or taking off it asks for the PIN too, and the menu has "Unlock every site". A site that sends you elsewhere to sign in needs unlocking for that.',
      ),
      row('lock-change', 'Change the PIN', () => tell({ kind: 'lock', op: 'set' }), {
        icon: 'lock',
        chevron: true,
      }),
      sure('lock-remove', 'Remove the PIN', 'Press again to remove the PIN', () =>
        tell({ kind: 'lock', op: 'remove' }),
      ),
    );
  }
  items.push(
    note(
      `This keeps a child with the remote out. It does not stop someone with a keyboard and the files: deleting lock.json in ${st.dataFolder} removes the lock, which is also what to do if the PIN is forgotten.`,
    ),
    back(),
  );
  return items;
}

/** Passwords: whether keeping them is offered, the ones kept, and the sites it is never offered for. */
export function passwordsPage(st: Settings): Node[] {
  const pw = st.passwords;
  const items: Node[] = [heading('Passwords', 'lock')];
  if (!pw.available) {
    items.push(
      el('p', { cls: 'lead', text: 'Passwords cannot be kept on this system.' }),
      note(
        `${PRODUCT.name} only keeps a password encrypted by the system's keyring (GNOME Keyring, KWallet or the like), and this system has none running. Nothing is saved, and nothing saved before can be read, until there is one.`,
      ),
      back(),
    );
    return items;
  }
  items.push(
    flip(
      'set-passwords',
      'Offer to keep passwords, and to fill them in',
      pw.offer,
      set('passwords', pw.offer ? false : null),
      'After you sign in somewhere, the menu offers to keep the password. Nothing is kept unless you say so',
    ),
    note(
      `Kept on this machine only, in passwords.json in ${st.dataFolder}, each one encrypted by the system's keyring. Never synced or sent anywhere. Not offered in private tabs.`,
    ),
  );
  if (pw.logins.length) items.push(el('h2', { text: 'Kept' }));
  pw.logins.forEach((l, i) =>
    items.push(
      sure(
        `pw-remove-${i}`,
        l.user ? `${l.site}: ${l.user}` : l.site,
        `Press again to forget the password for ${l.site}`,
        () => tell({ kind: 'password', op: 'remove', place: l.place, user: l.user }),
      ),
    ),
  );
  if (!pw.logins.length) items.push(note('None are kept.'));
  if (pw.never.length) items.push(el('h2', { text: 'Never offered for' }));
  pw.never.forEach((site, i) =>
    items.push(
      row(`pw-never-${i}`, site, () => tell({ kind: 'password', op: 'offerAgain', place: site }), {
        value: 'Offer again',
      }),
    ),
  );
  if (pw.logins.length > 1)
    items.push(
      sure('pw-remove-all', 'Forget every password', 'Press again to forget every password', () =>
        tell({ kind: 'password', op: 'removeAll' }),
      ),
    );
  items.push(back());
  return items;
}
