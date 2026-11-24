// Settings, page by page.
import { PRODUCT } from '../../shared/product';
import { type ChromeState, type SettingsAction } from '../../shared/chrome';
import { LANGUAGE_CHOICES, PAGE_SIZES, SEARCH_CHOICES } from '../../shared/settings';
import { BACKGROUND } from '../../shared/about';
import { button, el, heading, icon, note, row, type IconName } from '../parts';
import { tell, type SettingsPage, ui } from './ui';
import { render } from './render';

/**
 * Settings: a first page of headings, and a page for each. Every change is
 * sent to the shell, which checks it, keeps it in config.json and sends the
 * new state back; nothing is decided here.
 */
export function settingsPanel(s: ChromeState): Node[] {
  const st = s.settings;
  if (!st) return [heading('Settings', 'settings')];
  const set = (name: string, value: unknown) => (): void => tell({ kind: 'setting', name, value });
  const go = (page: SettingsPage) => (): void => {
    ui.settingsPage = page;
    ui.confirming = null;
    render();
  };
  const backTo = (text: string, page: SettingsPage): HTMLButtonElement =>
    row('settings-back', text, go(page), { icon: 'back', cls: 'quiet' });
  const back = backTo('Back to Settings', 'main');
  const say = (text: string): HTMLElement => note(text);
  /** A switch. `words` is what it said before it was drawn as one, kept as its accessible name. */
  const flip = (id: string, label: string, on: boolean, press: () => void, sub?: string): HTMLButtonElement =>
    row(id, label, press, { on, ...(sub ? { sub } : {}), say: `${label}: ${on ? 'yes' : 'no'}` });
  /** A row that clears or removes something: the first press asks, the second does it. */
  const sure = (
    id: string,
    text: string,
    again: string,
    press: () => void,
    pic: IconName = 'trash',
  ): HTMLButtonElement =>
    row(
      id,
      ui.confirming === id ? again : text,
      () => {
        if (ui.confirming === id) {
          ui.confirming = null;
          press();
        } else {
          ui.confirming = id;
          render();
        }
      },
      { icon: ui.confirming === id ? 'warn' : pic, cls: 'danger' },
    );
  const twice = (id: string, text: string, again: string, action: SettingsAction): HTMLButtonElement =>
    sure(id, text, again, () => tell({ kind: 'settingsAction', action }));
  const once = (id: string, text: string, action: SettingsAction, pic?: IconName): HTMLButtonElement =>
    row(id, text, () => tell({ kind: 'settingsAction', action }), pic ? { icon: pic } : {});

  /** A list to choose one from: the one in use is marked, and choosing goes back to the page it came from. */
  const choose = (
    title: string,
    name: string,
    options: Array<{ text: string; value: unknown; chosen: boolean; note?: string }>,
  ): Node[] => {
    const items: Node[] = [heading(title)];
    options.forEach((o, i) => {
      const pickIt = (): void => {
        ui.choosing = null;
        tell({ kind: 'setting', name, value: o.value });
      };
      const b = row(`pick-${i}`, o.text, pickIt, {
        ...(o.note ? { sub: o.note } : {}),
        ...(o.chosen ? { cls: 'chosen', say: `${o.text} (in use)` } : {}),
      });
      if (o.chosen) b.append(icon('check'));
      items.push(b);
    });
    items.push(
      row(
        'pick-cancel',
        'Cancel',
        () => {
          ui.choosing = null;
          render();
        },
        { cls: 'quiet' },
      ),
    );
    return items;
  };
  const pick = (what: NonNullable<typeof ui.choosing>) => (): void => {
    ui.choosing = what;
    render();
  };
  if (ui.choosing === 'search') {
    return choose(
      'Search with',
      'search',
      SEARCH_CHOICES.map((c) => ({ text: c.name, value: c.template, chosen: c.template === st.searchTemplate })),
    );
  }
  if (ui.choosing === 'language') {
    return choose(
      'Language sites are asked for',
      'language',
      LANGUAGE_CHOICES.map((l) => ({
        text: l.name === "the system's" ? "The system's language" : l.name,
        value: l.code,
        chosen: l.code === st.language,
      })),
    );
  }
  if (ui.choosing === 'theme') {
    return choose('Look sites are asked for', 'theme', [
      { text: "The system's", value: null, chosen: st.theme === null },
      { text: 'Dark', value: 'dark', chosen: st.theme === 'dark' },
      { text: 'Light', value: 'light', chosen: st.theme === 'light' },
    ]);
  }
  if (ui.choosing === 'ads') {
    const mode = st.adBlocking.mode;
    return choose('Ad blocking', 'adBlocking', [
      {
        text: 'Each site has its own switch',
        value: null,
        chosen: mode === 'sites',
        note: 'It starts off on the sites in the list and on everywhere else. The menu has the switch for the site in front.',
      },
      {
        text: 'On for every site',
        value: 'everywhere',
        chosen: mode === 'everywhere',
        note: 'The list is ignored. A site you switch off yourself from the menu stays off.',
      },
      {
        text: 'Off for every site',
        value: 'off',
        chosen: mode === 'off',
        note: 'Nothing is refused anywhere, and the filter list is not downloaded.',
      },
    ]);
  }

  switch (ui.settingsPage) {
    case 'general': {
      const language = LANGUAGE_CHOICES.find((l) => l.code === st.language)?.name ?? st.language ?? '';
      return [
        heading('Search and starting', 'search'),
        row('set-search', 'Search with', pick('search'), {
          value: st.search,
          chevron: true,
          sub: 'Where words typed into the address field are looked up',
        }),
        row('set-start', 'Open with', set('startWith', st.startWith === 'last' ? 'home' : 'last'), {
          value: st.startWith === 'last' ? 'The last site' : 'Home',
          say: st.startWith === 'last' ? 'Open with: the last site' : 'Open with: Home',
        }),
        row('set-language', 'Language sites are asked for', pick('language'), {
          value: language,
          chevron: true,
          sub: 'Takes effect the next time it starts',
        }),
        ...(st.canSuggest
          ? [
              flip(
                'set-suggest',
                'Suggest searches as you type',
                st.searchSuggestions,
                set('searchSuggestions', st.searchSuggestions ? null : true),
                `Sends the words you type in the address field to ${st.search} as you type them. Addresses are not sent, and nothing is in a private tab`,
              ),
            ]
          : [say('Search suggestions are for the four search sites offered by name.')]),
        say('Another search site can be put in config.json.'),
        back,
      ];
    }
    case 'display': {
      const at = PAGE_SIZES.reduce(
        (best, size, i) => (Math.abs(size - st.pageSize) < Math.abs(PAGE_SIZES[best]! - st.pageSize) ? i : best),
        0,
      );
      const step = (by: number): number => PAGE_SIZES[Math.min(PAGE_SIZES.length - 1, Math.max(0, at + by))]!;
      const look = st.theme === 'dark' ? 'dark' : st.theme === 'light' ? 'light' : "the system's";
      return [
        heading('Size and video', 'text'),
        el('h2', { text: 'Size of every site' }),
        el('div', { cls: 'pair' }, [
          button('set-size-down', 'Smaller', set('pageSize', step(-1)), at === 0),
          button('set-size-reset', `${Math.round(st.pageSize * 100)}%`, set('pageSize', null)),
          button('set-size-up', 'Bigger', set('pageSize', step(1)), at === PAGE_SIZES.length - 1),
        ]),
        say('Each site can also be made bigger or smaller from the menu.'),
        el('h2', { text: 'Look and video' }),
        row('set-theme', 'Look sites are asked for', pick('theme'), {
          value: look,
          chevron: true,
          sub: 'Many sites have a dark look and a light one',
        }),
        flip(
          'set-autoplay',
          'Videos may start by themselves',
          st.autoplay,
          set('autoplay', st.autoplay ? false : null),
          'Takes effect the next time it starts',
        ),
        flip(
          'set-decode',
          'Decode video on the graphics chip',
          st.hardwareDecode,
          set('hardwareDecode', !st.hardwareDecode),
          'Smoother on some boxes, broken on others. Takes effect the next time it starts',
        ),
        back,
      ];
    }
    case 'ads': {
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
        say(
          `Filter list: EasyList${st.blockTrackers ? ' and EasyPrivacy' : ''}, ${st.adBlocking.listUpdated}. Downloaded from easylist.to every four days.`,
        ),
        once('set-ads-update', 'Download the filter list now', 'updateFilters', 'download'),
        back,
      ];
    }
    case 'adsList': {
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
        say(
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
      if (!st.adBlocking.startsOff.length) items.push(say('The list is empty.'));
      items.push(backTo('Back to ad blocking', 'ads'));
      return items;
    }
    case 'privacy':
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
        say("A site's own settings are what you allowed it, its size and its ad-blocking switch."),
        twice(
          'clear-all',
          'Clear everything: history, recent sites, and what sites stored',
          'Press again to clear everything',
          'clearAll',
        ),
        el('h2', { text: `What ${PRODUCT.name} fetches by itself` }),
        el('p', { text: BACKGROUND }),
        back,
      ];
    case 'access': {
      const items: Node[] = [
        heading('What sites may ask for', 'shield'),
        say(
          'A site has to ask before it gets any of these, and you answer for that site. Switch one off here and no site can even ask.',
        ),
      ];
      for (const kind of st.askable) {
        const never = st.neverAsk.includes(kind.name);
        const next = never ? st.neverAsk.filter((n) => n !== kind.name) : [...st.neverAsk, kind.name];
        items.push(
          flip(
            `ask-${kind.name}`,
            `Sites may ask to ${kind.words}`,
            !never,
            set('neverAsk', next.length ? next : null),
          ),
        );
      }
      items.push(back);
      return items;
    }
    case 'profiles': {
      const items: Node[] = [
        heading('Profiles and apps', 'layers'),
        say(`${st.profiles === 1 ? '1 profile' : `${st.profiles} profiles`} on this machine.`),
        flip(
          'set-catalogue',
          'Look for reviewed profiles every day',
          st.catalogue,
          set('catalogue', st.catalogue ? false : null),
        ),
        once('set-catalogue-now', 'Look for reviewed profiles now', 'updateCatalogue', 'update'),
        row('set-import', 'Import profiles from USB', () => tell({ kind: 'menu', action: 'importProfiles' }), {
          icon: 'folder',
        }),
      ];
      if (s.home.apps.length) items.push(el('h2', { text: 'Apps' }));
      s.home.apps.forEach((a, i) =>
        items.push(
          sure(`set-app-${i}`, `Remove the app "${a.name}"`, `Press again to remove "${a.name}"`, () =>
            tell({ kind: 'removeApp', id: a.id }),
          ),
        ),
      );
      items.push(back);
      return items;
    }
    case 'downloads': {
      const f = st.folders;
      if (!f) {
        return [
          heading('Downloads', 'download'),
          say(
            `Files are saved in ${st.downloads}. Each download is asked about first, and nothing downloaded is opened.`,
          ),
          row('set-folder', 'Choose another folder', () => tell({ kind: 'folder', path: st.downloads }), {
            icon: 'folder',
            chevron: true,
          }),
          row('set-folder-usual', "Use the desktop's Downloads folder", set('downloads', null)),
          back,
        ];
      }
      const items: Node[] = [
        heading('Choose a folder', 'folder'),
        say(f.path),
        row('folder-use', 'Save downloads in this folder', set('downloads', f.path), { icon: 'check' }),
      ];
      if (f.up)
        items.push(
          row('folder-up', 'Up to the folder above', () => tell({ kind: 'folder', path: f.up }), { icon: 'back' }),
        );
      f.inside.forEach((name, i) =>
        items.push(
          row(`folder-${i}`, name, () => tell({ kind: 'folder', path: `${f.path === '/' ? '' : f.path}/${name}` }), {
            icon: 'folder',
            chevron: true,
            say: `Open: ${name}`,
          }),
        ),
      );
      if (!f.inside.length) items.push(say('There are no folders in here.'));
      f.places.forEach((place, i) =>
        items.push(
          row(`place-${i}`, place.name, () => tell({ kind: 'folder', path: place.path }), {
            icon: 'folder',
            say: `Go to: ${place.name}`,
          }),
        ),
      );
      items.push(row('folder-cancel', 'Cancel', () => tell({ kind: 'folder', path: null }), { cls: 'quiet' }));
      return items;
    }
    case 'lock': {
      const items: Node[] = [heading('Parental lock', 'lock')];
      if (!st.lock) {
        items.push(
          say(
            'Set a PIN and it is asked for before Settings opens. You can also have it asked for before any site that is not on Home.',
          ),
          row('lock-set', 'Set a PIN', () => tell({ kind: 'lock', op: 'set' }), { icon: 'lock', chevron: true }),
        );
      } else {
        items.push(
          say('A PIN is set: it is asked for before Settings opens.'),
          flip('lock-home-only', 'Only the sites on Home open without the PIN', st.lock.homeOnly, () =>
            tell({ kind: 'lock', op: 'homeOnly' }),
          ),
          say(
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
        say(
          `This keeps a child with the remote out. It does not stop someone with a keyboard and the files: deleting lock.json in ${st.dataFolder} removes the lock, which is also what to do if the PIN is forgotten.`,
        ),
        back,
      );
      return items;
    }
    case 'passwords': {
      const pw = st.passwords;
      const items: Node[] = [heading('Passwords', 'lock')];
      if (!pw.available) {
        items.push(
          el('p', { cls: 'lead', text: 'Passwords cannot be kept on this system.' }),
          say(
            `${PRODUCT.name} only keeps a password encrypted by the system's keyring (GNOME Keyring, KWallet or the like), and this system has none running. Nothing is saved, and nothing saved before can be read, until there is one.`,
          ),
          back,
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
        say(
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
      if (!pw.logins.length) items.push(say('None are kept.'));
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
      items.push(back);
      return items;
    }
    case 'extensions': {
      const items: Node[] = [
        heading('Extensions', 'plug'),
        say(
          'Extensions come from the Chrome Web Store. Open the store, go to an extension\'s page, then choose "Add this extension" on the menu\'s page about the page in front.',
        ),
        row(
          'ext-store',
          'Open the Chrome Web Store',
          () => tell({ kind: 'open', input: 'https://chromewebstore.google.com/category/extensions' }),
          { icon: 'globe', chevron: true },
        ),
      ];
      if (st.extensions.length) items.push(el('h2', { text: 'Installed' }));
      st.extensions.forEach((x, i) => {
        if (x.opens)
          items.push(
            row(`ext-open-${i}`, x.name, () => tell({ kind: 'extension', op: 'open', id: x.id }), {
              icon: 'plug',
              value: x.version,
              chevron: true,
              say: `Open "${x.name}"`,
            }),
          );
        else items.push(say(`"${x.name}" (${x.version}) has no page of its own.`));
        items.push(
          sure(`ext-remove-${i}`, `Remove "${x.name}"`, `Press again to remove "${x.name}"`, () =>
            tell({ kind: 'extension', op: 'remove', id: x.id }),
          ),
        );
      });
      if (!st.extensions.length) items.push(say('None are installed.'));
      items.push(
        flip(
          'ext-updates',
          'Look for newer versions of extensions every day',
          st.extensionUpdates,
          set('extensionUpdates', st.extensionUpdates ? false : null),
        ),
        say(
          `Not every extension works: ${PRODUCT.name} is not Chrome, and some need things it does not have. They are made for a mouse; pointer mode helps. Extensions do not run in private tabs or in apps that keep their own sign-ins.`,
        ),
        back,
      );
      return items;
    }
    case 'updates': {
      const u = st.update;
      const words = {
        install: u.canInstall ? 'installed by themselves' : 'looked for, and you are told',
        tell: 'looked for, and you are told',
        off: 'not looked for',
      } as const;
      const short = {
        install: u.canInstall ? 'Installed for you' : 'You are told',
        tell: 'You are told',
        off: 'Not looked for',
      } as const;
      const next = { install: 'tell', tell: 'off', off: null } as const;
      return [
        heading('New versions', 'update'),
        el('p', { cls: 'lead', text: `This is version ${s.version}. ${u.words}` }),
        row('set-updates', 'New versions are', set('updates', next[u.mode]), {
          value: short[u.mode],
          say: `New versions are: ${words[u.mode]}`,
        }),
        say(
          u.canInstall
            ? `Once a day ${PRODUCT.name} asks GitHub whether there is a newer release. A new one is downloaded, checked against the checksum the release states, and used from the next start.`
            : `Once a day ${PRODUCT.name} asks GitHub whether there is a newer release. This copy was not started from an AppImage it can write to, so it cannot replace itself: it only tells you.`,
        ),
        say('The request names this project and nothing about you or the sites you visit.'),
        once('check-update', 'Look for a new version now', 'checkUpdate', 'update'),
        back,
      ];
    }
    case 'remote': {
      const items: Node[] = [heading('Remote and keyboard buttons', 'remote')];
      if (st.capturing) {
        const words = st.buttons.find((b) => b.action === st.capturing)?.words ?? st.capturing;
        items.push(
          el('p', { cls: 'lead', text: `Press the button to use for "${words}". Back cancels.` }),
          say('The arrows, OK and plain letters and numbers cannot be given another job.'),
        );
        return items;
      }
      items.push(
        say('Give a button on your remote a job. The built-in buttons keep working; About and help lists them.'),
      );
      const speech: Node[] = [
        el('h2', { text: 'Speaking' }),
        say(
          st.voiceModel
            ? 'The speech model is on this machine. What you say is worked out here and never sent anywhere.'
            : 'The speech model has not been fetched. "Speak" on the menu offers to fetch it.',
        ),
      ];
      if (st.voiceModel)
        speech.push(
          sure('voice-remove', 'Remove the speech model', 'Press again to remove the speech model', () =>
            tell({ kind: 'settingsAction', action: 'removeVoiceModel' }),
          ),
        );
      for (const b of st.buttons) {
        items.push(
          row(`button-${b.action}`, b.words, () => tell({ kind: 'captureButton', action: b.action }), {
            value: b.keys.length ? b.keys.join(', ') : 'Add a button',
            say: b.keys.length ? `${b.words}: also ${b.keys.join(', ')}` : `${b.words}: add a button`,
          }),
        );
        if (b.keys.length)
          items.push(
            row(
              `unbutton-${b.action}`,
              `Take the extra buttons away from "${b.words}"`,
              () => tell({ kind: 'clearButtons', action: b.action }),
              { cls: 'quiet', icon: 'close' },
            ),
          );
      }
      items.push(...speech);
      items.push(back);
      return items;
    }
    default:
      return [
        heading('Settings', 'settings'),
        row('settings-general', 'Search and starting', go('general'), {
          icon: 'search',
          chevron: true,
          value: st.search,
        }),
        row('settings-display', 'Size and video', go('display'), {
          icon: 'text',
          chevron: true,
          value: `${Math.round(st.pageSize * 100)}%`,
        }),
        row('settings-ads', 'Ad blocking', go('ads'), { icon: 'block', chevron: true, say: 'Ad blocking' }),
        row('settings-privacy', 'Privacy and site data', go('privacy'), { icon: 'shield', chevron: true }),
        row('settings-passwords', 'Passwords', go('passwords'), {
          icon: 'lock',
          chevron: true,
          value: st.passwords.available ? String(st.passwords.logins.length) : 'No keyring',
        }),
        row('settings-access', 'What sites may ask for', go('access'), { icon: 'globe', chevron: true }),
        row('settings-lock', 'Parental lock', go('lock'), {
          icon: 'shield',
          chevron: true,
          value: st.lock ? 'PIN set' : 'Off',
          say: `Parental lock: ${st.lock ? 'PIN set' : 'no PIN'}`,
        }),
        row('settings-profiles', 'Profiles and apps', go('profiles'), { icon: 'layers', chevron: true }),
        row('settings-downloads', 'Downloads', go('downloads'), { icon: 'download', chevron: true }),
        row('settings-extensions', 'Extensions', go('extensions'), {
          icon: 'plug',
          chevron: true,
          value: String(st.extensions.length),
          say: `Extensions (${st.extensions.length})`,
        }),
        row('settings-remote', 'Remote and keyboard buttons', go('remote'), { icon: 'remote', chevron: true }),
        row('settings-updates', 'New versions', go('updates'), { icon: 'update', chevron: true, value: s.version }),
        row('settings-about', 'About and help', () => tell({ kind: 'menu', action: 'about' }), {
          icon: 'info',
          chevron: true,
        }),
        say(`Settings are kept in config.json in ${st.dataFolder}.`),
        twice(
          'settings-reset',
          'Put every setting back to the usual',
          'Press again to put every setting back',
          'reset',
        ),
        row('settings-close', 'Close', () => tell({ kind: 'menu', action: 'close' }), { cls: 'quiet' }),
      ];
  }
}
