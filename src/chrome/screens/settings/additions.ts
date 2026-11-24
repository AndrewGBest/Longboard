// The pages of Settings about what is added to Longboard and how it is kept
// current: profiles and apps, extensions, and new versions.
import { type ChromeState } from '../../../shared/chrome';
import { PRODUCT } from '../../../shared/product';
import { el, heading, note, row } from '../../parts';
import { tell } from '../ui';
import { back, flip, once, set, sure, type Settings } from './rows';

/** Profiles and apps: looking for reviewed profiles, importing them, and removing apps. */
export function profilesPage(st: Settings, s: ChromeState): Node[] {
  const items: Node[] = [
    heading('Profiles and apps', 'layers'),
    note(`${st.profiles === 1 ? '1 profile' : `${st.profiles} profiles`} on this machine.`),
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
  items.push(back());
  return items;
}

/** Extensions: the way to the store, the ones installed, and whether newer versions are looked for. */
export function extensionsPage(st: Settings): Node[] {
  const items: Node[] = [
    heading('Extensions', 'plug'),
    note(
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
    else items.push(note(`"${x.name}" (${x.version}) has no page of its own.`));
    items.push(
      sure(`ext-remove-${i}`, `Remove "${x.name}"`, `Press again to remove "${x.name}"`, () =>
        tell({ kind: 'extension', op: 'remove', id: x.id }),
      ),
    );
  });
  if (!st.extensions.length) items.push(note('None are installed.'));
  items.push(
    flip(
      'ext-updates',
      'Look for newer versions of extensions every day',
      st.extensionUpdates,
      set('extensionUpdates', st.extensionUpdates ? false : null),
    ),
    note(
      `Not every extension works: ${PRODUCT.name} is not Chrome, and some need things it does not have. They are made for a mouse; pointer mode helps. Extensions do not run in private tabs or in apps that keep their own sign-ins.`,
    ),
    back(),
  );
  return items;
}

/** New versions: the version running, and whether newer ones are installed, announced or not looked for. */
export function updatesPage(st: Settings, s: ChromeState): Node[] {
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
    note(
      u.canInstall
        ? `Once a day ${PRODUCT.name} asks GitHub whether there is a newer release. A new one is downloaded, checked against the checksum the release states, and used from the next start.`
        : `Once a day ${PRODUCT.name} asks GitHub whether there is a newer release. This copy was not started from an AppImage it can write to, so it cannot replace itself: it only tells you.`,
    ),
    note('The request names this project and nothing about you or the sites you visit.'),
    once('check-update', 'Look for a new version now', 'checkUpdate', 'update'),
    back(),
  ];
}
