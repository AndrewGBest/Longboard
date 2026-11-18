// Longboard's own screens: Home, the menu panel, About, and questions. This
// is the preload of the chrome view, which only ever shows chrome.html. It
// draws everything from the isolated world and talks to the shell directly;
// the page itself has no script and no API (Hard rule 13).
//
// The highlight here is moved by the same layer that drives websites, so
// Longboard's own interface is the first user of its navigation engine.
import { ipcRenderer } from 'electron';
import type { BootData, BridgeMessage } from '../shared/actions';
import type { ChromeMessage, ChromeState, EditAction, MenuAction } from '../shared/chrome';
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
/** The Home tile the highlight was on when the menu was opened from Home; the menu offers to remove it. */
let menuFor: { kind: 'recent'; url: string; name: string } | { kind: 'app'; id: string; name: string } | null = null;

/** The tile with the highlight on Home, from what is drawn now. */
function focusedTile(s: ChromeState): typeof menuFor {
  const id = document.querySelector('[data-longboard-focus]')?.id ?? '';
  const m = /^(tile|app)-(\d+)$/.exec(id);
  if (!m) return null;
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
      if (!typing) return;
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
  const main = el('main', { id: 'home' }, [el('h1', { text: 'Longboard' }), go]);
  if (apps.length) main.append(el('h2', { text: 'Apps' }), el('div', { id: 'apps', cls: 'tiles' }, apps));
  if (tiles.length) main.append(el('h2', { text: 'Recently opened' }), el('div', { id: 'tiles', cls: 'tiles' }, tiles));
  else if (!apps.length) main.append(el('p', { id: 'empty', text: 'Sites you open will appear here.' }));
  main.append(el('p', { id: 'hint', text: 'Menu key, Ctrl+O or Start: menu.   F2 or right stick click: pointer.   Ctrl+Q: quit.' }));
  return main;
}

function menuPanel(s: ChromeState): Node[] {
  const act = (action: MenuAction) => (): void => tell({ kind: 'menu', action });
  const page = s.page;
  const onPage = s.surface === 'page';
  const items: Node[] = [el('h1', { text: 'Menu' })];
  if (page && onPage) items.push(el('p', { cls: 'where', text: page.title ? `${page.title} (${page.site})` : page.site }));
  items.push(addressField('menu-address'));
  if (onPage) items.push(button('menu-home', 'Home', act('home')));
  else if (page) items.push(button('menu-resume', `Back to ${page.site}`, act('resume')));
  if (!onPage && menuFor) {
    const tile = menuFor;
    items.push(
      tile.kind === 'recent'
        ? button('menu-remove-tile', `Remove ${tile.name} from Home`, () => tell({ kind: 'removeRecent', url: tile.url }))
        : button('menu-remove-tile', `Remove the app "${tile.name}"`, () => tell({ kind: 'removeApp', id: tile.id })),
    );
  }
  if (page && onPage) {
    items.push(
      button('menu-back', 'Back', act('back'), !page.canGoBack),
      button('menu-reload', 'Reload', act('reload')),
      el('div', { cls: 'pair' }, [
        button('menu-zoom-out', 'Smaller', act('zoomOut')),
        button('menu-zoom-reset', `${page.zoomPercent}%`, act('zoomReset')),
        button('menu-zoom-in', 'Bigger', act('zoomIn')),
      ]),
      button('menu-pointer', page.pointer ? 'Pointer mode: on' : 'Pointer mode: off', act('pointer')),
      button('menu-outline', 'Save page outline', act('outline')),
      el('p', { cls: 'where', text: page.profile ? `Profile: ${page.profile}` : 'No profile for this site: generic mode' }),
    );
    if (page.adBlocking) {
      items.push(button('menu-adblock', page.adBlocking.on ? 'Ad blocking: on' : 'Ad blocking: off', act('adBlocking')), el('p', { cls: 'where', text: page.adBlocking.note }));
    }
    if (page.profile) items.push(button('menu-export', 'Export this profile', act('exportProfile')));
    if (page.answers) {
      items.push(el('p', { cls: 'where', text: page.answers }), button('menu-forget', 'Forget what this site may do', act('forgetAnswers')));
    }
    items.push(button('menu-edit', page.profile ? 'Edit the profile for this site' : 'Make a profile for this site', act('editProfile')));
    items.push(page.app ? button('menu-remove-app', `Remove the app "${page.app.name}"`, act('removeApp')) : button('menu-add-app', 'Add this site as an app', act('addApp')));
  }
  if (s.downloads.length > 0) {
    const going = s.downloads.filter((d) => d.state === 'going').length;
    items.push(button('menu-downloads', going ? `Downloads (${going} under way)` : 'Downloads', act('downloads')));
  }
  items.push(button('menu-import', 'Import profiles from USB', act('importProfiles')));
  items.push(button('menu-about', 'About and help', act('about')), button('menu-quit', 'Quit Longboard', act('quit')));
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
    toggle('app-session', draft.ownSession ? 'Sign-ins: its own, apart from the rest' : 'Sign-ins: shared with the rest of Longboard', () => (draft.ownSession = !draft.ownSession)),
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
      el('p', { text: 'A profile is settings, not a program: it tells Longboard where things are on a site and cannot run anything. Your answer is remembered.' }),
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
      el('p', { text: `It will be saved in ${s.prompt.folder}. Longboard does not open downloaded files.` }),
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
  const strip = s.surface === 'page';
  document.body.classList.toggle('strip', strip);
  const parts: Node[] = [];
  // Behind a website the view is only as wide as the panel; Home is not drawn.
  if (!strip) parts.push(home(s));
  let panel: HTMLElement | null = null;
  if (s.panel) {
    panel = el('aside', { id: 'panel' }, s.panel === 'menu' ? menuPanel(s) : s.panel === 'about' ? aboutPanel(s) : s.panel === 'addApp' ? addAppPanel(s) : s.panel === 'edit' ? editPanel(s) : s.panel === 'downloads' ? downloadsPanel(s) : promptPanel(s));
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
ipcRenderer.on('longboard:notice', (_event, text: unknown) => {
  if (typeof text === 'string') layer?.notice(text.slice(0, 200));
});

const start = (): void => {
  layer = startLayer({
    doc: document,
    options: boot.options,
    // Longboard's own screens are not a site to be worked out: everything on
    // them is a real control, and nothing is read by scrolling.
    rules: { ...genericRules(), generic: false },
    send,
    hooks: {
      back: () => {
        if (!state) return true;
        if (state.panel === 'prompt') tell({ kind: 'answer', allow: false, remember: false });
        // Back on the editor's panel goes back to pointing; the panel's own buttons end the editing.
        else if (state.panel === 'edit') tell({ kind: 'edit', action: 'pickAgain' });
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
