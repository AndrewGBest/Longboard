// The pages of Settings about everyday use: searching and starting, size and
// video, where downloads go, and the remote's buttons.
import { LANGUAGE_CHOICES, PAGE_SIZES } from '../../../shared/settings';
import { button, el, heading, note, row } from '../../parts';
import { tell } from '../ui';
import { back, flip, pick, set, sure, type Settings } from './rows';

/** Search and starting: the search site, what opens first, the language sites are asked for. */
export function generalPage(st: Settings): Node[] {
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
      : [note('Search suggestions are for the four search sites offered by name.')]),
    note('Another search site can be put in config.json.'),
    back(),
  ];
}

/** Size and video: how big every site is drawn, the look sites are asked for, and how video plays. */
export function displayPage(st: Settings): Node[] {
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
    note('Each site can also be made bigger or smaller from the menu.'),
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
    back(),
  ];
}

/** Downloads: where files are saved. While the shell is listing folders, the page is the folder chooser instead. */
export function downloadsPage(st: Settings): Node[] {
  const f = st.folders;
  if (!f) {
    return [
      heading('Downloads', 'download'),
      note(`Files are saved in ${st.downloads}. Each download is asked about first, and nothing downloaded is opened.`),
      row('set-folder', 'Choose another folder', () => tell({ kind: 'folder', path: st.downloads }), {
        icon: 'folder',
        chevron: true,
      }),
      row('set-folder-usual', "Use the desktop's Downloads folder", set('downloads', null)),
      back(),
    ];
  }
  const items: Node[] = [
    heading('Choose a folder', 'folder'),
    note(f.path),
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
  if (!f.inside.length) items.push(note('There are no folders in here.'));
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

/** Remote and keyboard buttons: extra buttons for each job, and the speech model. While a button is being waited for, only that is said. */
export function remotePage(st: Settings): Node[] {
  const items: Node[] = [heading('Remote and keyboard buttons', 'remote')];
  if (st.capturing) {
    const words = st.buttons.find((b) => b.action === st.capturing)?.words ?? st.capturing;
    items.push(
      el('p', { cls: 'lead', text: `Press the button to use for "${words}". Back cancels.` }),
      note('The arrows, OK and plain letters and numbers cannot be given another job.'),
    );
    return items;
  }
  items.push(note('Give a button on your remote a job. The built-in buttons keep working; About and help lists them.'));
  const speech: Node[] = [
    el('h2', { text: 'Speaking' }),
    note(
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
  items.push(back());
  return items;
}
