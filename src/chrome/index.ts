// Longboard's own screens: Home, the menu panel, About, and questions. This
// is the preload of the chrome view, which only ever shows chrome.html. It
// draws everything from the isolated world and talks to the shell directly;
// the page itself has no script and no API (Hard rule 13).
//
// The highlight here is moved by the same layer that drives websites, so
// Longboard's own interface is the first user of its navigation engine.
//
// How the screens look is in chrome.html; the parts they are built from
// (rows, switches, icons) are in ./parts.
import { ipcRenderer } from 'electron';
import { PRODUCT } from '../shared/product';
import type { BootData, BridgeMessage } from '../shared/actions';
import type { ChromeMessage, ChromeState, EditAction, MenuAction, SettingsAction } from '../shared/chrome';
import { LANGUAGE_CHOICES, PAGE_SIZES, SEARCH_CHOICES } from '../shared/settings';
import { aboutTitle, BACKGROUND, HELP, NOTICE, SHORTCUT_HELP } from '../shared/about';
import { siteName } from '../shared/address';
import { genericRules } from '../layer/profile/rules';
import { startLayer, type Layer } from '../layer/index';
import { badge, button, el, heading, icon, logo, note, row, type IconName } from './parts';

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
type SettingsPage = 'main' | 'general' | 'display' | 'ads' | 'adsList' | 'privacy' | 'access' | 'profiles' | 'downloads' | 'remote' | 'lock' | 'updates' | 'extensions';
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

const SEARCH_WORDS = 'Search or enter an address';

/** A field for an address or search words; Enter opens what was typed. */
function addressField(id: string): HTMLInputElement {
  const input = el('input', { id });
  input.type = 'text';
  input.placeholder = SEARCH_WORDS;
  input.setAttribute('aria-label', SEARCH_WORDS);
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

/** The suggestions for what is typed in an address field: a few buttons under it, replaced as the typing goes on. */
function showSuggestions(list: Array<{ url: string; text: string }>): void {
  const field = document.getElementById('address')?.parentElement ?? document.getElementById('menu-address');
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
      }, false, 'history'),
    ),
  );
}

/** The time and the day, at the top of Home, as a TV's own screens show them. */
function clockWords(now = new Date()): [string, string] {
  return [now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })];
}
function drawClock(): void {
  const clock = document.getElementById('clock');
  if (!clock) return;
  const [time, day] = clockWords();
  if (clock.firstChild?.textContent !== time) clock.replaceChildren(document.createTextNode(time), el('small', { text: day }));
}

/** A tile of Home: the site's icon, a name, a line under it, and a small label at the corner. */
function tile(id: string, pic: string | null, name: string, sub: string, mark: string, onPress: () => void): HTMLButtonElement {
  const t = button(id, '', onPress);
  t.className = 'tile';
  t.append(badge(pic, name), el('span', { cls: 'site', text: name }), el('span', { cls: 'sub title', text: sub }), el('span', { cls: 'mark', text: mark }));
  t.setAttribute('aria-label', [name, sub, mark].filter(Boolean).join(', '));
  return t;
}

function home(s: ChromeState): HTMLElement {
  let go: HTMLElement;
  if (typing) {
    const input = addressField('address');
    go = el('div', { cls: 'field typing' }, [icon('search'), input]);
    // Leaving the field without opening anything puts the button back.
    input.addEventListener('blur', () => {
      // With suggestions showing, the highlight may be on its way to one of them: the field stays.
      if (!typing || document.getElementById('suggestions')?.childElementCount) return;
      typing = false;
      render();
      const again = document.getElementById('go');
      if (again) layer?.focus(again);
    });
  } else {
    go = button('go', SEARCH_WORDS, () => {
      typing = true;
      render();
      const field = document.getElementById('address');
      if (field) layer?.typeIn(field);
    }, false, 'search');
    go.className = 'field';
  }
  const tiles = s.home.recents.map((r, i) => {
    const mark = r.profile === 'own' ? 'Your profile' : r.profile === 'reviewed' ? 'Reviewed profile' : '';
    return tile(`tile-${i}`, r.icon, siteName(r.url), r.title, mark, () => tell({ kind: 'openRecent', url: r.url }));
  });
  const apps = s.home.apps.map((a, i) => tile(`app-${i}`, a.icon, a.name, a.site, a.ownSession ? 'Own sign-ins' : '', () => tell({ kind: 'openApp', id: a.id })));
  const savedTiles = s.home.saved.map((p, i) => {
    const site = siteName(p.url);
    return tile(`saved-${i}`, p.icon, p.title || site, site, '', () => tell({ kind: 'openSaved', url: p.url }));
  });

  const [time, day] = clockWords();
  const top = el('header', { id: 'top' }, [logo(), el('h1', { text: PRODUCT.name })]);
  if (s.home.privateTab) top.append(el('span', { id: 'private-badge', cls: 'badge private' }, [icon('private'), el('span', { text: 'Private tab' })]));
  if (s.tabs.length > 1) top.append(el('span', { cls: 'badge' }, [icon('tabs'), el('span', { text: `${s.tabs.length} tabs` })]));
  top.append(el('div', { id: 'clock' }, [document.createTextNode(time), el('small', { text: day })]));

  const main = el('main', { id: 'home' }, [top, go]);
  if (s.home.privateTab) main.append(el('p', { id: 'private', cls: 'where', text: 'Nothing opened in this tab is kept: no history, no recent sites, and what its sites store goes when the tab is closed.' }));
  // The page left behind Home is one press away.
  if (s.page && !typing) {
    const back = button('resume', '', () => tell({ kind: 'menu', action: 'resume' }));
    back.append(badge(s.page.icon, s.page.site), el('span', { cls: 'text' }, [el('span', { cls: 'label', text: s.page.title || s.page.site }), el('span', { cls: 'sub', text: `Carry on at ${s.page.site}` })]), icon('chevron'));
    back.setAttribute('aria-label', `Carry on at ${s.page.site}`);
    main.append(back);
  }
  if (savedTiles.length) main.append(el('h2', { text: 'Saved pages' }), el('div', { id: 'saved', cls: 'tiles' }, savedTiles));
  if (apps.length) main.append(el('h2', { text: 'Apps' }), el('div', { id: 'apps', cls: 'tiles' }, apps));
  if (tiles.length) main.append(el('h2', { text: 'Recently opened' }), el('div', { id: 'tiles', cls: 'tiles' }, tiles));
  else if (!apps.length && !savedTiles.length && !s.home.privateTab) {
    const card = (pic: IconName, title: string, text: string): HTMLElement => el('div', {}, [icon(pic), el('b', { text: title }), el('span', { text })]);
    main.append(
      el('p', { id: 'welcome-title', text: `Welcome to ${PRODUCT.name}` }),
      el('div', { id: 'welcome' }, [
        card('search', 'Search or go to a site', 'Press OK on the bar above and type with the on-screen keyboard. A keyboard that is plugged in works too.'),
        card('apps', 'Your sites live here', 'Sites you open will appear here. The menu can keep a page on Home, or add a site as an app.'),
        card('pointer', 'A pointer when you need one', 'The arrows move between links and buttons. For a site that needs a mouse, F2 or a click of the right stick brings a pointer.'),
      ]),
    );
  }
  const key = (keys: string[], what: string): HTMLElement => el('span', {}, [...keys.flatMap((k, i) => (i ? [document.createTextNode('or'), el('kbd', { text: k })] : [el('kbd', { text: k })])), document.createTextNode(what)]);
  main.append(el('p', { id: 'hint' }, [key(['OK'], 'Open'), key(['Menu', 'Start'], 'Menu'), key(['Back'], 'Back'), key(['F2', 'R3'], 'Pointer')]));
  return main;
}

/** The site in front, at the top of the menu: its icon, the page's title, and whether the page was sent privately. */
function siteBlock(page: NonNullable<ChromeState['page']>): HTMLElement {
  const line = page.secure
    ? el('span', {}, [icon('lock'), el('span', { text: page.site })])
    : el('span', { cls: 'warn' }, [icon('warn'), el('span', { text: `${page.site}: not secure` })]);
  return el('div', { cls: 'site' }, [badge(page.icon, page.site), el('div', { cls: 'text' }, [el('b', { text: page.title || page.site }), line])]);
}

function menuPanel(s: ChromeState): Node[] {
  const act = (action: MenuAction) => (): void => tell({ kind: 'menu', action });
  const page = s.page;
  const onPage = s.surface === 'page';
  // The things about the page in front that are wanted now and then have a page of their own, to keep the menu short.
  if (menuPage === 'site' && page && onPage) {
    const items: Node[] = [
      heading('This page'),
      siteBlock(page),
      page.saved ? row('menu-unsave', 'Take this page off Home', act('unsavePage'), { icon: 'star' }) : row('menu-save', 'Keep this page on Home', act('savePage'), { icon: 'star' }),
      ...(page.storeExtension ? [row('menu-add-extension', 'Add this extension', act('addExtension'), { icon: 'plug' })] : []),
      row('menu-find', 'Find on this page', act('find'), { icon: 'search' }),
      row('menu-reader', 'Reader view', act('reader'), { icon: 'book', sub: 'Only the article, in large words' }),
      row('menu-desktop', 'Desktop site', act('desktop'), { icon: 'monitor', on: page.desktop, sub: 'The full-width layout, with smaller words' }),
      el('h2', { text: 'This site' }),
      page.app ? row('menu-remove-app', `Remove the app "${page.app.name}"`, act('removeApp'), { icon: 'trash' }) : row('menu-add-app', 'Add this site as an app', act('addApp'), { icon: 'apps', chevron: true }),
    ];
    if (page.answers) items.push(note(page.answers), row('menu-forget', 'Forget what this site may do', act('forgetAnswers'), { icon: 'shield' }));
    items.push(
      el('h2', { text: 'Profile' }),
      note(page.profile ? `Profile: ${page.profile}` : 'No profile for this site: generic mode'),
      row('menu-edit', page.profile ? 'Edit the profile for this site' : 'Make a profile for this site', act('editProfile'), { icon: 'layers', chevron: true }),
    );
    if (page.profile) items.push(row('menu-export', 'Export this profile', act('exportProfile'), { icon: 'download' }));
    items.push(
      row('menu-outline', 'Save page outline', act('outline'), { icon: 'download', sub: 'The structure only, for making a profile' }),
      row('menu-site-back', 'Back to the menu', () => {
        menuPage = 'main';
        render();
      }, { icon: 'back', cls: 'quiet' }),
    );
    return items;
  }
  const items: Node[] = [heading('Menu')];
  if (page && onPage) items.push(siteBlock(page));
  if (page && onPage && !page.secure) {
    const warn = note('Not secure: this page is sent over plain http, where anyone on the way can read or change it.', 'warn');
    warn.id = 'not-secure';
    items.push(warn);
  }
  items.push(addressField('menu-address'));
  if (onPage) items.push(row('menu-home', 'Home', act('home'), { icon: 'home' }));
  else if (page) items.push(row('menu-resume', `Back to ${page.site}`, act('resume'), { icon: 'back' }));
  if (!onPage && menuFor) {
    const tileFor = menuFor;
    items.push(
      tileFor.kind === 'recent'
        ? row('menu-remove-tile', `Remove ${tileFor.name} from Home`, () => tell({ kind: 'removeRecent', url: tileFor.url }), { icon: 'trash' })
        : tileFor.kind === 'saved'
          ? row('menu-remove-tile', `Take "${tileFor.name}" off Home`, () => tell({ kind: 'removeSaved', url: tileFor.url }), { icon: 'trash' })
          : row('menu-remove-tile', `Remove the app "${tileFor.name}"`, () => tell({ kind: 'removeApp', id: tileFor.id }), { icon: 'trash' }),
    );
  }
  if (page && onPage) {
    items.push(
      el('div', { cls: 'pair nav' }, [
        button('menu-back', 'Back', act('back'), !page.canGoBack, 'back'),
        button('menu-forward', 'Forward', act('forward'), !page.canGoForward, 'forward'),
        page.loading ? button('menu-reload', 'Stop', act('stop'), false, 'close') : button('menu-reload', 'Reload', act('reload'), false, 'reload'),
      ]),
      el('div', { cls: 'pair' }, [
        button('menu-zoom-out', 'Smaller', act('zoomOut')),
        button('menu-zoom-reset', `${page.zoomPercent}%`, act('zoomReset')),
        button('menu-zoom-in', 'Bigger', act('zoomIn')),
      ]),
      row('menu-pointer', 'Pointer mode', act('pointer'), { icon: 'pointer', on: page.pointer }),
    );
    if (page.adBlocking) items.push(row('menu-adblock', 'Ad blocking', act('adBlocking'), { icon: 'block', on: page.adBlocking.on, sub: page.adBlocking.note, disabled: page.adBlocking.locked }));
    items.push(
      row('menu-site', 'This page', () => {
        menuPage = 'site';
        render();
      }, { icon: 'globe', chevron: true, sub: 'Keep, find, reader view, app, profile' }),
    );
  }
  items.push(el('div', { cls: 'pair' }, [button('menu-tabs', s.tabs.length > 1 ? `Tabs (${s.tabs.length})` : 'Tabs', act('tabs'), false, 'tabs'), button('menu-history', 'History', act('history'), false, 'history')]));
  if (s.downloads.length > 0) {
    const going = s.downloads.filter((d) => d.state === 'going').length;
    items.push(row('menu-downloads', 'Downloads', act('downloads'), { icon: 'download', chevron: true, ...(going ? { value: `${going} under way` } : {}), say: going ? `Downloads (${going} under way)` : 'Downloads' }));
  }
  if (s.lock?.homeOnly) items.push(row('menu-lock', s.lock.unlocked ? 'Lock again: only the sites on Home' : 'Unlock every site (PIN)', act('lock'), { icon: s.lock.unlocked ? 'lock' : 'unlock' }));
  items.push(
    row('menu-settings', 'Settings', act('settings'), { icon: 'settings', chevron: true }),
    el('div', { cls: 'pair' }, [button('menu-about', 'About and help', act('about'), false, 'info'), button('menu-quit', `Quit ${PRODUCT.name}`, act('quit'), false, 'power')]),
  );
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
  const flip = (change: () => void) => (): void => {
    change();
    render();
  };
  const items: Node[] = [
    heading('Add as an app', 'apps'),
    note(`${s.page?.site ?? 'This site'} will get a tile on Home that opens it directly.`),
    name,
    row('app-session', 'Its own sign-ins', flip(() => (draft.ownSession = !draft.ownSession)), {
      on: draft.ownSession,
      sub: draft.ownSession ? 'Kept apart from the rest' : `Shared with the rest of ${PRODUCT.name}`,
      say: draft.ownSession ? 'Sign-ins: its own, apart from the rest' : `Sign-ins: shared with the rest of ${PRODUCT.name}`,
    }),
  ];
  if (s.page?.canAddToAppList) {
    items.push(row('app-launcher', "Also in the TV's app list", flip(() => (draft.launcher = !draft.launcher)), { on: draft.launcher, say: draft.launcher ? "Also in the TV's app list: yes" : "Also in the TV's app list: no" }));
  }
  items.push(
    row('app-add', 'Add', () => tell({ kind: 'addApp', name: draft.name, ownSession: draft.ownSession, launcher: draft.launcher && s.page?.canAddToAppList === true }), { icon: 'plus' }),
    row('app-cancel', 'Cancel', () => tell({ kind: 'menu', action: 'close' }), { cls: 'quiet' }),
  );
  return items;
}

/** The profile editor: what was pointed at, what it can be marked as, and Save. */
function editPanel(s: ChromeState): Node[] {
  const edit = s.edit;
  const press = (action: EditAction) => (): void => tell({ kind: 'edit', action });
  const items: Node[] = [heading('Profile editor', 'layers')];
  if (!edit) return items;
  const picked = edit.picked;
  if (!picked) {
    items.push(el('p', { cls: 'lead', text: `Making a profile for ${edit.site}. Move the pointer onto something and press OK to mark it.` }));
    items.push(row('edit-pick', 'Point at something', press('pickAgain'), { icon: 'pointer' }));
  } else {
    const mark = (id: string, label: string, on: boolean, action: EditAction): HTMLButtonElement => row(id, label, press(action), { on, say: `${label}: ${on ? 'yes' : 'no'}` });
    items.push(
      note(`${picked.selector}: ${picked.matches} on this page, shown with a dashed box`),
      mark('edit-include', 'Can be selected', picked.marks.include, 'include'),
      mark('edit-exclude', 'Never select', picked.marks.exclude, 'exclude'),
      mark('edit-row', 'This is a row', picked.marks.row, 'row'),
      mark('edit-player', 'This is the player', picked.marks.player, 'player'),
      el('div', { cls: 'pair' }, [button('edit-narrower', 'Narrower', press('narrower'), !picked.canNarrow), button('edit-wider', 'Wider', press('wider'), !picked.canWiden)]),
      row('edit-pick', 'Point at something else', press('pickAgain'), { icon: 'pointer' }),
    );
  }
  items.push(
    note(edit.marked === 1 ? '1 thing marked so far.' : `${edit.marked} things marked so far.`),
    row('edit-save', 'Save and finish', press('save'), { icon: 'check', disabled: edit.marked === 0 }),
    row('edit-discard', 'Finish without saving', press('discard'), { cls: 'quiet' }),
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
  if (!st) return [heading('Settings', 'settings')];
  const set = (name: string, value: unknown) => (): void => tell({ kind: 'setting', name, value });
  const go = (page: SettingsPage) => (): void => {
    settingsPage = page;
    confirming = null;
    render();
  };
  const backTo = (text: string, page: SettingsPage): HTMLButtonElement => row('settings-back', text, go(page), { icon: 'back', cls: 'quiet' });
  const back = backTo('Back to Settings', 'main');
  const say = (text: string): HTMLElement => note(text);
  /** A switch. `words` is what it said before it was drawn as one, kept as its accessible name. */
  const flip = (id: string, label: string, on: boolean, press: () => void, sub?: string): HTMLButtonElement => row(id, label, press, { on, ...(sub ? { sub } : {}), say: `${label}: ${on ? 'yes' : 'no'}` });
  /** A row that clears or removes something: the first press asks, the second does it. */
  const sure = (id: string, text: string, again: string, press: () => void, pic: IconName = 'trash'): HTMLButtonElement =>
    row(id, confirming === id ? again : text, () => {
      if (confirming === id) {
        confirming = null;
        press();
      } else {
        confirming = id;
        render();
      }
    }, { icon: confirming === id ? 'warn' : pic, cls: 'danger' });
  const twice = (id: string, text: string, again: string, action: SettingsAction): HTMLButtonElement => sure(id, text, again, () => tell({ kind: 'settingsAction', action }));
  const once = (id: string, text: string, action: SettingsAction, pic?: IconName): HTMLButtonElement => row(id, text, () => tell({ kind: 'settingsAction', action }), pic ? { icon: pic } : {});

  /** A list to choose one from: the one in use is marked, and choosing goes back to the page it came from. */
  const choose = (title: string, name: string, options: Array<{ text: string; value: unknown; chosen: boolean; note?: string }>): Node[] => {
    const items: Node[] = [heading(title)];
    options.forEach((o, i) => {
      const pickIt = (): void => {
        choosing = null;
        tell({ kind: 'setting', name, value: o.value });
      };
      const b = row(`pick-${i}`, o.text, pickIt, { ...(o.note ? { sub: o.note } : {}), ...(o.chosen ? { cls: 'chosen', say: `${o.text} (in use)` } : {}) });
      if (o.chosen) b.append(icon('check'));
      items.push(b);
    });
    items.push(
      row('pick-cancel', 'Cancel', () => {
        choosing = null;
        render();
      }, { cls: 'quiet' }),
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
      const language = LANGUAGE_CHOICES.find((l) => l.code === st.language)?.name ?? st.language ?? '';
      return [
        heading('Search and starting', 'search'),
        row('set-search', 'Search with', pick('search'), { value: st.search, chevron: true, sub: 'Where words typed into the address field are looked up' }),
        row('set-start', 'Open with', set('startWith', st.startWith === 'last' ? 'home' : 'last'), { value: st.startWith === 'last' ? 'The last site' : 'Home', say: st.startWith === 'last' ? 'Open with: the last site' : 'Open with: Home' }),
        row('set-language', 'Language sites are asked for', pick('language'), { value: language, chevron: true, sub: 'Takes effect the next time it starts' }),
        say('Another search site can be put in config.json.'),
        back,
      ];
    }
    case 'display': {
      const at = PAGE_SIZES.reduce((best, size, i) => (Math.abs(size - st.pageSize) < Math.abs(PAGE_SIZES[best]! - st.pageSize) ? i : best), 0);
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
        row('set-theme', 'Look sites are asked for', pick('theme'), { value: look, chevron: true, sub: 'Many sites have a dark look and a light one' }),
        flip('set-autoplay', 'Videos may start by themselves', st.autoplay, set('autoplay', st.autoplay ? false : null), 'Takes effect the next time it starts'),
        flip('set-decode', 'Decode video on the graphics chip', st.hardwareDecode, set('hardwareDecode', !st.hardwareDecode), 'Smoother on some boxes, broken on others. Takes effect the next time it starts'),
        back,
      ];
    }
    case 'ads': {
      const words = { sites: 'each site has its own switch', everywhere: 'on for every site', off: 'off for every site' } as const;
      const short = { sites: 'Per site', everywhere: 'Everywhere', off: 'Off' } as const;
      const mode = st.adBlocking.mode;
      const off = st.adBlocking.startsOff.filter((e) => e.off).length;
      return [
        heading('Ad blocking', 'block'),
        row('set-ads', 'Ad blocking', pick('ads'), { value: short[mode], chevron: true, say: `Ad blocking: ${words[mode]}` }),
        row('set-ads-list', 'Sites where it starts off', go('adsList'), { value: String(off), chevron: true, say: `Sites where it starts off (${off})` }),
        say(`Filter list: EasyList${st.blockTrackers ? ' and EasyPrivacy' : ''}, ${st.adBlocking.listUpdated}. Downloaded from easylist.to every four days.`),
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
        say(`Sites whose advertising is left alone unless you switch blocking on for them. The reviewed list comes with ${PRODUCT.name}; you can add to it and take sites off it. Press a site to change it.`),
        add,
      ];
      st.adBlocking.startsOff.forEach((entry, i) => {
        const what = entry.from === 'you' ? 'added by you: press to remove' : entry.off ? 'reviewed list: press to take off' : 'taken off by you: press to put back';
        items.push(row(`starts-off-${i}`, entry.domain, () => tell({ kind: 'startsOff', op: 'toggle', domain: entry.domain }), { sub: what.charAt(0).toUpperCase() + what.slice(1), say: `${entry.domain} (${what})` }));
      });
      if (!st.adBlocking.startsOff.length) items.push(say('The list is empty.'));
      items.push(backTo('Back to ad blocking', 'ads'));
      return items;
    }
    case 'privacy':
      return [
        heading('Privacy and site data', 'shield'),
        el('h2', { text: 'Protection' }),
        flip('set-dnt', 'Ask sites not to track you or sell your data', st.doNotTrack, set('doNotTrack', st.doNotTrack ? null : true), 'Sends the "Do Not Track" and "Global Privacy Control" signals. Each site decides whether to honour them'),
        flip('set-trackers', 'Refuse known trackers as well as ads', st.blockTrackers, set('blockTrackers', st.blockTrackers ? null : true), "Uses the public EasyPrivacy list, and each site's own ad-blocking switch"),
        flip('set-local-address', "Hide this device's home-network address from sites", st.hideLocalAddress, set('hideLocalAddress', st.hideLocalAddress ? null : true)),
        flip('set-https', 'Open only pages sent privately (https)', st.httpsOnly, set('httpsOnly', st.httpsOnly ? null : true)),
        el('h2', { text: 'What is kept' }),
        flip('set-history', 'Keep a history of pages opened', st.history, set('history', st.history ? false : null)),
        flip('set-clear-exit', `Clear what sites stored when ${PRODUCT.name} closes`, st.clearOnExit, set('clearOnExit', st.clearOnExit ? null : true)),
        el('h2', { text: 'Clear' }),
        once('clear-history', `Clear the history (${st.visits})`, 'clearHistory', 'history'),
        once('clear-home', 'Clear the recently opened sites on Home', 'clearHome', 'home'),
        once('clear-cache', 'Clear saved copies of pages and pictures', 'clearCache', 'trash'),
        twice('clear-data', 'Sign out of every site and clear what sites have stored', 'Press again to sign out everywhere', 'clearSiteData'),
        twice('clear-sites', `Forget every site's own settings (${st.sitesWithChoices})`, "Press again to forget every site's settings", 'forgetSites'),
        say("A site's own settings are what you allowed it, its size and its ad-blocking switch."),
        twice('clear-all', 'Clear everything: history, recent sites, and what sites stored', 'Press again to clear everything', 'clearAll'),
        el('h2', { text: `What ${PRODUCT.name} fetches by itself` }),
        el('p', { text: BACKGROUND }),
        back,
      ];
    case 'access': {
      const items: Node[] = [heading('What sites may ask for', 'shield'), say('A site has to ask before it gets any of these, and you answer for that site. Switch one off here and no site can even ask.')];
      for (const kind of st.askable) {
        const never = st.neverAsk.includes(kind.name);
        const next = never ? st.neverAsk.filter((n) => n !== kind.name) : [...st.neverAsk, kind.name];
        items.push(flip(`ask-${kind.name}`, `Sites may ask to ${kind.words}`, !never, set('neverAsk', next.length ? next : null)));
      }
      items.push(back);
      return items;
    }
    case 'profiles': {
      const items: Node[] = [
        heading('Profiles and apps', 'layers'),
        say(`${st.profiles === 1 ? '1 profile' : `${st.profiles} profiles`} on this machine.`),
        flip('set-catalogue', 'Look for reviewed profiles every day', st.catalogue, set('catalogue', st.catalogue ? false : null)),
        once('set-catalogue-now', 'Look for reviewed profiles now', 'updateCatalogue', 'update'),
        row('set-import', 'Import profiles from USB', () => tell({ kind: 'menu', action: 'importProfiles' }), { icon: 'folder' }),
      ];
      if (s.home.apps.length) items.push(el('h2', { text: 'Apps' }));
      s.home.apps.forEach((a, i) => items.push(sure(`set-app-${i}`, `Remove the app "${a.name}"`, `Press again to remove "${a.name}"`, () => tell({ kind: 'removeApp', id: a.id }))));
      items.push(back);
      return items;
    }
    case 'downloads': {
      const f = st.folders;
      if (!f) {
        return [
          heading('Downloads', 'download'),
          say(`Files are saved in ${st.downloads}. Each download is asked about first, and nothing downloaded is opened.`),
          row('set-folder', 'Choose another folder', () => tell({ kind: 'folder', path: st.downloads }), { icon: 'folder', chevron: true }),
          row('set-folder-usual', "Use the desktop's Downloads folder", set('downloads', null)),
          back,
        ];
      }
      const items: Node[] = [heading('Choose a folder', 'folder'), say(f.path), row('folder-use', 'Save downloads in this folder', set('downloads', f.path), { icon: 'check' })];
      if (f.up) items.push(row('folder-up', 'Up to the folder above', () => tell({ kind: 'folder', path: f.up }), { icon: 'back' }));
      f.inside.forEach((name, i) => items.push(row(`folder-${i}`, name, () => tell({ kind: 'folder', path: `${f.path === '/' ? '' : f.path}/${name}` }), { icon: 'folder', chevron: true, say: `Open: ${name}` })));
      if (!f.inside.length) items.push(say('There are no folders in here.'));
      f.places.forEach((place, i) => items.push(row(`place-${i}`, place.name, () => tell({ kind: 'folder', path: place.path }), { icon: 'folder', say: `Go to: ${place.name}` })));
      items.push(row('folder-cancel', 'Cancel', () => tell({ kind: 'folder', path: null }), { cls: 'quiet' }));
      return items;
    }
    case 'lock': {
      const items: Node[] = [heading('Parental lock', 'lock')];
      if (!st.lock) {
        items.push(
          say('Set a PIN and it is asked for before Settings opens. You can also have it asked for before any site that is not on Home.'),
          row('lock-set', 'Set a PIN', () => tell({ kind: 'lock', op: 'set' }), { icon: 'lock', chevron: true }),
        );
      } else {
        items.push(
          say('A PIN is set: it is asked for before Settings opens.'),
          flip('lock-home-only', 'Only the sites on Home open without the PIN', st.lock.homeOnly, () => tell({ kind: 'lock', op: 'homeOnly' })),
          say('The sites on Home are your apps and saved pages. With this on, adding to Home or taking off it asks for the PIN too, and the menu has "Unlock every site". A site that sends you elsewhere to sign in needs unlocking for that.'),
          row('lock-change', 'Change the PIN', () => tell({ kind: 'lock', op: 'set' }), { icon: 'lock', chevron: true }),
          sure('lock-remove', 'Remove the PIN', 'Press again to remove the PIN', () => tell({ kind: 'lock', op: 'remove' })),
        );
      }
      items.push(say(`This keeps a child with the remote out. It does not stop someone with a keyboard and the files: deleting lock.json in ${st.dataFolder} removes the lock, which is also what to do if the PIN is forgotten.`), back);
      return items;
    }
    case 'extensions': {
      const items: Node[] = [
        heading('Extensions', 'plug'),
        say('Extensions come from the Chrome Web Store. Open the store, go to an extension\'s page, then choose "Add this extension" on the menu\'s page about the page in front.'),
        row('ext-store', 'Open the Chrome Web Store', () => tell({ kind: 'open', input: 'https://chromewebstore.google.com/category/extensions' }), { icon: 'globe', chevron: true }),
      ];
      if (st.extensions.length) items.push(el('h2', { text: 'Installed' }));
      st.extensions.forEach((x, i) => {
        if (x.opens) items.push(row(`ext-open-${i}`, x.name, () => tell({ kind: 'extension', op: 'open', id: x.id }), { icon: 'plug', value: x.version, chevron: true, say: `Open "${x.name}"` }));
        else items.push(say(`"${x.name}" (${x.version}) has no page of its own.`));
        items.push(sure(`ext-remove-${i}`, `Remove "${x.name}"`, `Press again to remove "${x.name}"`, () => tell({ kind: 'extension', op: 'remove', id: x.id })));
      });
      if (!st.extensions.length) items.push(say('None are installed.'));
      items.push(
        flip('ext-updates', 'Look for newer versions of extensions every day', st.extensionUpdates, set('extensionUpdates', st.extensionUpdates ? false : null)),
        say(`Not every extension works: ${PRODUCT.name} is not Chrome, and some need things it does not have. They are made for a mouse; pointer mode helps. Extensions do not run in private tabs or in apps that keep their own sign-ins.`),
        back,
      );
      return items;
    }
    case 'updates': {
      const u = st.update;
      const words = { install: u.canInstall ? 'installed by themselves' : 'looked for, and you are told', tell: 'looked for, and you are told', off: 'not looked for' } as const;
      const short = { install: u.canInstall ? 'Installed for you' : 'You are told', tell: 'You are told', off: 'Not looked for' } as const;
      const next = { install: 'tell', tell: 'off', off: null } as const;
      return [
        heading('New versions', 'update'),
        el('p', { cls: 'lead', text: `This is version ${s.version}. ${u.words}` }),
        row('set-updates', 'New versions are', set('updates', next[u.mode]), { value: short[u.mode], say: `New versions are: ${words[u.mode]}` }),
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
        items.push(el('p', { cls: 'lead', text: `Press the button to use for "${words}". Back cancels.` }), say('The arrows, OK and plain letters and numbers cannot be given another job.'));
        return items;
      }
      items.push(say('Give a button on your remote a job. The built-in buttons keep working; About and help lists them.'));
      for (const b of st.buttons) {
        items.push(row(`button-${b.action}`, b.words, () => tell({ kind: 'captureButton', action: b.action }), { value: b.keys.length ? b.keys.join(', ') : 'Add a button', say: b.keys.length ? `${b.words}: also ${b.keys.join(', ')}` : `${b.words}: add a button` }));
        if (b.keys.length) items.push(row(`unbutton-${b.action}`, `Take the extra buttons away from "${b.words}"`, () => tell({ kind: 'clearButtons', action: b.action }), { cls: 'quiet', icon: 'close' }));
      }
      items.push(back);
      return items;
    }
    default:
      return [
        heading('Settings', 'settings'),
        row('settings-general', 'Search and starting', go('general'), { icon: 'search', chevron: true, value: st.search }),
        row('settings-display', 'Size and video', go('display'), { icon: 'text', chevron: true, value: `${Math.round(st.pageSize * 100)}%` }),
        row('settings-ads', 'Ad blocking', go('ads'), { icon: 'block', chevron: true, say: 'Ad blocking' }),
        row('settings-privacy', 'Privacy and site data', go('privacy'), { icon: 'shield', chevron: true }),
        row('settings-access', 'What sites may ask for', go('access'), { icon: 'globe', chevron: true }),
        row('settings-lock', 'Parental lock', go('lock'), { icon: 'lock', chevron: true, value: st.lock ? 'PIN set' : 'Off', say: `Parental lock: ${st.lock ? 'PIN set' : 'no PIN'}` }),
        row('settings-profiles', 'Profiles and apps', go('profiles'), { icon: 'layers', chevron: true }),
        row('settings-downloads', 'Downloads', go('downloads'), { icon: 'download', chevron: true }),
        row('settings-extensions', 'Extensions', go('extensions'), { icon: 'plug', chevron: true, value: String(st.extensions.length), say: `Extensions (${st.extensions.length})` }),
        row('settings-remote', 'Remote and keyboard buttons', go('remote'), { icon: 'remote', chevron: true }),
        row('settings-updates', 'New versions', go('updates'), { icon: 'update', chevron: true, value: s.version }),
        row('settings-about', 'About and help', () => tell({ kind: 'menu', action: 'about' }), { icon: 'info', chevron: true }),
        say(`Settings are kept in config.json in ${st.dataFolder}.`),
        twice('settings-reset', 'Put every setting back to the usual', 'Press again to put every setting back', 'reset'),
        row('settings-close', 'Close', () => tell({ kind: 'menu', action: 'close' }), { cls: 'quiet' }),
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
    heading('Find on this page', 'search'),
    field,
    el('div', { cls: 'pair' }, [button('find-previous', 'Previous', look(false), false, 'back'), button('find-next', 'Next', look(true), false, 'forward')]),
    note('Each place the words are found is marked on the page. The part of the page under this panel cannot be seen until it is closed.'),
    row('find-close', 'Close', () => tell({ kind: 'menu', action: 'close' }), { cls: 'quiet' }),
  ];
}

/** The digits entered so far on the PIN screen. Never shown, never kept after the fourth. */
let pinDigits = '';
function pinDots(): HTMLElement {
  const dots = el('p', { id: 'pin-dots' }, [0, 1, 2, 3].map((i) => el('i', { cls: i < pinDigits.length ? 'in' : '' })));
  dots.setAttribute('role', 'status');
  dots.setAttribute('aria-label', `${pinDigits.length} of 4 digits entered`);
  return dots;
}
function pinKey(key: string): void {
  if (state?.panel !== 'pin') return;
  if (key === 'delete') pinDigits = pinDigits.slice(0, -1);
  else if (/^\d$/.test(key) && pinDigits.length < 4) pinDigits += key;
  if (pinDigits.length === 4) {
    const digits = pinDigits;
    pinDigits = '';
    tell({ kind: 'pin', digits });
  }
  document.getElementById('pin-dots')?.replaceWith(pinDots());
}
/** The PIN screen: ten digits to press with OK (or the number buttons of a remote), shown only as dots. */
function pinPanel(s: ChromeState): Node[] {
  const p = s.pin;
  const word = (b: HTMLButtonElement): HTMLButtonElement => {
    b.className = 'word';
    return b;
  };
  const pad = el('div', { cls: 'pinpad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => button(`pin-${d}`, d, () => pinKey(d))));
  const last = el('div', { cls: 'pinpad' }, [word(button('pin-delete', 'Delete', () => pinKey('delete'))), button('pin-0', '0', () => pinKey('0')), word(button('pin-cancel', 'Cancel', () => tell({ kind: 'menu', action: 'close' })))]);
  const items: Node[] = [heading('PIN', 'lock'), el('p', { cls: 'lead', text: p?.title ?? '' }), pinDots()];
  if (p && p.waitSeconds > 0) items.push(el('p', { id: 'pin-wait', cls: 'where warn', text: `Too many wrong tries. Another is taken in ${p.waitSeconds} seconds.` }));
  items.push(pad, last);
  if (p?.note) items.push(note(p.note));
  return items;
}

/** How big the reader view's words are; kept while Longboard is open. */
const READER_SIZES = [3, 3.6, 4.4, 5.4, 6.6] as const;
let readerSize = 1;
/** Reader view: the words of the article, big, on a screen of their own. Up and Down move through it. */
function readerPanel(s: ChromeState): Node[] {
  const r = s.reader;
  if (!r) return [heading('Reader view', 'book')];
  const size = (step: number) => (): void => {
    readerSize = Math.min(READER_SIZES.length - 1, Math.max(0, readerSize + step));
    render();
  };
  const tags = { heading: 'h2', text: 'p', item: 'li', quote: 'blockquote', code: 'pre' } as const;
  const minutes = Math.max(1, Math.round(r.blocks.reduce((n, b) => n + b.text.split(/\s+/).length, 0) / 220));
  const article = el('article', { id: 'reader-text' }, [el('h1', { text: r.title || r.site }), el('p', { cls: 'where', text: `${r.site} · about ${minutes === 1 ? '1 minute' : `${minutes} minutes`} to read` }), ...r.blocks.filter((b, i) => !(i === 0 && b.kind === 'heading' && b.text.trim() === r.title.trim())).map((b) => el(tags[b.kind] ?? 'p', { text: b.text }))]);
  article.style.fontSize = `${READER_SIZES[readerSize]}vh`;
  return [
    el('div', { cls: 'pair', id: 'reader-bar' }, [
      button('reader-close', 'Close reader view', () => tell({ kind: 'menu', action: 'close' }), false, 'back'),
      el('span', { cls: 'spacer' }),
      button('reader-smaller', 'Smaller words', size(-1), readerSize === 0, 'minus'),
      button('reader-bigger', 'Bigger words', size(1), readerSize === READER_SIZES.length - 1, 'plus'),
    ]),
    article,
  ];
}

/** The open tabs: bring one in front, close one, or open another. */
function tabsPanel(s: ChromeState): Node[] {
  const items: Node[] = [
    heading('Tabs', 'tabs'),
    el('div', { cls: 'pair' }, [button('tab-new', 'New tab', () => tell({ kind: 'tab', op: 'new' }), false, 'plus'), button('tab-private', 'New private tab', () => tell({ kind: 'tab', op: 'private' }), false, 'private')]),
  ];
  s.tabs.forEach((t, i) => {
    const what = t.site ? (t.title ? `${t.title} (${t.site})` : t.site) : 'Empty tab';
    const name = t.private ? `Private: ${what}` : what;
    const open = row(`tab-${i}`, t.site ? t.title || t.site : 'Empty tab', () => tell({ kind: 'tab', op: 'switch', id: t.id }), {
      ...(t.private ? { icon: 'private' as const } : {}),
      sub: [t.private ? 'Private' : '', t.site, t.current ? 'In front now' : ''].filter(Boolean).join(' · '),
      cls: `grow${t.current ? ' chosen' : ''}`,
      say: t.current ? `${name}: in front now` : name,
    });
    if (s.tabs.length < 2) return void items.push(open);
    const close = button(`tab-close-${i}`, '', () => tell({ kind: 'tab', op: 'close', id: t.id }));
    close.append(icon('close'));
    close.setAttribute('aria-label', `Close: ${name}`);
    items.push(el('div', { cls: 'pair' }, [open, close]));
  });
  if (s.closedTabs > 0) items.push(row('tab-reopen', 'Open the tab closed last', () => tell({ kind: 'tab', op: 'reopen' }), { icon: 'history' }));
  items.push(row('tabs-close', 'Close this list', () => tell({ kind: 'menu', action: 'close' }), { cls: 'quiet' }));
  return items;
}

/** The pages opened lately, under the day they were opened. Pressing one opens it; the cross beside it takes it out. */
let historyWords = '';
function historyRows(s: ChromeState): Node[] {
  const words = historyWords.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const all = s.history ?? [];
  const items: Node[] = [];
  let day = '';
  let shown = 0;
  all.forEach((v, i) => {
    const hay = `${v.title} ${v.site} ${v.url}`.toLowerCase();
    if (!words.every((w) => hay.includes(w)) || shown >= 80) return;
    shown += 1;
    if (v.day !== day) items.push(el('h2', { text: (day = v.day) }));
    const open = row(`visit-${i}`, v.title || v.site, () => tell({ kind: 'openVisit', url: v.url }), { sub: v.site, value: v.time, cls: 'grow', say: v.text });
    const forget = button(`visit-forget-${i}`, '', () => tell({ kind: 'forgetVisit', url: v.url }));
    forget.append(icon('close'));
    forget.setAttribute('aria-label', `Take out of the history: ${v.title || v.site}`);
    items.push(el('div', { cls: 'pair' }, [open, forget]));
  });
  if (!shown && all.length) items.push(note('No page in the history has those words.'));
  return items;
}
function historyPanel(s: ChromeState): Node[] {
  const items: Node[] = [heading('History', 'history')];
  const list = s.history ?? [];
  if (!list.length) items.push(el('p', { cls: 'lead', text: 'No pages yet.' }), note('Settings, under Privacy, says whether a history is kept.'));
  else {
    const field = el('input', { id: 'history-find' });
    field.type = 'text';
    field.value = historyWords;
    field.placeholder = 'Search the history';
    field.setAttribute('aria-label', 'Search the history');
    field.setAttribute('enterkeyhint', 'search');
    field.autocapitalize = 'off';
    field.spellcheck = false;
    // Only the list is drawn again as words are typed, so the field keeps what is in it.
    field.addEventListener('input', () => {
      historyWords = field.value;
      document.getElementById('visits')?.replaceChildren(...historyRows(s));
    });
    items.push(field, el('div', { id: 'visits', cls: 'list' }, historyRows(s)));
  }
  items.push(row('history-close', 'Close', () => tell({ kind: 'menu', action: 'close' }), { cls: 'quiet' }));
  return items;
}

/** What was downloaded in this run and how each one went. Longboard does not open the files. */
function downloadsPanel(s: ChromeState): Node[] {
  const said = { saved: 'Saved', cancelled: 'Cancelled', failed: 'Failed' } as const;
  const items: Node[] = [heading('Downloads', 'download')];
  for (const d of s.downloads) {
    items.push(note(`${d.name}: ${d.state === 'going' ? d.progress : said[d.state]}`));
    if (d.state === 'going') items.push(row(`dl-cancel-${d.id}`, `Cancel ${d.name}`, () => tell({ kind: 'cancelDownload', id: d.id }), { icon: 'close' }));
  }
  items.push(row('downloads-close', 'Close', () => tell({ kind: 'menu', action: 'close' }), { cls: 'quiet' }));
  return items;
}

function aboutPanel(s: ChromeState): Node[] {
  const list = el('dl');
  for (const [keys, what] of HELP) list.append(el('dt', { text: what }), el('dd', { text: keys }));
  const more = el('dl');
  for (const [keys, what] of SHORTCUT_HELP) more.append(el('dt', { text: what }), el('dd', { text: keys }));
  return [
    heading(aboutTitle(s.version)),
    el('p', { text: NOTICE }),
    el('h2', { text: 'Buttons' }),
    list,
    el('h2', { text: 'With a keyboard plugged in' }),
    more,
    el('h2', { text: `What ${PRODUCT.name} fetches by itself` }),
    el('p', { text: BACKGROUND }),
    row('about-close', 'Close', () => tell({ kind: 'menu', action: 'close' }), { cls: 'quiet' }),
  ];
}

function promptPanel(s: ChromeState): Node[] {
  const answer = (allow: boolean) => (): void => tell({ kind: 'answer', allow });
  const lead = (text: string): HTMLElement => el('p', { cls: 'lead', text });
  const yes = (text: string): HTMLButtonElement => row('prompt-allow', text, answer(true), { icon: 'check' });
  const no = (text: string): HTMLButtonElement => row('prompt-deny', text, answer(false), { icon: 'close' });
  if (s.prompt?.what === 'profile') {
    return [
      heading('Use this profile?', 'layers'),
      lead(`"${s.prompt.name}" (version ${s.prompt.version}) is a profile someone gave you. Nobody has reviewed it.`),
      el('p', { text: `It applies to: ${s.prompt.hosts.join(', ')}` }),
      el('p', { text: `A profile is settings, not a program: it tells ${PRODUCT.name} where things are on a site and cannot run anything. Your answer is remembered.` }),
      yes('Use it'),
      no('Do not use it'),
    ];
  }
  if (s.prompt?.what === 'extension') {
    return [
      heading('Add this extension?', 'plug'),
      note(`${s.prompt.name} (version ${s.prompt.version})`),
      lead('It will be able to:'),
      ...s.prompt.can.map((c) => el('p', { text: `• ${c}` })),
      el('p', { text: `An extension is a program written by someone else. ${PRODUCT.name} has not looked at it. Add it only if you trust who made it.` }),
      yes('Add it'),
      no('Do not add it'),
    ];
  }
  if (s.prompt?.what === 'download') {
    return [
      heading('Download this file?', 'download'),
      // The name is the site's to choose, so it stands apart from what Longboard says about it.
      note(s.prompt.name),
      lead(`${s.prompt.size ? `${s.prompt.size}, from` : 'From'} ${s.prompt.site}.`),
      el('p', { text: `It will be saved in ${s.prompt.folder}. ${PRODUCT.name} does not open downloaded files.` }),
      yes('Download'),
      no('Cancel'),
    ];
  }
  const site = s.prompt?.what === 'permission' ? s.prompt.site : 'This site';
  const wants = s.prompt?.what === 'permission' ? s.prompt.wants : 'do something';
  return [
    heading('Allow this?', 'shield'),
    lead(`${site} wants to ${wants}.`),
    el('p', { text: 'Your answer is remembered for this site. The menu can forget it. Back asks again next time.' }),
    yes('Allow'),
    no('Do not allow'),
  ];
}

/** The panel last drawn: one that is already open does not slide in again each time something on it changes. */
let drawnPanel: string | null = null;

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
    if (drawnPanel === s.panel) panel.classList.add('still');
    // The layer keeps the highlight inside an open modal dialog.
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    parts.push(panel);
  }
  drawnPanel = s.panel;
  // Where a long list had been scrolled to is kept when it is drawn again.
  const scrolled = document.getElementById('panel')?.scrollTop ?? 0;
  const homeScrolled = document.getElementById('home')?.scrollTop ?? 0;
  document.body.replaceChildren(...parts, ...document.querySelectorAll('longboard-overlay'));
  if (panel && panel.classList.contains('still')) panel.scrollTop = scrolled;
  const homeNow = document.getElementById('home');
  if (homeNow) homeNow.scrollTop = homeScrolled;
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
  if (next.panel !== 'history') historyWords = '';
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
// Ctrl+L on a keyboard: straight into the address field, on Home or in the menu.
ipcRenderer.on('longboard:type-address', () => {
  const inMenu = document.getElementById('menu-address');
  if (inMenu) layer?.typeIn(inMenu);
  else if (!state?.panel) document.getElementById('go')?.click();
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
  window.setInterval(drawClock, 5000);
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
