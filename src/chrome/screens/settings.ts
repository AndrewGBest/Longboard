// Settings: which page to draw, the first page of headings, and the lists to
// choose one thing from. The other pages are in ./settings/, grouped by
// subject, built from the rows in ./settings/rows.
import { type ChromeState } from '../../shared/chrome';
import { LANGUAGE_CHOICES, SEARCH_CHOICES } from '../../shared/settings';
import { heading, icon, note, row } from '../parts';
import { render } from './render';
import { extensionsPage, profilesPage, updatesPage } from './settings/additions';
import { displayPage, downloadsPage, generalPage, remotePage } from './settings/everyday';
import { accessPage, adsListPage, adsPage, lockPage, passwordsPage, privacyPage } from './settings/privacy';
import { go, twice, type Settings } from './settings/rows';
import { tell, ui } from './ui';

/** A list to choose one from: the one in use is marked, and choosing goes back to the page it came from. */
function choose(
  title: string,
  name: string,
  options: Array<{ text: string; value: unknown; chosen: boolean; note?: string }>,
): Node[] {
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
}

/** The list that `ui.choosing` names, with what is in use now marked. */
function choiceList(what: NonNullable<typeof ui.choosing>, st: Settings): Node[] {
  if (what === 'search') {
    return choose(
      'Search with',
      'search',
      SEARCH_CHOICES.map((c) => ({ text: c.name, value: c.template, chosen: c.template === st.searchTemplate })),
    );
  }
  if (what === 'language') {
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
  if (what === 'theme') {
    return choose('Look sites are asked for', 'theme', [
      { text: "The system's", value: null, chosen: st.theme === null },
      { text: 'Dark', value: 'dark', chosen: st.theme === 'dark' },
      { text: 'Light', value: 'light', chosen: st.theme === 'light' },
    ]);
  }
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

/** The first page: a row for each of the others, with what is set now where one value says it. */
function firstPage(st: Settings, s: ChromeState): Node[] {
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
    note(`Settings are kept in config.json in ${st.dataFolder}.`),
    twice('settings-reset', 'Put every setting back to the usual', 'Press again to put every setting back', 'reset'),
    row('settings-close', 'Close', () => tell({ kind: 'menu', action: 'close' }), { cls: 'quiet' }),
  ];
}

/**
 * Settings: a first page of headings, and a page for each. Every change is
 * sent to the shell, which checks it, keeps it in config.json and sends the
 * new state back; nothing is decided here.
 */
export function settingsPanel(s: ChromeState): Node[] {
  const st = s.settings;
  if (!st) return [heading('Settings', 'settings')];
  if (ui.choosing) return choiceList(ui.choosing, st);
  switch (ui.settingsPage) {
    case 'general':
      return generalPage(st);
    case 'display':
      return displayPage(st);
    case 'ads':
      return adsPage(st);
    case 'adsList':
      return adsListPage(st);
    case 'privacy':
      return privacyPage(st);
    case 'access':
      return accessPage(st);
    case 'profiles':
      return profilesPage(st, s);
    case 'downloads':
      return downloadsPage(st);
    case 'lock':
      return lockPage(st);
    case 'passwords':
      return passwordsPage(st);
    case 'extensions':
      return extensionsPage(st);
    case 'updates':
      return updatesPage(st, s);
    case 'remote':
      return remotePage(st);
    default:
      return firstPage(st, s);
  }
}
