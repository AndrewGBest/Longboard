// Longboard's own screens: Home, the menu panel, About, and questions. This
// is the preload of the chrome view, which only ever shows chrome.html. It
// draws everything from the isolated world and talks to the shell directly;
// the page itself has no script and no API (Hard rule 13).
//
// The highlight here is moved by the same layer that drives websites, so
// Longboard's own interface is the first user of its navigation engine.
import { ipcRenderer } from 'electron';
import { PRODUCT } from '../shared/product';
import type { BootData, BridgeMessage } from '../shared/actions';
import type { ChromeMessage, ChromeState, EditAction, MenuAction, SettingsAction } from '../shared/chrome';
import { LANGUAGE_CHOICES, PAGE_SIZES, SEARCH_CHOICES } from '../shared/settings';
import { aboutTitle, BACKGROUND, HELP, NOTICE } from '../shared/about';
import { siteName } from '../shared/address';
import { genericRules } from '../layer/profile/rules';
import { startLayer, type Layer } from '../layer/index';

const boot = ipcRenderer.sendSync('longboard:boot') as BootData & { state?: ChromeState };
const send = (msg: BridgeMessage): void => ipcRenderer.send('longboard:msg', msg);
const tell = (msg: ChromeMessage): void => ipcRenderer.send('longboard:chrome', msg);

let state: ChromeState | undefined = boot.state;
let layer: Layer | undefined;
/** True while the address field stands in for the "go to" button. */
let typing = false;
/** What the person has chosen so far on the "add as an app" panel. */
let draft = { name: '', ownSession: false, launcher: true };
/** The menu's own second page, about the site in front. */
let menuPage: 'main' | 'site' = 'main';
/** A list to choose one thing from, opened from a Settings page. */
let choosing: 'search' | 'language' | 'ads' | 'theme' | null = null;
/** Which page of Settings is showing. */
type SettingsPage = 'main' | 'general' | 'display' | 'ads' | 'adsList' | 'privacy' | 'access' | 'profiles' | 'downloads' | 'remote' | 'lock' | 'updates';
let settingsPage: SettingsPage = 'main';
/** A button that clears something has been pressed once and waits for the second press. */
let confirming: string | null = null;
/** The Home tile the highlight was on when the menu was opened from Home; the menu offers to remove it. */
let menuFor: { kind: 'recent'; url: string; name: string } | { kind: 'saved'; url: string; name: string } | { kind: 'app'; id: string; name: string } | null = null;

/** The tile with the highlight on Home, from what is drawn now. */
function focusedTile(s: ChromeState): typeof menuFor {
  const id = document.querySelector('[data-longboard-focus]')?.id ?? '';
  const m = /^(tile|app|saved)-(\d+)$/.exec(id);
  if (!m) return null;
  if (m[1] === 'saved') {
    const p = s.home.saved[Number(m[2])];
    return p ? { kind: 'saved', url: p.url, name: p.title || siteName(p.url) } : null;
  }
  if (m[1] === 'tile') {
    const r = s.home.recents[Number(m[2])];
    return r ? { kind: 'recent', url: r.url, name: siteName(r.url) } : null;
  }
  const a = s.home.apps[Number(m[2])];
  return a ? { kind: 'app', id: a.id, name: a.name } : null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: { id?: string; cls?: string; text?: string } = {}, children: Node[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.id) node.id = props.id;
  if (props.cls) node.className = props.cls;
  if (props.text !== undefined) node.textContent = props.text;
  node.append(...children);
  return node;
}

function button(id: string, text: string, onPress: () => void, disabled = false): HTMLButtonElement {
  const b = el('button', { id, text });
  b.type = 'button';
  b.disabled = disabled;
  b.addEventListener('click', onPress);
  return b;
}

/** A field for an address or search words; Enter opens what was typed. */
function addressField(id: string): HTMLInputElement {
  const input = el('input', { id });
  input.type = 'text';
  input.placeholder = 'Go to address or search';
  input.setAttribute('aria-label', 'Go to address or search');
  input.setAttribute('enterkeyhint', 'go');
  input.autocapitalize = 'off';
  input.spellcheck = false;
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    typing = false;
    input.blur();
    tell({ kind: 'open', input: text });
  });
  // Places the person already knows that match what has been typed so far, offered under the field.
  input.addEventListener('input', () => tell({ kind: 'suggest', text: input.value }));
  return input;
}

/** The site's own icon, as the site served it; the first letter of its name when it gave none. */
function badge(icon: string | null, name: string): HTMLElement {
  if (!icon) return el('span', { cls: 'mono', text: name.slice(0, 1) || '?' });
  const img = el('img', { cls: 'mono icon' });
  img.src = icon;
  img.alt = '';
  return img;
}

/** The suggestions for what is typed in an address field: a few buttons under it, replaced as the typing goes on. */
function showSuggestions(list: Array<{ url: string; text: string }>): void {
  const field = document.getElementById('address') ?? document.getElementById('menu-address');
  if (!field) return;
  let box = document.getElementById('suggestions');
  if (!box) {
    box = el('div', { id: 'suggestions' });
    field.after(box);
  }
  box.replaceChildren(
    ...list.map((sug, i) =>
      button(`suggest-${i}`, sug.text, () => {
        typing = false;
        tell({ kind: 'openSuggestion', url: sug.url });
      }),
    ),
  );
}

function home(s: ChromeState): HTMLElement {
  const go = typing
    ? addressField('address')
    : button('go', 'Go to address or search', () => {
        typing = true;
        render();
        const field = document.getElementById('address');
        if (field) layer?.typeIn(field);
      });
  if (typing) {
    // Leaving the field without opening anything puts the button back.
    go.addEventListener('blur', () => {
      // With suggestions showing, the highlight may be on its way to one of them: the field stays.
      if (!typing || document.getElementById('suggestions')?.childElementCount) return;
      typing = false;
      render();
      const again = document.getElementById('go');
      if (again) layer?.focus(again);
    });
  }
  const tiles = s.home.recents.map((r, i) => {
    const site = siteName(r.url);
    const tile = button(`tile-${i}`, '', () => tell({ kind: 'openRecent', url: r.url }));
    tile.className = 'tile';
    const mark = r.profile === 'own' ? 'Your profile' : r.profile === 'reviewed' ? 'Reviewed profile' : '';
    tile.append(
      badge(r.icon, site),
      el('span', { cls: 'site', text: site }),
      el('span', { cls: 'title', text: r.title }),
      el('span', { cls: 'mark', text: mark }),
    );
    return tile;
  });
  const apps = s.home.apps.map((a, i) => {
    const tile = button(`app-${i}`, '', () => tell({ kind: 'openApp', id: a.id }));
    tile.className = 'tile';
    tile.append(badge(a.icon, a.name), el('span', { cls: 'site', text: a.name }), el('span', { cls: 'title', text: a.site }), el('span', { cls: 'mark', text: a.ownSession ? 'Own sign-ins' : '' }));
    return tile;
  });
  const savedTiles = s.home.saved.map((p, i) => {
    const site = siteName(p.url);
    const tile = button(`saved-${i}`, '', () => tell({ kind: 'openSaved', url: p.url }));
    tile.className = 'tile';
    tile.append(badge(p.icon, site), el('span', { cls: 'site', text: p.title || site }), el('span', { cls: 'title', text: site }), el('span', { cls: 'mark', text: '' }));
    return tile;
  });
  const main = el('main', { id: 'home' }, [el('h1', { text: s.home.privateTab ? `${PRODUCT.name}: private tab` : PRODUCT.name }), go]);
  if (s.home.privateTab) main.append(el('p', { id: 'private', text: 'Nothing opened in this tab is kept: no history, no recent sites, and what its sites store goes when the tab is closed.' }));
  if (savedTiles.length) main.append(el('h2', { text: 'Saved pages' }), el('div', { id: 'saved', cls: 'tiles' }, savedTiles));
  if (apps.length) main.append(el('h2', { text: 'Apps' }), el('div', { id: 'apps', cls: 'tiles' }, apps));
  if (tiles.length) main.append(el('h2', { text: 'Recently opened' }), el('div', { id: 'tiles', cls: 'tiles' }, tiles));
  else if (!apps.length && !savedTiles.length) main.append(el('p', { id: 'empty', text: 'Sites you open will appear here.' }));
  main.append(el('p', { id: 'hint', text: 'Menu key, Ctrl+O or Start: menu.   F2 or right stick click: pointer.   Ctrl+Q: quit.' }));
  return main;
}

function menuPanel(s: ChromeState): Node[] {
  const act = (action: MenuAction) => (): void => tell({ kind: 'menu', action });
  const page = s.page;
  const onPage = s.surface === 'page';
  // The things about the site in front that are wanted now and then have a page of their own, to keep the menu short.
  if (menuPage === 'site' && page && onPage) {
    const items: Node[] = [
      el('h1', { text: 'This site' }),
      el('p', { cls: 'where', text: page.title ? `${page.title} (${page.site})` : page.site }),
      page.saved ? button('menu-unsave', 'Take this page off Home', act('unsavePage')) : button('menu-save', 'Keep this page on Home', act('savePage')),
      button('menu-find', 'Find words on this page', act('find')),
      button('menu-reader', 'Reader view: only the words of this page, big', act('reader')),
      button('menu-desktop', `Desktop site: ${page.desktop ? 'on' : 'off'}`, act('desktop')),
      el('p', { cls: 'where', text: 'On, the site gets the width of a desk screen and lays itself out in full, with smaller text. Sites are already told this is a desk browser; only the room they get changes.' }),
      page.app ? button('menu-remove-app', `Remove the app "${page.app.name}"`, act('removeApp')) : button('menu-add-app', 'Add this site as an app', act('addApp')),
      el('p', { cls: 'where', text: page.profile ? `Profile: ${page.profile}` : 'No profile for this site: generic mode' }),
      button('menu-edit', page.profile ? 'Edit the profile for this site' : 'Make a profile for this site', act('editProfile')),
    ];
    if (page.profile) items.push(button('menu-export', 'Export this profile', act('exportProfile')));
    items.push(button('menu-outline', 'Save page outline', act('outline')));
    if (page.answers) items.push(el('p', { cls: 'where', text: page.answers }), button('menu-forget', 'Forget what this site may do', act('forgetAnswers')));
    items.push(
      button('menu-site-back', 'Back to the menu', () => {
        menuPage = 'main';
        render();
      }),
    );
    return items;
  }
  const items: Node[] = [el('h1', { text: 'Menu' })];
  if (page && onPage) items.push(el('p', { cls: 'where', text: page.title ? `${page.title} (${page.site})` : page.site }));
  if (page && onPage && !page.secure) items.push(el('p', { id: 'not-secure', cls: 'where warn', text: 'Not secure: this page is sent over plain http, where anyone on the way can read or change it.' }));
  items.push(addressField('menu-address'));
  if (onPage) items.push(button('menu-home', 'Home', act('home')));
  else if (page) items.push(button('menu-resume', `Back to ${page.site}`, act('resume')));
  if (!onPage && menuFor) {
    const tile = menuFor;
    items.push(
      tile.kind === 'recent'
        ? button('menu-remove-tile', `Remove ${tile.name} from Home`, () => tell({ kind: 'removeRecent', url: tile.url }))
        : tile.kind === 'saved'
          ? button('menu-remove-tile', `Take "${tile.name}" off Home`, () => tell({ kind: 'removeSaved', url: tile.url }))
          : button('menu-remove-tile', `Remove the app "${tile.name}"`, () => tell({ kind: 'removeApp', id: tile.id })),
    );
  }
  if (page && onPage) {
    items.push(
      el('div', { cls: 'pair' }, [button('menu-back', 'Back', act('back'), !page.canGoBack), button('menu-reload', 'Reload', act('reload'))]),
      el('div', { cls: 'pair' }, [
        button('menu-zoom-out', 'Smaller', act('zoomOut')),
        button('menu-zoom-reset', `${page.zoomPercent}%`, act('zoomReset')),
        button('menu-zoom-in', 'Bigger', act('zoomIn')),
      ]),
      button('menu-pointer', page.pointer ? 'Pointer mode: on' : 'Pointer mode: off', act('pointer')),
    );
    if (page.adBlocking) {
      items.push(button('menu-adblock', page.adBlocking.on ? 'Ad blocking: on' : 'Ad blocking: off', act('adBlocking'), page.adBlocking.locked), el('p', { cls: 'where', text: page.adBlocking.note }));
    }
    items.push(
      button('menu-site', 'This site: app, profile, what it may do', () => {
        menuPage = 'site';
        render();
      }),
    );
  }
  items.push(el('div', { cls: 'pair' }, [button('menu-tabs', s.tabs.length > 1 ? `Tabs (${s.tabs.length})` : 'Tabs', act('tabs')), button('menu-history', 'History', act('history'))]));
  if (s.downloads.length > 0) {
    const going = s.downloads.filter((d) => d.state === 'going').length;
    items.push(button('menu-downloads', going ? `Downloads (${going} under way)` : 'Downloads', act('downloads')));
  }
  if (s.lock?.homeOnly) items.push(button('menu-lock', s.lock.unlocked ? 'Lock again: only the sites on Home' : 'Unlock every site (PIN)', act('lock')));
  items.push(button('menu-settings', 'Settings', act('settings')), el('div', { cls: 'pair' }, [button('menu-about', 'About and help', act('about')), button('menu-quit', `Quit ${PRODUCT.name}`, act('quit'))]));
  return items;
}

/** "Add as an app": a name, two choices, and Add. The choices are kept here until Add is pressed. */
function addAppPanel(s: ChromeState): Node[] {
  const name = el('input', { id: 'app-name' });
  name.type = 'text';
  name.value = draft.name;
  name.setAttribute('aria-label', 'Name');
  name.setAttribute('enterkeyhint', 'done');
  name.addEventListener('input', () => (draft.name = name.value));
  const toggle = (id: string, text: string, flip: () => void): HTMLButtonElement =>
    button(id, text, () => {
      flip();
      render();
    });
  const items: Node[] = [
    el('h1', { text: 'Add as an app' }),
    el('p', { cls: 'where', text: `${s.page?.site ?? 'This site'} will get a tile on Home that opens it directly.` }),
    name,
    toggle('app-session', draft.ownSession ? 'Sign-ins: its own, apart from the rest' : `Sign-ins: shared with the rest of ${PRODUCT.name}`, () => (draft.ownSession = !draft.ownSession)),
  ];
  if (s.page?.canAddToAppList) {
    items.push(toggle('app-launcher', draft.launcher ? "Also in the TV's app list: yes" : "Also in the TV's app list: no", () => (draft.launcher = !draft.launcher)));
  }
  items.push(
    button('app-add', 'Add', () => tell({ kind: 'addApp', name: draft.name, ownSession: draft.ownSession, launcher: draft.launcher && s.page?.canAddToAppList === true })),
    button('app-cancel', 'Cancel', () => tell({ kind: 'menu', action: 'close' })),
  );
  return items;
}

/** The profile editor: what was pointed at, what it can be marked as, and Save. */
function editPanel(s: ChromeState): Node[] {
  const edit = s.edit;
  const press = (action: EditAction) => (): void => tell({ kind: 'edit', action });
  const items: Node[] = [el('h1', { text: 'Profile editor' })];
  if (!edit) return items;
  const picked = edit.picked;
  if (!picked) {
    items.push(el('p', { text: `Making a profile for ${edit.site}. Move the pointer onto something and press OK to mark it.` }));
    items.push(button('edit-pick', 'Point at something', press('pickAgain')));
  } else {
    const onOff = (on: boolean): string => (on ? 'yes' : 'no');
    items.push(
      el('p', { cls: 'where', text: `${picked.selector}: ${picked.matches} on this page, shown with a dashed box` }),
      button('edit-include', `Can be selected: ${onOff(picked.marks.include)}`, press('include')),
      button('edit-exclude', `Never select: ${onOff(picked.marks.exclude)}`, press('exclude')),
      button('edit-row', `This is a row: ${onOff(picked.marks.row)}`, press('row')),
      button('edit-player', `This is the player: ${onOff(picked.marks.player)}`, press('player')),
      el('div', { cls: 'pair' }, [button('edit-narrower', 'Narrower', press('narrower'), !picked.canNarrow), button('edit-wider', 'Wider', press('wider'), !picked.canWiden)]),
      button('edit-pick', 'Point at something else', press('pickAgain')),
    );
  }
  items.push(
    el('p', { cls: 'where', text: edit.marked === 1 ? '1 thing marked so far.' : `${edit.marked} things marked so far.` }),
    button('edit-save', 'Save and finish', press('save'), edit.marked === 0),
    button('edit-discard', 'Finish without saving', press('discard')),
  );
  return items;
}

/**
 * Settings: a first page of headings, and a page for each. Every change is
 * sent to the shell, which checks it, keeps it in config.json and sends the
 * new state back; nothing is decided here.
 */
function settingsPanel(s: ChromeState): Node[] {
  const st = s.settings;
  if (!st) return [el('h1', { text: 'Settings' })];
  const set = (name: string, value: unknown) => (): void => tell({ kind: 'setting', name, value });
  const go = (page: SettingsPage) => (): void => {
    settingsPage = page;
    confirming = null;
    render();
  };
  const back = button('settings-back', 'Back to Settings', go('main'));
  const say = (text: string): HTMLElement => el('p', { cls: 'where', text });
  const yesNo = (on: boolean): string => (on ? 'yes' : 'no');
  /** A button that clears something: the first press asks, the second does it. */
  const twice = (id: string, text: string, sure: string, action: SettingsAction): HTMLButtonElement =>
    button(id, confirming === id ? sure : text, () => {
      if (confirming === id) {
        confirming = null;
        tell({ kind: 'settingsAction', action });
      } else {
        confirming = id;
        render();
      }
    });
  const once = (id: string, text: string, action: SettingsAction): HTMLButtonElement => button(id, text, () => tell({ kind: 'settingsAction', action }));

  /** A list to choose one from: the one in use is marked, and choosing goes back to the page it came from. */
  const choose = (title: string, name: string, options: Array<{ text: string; value: unknown; chosen: boolean; note?: string }>): Node[] => {
    const items: Node[] = [el('h1', { text: title })];
    options.forEach((o, i) => {
      items.push(
        button(`pick-${i}`, o.chosen ? `${o.text} (in use)` : o.text, () => {
          choosing = null;
          tell({ kind: 'setting', name, value: o.value });
        }),
      );
      if (o.note) items.push(say(o.note));
    });
    items.push(
      button('pick-cancel', 'Cancel', () => {
        choosing = null;
        render();
      }),
    );
    return items;
  };
  const pick = (what: NonNullable<typeof choosing>) => (): void => {
    choosing = what;
    render();
  };
  if (choosing === 'search') {
    return choose('Search with', 'search', SEARCH_CHOICES.map((c) => ({ text: c.name, value: c.template, chosen: c.template === st.searchTemplate })));
  }
  if (choosing === 'language') {
    return choose('Language sites are asked for', 'language', LANGUAGE_CHOICES.map((l) => ({ text: l.name === "the system's" ? "The system's language" : l.name, value: l.code, chosen: l.code === st.language })));
  }
  if (choosing === 'theme') {
    return choose('Look sites are asked for', 'theme', [
      { text: "The system's", value: null, chosen: st.theme === null },
      { text: 'Dark', value: 'dark', chosen: st.theme === 'dark' },
      { text: 'Light', value: 'light', chosen: st.theme === 'light' },
    ]);
  }
  if (choosing === 'ads') {
    const mode = st.adBlocking.mode;
    return choose('Ad blocking', 'adBlocking', [
      { text: 'Each site has its own switch', value: null, chosen: mode === 'sites', note: 'It starts off on the sites in the list and on everywhere else. The menu has the switch for the site in front.' },
      { text: 'On for every site', value: 'everywhere', chosen: mode === 'everywhere', note: 'The list is ignored. A site you switch off yourself from the menu stays off.' },
      { text: 'Off for every site', value: 'off', chosen: mode === 'off', note: 'Nothing is refused anywhere, and the filter list is not downloaded.' },
    ]);
  }

  switch (settingsPage) {
    case 'general': {
      return [
        el('h1', { text: 'Search and starting' }),
        button('set-search', `Search with: ${st.search}`, pick('search')),
        say('Words typed into the address field are looked up there. Another search site can be put in config.json.'),
        button('set-start', st.startWith === 'last' ? 'Open with: the last site' : 'Open with: Home', set('startWith', st.startWith === 'last' ? 'home' : 'last')),
        button('set-language', `Language sites are asked for: ${LANGUAGE_CHOICES.find((l) => l.code === st.language)?.name ?? st.language}`, pick('language')),
        say(`Sites that come in several languages are asked for this one. Takes effect the next time ${PRODUCT.name} starts.`),
        back,
      ];
    }
    case 'display': {
      const at = PAGE_SIZES.reduce((best, size, i) => (Math.abs(size - st.pageSize) < Math.abs(PAGE_SIZES[best]! - st.pageSize) ? i : best), 0);
      const step = (by: number): number => PAGE_SIZES[Math.min(PAGE_SIZES.length - 1, Math.max(0, at + by))]!;
      return [
        el('h1', { text: 'Size and video' }),
        say('The size of everything on every site. Each site can also be made bigger or smaller from the menu.'),
        el('div', { cls: 'pair' }, [
          button('set-size-down', 'Smaller', set('pageSize', step(-1)), at === 0),
          button('set-size-reset', `${Math.round(st.pageSize * 100)}%`, set('pageSize', null)),
          button('set-size-up', 'Bigger', set('pageSize', step(1)), at === PAGE_SIZES.length - 1),
        ]),
        button('set-theme', `Look sites are asked for: ${st.theme === 'dark' ? 'dark' : st.theme === 'light' ? 'light' : "the system's"}`, pick('theme')),
        say('Many sites have a dark look and a light one and ask the browser which to show.'),
        button('set-autoplay', `Videos may start by themselves: ${yesNo(st.autoplay)}`, set('autoplay', st.autoplay ? false : null)),
        say(`Sites that play video as soon as they open. Takes effect the next time ${PRODUCT.name} starts.`),
        button('set-decode', `Decode video on the graphics chip: ${yesNo(st.hardwareDecode)}`, set('hardwareDecode', !st.hardwareDecode)),
        say(`Can make video smoother on some boxes and break it on others. Takes effect the next time ${PRODUCT.name} starts.`),
        back,
      ];
    }
    case 'ads': {
      const words = { sites: 'each site has its own switch', everywhere: 'on for every site', off: 'off for every site' } as const;
      const mode = st.adBlocking.mode;
      const off = st.adBlocking.startsOff.filter((e) => e.off).length;
      return [
        el('h1', { text: 'Ad blocking' }),
        button('set-ads', `Ad blocking: ${words[mode]}`, pick('ads')),
        button('set-ads-list', `Sites where it starts off (${off})`, go('adsList')),
        say(`Filter list: EasyList${st.blockTrackers ? ' and EasyPrivacy' : ''}, ${st.adBlocking.listUpdated}. Downloaded from easylist.to every four days.`),
        once('set-ads-update', 'Download the filter list now', 'updateFilters'),
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
        el('h1', { text: 'Sites where ad blocking starts off' }),
        say(`Sites whose advertising is left alone unless you switch blocking on for them. The reviewed list comes with ${PRODUCT.name}; you can add to it and take sites off it. Press a site to change it.`),
        add,
      ];
      st.adBlocking.startsOff.forEach((entry, i) => {
        const what = entry.from === 'you' ? 'added by you: press to remove' : entry.off ? 'reviewed list: press to take off' : 'taken off by you: press to put back';
        items.push(button(`starts-off-${i}`, `${entry.domain} (${what})`, () => tell({ kind: 'startsOff', op: 'toggle', domain: entry.domain })));
      });
      if (!st.adBlocking.startsOff.length) items.push(say('The list is empty.'));
      items.push(button('settings-back', 'Back to ad blocking', go('ads')));
      return items;
    }
    case 'privacy':
      return [
        el('h1', { text: 'Privacy and site data' }),
        twice('clear-data', 'Sign out of every site and clear what sites have stored', 'Press again to sign out everywhere', 'clearSiteData'),
        once('clear-cache', 'Clear saved copies of pages and pictures', 'clearCache'),
        once('clear-home', 'Clear the recently opened sites on Home', 'clearHome'),
        twice('clear-all', 'Clear everything: history, recent sites, and what sites stored', 'Press again to clear everything', 'clearAll'),
        button('set-dnt', `Ask sites not to track you or sell your data: ${yesNo(st.doNotTrack)}`, set('doNotTrack', st.doNotTrack ? null : true)),
        say('Sends the "Do Not Track" and "Global Privacy Control" signals with every request. Each site decides whether to honour them.'),
        button('set-trackers', `Refuse known trackers as well as ads: ${yesNo(st.blockTrackers)}`, set('blockTrackers', st.blockTrackers ? null : true)),
        say("Uses the public EasyPrivacy list, downloaded from easylist.to, and each site's own ad-blocking switch."),
        button('set-local-address', `Hide this device's home-network address from sites: ${yesNo(st.hideLocalAddress)}`, set('hideLocalAddress', st.hideLocalAddress ? null : true)),
        button('set-https', `Open only pages sent privately (https): ${yesNo(st.httpsOnly)}`, set('httpsOnly', st.httpsOnly ? null : true)),
        button('set-clear-exit', `Clear what sites stored when ${PRODUCT.name} closes: ${yesNo(st.clearOnExit)}`, set('clearOnExit', st.clearOnExit ? null : true)),
        button('set-history', `Keep a history of pages opened: ${yesNo(st.history)}`, set('history', st.history ? false : null)),
        once('clear-history', `Clear the history (${st.visits})`, 'clearHistory'),
        twice('clear-sites', `Forget every site's own settings (${st.sitesWithChoices})`, "Press again to forget every site's settings", 'forgetSites'),
        say("A site's own settings are what you allowed it, its size and its ad-blocking switch."),
        el('p', { text: BACKGROUND }),
        back,
      ];
    case 'access': {
      const items: Node[] = [el('h1', { text: 'What sites may ask for' }), say('A site has to ask before it gets any of these, and you answer for that site. Say no here and no site can even ask.')];
      for (const kind of st.askable) {
        const never = st.neverAsk.includes(kind.name);
        const next = never ? st.neverAsk.filter((n) => n !== kind.name) : [...st.neverAsk, kind.name];
        items.push(button(`ask-${kind.name}`, `Sites may ask to ${kind.words}: ${yesNo(!never)}`, set('neverAsk', next.length ? next : null)));
      }
      items.push(back);
      return items;
    }
    case 'profiles': {
      const items: Node[] = [
        el('h1', { text: 'Profiles and apps' }),
        say(`${st.profiles === 1 ? '1 profile' : `${st.profiles} profiles`} on this machine.`),
        button('set-catalogue', `Look for reviewed profiles every day: ${yesNo(st.catalogue)}`, set('catalogue', st.catalogue ? false : null)),
        once('set-catalogue-now', 'Look for reviewed profiles now', 'updateCatalogue'),
        button('set-import', 'Import profiles from USB', () => tell({ kind: 'menu', action: 'importProfiles' })),
      ];
      s.home.apps.forEach((a, i) => {
        const id = `set-app-${i}`;
        items.push(
          button(id, confirming === id ? `Press again to remove "${a.name}"` : `Remove the app "${a.name}"`, () => {
            if (confirming === id) {
              confirming = null;
              tell({ kind: 'removeApp', id: a.id });
            } else {
              confirming = id;
              render();
            }
          }),
        );
      });
      items.push(back);
      return items;
    }
    case 'downloads': {
      const f = st.folders;
      if (!f) {
        return [
          el('h1', { text: 'Downloads' }),
          say(`Files are saved in ${st.downloads}. Each download is asked about first, and nothing downloaded is opened.`),
          button('set-folder', 'Choose another folder', () => tell({ kind: 'folder', path: st.downloads })),
          button('set-folder-usual', "Use the desktop's Downloads folder", set('downloads', null)),
          back,
        ];
      }
      const items: Node[] = [el('h1', { text: 'Choose a folder' }), say(f.path), button('folder-use', 'Save downloads in this folder', set('downloads', f.path))];
      if (f.up) items.push(button('folder-up', 'Up to the folder above', () => tell({ kind: 'folder', path: f.up })));
      f.inside.forEach((name, i) => items.push(button(`folder-${i}`, `Open: ${name}`, () => tell({ kind: 'folder', path: `${f.path === '/' ? '' : f.path}/${name}` }))));
      if (!f.inside.length) items.push(say('There are no folders in here.'));
      f.places.forEach((place, i) => items.push(button(`place-${i}`, `Go to: ${place.name}`, () => tell({ kind: 'folder', path: place.path }))));
      items.push(button('folder-cancel', 'Cancel', () => tell({ kind: 'folder', path: null })));
      return items;
    }
    case 'lock': {
      const items: Node[] = [el('h1', { text: 'Parental lock' })];
      if (!st.lock) {
        items.push(
          say('Set a PIN and it is asked for before Settings opens. You can also have it asked for before any site that is not on Home.'),
          button('lock-set', 'Set a PIN', () => tell({ kind: 'lock', op: 'set' })),
        );
      } else {
        const id = 'lock-remove';
        items.push(
          say('A PIN is set: it is asked for before Settings opens.'),
          button('lock-home-only', `Only the sites on Home open without the PIN: ${yesNo(st.lock.homeOnly)}`, () => tell({ kind: 'lock', op: 'homeOnly' })),
          say('The sites on Home are your apps and saved pages. With this on, adding to Home or taking off it asks for the PIN too, and the menu has "Unlock every site". A site that sends you elsewhere to sign in needs unlocking for that.'),
          button('lock-change', 'Change the PIN', () => tell({ kind: 'lock', op: 'set' })),
          button(id, confirming === id ? 'Press again to remove the PIN' : 'Remove the PIN', () => {
            if (confirming === id) {
              confirming = null;
              tell({ kind: 'lock', op: 'remove' });
            } else {
              confirming = id;
              render();
            }
          }),
        );
      }
      items.push(say(`This keeps a child with the remote out. It does not stop someone with a keyboard and the files: deleting lock.json in ${st.dataFolder} removes the lock, which is also what to do if the PIN is forgotten.`), back);
      return items;
    }
    case 'updates': {
      const u = st.update;
      const words = { install: u.canInstall ? 'installed by themselves' : 'looked for, and you are told', tell: 'looked for, and you are told', off: 'not looked for' } as const;
      const next = { install: 'tell', tell: 'off', off: null } as const;
      return [
        el('h1', { text: 'New versions' }),
        say(`This is version ${s.version}. ${u.words}`),
        button('set-updates', `New versions are: ${words[u.mode]}`, set('updates', next[u.mode])),
        say(
          u.canInstall
            ? `Once a day ${PRODUCT.name} asks GitHub whether there is a newer release. A new one is downloaded, checked against the checksum the release states, and used from the next start.`
            : `Once a day ${PRODUCT.name} asks GitHub whether there is a newer release. This copy was not started from an AppImage it can write to, so it cannot replace itself: it only tells you.`,
        ),
        say('The request names this project and nothing about you or the sites you visit.'),
        once('check-update', 'Look for a new version now', 'checkUpdate'),
        back,
      ];
    }
    case 'remote': {
      const items: Node[] = [el('h1', { text: 'Remote and keyboard buttons' })];
      if (st.capturing) {
        const words = st.buttons.find((b) => b.action === st.capturing)?.words ?? st.capturing;
        items.push(el('p', { text: `Press the button to use for "${words}". Back cancels.` }), say('The arrows, OK and plain letters and numbers cannot be given another job.'));
        return items;
      }
      items.push(say('Give a button on your remote a job. The built-in buttons keep working; About and help lists them.'));
      for (const b of st.buttons) {
        items.push(button(`button-${b.action}`, b.keys.length ? `${b.words}: also ${b.keys.join(', ')}` : `${b.words}: add a button`, () => tell({ kind: 'captureButton', action: b.action })));
        if (b.keys.length) items.push(button(`unbutton-${b.action}`, `Take the extra buttons away from "${b.words}"`, () => tell({ kind: 'clearButtons', action: b.action })));
      }
      items.push(back);
      return items;
    }
    default:
      return [
        el('h1', { text: 'Settings' }),
        button('settings-general', 'Search and starting', go('general')),
        button('settings-display', 'Size and video', go('display')),
        button('settings-ads', 'Ad blocking', go('ads')),
        button('settings-privacy', 'Privacy and site data', go('privacy')),
        button('settings-access', 'What sites may ask for', go('access')),
        button('settings-lock', `Parental lock: ${st.lock ? 'PIN set' : 'no PIN'}`, go('lock')),
        button('settings-profiles', 'Profiles and apps', go('profiles')),
        button('settings-downloads', 'Downloads', go('downloads')),
        button('settings-remote', 'Remote and keyboard buttons', go('remote')),
        button('settings-updates', 'New versions', go('updates')),
        say(`Settings are kept in config.json in ${st.dataFolder}.`),
        twice('settings-reset', 'Put every setting back to the usual', 'Press again to put every setting back', 'reset'),
        button('settings-about', 'About and help', () => tell({ kind: 'menu', action: 'about' })),
        button('settings-close', 'Close', () => tell({ kind: 'menu', action: 'close' })),
      ];
  }
}

/** Find words on the page in front: a field, and next and previous. What was typed stays while the panel is open. */
let finding = '';
function findPanel(): Node[] {
  const field = el('input', { id: 'find-text' });
  field.type = 'text';
  field.value = finding;
  field.placeholder = 'Words to find';
  field.setAttribute('aria-label', 'Words to find');
  field.setAttribute('enterkeyhint', 'search');
  field.autocapitalize = 'off';
  field.spellcheck = false;
  const look = (forward: boolean) => (): void => {
    if (finding.trim()) tell({ kind: 'find', text: finding, forward });
  };
  field.addEventListener('input', () => (finding = field.value));
  field.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    field.blur();
    look(true)();
    const next = document.getElementById('find-next');
    if (next) layer?.focus(next);
  });
  return [
    el('h1', { text: 'Find on this page' }),
    field,
    el('div', { cls: 'pair' }, [button('find-previous', 'Previous', look(false)), button('find-next', 'Next', look(true))]),
    el('p', { cls: 'where', text: 'Each place the words are found is marked on the page. The part of the page under this panel cannot be seen until it is closed.' }),
    button('find-close', 'Close', () => tell({ kind: 'menu', action: 'close' })),
  ];
}

/** The digits entered so far on the PIN screen. Never shown, never kept after the fourth. */
let pinDigits = '';
function pinKey(key: string): void {
  if (state?.panel !== 'pin') return;
  if (key === 'delete') pinDigits = pinDigits.slice(0, -1);
  else if (/^\d$/.test(key) && pinDigits.length < 4) pinDigits += key;
  if (pinDigits.length === 4) {
    const digits = pinDigits;
    pinDigits = '';
    tell({ kind: 'pin', digits });
  }
  const dots = document.getElementById('pin-dots');
  if (dots) dots.textContent = '●'.repeat(pinDigits.length) + '○'.repeat(4 - pinDigits.length);
}
/** The PIN screen: ten digits to press with OK (or the number buttons of a remote), shown only as dots. */
function pinPanel(s: ChromeState): Node[] {
  const p = s.pin;
  const pad = el('div', { cls: 'pinpad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => button(`pin-${d}`, d, () => pinKey(d))));
  const last = el('div', { cls: 'pinpad' }, [button('pin-delete', 'Delete', () => pinKey('delete')), button('pin-0', '0', () => pinKey('0')), button('pin-cancel', 'Cancel', () => tell({ kind: 'menu', action: 'close' }))]);
  const items: Node[] = [el('h1', { text: 'PIN' }), el('p', { text: p?.title ?? '' }), el('p', { id: 'pin-dots', text: '●'.repeat(pinDigits.length) + '○'.repeat(4 - pinDigits.length) })];
  if (p && p.waitSeconds > 0) items.push(el('p', { id: 'pin-wait', cls: 'where warn', text: `Too many wrong tries. Another is taken in ${p.waitSeconds} seconds.` }));
  items.push(pad, last);
  if (p?.note) items.push(el('p', { cls: 'where', text: p.note }));
  return items;
}

/** How big the reader view's words are; kept while Longboard is open. */
const READER_SIZES = [3, 3.6, 4.4, 5.4, 6.6] as const;
let readerSize = 2;
/** Reader view: the words of the article, big, on a screen of their own. Up and Down move through it. */
function readerPanel(s: ChromeState): Node[] {
  const r = s.reader;
  if (!r) return [el('h1', { text: 'Reader view' })];
  const size = (step: number) => (): void => {
    readerSize = Math.min(READER_SIZES.length - 1, Math.max(0, readerSize + step));
    render();
  };
  const tags = { heading: 'h2', text: 'p', item: 'li', quote: 'blockquote', code: 'pre' } as const;
  const article = el('article', { id: 'reader-text' }, [el('h1', { text: r.title || r.site }), el('p', { cls: 'where', text: r.site }), ...r.blocks.map((b) => el(tags[b.kind] ?? 'p', { text: b.text }))]);
  article.style.fontSize = `${READER_SIZES[readerSize]}vh`;
  return [
    el('div', { cls: 'pair', id: 'reader-bar' }, [
      button('reader-close', 'Close reader view', () => tell({ kind: 'menu', action: 'close' })),
      button('reader-smaller', 'Smaller words', size(-1), readerSize === 0),
      button('reader-bigger', 'Bigger words', size(1), readerSize === READER_SIZES.length - 1),
    ]),
    article,
  ];
}

/** The open tabs: bring one in front, close one, or open another. */
function tabsPanel(s: ChromeState): Node[] {
  const items: Node[] = [
    el('h1', { text: 'Tabs' }),
    el('div', { cls: 'pair' }, [button('tab-new', 'New tab', () => tell({ kind: 'tab', op: 'new' })), button('tab-private', 'New private tab', () => tell({ kind: 'tab', op: 'private' }))]),
  ];
  s.tabs.forEach((t, i) => {
    const what = t.site ? (t.title ? `${t.title} (${t.site})` : t.site) : 'Empty tab';
    const name = t.private ? `Private: ${what}` : what;
    items.push(button(`tab-${i}`, t.current ? `${name}: in front now` : name, () => tell({ kind: 'tab', op: 'switch', id: t.id })));
    if (s.tabs.length > 1) items.push(button(`tab-close-${i}`, `Close: ${name}`, () => tell({ kind: 'tab', op: 'close', id: t.id })));
  });
  items.push(button('tabs-close', 'Close this list', () => tell({ kind: 'menu', action: 'close' })));
  return items;
}

/** The pages opened lately. Pressing one opens it. */
function historyPanel(s: ChromeState): Node[] {
  const items: Node[] = [el('h1', { text: 'History' })];
  const list = s.history ?? [];
  if (!list.length) items.push(el('p', { text: 'No pages yet. Settings, under Privacy, says whether a history is kept.' }));
  list.forEach((v, i) => items.push(button(`visit-${i}`, v.text, () => tell({ kind: 'openVisit', url: v.url }))));
  items.push(button('history-close', 'Close', () => tell({ kind: 'menu', action: 'close' })));
  return items;
}

/** What was downloaded in this run and how each one went. Longboard does not open the files. */
function downloadsPanel(s: ChromeState): Node[] {
  const said = { saved: 'Saved', cancelled: 'Cancelled', failed: 'Failed' } as const;
  const items: Node[] = [el('h1', { text: 'Downloads' })];
  for (const d of s.downloads) {
    items.push(el('p', { cls: 'where', text: `${d.name}: ${d.state === 'going' ? d.progress : said[d.state]}` }));
    if (d.state === 'going') items.push(button(`dl-cancel-${d.id}`, `Cancel ${d.name}`, () => tell({ kind: 'cancelDownload', id: d.id })));
  }
  items.push(button('downloads-close', 'Close', () => tell({ kind: 'menu', action: 'close' })));
  return items;
}

function aboutPanel(s: ChromeState): Node[] {
  const list = el('dl');
  for (const [keys, what] of HELP) list.append(el('dt', { text: keys }), el('dd', { text: what }));
  return [
    el('h1', { text: aboutTitle(s.version) }),
    el('p', { text: NOTICE }),
    el('p', { text: BACKGROUND }),
    list,
    button('about-close', 'Close', () => tell({ kind: 'menu', action: 'close' })),
  ];
}

function promptPanel(s: ChromeState): Node[] {
  const answer = (allow: boolean) => (): void => tell({ kind: 'answer', allow });
  if (s.prompt?.what === 'profile') {
    return [
      el('h1', { text: 'Use this profile?' }),
      el('p', { text: `"${s.prompt.name}" (version ${s.prompt.version}) is a profile someone gave you. Nobody has reviewed it.` }),
      el('p', { text: `It applies to: ${s.prompt.hosts.join(', ')}` }),
      el('p', { text: `A profile is settings, not a program: it tells ${PRODUCT.name} where things are on a site and cannot run anything. Your answer is remembered.` }),
      button('prompt-allow', 'Use it', answer(true)),
      button('prompt-deny', 'Do not use it', answer(false)),
    ];
  }
  if (s.prompt?.what === 'download') {
    return [
      el('h1', { text: 'Download this file?' }),
      // The name is the site's to choose, so it stands apart from what Longboard says about it.
      el('p', { cls: 'where', text: s.prompt.name }),
      el('p', { text: `${s.prompt.size ? `${s.prompt.size}, from` : 'From'} ${s.prompt.site}.` }),
      el('p', { text: `It will be saved in ${s.prompt.folder}. ${PRODUCT.name} does not open downloaded files.` }),
      button('prompt-allow', 'Download', answer(true)),
      button('prompt-deny', 'Cancel', answer(false)),
    ];
  }
  const site = s.prompt?.what === 'permission' ? s.prompt.site : 'This site';
  const wants = s.prompt?.what === 'permission' ? s.prompt.wants : 'do something';
  return [
    el('h1', { text: 'Allow this?' }),
    el('p', { text: `${site} wants to ${wants}.` }),
    el('p', { text: 'Your answer is remembered for this site. The menu can forget it. Back asks again next time.' }),
    button('prompt-allow', 'Allow', answer(true)),
    button('prompt-deny', 'Do not allow', answer(false)),
  ];
}

function render(): void {
  const s = state;
  if (!s) return;
  const keep = document.querySelector('[data-longboard-focus]')?.id;
  const reader = s.panel === 'reader';
  const strip = s.surface === 'page' && !reader;
  document.body.classList.toggle('strip', strip);
  const parts: Node[] = [];
  // Behind a website the view is only as wide as the panel; Home is not drawn.
  if (!strip && !reader) parts.push(home(s));
  let panel: HTMLElement | null = null;
  if (s.panel) {
    panel = el('aside', { id: 'panel' }, s.panel === 'menu' ? menuPanel(s) : s.panel === 'about' ? aboutPanel(s) : s.panel === 'addApp' ? addAppPanel(s) : s.panel === 'edit' ? editPanel(s) : s.panel === 'downloads' ? downloadsPanel(s) : s.panel === 'settings' ? settingsPanel(s) : s.panel === 'history' ? historyPanel(s) : s.panel === 'tabs' ? tabsPanel(s) : s.panel === 'find' ? findPanel() : s.panel === 'reader' ? readerPanel(s) : s.panel === 'pin' ? pinPanel(s) : promptPanel(s));
    if (reader) panel.classList.add('reader');
    // The layer keeps the highlight inside an open modal dialog.
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    parts.push(panel);
  }
  document.body.replaceChildren(...parts, ...document.querySelectorAll('longboard-overlay'));
  if (!layer || typing) return;
  const same = keep ? document.getElementById(keep) : null;
  const inScope = same && (!panel || panel.contains(same)) && !(same as HTMLButtonElement).disabled;
  if (inScope) layer.focus(same);
  else if (panel) {
    // Not the text field: landing on it would put the keyboard up before anything was asked for.
    // A question starts on the answer that changes nothing: a page can time
    // its request for when OK is about to be pressed for something else.
    const first = document.getElementById('prompt-deny') ?? [...panel.querySelectorAll('button')].find((b) => !b.disabled);
    if (first) layer.focus(first);
  } else {
    const first = document.querySelector('.tiles button') ?? document.getElementById('go');
    if (first) layer.focus(first);
  }
}

ipcRenderer.on('longboard:chrome-state', (_event, next: ChromeState) => {
  // A panel that opens or closes ends any typing in the Home field.
  if (state && (state.panel !== next.panel || state.surface !== next.surface)) typing = false;
  // The menu opens on its first page each time, and a chooser does not outlive its screen.
  if (next.panel !== 'menu' || state?.panel !== 'menu') menuPage = 'main';
  if (next.panel !== 'settings') choosing = null;
  if (next.panel !== 'find') finding = '';
  // Settings opens on its first page each time; coming back from choosing a PIN it is where it was.
  if (next.panel !== 'settings' && next.panel !== 'pin') settingsPage = 'main';
  if (next.panel !== 'pin' || state?.panel !== 'pin') pinDigits = '';
  if (next.panel !== 'settings') confirming = null;
  // The "add as an app" panel starts from the page's own name each time it opens.
  if (next.panel === 'addApp' && state?.panel !== 'addApp') draft = { name: next.page?.title || next.page?.site || '', ownSession: false, launcher: true };
  // The menu opened from Home is about the tile the highlight was on.
  if (next.panel === 'menu' && state && state.panel === null && state.surface === 'home') menuFor = focusedTile(state);
  else if (next.panel !== 'menu') menuFor = null;
  state = next;
  render();
});
// A site's own icon, to be drawn small and handed back as a PNG made here.
// This process is sandboxed, so it is the right place for a picture from a
// website to be decoded; the shell never decodes one.
ipcRenderer.on('longboard:icon', (_event, job: { id: number; dataUrl: string; size: number }) => {
  if (!job || typeof job.id !== 'number' || typeof job.dataUrl !== 'string' || !job.dataUrl.startsWith('data:image/')) return;
  const size = Math.min(256, Math.max(16, Number(job.size) || 128));
  const done = (png: string | null): void => tell({ kind: 'icon', id: job.id, png });
  const img = new Image();
  img.onerror = () => done(null);
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const w = img.naturalWidth || size;
      const h = img.naturalHeight || size;
      const scale = Math.min(size / w, size / h);
      const ctx = canvas.getContext('2d');
      if (!ctx) return done(null);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale);
      done(canvas.toDataURL('image/png'));
    } catch {
      done(null);
    }
  };
  img.src = job.dataUrl;
});
// Button mappings changed in Settings: the layer reads this object at every key.
ipcRenderer.on('longboard:keys', (_event, keys: unknown) => {
  const held = ((boot.options as { keys?: Record<string, string> }).keys ??= {});
  if (!keys || typeof keys !== 'object') return;
  for (const key of Object.keys(held)) delete held[key];
  for (const [key, action] of Object.entries(keys as Record<string, unknown>).slice(0, 200)) if (typeof action === 'string') held[key] = action;
});
ipcRenderer.on('longboard:suggestions', (_event, reply: { text: string; list: Array<{ url: string; text: string }> }) => {
  const field = (document.getElementById('address') ?? document.getElementById('menu-address')) as HTMLInputElement | null;
  // Only for what is in the field now: an answer to something typed earlier is out of date.
  if (!reply || !field || field.value !== reply.text || !Array.isArray(reply.list)) return;
  showSuggestions(reply.list.slice(0, 5).filter((x) => x && typeof x.url === 'string' && typeof x.text === 'string'));
});
ipcRenderer.on('longboard:notice', (_event, text: unknown) => {
  if (typeof text === 'string') layer?.notice(text.slice(0, 200));
});

const start = (): void => {
  document.title = PRODUCT.name;
  // A remote's number buttons, or a keyboard's, enter the PIN directly.
  document.addEventListener('keydown', (e) => {
    if (state?.panel !== 'pin' || !e.isTrusted) return;
    if (/^\d$/.test(e.key)) pinKey(e.key);
    else if (e.key === 'Backspace') pinKey('delete');
    else return;
    e.preventDefault();
  }, true);
  layer = startLayer({
    doc: document,
    options: boot.options,
    // Longboard's own screens are not a site to be worked out: everything on
    // them is a real control, and nothing is read by scrolling.
    rules: { ...genericRules(), generic: false },
    send,
    hooks: {
      // A list on a TV goes round: up from the top is the bottom, down from the bottom is the top.
      edge: (dir) => {
        const panel = document.getElementById('panel');
        if (!panel || (dir !== 'up' && dir !== 'down')) return false;
        // The reader view has nothing to move to above or below its buttons: the arrows move the words.
        if (state?.panel === 'reader') {
          panel.scrollBy({ top: (dir === 'down' ? 1 : -1) * panel.clientHeight * 0.6, behavior: 'smooth' });
          return true;
        }
        const all = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input')];
        const to = dir === 'up' ? all[all.length - 1] : all[0];
        if (!to || all.length < 2) return false;
        layer?.focus(to);
        return true;
      },
      back: () => {
        if (!state) return true;
        // Back out of an address field that is showing suggestions puts the button back.
        if (typing && !state.panel) {
          typing = false;
          render();
          return true;
        }
        if (state.panel === 'prompt') tell({ kind: 'answer', allow: false, remember: false });
        // Back on the editor's panel goes back to pointing; the panel's own buttons end the editing.
        else if (state.panel === 'edit') tell({ kind: 'edit', action: 'pickAgain' });
        // Back inside Settings goes up a page before it closes.
        else if (state.panel === 'menu' && menuPage === 'site') {
          menuPage = 'main';
          render();
        } else if (state.panel === 'settings' && choosing) {
          choosing = null;
          render();
        } else if (state.panel === 'settings' && state.settings?.folders) tell({ kind: 'folder', path: null });
        else if (state.panel === 'settings' && settingsPage !== 'main') {
          settingsPage = settingsPage === 'adsList' ? 'ads' : 'main';
          confirming = null;
          render();
        }
        else if (state.panel) tell({ kind: 'menu', action: 'close' });
        else if (state.page) tell({ kind: 'menu', action: 'resume' });
        return true;
      },
    },
  });
  render();
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
