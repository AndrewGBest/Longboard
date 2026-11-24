// Home: the address field with its suggestions, the clock, and the tiles.
import { PRODUCT } from '../../shared/product';
import { type ChromeState } from '../../shared/chrome';
import { siteName } from '../../shared/address';
import { badge, button, el, icon, logo, type IconName } from '../parts';
import { tell, ui } from './ui';
import { render } from './render';

/** The tile with the highlight on Home, from what is drawn now. */
export function focusedTile(s: ChromeState): typeof ui.menuFor {
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
export function addressField(id: string): HTMLInputElement {
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
    ui.typing = false;
    input.blur();
    tell({ kind: 'open', input: text });
  });
  // Places the person already knows that match what has been typed so far, offered under the field.
  input.addEventListener('input', () => tell({ kind: 'suggest', text: input.value }));
  return input;
}

/** The suggestions for what is typed in an address field: a few buttons under it, replaced as the typing goes on. */
export function showSuggestions(list: Array<{ url: string; text: string; search?: boolean }>): void {
  const field = document.getElementById('address')?.parentElement ?? document.getElementById('menu-address');
  if (!field) return;
  let box = document.getElementById('suggestions');
  if (!box) {
    box = el('div', { id: 'suggestions' });
    field.after(box);
  }
  box.replaceChildren(
    ...list.map((sug, i) =>
      button(
        `suggest-${i}`,
        sug.text,
        () => {
          ui.typing = false;
          tell({ kind: 'openSuggestion', url: sug.url });
        },
        false,
        sug.search ? 'search' : 'history',
      ),
    ),
  );
}

/** The time and the day, at the top of Home, as a TV's own screens show them. */
function clockWords(now = new Date()): [string, string] {
  return [
    now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }),
  ];
}
export function drawClock(): void {
  const clock = document.getElementById('clock');
  if (!clock) return;
  const [time, day] = clockWords();
  if (clock.firstChild?.textContent !== time)
    clock.replaceChildren(document.createTextNode(time), el('small', { text: day }));
}

/** A tile of Home: the site's icon, a name, a line under it, and a small label at the corner. */
function tile(
  id: string,
  pic: string | null,
  name: string,
  sub: string,
  mark: string,
  onPress: () => void,
): HTMLButtonElement {
  const t = button(id, '', onPress);
  t.className = 'tile';
  t.append(
    badge(pic, name),
    el('span', { cls: 'site', text: name }),
    el('span', { cls: 'sub title', text: sub }),
    el('span', { cls: 'mark', text: mark }),
  );
  t.setAttribute('aria-label', [name, sub, mark].filter(Boolean).join(', '));
  return t;
}

export function home(s: ChromeState): HTMLElement {
  let go: HTMLElement;
  if (ui.typing) {
    const input = addressField('address');
    go = el('div', { cls: 'field typing' }, [icon('search'), input]);
    // Leaving the field without opening anything puts the button back.
    input.addEventListener('blur', () => {
      // With suggestions showing, the highlight may be on its way to one of them: the field stays.
      if (!ui.typing || document.getElementById('suggestions')?.childElementCount) return;
      ui.typing = false;
      render();
      const again = document.getElementById('go');
      if (again) ui.layer?.focus(again);
    });
  } else {
    go = button(
      'go',
      SEARCH_WORDS,
      () => {
        ui.typing = true;
        render();
        const field = document.getElementById('address');
        if (field) ui.layer?.typeIn(field);
      },
      false,
      'search',
    );
    go.className = 'field';
  }
  const tiles = s.home.recents.map((r, i) => {
    const mark = r.profile === 'own' ? 'Your profile' : r.profile === 'reviewed' ? 'Reviewed profile' : '';
    return tile(`tile-${i}`, r.icon, siteName(r.url), r.title, mark, () => tell({ kind: 'openRecent', url: r.url }));
  });
  const apps = s.home.apps.map((a, i) =>
    tile(`app-${i}`, a.icon, a.name, a.site, a.ownSession ? 'Own sign-ins' : '', () =>
      tell({ kind: 'openApp', id: a.id }),
    ),
  );
  const savedTiles = s.home.saved.map((p, i) => {
    const site = siteName(p.url);
    return tile(`saved-${i}`, p.icon, p.title || site, site, '', () => tell({ kind: 'openSaved', url: p.url }));
  });

  const [time, day] = clockWords();
  const top = el('header', { id: 'top' }, [logo(), el('h1', { text: PRODUCT.name })]);
  if (s.home.privateTab)
    top.append(
      el('span', { id: 'private-badge', cls: 'badge private' }, [icon('private'), el('span', { text: 'Private tab' })]),
    );
  if (s.tabs.length > 1)
    top.append(el('span', { cls: 'badge' }, [icon('tabs'), el('span', { text: `${s.tabs.length} tabs` })]));
  top.append(el('div', { id: 'clock' }, [document.createTextNode(time), el('small', { text: day })]));
  // The menu, for a remote that has no button for it: everything else (Settings, the pointer, giving a button a job) is behind it.
  const menuButton = button('home-menu', 'Menu', () => tell({ kind: 'menu', action: 'open' }), false, 'menu');
  top.append(menuButton);

  const main = el('main', { id: 'home' }, [top, go]);
  if (s.home.privateTab)
    main.append(
      el('p', {
        id: 'private',
        cls: 'where',
        text: 'Nothing opened in this tab is kept: no history, no recent sites, and what its sites store goes when the tab is closed.',
      }),
    );
  // The page left behind Home is one press away.
  if (s.page && !ui.typing) {
    const back = button('resume', '', () => tell({ kind: 'menu', action: 'resume' }));
    back.append(
      badge(s.page.icon, s.page.site),
      el('span', { cls: 'text' }, [
        el('span', { cls: 'label', text: s.page.title || s.page.site }),
        el('span', { cls: 'sub', text: `Carry on at ${s.page.site}` }),
      ]),
      icon('chevron'),
    );
    back.setAttribute('aria-label', `Carry on at ${s.page.site}`);
    main.append(back);
  }
  if (savedTiles.length)
    main.append(el('h2', { text: 'Saved pages' }), el('div', { id: 'saved', cls: 'tiles' }, savedTiles));
  if (apps.length) main.append(el('h2', { text: 'Apps' }), el('div', { id: 'apps', cls: 'tiles' }, apps));
  if (tiles.length) main.append(el('h2', { text: 'Recently opened' }), el('div', { id: 'tiles', cls: 'tiles' }, tiles));
  else if (!apps.length && !savedTiles.length && !s.home.privateTab) {
    const card = (pic: IconName, title: string, text: string): HTMLElement =>
      el('div', {}, [icon(pic), el('b', { text: title }), el('span', { text })]);
    main.append(
      el('p', { id: 'welcome-title', text: `Welcome to ${PRODUCT.name}` }),
      el('div', { id: 'welcome' }, [
        card(
          'search',
          'Search or go to a site',
          'Press OK on the bar above and type with the on-screen keyboard. A keyboard that is plugged in works too.',
        ),
        card(
          'apps',
          'Your sites live here',
          'Sites you open will appear here. The menu can keep a page on Home, or add a site as an app. On a website, press Up twice at the top of the page for the menu.',
        ),
        card(
          'pointer',
          'A pointer when you need one',
          'The arrows move between links and buttons. For a site that needs a mouse, "Pointer" in the menu puts an arrow on the screen that you steer.',
        ),
      ]),
    );
  }
  return main;
}
