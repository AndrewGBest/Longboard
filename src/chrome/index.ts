// Longboard's own screens: Home, the menu panel, About, and questions. This
// is the preload of the chrome view, which only ever shows chrome.html. It
// draws everything from the isolated world and talks to the shell directly;
// the page itself has no script and no API (Hard rule 13).
//
// The highlight here is moved by the same layer that drives websites, so
// Longboard's own interface is the first user of its navigation engine.
import { ipcRenderer } from 'electron';
import type { BootData, BridgeMessage } from '../shared/actions';
import type { ChromeMessage, ChromeState, MenuAction } from '../shared/chrome';
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
      el('span', { cls: 'mono', text: site.slice(0, 1) || '?' }),
      el('span', { cls: 'site', text: site }),
      el('span', { cls: 'title', text: r.title }),
      el('span', { cls: 'mark', text: mark }),
    );
    return tile;
  });
  const apps = s.home.apps.map((a, i) => {
    const tile = button(`app-${i}`, '', () => tell({ kind: 'openApp', id: a.id }));
    tile.className = 'tile';
    // The site's own icon, as the site served it; a letter when it gave none.
    let badge: HTMLElement = el('span', { cls: 'mono', text: a.name.slice(0, 1) || '?' });
    if (a.icon) {
      const img = el('img', { cls: 'mono icon' });
      img.src = a.icon;
      img.alt = '';
      badge = img;
    }
    tile.append(badge, el('span', { cls: 'site', text: a.name }), el('span', { cls: 'title', text: a.site }), el('span', { cls: 'mark', text: a.ownSession ? 'Own sign-ins' : '' }));
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
    if (page.profile) items.push(button('menu-export', 'Export this profile', act('exportProfile')));
    items.push(page.app ? button('menu-remove-app', `Remove the app "${page.app.name}"`, act('removeApp')) : button('menu-add-app', 'Add this site as an app', act('addApp')));
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
  const site = s.prompt?.what === 'protectedPlayback' ? s.prompt.site : 'This site';
  return [
    el('h1', { text: 'Allow protected video?' }),
    el('p', { text: `${site} wants to play protected (DRM) video. Longboard plays it through the browser's standard, unmodified playback component. Your answer is remembered for this site.` }),
    button('prompt-allow', 'Allow', answer(true)),
    button('prompt-deny', 'Not now', answer(false)),
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
    panel = el('aside', { id: 'panel' }, s.panel === 'menu' ? menuPanel(s) : s.panel === 'about' ? aboutPanel(s) : s.panel === 'addApp' ? addAppPanel(s) : promptPanel(s));
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
    const first = [...panel.querySelectorAll('button')].find((b) => !b.disabled);
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
  state = next;
  render();
});
ipcRenderer.on('longboard:notice', (_event, text: unknown) => {
  if (typeof text === 'string') layer?.notice(text.slice(0, 200));
});

const start = (): void => {
  layer = startLayer({
    doc: document,
    options: boot.options,
    rules: genericRules(),
    send,
    hooks: {
      back: () => {
        if (!state) return true;
        if (state.panel === 'prompt') tell({ kind: 'answer', allow: false, remember: false });
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
